import { clamp, lerp, pick, rnd } from './rng.js';
import { SCHEDULER } from '../config.js';

/*
 * The toolkit a behavior plans with: a timed script builder plus the
 * shared movement helpers (walking in X/Y/Z, glances, depth bands).
 *
 * A behavior is a pure planner. It receives the context `c` and a script
 * `S`, adds timed patches to S and returns its duration. The scheduler
 * plays the script from a single timeout.
 */

export function makeScript(c, animations) {
  const beats = [];
  const S = {
    beats,
    at(t, patch) {
      beats.push({ t, patch });
      return S;
    },
    blink(t, back = 'open') {
      S.at(t, { eyes: 'blink' });
      S.at(t + 140, { eyes: back });
      return S;
    },
    // create / update / remove (spec = null) a world-anchored environmental prop
    prop(t, id, spec) {
      return S.at(t, { propOps: [[id, spec]] });
    },
    // create / update / remove (spec = null) a sprite-space overlay effect
    fx(t, key, spec) {
      return S.at(t, { fxOps: [[key, spec]] });
    },
    // several overlay effects in one beat: { key: spec | null }
    fxMany(t, map) {
      return S.at(t, { fxOps: Object.entries(map) });
    },
    // remove every overlay effect at once
    clearFx(t) {
      return S.at(t, { fx: {} });
    },
    // play a named animation from the pet's animation registry
    play(id, t0 = 0, opts) {
      return animations ? animations.play(S, c, id, t0, opts) : t0;
    },
  };
  return S;
}

// A band of depth around the current z, kept inside the allowed range.
export const zBand = (c, dz) => [
  Math.max(c.geo.zRange[0], c.cur.z - dz),
  Math.min(c.geo.zRange[1], c.cur.z + dz),
];

// Legs alternate while a glide carries the pet along.
export function flick(S, t0, ms) {
  for (let t = 0, i = 0; t < ms; t += 400, i++) {
    S.at(t0 + t, { legs: i % 2 ? 2 : 1 });
  }
  S.at(t0 + ms, { legs: 0 });
}

/*
 * Continuous walk from one spot to another: one step per stepMs, each a
 * short linear glide, so it reads as walking. Works in all three axes
 * (depth interpolates with the screen position). Never a jump. The cat
 * turns (view) to show the side it walks on, and back to the front when
 * it arrives, always through the in-between views.
 *
 * opts (all optional):
 *   pose     the gait's body pose (default 'stand'; 'crouch' creeps)
 *   endPose  the pose it arrives in (default 'sit')
 *   gaze     a fixed gaze while walking (default: the walking direction)
 */
export function travel(S, c, from, dest, t0, stepMs = SCHEDULER.stepMs, maxSteps = 30, depthWeight = 0, opts = {}) {
  const { pose = 'stand', endPose = 'sit', gaze = null } = opts;
  const dx = dest.sx - from.sx;
  const face = Math.abs(dx) > 4 ? { facing: dx < 0 ? -1 : 1 } : {};

  // turn to show the side it walks on, through the in-between views
  const view = walkView(dx, dest.sy - from.sy + (dest.z - from.z) * 0.8);
  turnPath('front', view).forEach((v, k) => S.at(t0 + k * TURN_MS, { view: v, ...face }));
  // depthWeight > 0 lets a mostly-in-depth move take proportionally more steps
  const dist = Math.hypot(dx, dest.sy - from.sy) + Math.abs(dest.z - from.z) * depthWeight;
  const sAvg = (c.geo.scaleAt(from.z) + c.geo.scaleAt(dest.z)) / 2;
  const n = clamp(Math.ceil(dist / (c.geo.cell * sAvg * 1.2)), 1, maxSteps);

  for (let i = 0; i < n; i++) {
    const f = (i + 1) / n;
    S.at(t0 + i * stepMs, {
      sx: lerp(from.sx, dest.sx, f),
      sy: lerp(from.sy, dest.sy, f),
      z: lerp(from.z, dest.z, f),
      legs: i % 2 ? 2 : 1,
      gaze: gaze ?? (dx < -4 ? 'l' : dx > 4 ? 'r' : 'c'),
      pose,
      transitionMs: stepMs,
      ease: 'linear',
      ...face,
    });
  }

  // arrives, then turns back to face the room the same way
  const end = t0 + n * stepMs;
  S.at(end, { legs: 0, gaze: gaze ?? 'c', pose: endPose });
  const back = turnPath(view, 'front');
  back.forEach((v, k) => S.at(end + k * TURN_MS, { view: v }));
  return end + Math.max(0, back.length - 1) * TURN_MS;
}

