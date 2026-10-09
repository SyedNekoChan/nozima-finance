import { SCHEDULER } from '../config.js';
import { makeScript } from './toolkit.js';
import { rnd } from './rng.js';
import { weightFor } from './behaviors.js';

/*
 * The one behavior scheduler of a pet instance.
 *
 * It picks the next behavior dynamically when the previous one finishes
 * (weighted random, never back to back, recent ones down-weighted, natural
 * follow-ons nudged, long stretches of doing nothing) and plays each
 * behavior's script from a SINGLE timeout.
 *
 * Financial mood has priority: only behaviors with a positive weight in the
 * current mood are ever eligible, so an optional idle activity can never
 * override the stressed or prosperous appearance.
 *
 * A module-level lock guarantees that two schedulers can never control the
 * same pet instance: starting one stops the other.
 */

const LIVE = new Map();

export class PetScheduler {
  /*
   * key        : pet instance id (the lock)
   * behaviors  : normalised behavior set (see buildBehaviorSet)
   * getCtx     : () => context for planning, or null while unmeasured
   * apply      : (patch) => void   (merges into the pet's view)
   * resetPatch : posture reset applied when a behavior is cancelled
   * animations : the pet's animation registry
   */
  constructor({ key, rng, mood, reduced, compact, behaviors, animations, getCtx, apply, resetPatch }) {
    this.key = key;
    this.rng = rng;
    this.mood = mood;
    this.reduced = reduced;
    this.compact = compact;
    this.behaviors = behaviors;
    this.byId = Object.fromEntries(behaviors.map((b) => [b.id, b]));
    this.animations = animations;
    this.getCtx = getCtx;
    this.apply = apply;
    this.resetPatch = resetPatch;

    this.alive = true;
    this.timer = null;
    this.last = null;
    this.current = null;
    this.history = [];
    this.lastAt = {};
    this.broken = new Set(); // behaviors that threw: switched off for the session
    this.queued = null; // a requested reaction waiting for the next boundary
  }

  // Exactly one pending timer at any moment.
  schedule(fn, ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(fn, Math.max(0, ms));
  }

  start(delay) {
    const other = LIVE.get(this.key);
    if (other && other !== this) other.stop();
    LIVE.set(this.key, this);
    this.alive = true;
    this.schedule(() => this.next(), delay);
  }

  stop() {
    this.alive = false;
    clearTimeout(this.timer);
    this.runExit('cancel');
    if (LIVE.get(this.key) === this) LIVE.delete(this.key);
  }

  /*
   * Financial mood, breakpoint or reduced-motion changed: abandon the
   * running behavior cleanly, reset posture (not position) and carry on.
   * Cooldowns, history and the random stream persist.
   */
  setMode({ mood, reduced, compact }, delay) {
    if (!this.alive) return;
    this.cancel();
    this.mood = mood;
    this.reduced = reduced;
    this.compact = compact;
    this.queued = null;
    this.schedule(() => this.next(), delay);
  }

  cancel() {
    clearTimeout(this.timer);
    this.runExit('cancel');
    this.guard(() => this.apply(this.resetPatch));
  }

  runExit(why) {
    const b = this.current && this.byId[this.current];
    this.current = null;
    if (b?.exit) {
      const c = this.getCtx();
      if (c) this.guard(() => b.exit(c, why));
    }
  }

  guard(fn) {
    try {
      return fn();
    } catch (err) {
      console.warn('[pets] behavior error:', err);
      return undefined;
    }
  }

  isEligible(b, c, now) {
    if (!b.enabled || !b.supported || this.broken.has(b.id)) return false;
    if (weightFor(b, this.mood) <= 0) return false;
    if (this.reduced && b.moves) return false;
    if (now - (this.lastAt[b.id] ?? -Infinity) < b.cooldown) return false;
    return !b.eligible || !!this.guard(() => b.eligible(c));
  }

  /*
   * Future interaction API entry: ask for a behavior as a reaction.
   * Accepted only if the behavior exists and is compatible with the current
   * financial mood and motion preference. interrupt=false waits for the
   * running behavior to finish; true cancels it and reacts now.
   */
  request(id, { interrupt = false } = {}) {
    const b = this.byId[id];
    if (!this.alive || !b || !b.enabled || !b.supported || this.broken.has(id)) return false;
    if (weightFor(b, this.mood) <= 0 || (this.reduced && b.moves)) return false;

    if (interrupt) {
      this.cancel();
      this.next(id);
    } else {
      this.queued = id;
    }
    return true;
  }

  choose(c) {
    const now = performance.now();

    if (this.queued) {
      const id = this.queued;
      this.queued = null;
      if (this.isEligible({ ...this.byId[id], cooldown: 0 }, c, now)) return id;
    }

    const pool = this.behaviors.filter((b) => b.id !== this.last && this.isEligible(b, c, now));
    if (!pool.length) return this.fallbackId();

    const follow = (this.last && this.byId[this.last]?.followOn) || {};
    const weights = pool.map(
      (b) =>
        weightFor(b, this.mood) *
        (follow[b.id] || 1) *
        (this.history.includes(b.id) ? SCHEDULER.historyPenalty : 1)
    );

    let r = c.rng() * weights.reduce((s, w) => s + w, 0);
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i].id;
    }
    return pool[0].id;
  }

  fallbackId() {
    const id = this.mood === 'stressed' ? 'still' : 'sit';
    return this.byId[id] ? id : this.behaviors.find((b) => weightFor(b, this.mood) > 0)?.id;
  }

  next(forceId) {
    if (!this.alive) return;

    const c = this.getCtx();
    if (!c) {
      this.schedule(() => this.next(forceId), 200);
      return;
    }

    const id = forceId || this.choose(c);
    const b = id && this.byId[id];
    if (!b) {
      this.schedule(() => this.next(), 1500);
      return;
    }

    const S = makeScript(c, this.animations);
    let planned;
    try {
      if (b.enter) b.enter(c);
      planned = b.plan(c, S);
    } catch (err) {
      // an optional behavior must never take the pet (or the app) down
      console.warn(`[pets] behavior "${id}" disabled:`, err);
      this.broken.add(id);
      this.guard(() => this.apply(this.resetPatch));
      this.schedule(() => this.next(), 800);
      return;
    }

    const end = this.reduced ? planned * SCHEDULER.reducedDurationFactor : planned;

    this.current = id;
    this.run(S.beats.sort((a, z) => a.t - z.t), Math.max(end, SCHEDULER.minBehaviorMs));
  }

  run(beats, end) {
    const t0 = performance.now();
    let i = 0;

    const step = () => {
      if (!this.alive) return;
      const now = performance.now() - t0;

      while (i < beats.length && beats[i].t <= now + 4) {
        this.guard(() => this.apply(beats[i].patch));
        i++;
      }

      if (i < beats.length) {
        this.schedule(step, beats[i].t - now);
      } else {
        this.schedule(() => this.finish(), end - now);
      }
    };

    step();
  }

  finish() {
    if (!this.alive) return;

    const id = this.current;
    this.runExit('done');

    this.last = id;
    this.lastAt[id] = performance.now();
    this.history = [...this.history, id].slice(-SCHEDULER.historyLength);

    // Meaningful stretches of doing nothing, with varied pauses.
    const gap =
      this.rng() < SCHEDULER.longGapChance
        ? rnd(this.rng, ...SCHEDULER.longGap)
        : rnd(this.rng, ...SCHEDULER.gap);

    this.schedule(() => this.next(), this.reduced ? gap * SCHEDULER.reducedGapFactor : gap);
  }
}
