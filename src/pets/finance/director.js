import { FINANCE } from './config.js';

/*
 * Financial reaction director (pet-agnostic).
 *
 * It turns financial SIGNALS into a small queue of pending reactions and
 * hands the next one to the pet's scheduler at a safe behavior boundary.
 * It owns no timer and no animation: expiry and cooldowns are evaluated
 * lazily, so it cannot leak or accumulate anything.
 *
 * Two concepts stay separate:
 *   PERSISTENT MOOD     - the appearance (idle / content / stressed), owned
 *                         by the application's financial state; the director
 *                         never changes it and never offers a behavior that
 *                         is incompatible with it.
 *   TRANSIENT REACTIONS - one-shots for state transitions and successful
 *                         operations, defined per pet as data (below).
 *
 * Signals
 *   setContext({ mood, armed })  persistent state; edge-detects transitions:
 *                                'stress-entered', 'stress-recovered',
 *                                'position-changed' (idle <-> content)
 *   noteEvent({ type, id })      a genuine success event raised by the store
 *                                (INCOME, EXPENSE, TRANSFER, OVERSPEND, ...)
 *
 * A pet registers reactions with defineFinancialReaction:
 *   {
 *     id,                          unique
 *     triggers: [ { transition } | { event } ],
 *     priority,                    higher wins (see FINANCE.priority)
 *     group,                       reactions in a group coalesce into one slot
 *     ttl,                         ms a pending reaction stays valid
 *     cooldown,                    ms between two runs of this reaction
 *     settle,                      ms to wait so bursts coalesce (default: acks wait)
 *     candidates: [ { id, weight } ]   the pet's own behaviors; the first
 *                                  eligible weighted pick runs
 *     enabled
 *   }
 */

export function defineFinancialReaction(def) {
  if (!def || typeof def.id !== 'string' || !Array.isArray(def.triggers) || !def.triggers.length) {
    throw new Error('financial reaction needs an id and triggers');
  }
  if (!Array.isArray(def.candidates) || !def.candidates.length) {
    throw new Error(`financial reaction "${def.id}" needs candidates`);
  }
  return {
    priority: FINANCE.priority.ack,
    group: def.id,
    ttl: 20000,
    cooldown: 20000,
    settle: null, // default: acknowledgements settle, persistent changes do not
    enabled: true,
    ...def,
  };
}

export class FinancialDirector {
  /*
   * reactions : defineFinancialReaction results (invalid ones are skipped by the caller)
   * rng       : () => 0..1
   * now       : () => ms (injectable for tests)
   */
  constructor({ reactions = [], rng = Math.random, now = () => performance.now() } = {}) {
    this.reactions = reactions.filter((r) => r.enabled);
    this.byTrigger = new Map();
    for (const r of this.reactions) {
      for (const t of r.triggers) {
        const key = t.transition ? `transition:${t.transition}` : `event:${t.event}`;
        if (!this.byTrigger.has(key)) this.byTrigger.set(key, []);
        this.byTrigger.get(key).push(r);
      }
    }
    this.rng = rng;
    this.now = now;

    this.queue = []; // pending entries, at most FINANCE.queueMax
    this.lastRun = {}; // reaction id -> time it last ran
    this.lastAck = -Infinity;
    this.seen = new Map(); // `${type}:${id}` -> time (dedupe)
    this.prev = null; // last armed mood
    this.armedAt = null;
  }

  /* ---------------------------------------------------------------- */
  /* Signals                                                           */
  /* ---------------------------------------------------------------- */

  /*
   * armed: false until the application data has loaded. The first armed
   * context is the baseline; changes inside the baseline window update it
   * silently (nothing is reacted to merely because the app started up).
   */
  setContext({ mood, armed }) {
    const now = this.now();
    if (!armed) return;

    if (this.armedAt === null) {
      this.armedAt = now;
      this.prev = mood;
      return;
    }

    const before = this.prev;
    this.prev = mood;
    if (before === mood || now - this.armedAt < FINANCE.baselineMs) return;

    if (mood === 'stressed') this.signal('transition:stress-entered');
    else if (before === 'stressed') this.signal('transition:stress-recovered');
    else this.signal('transition:position-changed');
  }