/*
 * Which side of the cat a walk shows (view.view): the front walking toward
 * the viewer, the rear walking away, the profile walking across, and the
 * three-quarter views in between. `toward` is the movement toward the
 * viewer (down the screen and nearer in depth).
 */
const VIEW_RING = ['front', 'frontQ', 'side', 'rearQ', 'rear'];
export const TURN_MS = 110;

export function walkView(dx, toward) {
  const ax = Math.abs(dx);
  const at = Math.abs(toward);
  if (ax < 4 && at < 4) return 'front';
  if (ax >= at * 2.2) return 'side';
  if (at >= ax * 2.2) return toward > 0 ? 'front' : 'rear';
  return toward > 0 ? 'frontQ' : 'rearQ';
}

// The views a turn passes through (excluding where it starts).
export function turnPath(from, to) {
  const a = VIEW_RING.indexOf(from);
  const b = VIEW_RING.indexOf(to);
  const out = [];
  for (let i = a; i !== b; ) {
    i += Math.sign(b - a);
    out.push(VIEW_RING[i]);
  }
  return out;
}

// Stay put and take in the surroundings with a few dwelling glances.
export function sweep(c, S, t0, stops) {
  let t = t0;
  for (let i = 0; i < stops; i++) {
    S.at(t, { gaze: pick(c.rng, ['l', 'c', 'r', 'l', 'r', 'u']) });
    t += rnd(c.rng, 900, 2400);
    if (c.rng() < 0.35) S.blink(t - 400);
  }
  S.at(t, { gaze: 'c' });
  return t + 400;
}

// Where an item sits in the sprite space decides where the eyes go.
export const gazeForX = (x, spriteW) => (x < spriteW * 0.36 ? 'l' : x > spriteW * 0.64 ? 'r' : 'c');

/*
 * Reduced motion: the same script, played shorter and with fewer visible
 * steps. Beat times scale by `factor`, and beats that then fall in the same
 * `slotMs` window are folded into one patch (earliest time), so a blink or a
 * quick glance simply never shows. Folding keeps patch semantics: later keys
 * win, overlay / prop operations stay in order, and a full `fx` / `props`
 * replacement discards the operations queued before it. Applying the result
 * leaves the view exactly where applying the original beats would.
 */
export function compressBeats(beats, factor, slotMs) {
  const out = [];
  let slot = -1;
  for (const { t, patch } of beats) {
    const at = Math.round(t * factor);
    const k = Math.floor(at / slotMs);
    const last = out[out.length - 1];
    if (last && k === slot) {
      last.patch = foldPatch(last.patch, patch);
    } else {
      out.push({ t: at, patch: { ...patch } });
      slot = k;
    }
  }
  return out;
}

function foldPatch(a, b) {
  const out = { ...a };
  for (const [ops, full] of [['propOps', 'props'], ['fxOps', 'fx']]) {
    if (b[full] !== undefined) delete out[ops]; // a full replacement wipes what came before
    if (b[ops]) out[ops] = [...(out[ops] || []), ...b[ops]];
  }
  for (const [key, value] of Object.entries(b)) {
    if (key !== 'propOps' && key !== 'fxOps') out[key] = value;
  }
  return out;
}
