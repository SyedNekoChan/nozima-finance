import { SCHEDULER } from '../config.js';
import { gazeToward } from './encounter.js';
import { clamp, lerp } from './rng.js';
import { travel } from './toolkit.js';

/*
 * Choreography helpers shared by every pet.
 *
 * Behaviors are pure planners, so a multi-phase performance needs to know
 * where the pet WILL be at each point of its own script. An actor tracks
 * that planned position, converts sprite-space offsets (sprite pixels from
 * the sprite centre, screen orientation) into world points and back, and
 * composes walks, glides and hops from the shared movement primitives.
 * Nothing here owns a timer: every helper only adds beats to the script.
 */

// One sprite pixel in screen px at depth z (perspective and foreground boost).
export const spritePx = (c, z) => (c.geo.half(z)[0] * 2) / c.pet.sprite.width;

/*
 * Keeps a small object inside the pet's world area: the region the pet's
 * own sprite box may cover, shrunk by the object's half-size (`size` is
 * the object's width in sprite pixels).
 */
export function clampPoint(c, p, size = 0) {
  const [z0, z1] = c.geo.zRange;
  const z = clamp(p.z, z0, z1);
  const b = c.geo.bounds(z);
  const [hw, hh] = c.geo.half(z);
  const pad = (size / 2) * spritePx(c, z);
  return {
    sx: clamp(p.sx, Math.min(b.minX - hw + pad, b.maxX), Math.max(b.maxX + hw - pad, b.minX)),
    sy: clamp(p.sy, Math.min(b.minY - hh + pad, b.maxY), Math.max(b.maxY + hh - pad, b.minY)),
    z,
  };
}

/*
 * Samples a stretch of time into evenly spaced beats: fn(t, u, i) for
 * u in (0, 1]. Returns the end time.
 */
export function sample(t0, ms, every, fn) {
  const n = Math.max(1, Math.round(ms / every));
  for (let i = 1; i <= n; i++) fn(t0 + (i * ms) / n, i / n, i);
  return t0 + ms;
}

// Easing curves for sampled motion.
export const EASE = {
  linear: (u) => u,
  out: (u) => 1 - (1 - u) * (1 - u), // decelerating (a roll losing speed)
  in: (u) => u * u, // accelerating (a fall, a rush)
  inOut: (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u)),
};

/*
 * The screen-space footprint of the pet's sprite body at depth z, as a
 * half-width / half-height in px: where a prop must not change which side of
 * the pet it is drawn on (a quarter of the sprite wide, nearly all of it tall).
 */
export function footprint(c, z, size = 0) {
  const k = spritePx(c, z);
  return { hw: (c.pet.sprite.width * 0.25 + size / 2) * k, hh: (c.pet.sprite.height * 0.45 + size / 2) * k };
}

/*
 * Moves a world prop along a straight line as a series of short linear
 * glides (the prop's own CSS transition carries it between beats).
 *   extra(u, i) adds fields per beat (a rolling frame, a bob...)
 *   around: { c, pos, size } routes the prop around the pet. A prop is drawn
 *   behind or in front of the pet by its depth, so a move from one side of
 *   the pet's depth to the other must not cross the pet's body: it leaves
 *   the footprint first (staying on its side), then changes depth in the
 *   clear and glides on.
 * Returns the end time.
 */
export function moveProp(S, id, from, to, t0, ms, { every = 120, ease = EASE.linear, extra, around } = {}) {
  const side = (z) => z > (around ? around.pos.z : 0); // in front of the pet (a tie is behind, as it is drawn)
  const n = Math.max(1, Math.round(ms / every));
  let plan = null; // the rerouted path: counts of beats per leg
  if (around && side(from.z) !== side(to.z) && n >= 5) {
    const fp = footprint(around.c, around.pos.z, around.size ?? 11);
    const cx = around.pos.sx;
    const cy = around.pos.sy;
    const inside = (p) => Math.abs(p.sx - cx) < fp.hw && Math.abs(p.sy - cy) < fp.hh;
    // does the straight line enter the footprint?
    let hits = false;
    for (let i = 0; i <= 12 && !hits; i++) hits = inside({ sx: lerp(from.sx, to.sx, i / 12), sy: lerp(from.sy, to.sy, i / 12) });
    if (hits) {
      const dir = to.sx === cx ? (from.sx >= cx ? 1 : -1) : to.sx > cx ? 1 : -1;
      const out = { sx: cx + dir * (fp.hw + 4), sy: lerp(from.sy, to.sy, 0.4) };
      const a = { ...out, z: from.z };
      const b = { ...out, z: to.z };
      // out round the pet at the start depth, then the depth changes in the clear
      // (two beats land there), then in at the new depth
      const d1 = Math.hypot(a.sx - from.sx, a.sy - from.sy) + 1;
      const d3 = Math.hypot(to.sx - b.sx, to.sy - b.sy) + 1;
      const n1 = Math.max(1, Math.min(n - 3, Math.round(((n - 2) * d1) / (d1 + d3))));
      plan = { a, b, n1, nz: 2 };
    }
  }
  const step = ms / n;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    let p;
    if (!plan) {
      const k = ease(u);
      p = { sx: lerp(from.sx, to.sx, k), sy: lerp(from.sy, to.sy, k), z: lerp(from.z, to.z, k) };
    } else if (i <= plan.n1) {
      const f = ease(u) / Math.max(1e-6, ease(plan.n1 / n));
      p = { sx: lerp(from.sx, plan.a.sx, f), sy: lerp(from.sy, plan.a.sy, f), z: from.z };
    } else if (i <= plan.n1 + plan.nz) {
      p = { sx: plan.a.sx, sy: plan.a.sy, z: lerp(from.z, to.z, (i - plan.n1) / plan.nz) };
    } else {
      const e0 = ease((plan.n1 + plan.nz) / n);
      const f = (ease(u) - e0) / Math.max(1e-6, 1 - e0);
      p = { sx: lerp(plan.b.sx, to.sx, f), sy: lerp(plan.b.sy, to.sy, f), z: to.z };
    }
    // each beat starts a short glide that arrives at the sampled point
    S.prop(t0 + (i - 1) * step, id, { ...p, moveMs: Math.round(step), ease: 'linear', ...(extra ? extra(u, i) : {}) });
  }
  return t0 + ms;
}

