import { SCHEDULER } from '../config.js';

/*
 * Behavior modules.
 *
 * A behavior is one self-contained definition:
 *
 *   defineBehavior({
 *     id,                     unique id
 *     rarity,                 'common' | 'uncommon' | 'rare' | 'veryRare' | 'extremelyRare'
 *     moods,                  financial states it may run in (default ['idle'])
 *     weights,                optional explicit { idle, content, stressed }
 *                             (overrides the rarity weight per state)
 *     cooldown,               ms before it may run again
 *     duration,               [min, max] ms, informational + helper for planners
 *     moves,                  true if it needs motion (skipped under reduced motion)
 *     requires,               pet capabilities / vanity items it needs
 *     eligible(c),            optional extra rule on the live context
 *     followOn,               { otherId: factor } natural continuations (a nudge, never a script)
 *     enter(c), exit(c, why), lifecycle hooks; exit also runs on cancellation
 *     plan(c, S) -> ms,       adds timed patches to S, returns the duration
 *     enabled,                false switches it off
 *   })
 *
 * Nothing here knows about the scheduler's internals, so a behavior can be
 * added, removed, disabled or tuned without touching core code.
 */

export function defineBehavior(def) {
  if (!def || typeof def.id !== 'string' || typeof def.plan !== 'function') {
    throw new Error('behavior needs an id and a plan(c, S) function');
  }
  return {
    rarity: 'common',
    moods: ['idle'],
    weights: null,
    cooldown: 0,
    duration: null,
    moves: false,
    requires: [],
    followOn: {},
    enabled: true,
    ...def,
  };
}

// Selection weight of a behavior for a financial mood (0 = never).
export function weightFor(b, mood) {
  if (b.weights && b.weights[mood] !== undefined) return b.weights[mood];
  if (!b.moods.includes(mood)) return 0;
  return SCHEDULER.rarityWeight[b.rarity] ?? SCHEDULER.rarityWeight.common;
}

/*
 * Builds the pet's live behavior set: normalises modules, applies the
 * pet's per-behavior overrides (enabled / weights / cooldown / rarity)
 * and drops anything invalid or unsupported instead of throwing.
 */
export function buildBehaviorSet(modules, overrides = {}, hasCapability = () => true) {
  const out = [];
  const seen = new Set();

  for (const mod of modules) {
    try {
      const base = defineBehavior(mod);
      if (seen.has(base.id)) throw new Error(`duplicate behavior "${base.id}"`);
      const b = { ...base, ...(overrides[base.id] || {}) };
      if (b.weights && overrides[base.id]?.weights) b.weights = { ...base.weights, ...overrides[base.id].weights };
      seen.add(b.id);
      b.supported = b.requires.every(hasCapability);
      out.push(b);
    } catch (err) {
      console.warn('[pets] behavior skipped:', err.message);
    }
  }
  return out;
}
