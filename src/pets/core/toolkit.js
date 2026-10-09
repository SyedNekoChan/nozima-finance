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
 * (depth interpolates with the screen position). Never a jump.
 */
export function travel(S, c, from, dest, t0, stepMs = SCHEDULER.stepMs, maxSteps = 30, depthWeight = 0) {
  const dx = dest.sx - from.sx;
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
      gaze: dx < -4 ? 'l' : dx > 4 ? 'r' : 'c',
      pose: 'stand',
      transitionMs: stepMs,
      ease: 'linear',
      ...(Math.abs(dx) > 4 ? { facing: dx < 0 ? -1 : 1 } : {}),
    });
  }

  const end = t0 + n * stepMs;
  S.at(end, { legs: 0, gaze: 'c', pose: 'sit' });
  return end;
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
