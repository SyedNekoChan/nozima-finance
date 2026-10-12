import { rnd } from '../../core/rng.js';

// Per-mood weights: W(idle, content, stressed). 0 = never in that state.
export const W = (idle, content = 0, stressed = 0) => ({ idle, content, stressed });

/* Shared helpers for the activity modules (screen-space sides 'l' / 'r'). */

export const PAW = { l: 'pawL', r: 'pawR' };
export const LEAN = { l: -1, r: 1 };
export const SIGN = LEAN;
export const other = (s) => (s === 'l' ? 'r' : 'l');
export const anySide = (c) => (c.rng() < 0.5 ? 'l' : 'r');

// Weighted pick from { name: weight }.
export function weighted(rng, table) {
  const entries = Object.entries(table).filter(([, w]) => w > 0);
  let r = rng() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [name, w] of entries) {
    r -= w;
    if (r <= 0) return name;
  }
  return entries[0]?.[0];
}

/*
 * Optional connecting actions between phases or at the end of a
 * performance (see the transition animations). Played only by chance,
 * never as a mandatory ending.
 */
export const TRANSITIONS = {
  inspectPaw: 3,
  survey: 3,
  pause: 3,
  earFlick: 2,
  tailSwish: 2,
  stretchOut: 1.5,
  yawn: 1,
};

export function maybeTransition(S, c, t, { chance = 0.4, pool = TRANSITIONS, opts } = {}) {
  if (c.rng() >= chance) return t;
  return S.play(weighted(c.rng, pool), t, opts) + rnd(c.rng, 150, 450);
}

/*
 * A burst of typing: paws alternate on the keys (`level` per paw), with
 * onKey(t, i) called for each keystroke so the prop can follow along.
 * fast: an exaggerated flurry. Returns the end time.
 */
export function typeBurst(S, c, t0, n, { level = 'low', fast = false, onKey } = {}) {
  let t = t0;
  const [lo, hi] = fast ? [70, 110] : [130, 240];
  for (let i = 0; i < n; i++) {
    const left = i % 2 === 0 || (!fast && c.rng() < 0.25);
    S.at(t, left ? { pawL: level, pawR: null } : { pawL: null, pawR: level });
    onKey?.(t, i);
    t += rnd(c.rng, lo, hi);
  }
  S.at(t, { pawL: null, pawR: null });
  return t + 60;
}