/*
 * A planned actor for script S, starting where the pet is (or `from`).
 * Every movement helper returns the time it ends and updates `pos`.
 */
export function createActor(c, S, from = c.cur) {
  const [z0, z1] = c.geo.zRange;
  const W = c.pet.sprite.width;

  const A = {
    pos: { sx: from.sx, sy: from.sy, z: from.z },
    facing: from.facing ?? 1,

    // sprite pixels -> screen px where the actor is
    px: () => spritePx(c, A.pos.z),

    // world point at a sprite-space offset from the actor (or from `base`)
    world(dx, dy = 0, dz = 0, base = A.pos) {
      const k = spritePx(c, base.z);
      return { sx: base.sx + dx * k, sy: base.sy + dy * k, z: clamp(base.z + dz, z0, z1) };
    },

    // where the actor must stand so its sprite offset (dx, dy, dz) lands on p
    standFor(p, dx = 0, dy = 0, dz = 0) {
      const z = clamp(p.z - dz, z0, z1);
      const k = spritePx(c, z);
      return c.geo.clamp({ sx: p.sx - dx * k, sy: p.sy - dy * k, z });
    },

    // sprite-space x of a world point (the pupils' focus), kept near the box
    spriteX(p) {
      return Math.round(clamp(W / 2 + (p.sx - A.pos.sx) / A.px(), -12, W + 12));
    },

    // screen distance to a world point, in sprite pixels
    dist(p) {
      return Math.hypot(p.sx - A.pos.sx, p.sy - A.pos.sy) / A.px();
    },

    gazeAt: (p) => gazeToward(A.pos, p),

    // eyes (and pupils) toward a world point; `turn` also turns the body
    look(t, p, extra = {}, turn = false) {
      const patch = { gaze: gazeToward(A.pos, p), focus: A.spriteX(p), ...extra };
      if (turn && Math.abs(p.sx - A.pos.sx) > 4) {
        A.facing = p.sx < A.pos.sx ? -1 : 1;
        patch.facing = A.facing;
      }
      S.at(t, patch);
      return t;
    },

    // walk with the shared step cycle (opts: stepMs, maxSteps, depthWeight, pose, endPose, gaze)
    walk(t, dest, opts = {}) {
      const to = c.geo.clamp(dest);
      const end = travel(
        S,
        c,
        A.pos,
        to,
        t,
        opts.stepMs ?? SCHEDULER.stepMs,
        opts.maxSteps ?? 30,
        opts.depthWeight ?? 0.5,
        opts
      );
      if (Math.abs(to.sx - A.pos.sx) > 4) A.facing = to.sx < A.pos.sx ? -1 : 1;
      A.pos = to;
      return end;
    },

    // a quick single glide (a scoot, a recoil, a slide): no step cycle
    glide(t, dest, ms, patch = {}) {
      const to = c.geo.clamp(dest);
      S.at(t, { sx: to.sx, sy: to.sy, z: to.z, transitionMs: ms, ease: 'out', ...patch });
      A.pos = to;
      return t + ms;
    },

    // a hop or pounce: up and over in an arc, landing in `land`
    hop(t, dest, { height = 8, ms = 420, land = { pose: 'crouch', legs: 0 } } = {}) {
      const to = c.geo.clamp(dest);
      const k = A.px();
      const mid = c.geo.clamp({
        sx: lerp(A.pos.sx, to.sx, 0.5),
        sy: lerp(A.pos.sy, to.sy, 0.5) - height * k,
        z: lerp(A.pos.z, to.z, 0.5),
      });
      const face = Math.abs(to.sx - A.pos.sx) > 4 ? { facing: to.sx < A.pos.sx ? -1 : 1 } : {};
      if (face.facing) A.facing = face.facing;
      S.at(t, { ...mid, transitionMs: Math.round(ms / 2), ease: 'out', pose: 'stand', legs: 3, ...face });
      S.at(t + ms / 2, { ...to, transitionMs: Math.round(ms / 2), ease: 'in' });
      S.at(t + ms, { legs: 0, ...land });
      A.pos = to;
      return t + ms;
    },
  };

  return A;
}