  noteEvent(event) {
    if (!event || typeof event.type !== 'string') return;
    const now = this.now();

    // genuine events only, each counted once
    const key = `${event.type}:${event.id ?? ''}`;
    const seenAt = this.seen.get(key);
    if (seenAt !== undefined && now - seenAt < FINANCE.dedupeMs) return;
    this.seen.set(key, now);
    if (this.seen.size > 32) {
      for (const [k, t] of this.seen) if (now - t > FINANCE.dedupeMs) this.seen.delete(k);
    }

    this.signal(`event:${event.type}`);
  }

  signal(triggerKey) {
    const now = this.now();
    for (const r of this.byTrigger.get(triggerKey) || []) {
      if (now - (this.lastRun[r.id] ?? -Infinity) < r.cooldown) continue;
      if (r.priority <= FINANCE.priority.ack && now - this.lastAck < FINANCE.ackGlobalCooldownMs) continue;
      this.enqueue(r, now);
    }
  }

  enqueue(r, now) {
    this.purge(now);

    // a pending persistent change makes a minor acknowledgement redundant
    if (this.queue.some((e) => e.reaction.priority > r.priority && r.priority <= FINANCE.priority.ack)) return;

    // same group: coalesce into one slot, the newest wins
    this.queue = this.queue.filter((e) => e.reaction.group !== r.group);
    this.queue.push({ reaction: r, createdAt: now, readyAt: now + (r.settle ?? (r.priority <= FINANCE.priority.ack ? FINANCE.settleMs : 0)), expiresAt: now + r.ttl });

    // bounded: drop the lowest priority (then oldest) beyond the limit
    while (this.queue.length > FINANCE.queueMax) {
      this.queue.sort((a, b) => b.reaction.priority - a.reaction.priority || b.createdAt - a.createdAt);
      this.queue.pop();
    }
  }

  purge(now) {
    this.queue = this.queue.filter((e) => e.expiresAt > now);
  }

  /* ---------------------------------------------------------------- */
  /* Hand-off to the scheduler (at a behavior boundary)                */
  /* ---------------------------------------------------------------- */

  /*
   * mood   : the current persistent mood
   * canRun : (behaviorId) => true if the pet may run it now (appearance
   *          rules, enabled, reduced motion...)
   * Returns a behavior id or null.
   */
  take({ canRun }) {
    const now = this.now();
    this.purge(now);
    if (!this.queue.length) return null;

    const ordered = [...this.queue].sort(
      (a, b) => b.reaction.priority - a.reaction.priority || a.createdAt - b.createdAt
    );

    for (const entry of ordered) {
      if (entry.readyAt > now) continue;

      const r = entry.reaction;
      const options = r.candidates.filter((c) => c.weight > 0 && canRun(c.id));

      if (!options.length) {
        // not playable in the current mood: drop it instead of letting it pile up
        this.queue = this.queue.filter((e) => e !== entry);
        continue;
      }

      let roll = this.rng() * options.reduce((s, c) => s + c.weight, 0);
      let chosen = options[options.length - 1];
      for (const c of options) {
        roll -= c.weight;
        if (roll <= 0) {
          chosen = c;
          break;
        }
      }

      this.lastRun[r.id] = now;
      if (r.priority <= FINANCE.priority.ack) this.lastAck = now;

      // a taken persistent change supersedes everything minor still waiting
      this.queue = this.queue.filter((e) => e !== entry && e.reaction.priority >= r.priority);
      return chosen.id;
    }

    return null;
  }

  // Forget everything pending (unmount, pet swap).
  clear() {
    this.queue = [];
  }

  get pending() {
    return this.queue.length;
  }
}
