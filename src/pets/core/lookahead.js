import { pick, rnd } from './rng.js';
import { isNeutral } from './attention.js';

/*
 * Look before moving: now and then, before a calm, self-chosen walk, the cat looks where it is about to go.
 *
 * The scheduler asks this once per behavior it picked on its own (never a reaction, a request, a forced run or anything
 * under reduced motion). Most of the time the answer is no: only the calm movers qualify, only some of those, and not
 * twice within a while. When it is yes the answer is a short run-up (a third to a second and a bit) that the scheduler
 * plays BEFORE the behavior's own script, which is shifted later by that long. The run-up only touches gaze, ears and
 * the head lean, and puts them all back to rest before the walk begins, so the behavior starts from exactly the rig it
 * always started from and nothing it owns is overwritten.
 *
 *   -> null | { lead, beats: [{ t, patch }] }
 */

export const LOOK_BEFORE = {
  ids: ['walk', 'travel', 'relocate', 'edgeExit'],
  chance: 0.4,
  minGapMs: 20000,
  minTravel: 18, // a move shorter than this (px) is not worth a look
};

const side = (dx) => (dx < 0 ? 'l' : 'r');

export function firstMove(beats, view) {
  for (const b of beats) {
    const sx = b.patch && b.patch.sx;
    if (typeof sx === 'number' && Math.abs(sx - view.sx) >= LOOK_BEFORE.minTravel) return sx - view.sx;
  }
  return null;
}

export function planLookBefore({ rng, behavior, beats, view, source, mood, reduced, memory, now }) {
  if (reduced || mood === 'stressed' || source !== 'pool') return null;
  if (!behavior || !behavior.moves || !LOOK_BEFORE.ids.includes(behavior.id)) return null;
  if (!isNeutral(view)) return null;
  const mem = memory || {};
  if (now - (mem.lookBeforeAt ?? -1e9) < LOOK_BEFORE.minGapMs) return null;
  if (rng() > LOOK_BEFORE.chance) return null;
  const dx = firstMove(beats, view);
  if (dx === null) return null;
  mem.lookBeforeAt = now;

  const s = side(dx);
  const o = s === 'l' ? 'r' : 'l';
  const lean = s === 'l' ? -1 : 1;
  const r = rng();
  let lead;
  const out = [];
  if (r < 0.4) {
    // a plain look toward where it is going
    lead = rnd(rng, 380, 780);
    out.push([0, { gaze: s }]);
  } else if (r < 0.65) {
    // the ears come up first, then the eyes
    lead = rnd(rng, 450, 900);
    out.push([0, { ears: 'perk' }], [rnd(rng, 70, 170), { gaze: s }]);
  } else if (r < 0.85) {
    // the eyes, then the head follows
    lead = rnd(rng, 520, 950);
    out.push([0, { gaze: s }], [rnd(rng, 120, 260), { lean }]);
  } else {
    // a look around: the wrong way first, then the right one
    lead = rnd(rng, 750, 1150);
    out.push([0, { gaze: o }], [rnd(rng, 260, 420), { gaze: s }]);
  }
  // everything back to rest just before the walk's own script begins
  out.push([lead - 4, { gaze: 'c', ears: null, lean: 0 }]);
  return { lead, beats: out.map(([t, patch]) => ({ t, patch })) };
}
