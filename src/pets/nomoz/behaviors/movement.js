import { defineBehavior } from '../../core/behaviors.js';
import { clamp, int, lerp, pick, rnd } from '../../core/rng.js';
import { flick, sweep, travel, zBand } from '../../core/toolkit.js';
import { SCHEDULER } from '../../config.js';
import { W } from './util.js';

/* Behaviors that move the pet through the X / Y / Z world. */

const AMBIENT_MS = SCHEDULER.ambientMs;

export const walk = defineBehavior({
  id: 'walk',
  weights: W(16, 10),
  cooldown: 3000,
  moves: true,
  followOn: { sit: 3, observe: 3, inspect: 3, curious: 2 },
  plan(c, S) {
    const dest = c.pickSpot({
      near: { sx: c.cur.sx, sy: c.cur.sy, radius: c.compact ? 150 : 340 },
      zRange: zBand(c, 90),
    });

    // occasionally stop partway, as though distracted
    if (c.mood === 'idle' && c.rng() < 0.35) {
      const f = rnd(c.rng, 0.35, 0.65);
      const mid = {
        sx: lerp(c.cur.sx, dest.sx, f),
        sy: lerp(c.cur.sy, dest.sy, f),
        z: lerp(c.cur.z, dest.z, f),
      };
      const t1 = travel(S, c, c.cur, mid, 0);
      S.at(t1, { eyes: 'wide', cue: '?', gaze: 'c' });
      S.at(t1 + 1500, { eyes: 'open', cue: null });
      const t2 = travel(S, c, mid, dest, t1 + 1700);
      return t2 + rnd(c.rng, 800, 1800);
    }

    return travel(S, c, c.cur, dest, 0) + rnd(c.rng, 800, 1800);
  },
});

export const travelFar = defineBehavior({
  id: 'travel',
  weights: W(8, 5),
  cooldown: 15000,
  moves: true,
  followOn: { observe: 2, read: 3, sit: 2 },
  plan(c, S) {
    const dest = c.pickSpot({});
    const t = travel(S, c, c.cur, dest, 0);
    const hold = rnd(c.rng, 6000, 14000);
    S.at(t + 200, { pose: 'sit', legs: 0 });
    for (let i = int(c.rng, 1, 3); i > 0; i--) S.blink(t + rnd(c.rng, 800, hold - 500));
    if (c.rng() < 0.5) S.at(t + rnd(c.rng, 1500, hold - 1500), { gaze: pick(c.rng, ['l', 'r', 'u']) });
    return t + hold;
  },
});

export const retreat = defineBehavior({
  id: 'retreat',
  weights: W(6, 3, 3),
  cooldown: 20000,
  moves: true,
  followOn: { observe: 3, sleep: 2 },
  plan(c, S) {
    const [z0, z1] = c.geo.zRange;
    const dest = c.pickSpot({ zRange: [z0, z0 + (z1 - z0) * 0.3] });
    const t = travel(S, c, c.cur, dest, 0);
    S.at(t + 200, { pose: 'sit', legs: 0 });
    return sweep(c, S, t + 900, int(c.rng, 3, 5)) + rnd(c.rng, 1500, 4000);
  },
});

/*
 * E. Vanishing into the distance: the pet walks steadily deeper into Z,
 * growing smaller and more subdued, stays there for a variable time, then
 * walks back. Every stage is continuous walking; nothing teleports.
 */
export const vanish = defineBehavior({
  id: 'vanish',
  rarity: 'uncommon',
  weights: W(4, 2),
  cooldown: 80000,
  duration: [8000, 26000],
  moves: true,
  followOn: { sleep: 3, observe: 2, watchBeyond: 2, read: 2 },
  plan(c, S) {
    const [z0, z1] = c.geo.zRange;
    const deepZ = z0 + (z1 - z0) * rnd(c.rng, 0, 0.07);
    const b = c.geo.bounds(deepZ);
    const spread = c.compact ? 70 : 150;
    const away = {
      sx: clamp(c.cur.sx + rnd(c.rng, -spread, spread), b.minX, b.maxX),
      sy: clamp(c.cur.sy + rnd(c.rng, -spread / 2, spread / 2), b.minY, b.maxY),
      z: deepZ,
    };

    // a slow descent into depth: more steps for more distance in Z
    const t = travel(S, c, c.cur, away, 0, SCHEDULER.stepMs, 30, 0.6);

    // far away it is quieter: dimmer, still, watching
    S.at(t, { fade: 0.78, pose: 'sit', legs: 0 });
    const stay = rnd(c.rng, ...this.duration);
    let u = t + 1000;
    while (u < t + stay - 1500) {
      S.at(u, { gaze: pick(c.rng, ['l', 'c', 'r', 'u']) });
      if (c.rng() < 0.4) S.blink(u + rnd(c.rng, 400, 1200));
      u += rnd(c.rng, 1800, 4200);
    }

    // then it comes back the way it went, by walking
    S.at(t + stay, { fade: 1, gaze: 'c' });
    const back = c.pickSpot({ zRange: [z0 + (z1 - z0) * 0.35, z1 - (z1 - z0) * 0.1] });
    const t2 = travel(S, c, away, back, t + stay + 500, SCHEDULER.stepMs, 30, 0.6);
    return t2 + rnd(c.rng, 800, 1800);
  },
});

export const approach = defineBehavior({
  id: 'approach',
  weights: W(6, 3, 6),
  cooldown: 20000,
  moves: true,
  followOn: { look: 3, ponderSymbol: 2 },
  plan(c, S) {
    const [z0, z1] = c.geo.zRange;
    const dest = c.pickSpot({ zRange: [z1 - (z1 - z0) * 0.3, z1] });
    const t = travel(S, c, c.cur, dest, 0);
    S.at(t + 200, { eyes: 'wide', legs: 0 });
    S.at(t + 900, { eyes: 'open' });
    return sweep(c, S, t + 1100, int(c.rng, 2, 4));
  },
});

export const relocate = defineBehavior({
  id: 'relocate',
  weights: W(4, 3, 4),
  cooldown: 45000,
  moves: true,
  followOn: { look: 2, sit: 2 },
  plan(c, S) {
    const dest = c.pickSpot({});
    S.at(0, { fade: 0, pose: 'sit', legs: 0 });
    S.at(AMBIENT_MS + 80, {
      sx: dest.sx,
      sy: dest.sy,
      z: dest.z,
      transitionMs: 0,
      facing: c.rng() < 0.5 ? -1 : 1,
      gaze: pick(c.rng, ['c', 'l', 'r']),
    });
    S.at(AMBIENT_MS + 220, { fade: 1 });
    return AMBIENT_MS * 2 + 600;
  },
});

export const edgeExit = defineBehavior({
  id: 'edgeExit',
  weights: W(3, 1),
  cooldown: 90000,
  moves: true,
  followOn: { look: 2, sit: 2 },
  plan(c, S) {
    const W_ = c.geo.width;
    const left = c.cur.sx < W_ / 2;
    const [hw] = c.geo.half(c.cur.z);
    const dest = c.pickSpot({});
    const [hw2] = c.geo.half(dest.z);
    const enterLeft = c.rng() < 0.5;

    const out = rnd(c.rng, 1800, 2600);
    S.at(0, {
      sx: left ? -hw * 1.4 : W_ + hw * 1.4,
      facing: left ? -1 : 1,
      gaze: left ? 'l' : 'r',
      pose: 'sit',
      transitionMs: out,
      ease: 'out',
      offscreen: true,
    });
    flick(S, 0, out);

    const hide = out + rnd(c.rng, 2200, 5500);
    S.at(hide, {
      sx: enterLeft ? -hw2 * 1.4 : W_ + hw2 * 1.4,
      sy: dest.sy,
      z: dest.z,
      transitionMs: 0,
      facing: enterLeft ? 1 : -1,
      gaze: enterLeft ? 'r' : 'l',
      legs: 0,
    });

    const inn = rnd(c.rng, 2200, 3200);
    S.at(hide + 80, { sx: dest.sx, transitionMs: inn, ease: 'out' });
    flick(S, hide + 80, inn);
    S.at(hide + 80 + inn, { offscreen: false, gaze: 'c' });
    return hide + inn + 700;
  },
  exit(c, why) {
    if (why === 'cancel') c.apply({ offscreen: false });
  },
});

export const peek = defineBehavior({
  id: 'peek',
  weights: W(4),
  cooldown: 60000,
  moves: true,
  followOn: { look: 2, sit: 2 },
  plan(c, S) {
    const W_ = c.geo.width;
    const left = c.cur.sx < W_ / 2;
    const [z0, z1] = c.geo.zRange;
    const z = lerp(z0, z1, rnd(c.rng, 0.3, 0.8));
    const [hw] = c.geo.half(z);
    const b = c.geo.bounds(z);
    const sy = lerp(b.minY, b.maxY, c.rng());
    const hiddenX = left ? -hw * 1.3 : W_ + hw * 1.3;
    const peekX = left ? -hw * 0.2 : W_ + hw * 0.2;

    // leave while faded out, then slide in just far enough to be seen
    S.at(0, { fade: 0 });
    S.at(AMBIENT_MS + 60, {
      sx: hiddenX,
      sy,
      z,
      transitionMs: 0,
      offscreen: true,
      facing: left ? -1 : 1,
      gaze: left ? 'r' : 'l',
      legs: 0,
      pose: 'sit',
    });
    S.at(AMBIENT_MS + 160, { fade: 1 });

    let t = AMBIENT_MS + 300;
    S.at(t, { sx: peekX, transitionMs: 1300, ease: 'out' });
    t += 1300 + rnd(c.rng, 500, 900);
    S.blink(t);
    t += rnd(c.rng, 800, 1500);
    S.at(t, { sx: hiddenX, transitionMs: 1100, ease: 'out' });
    t += 1100 + rnd(c.rng, 2200, 4000);

    const dest = c.pickSpot({});
    t = travel(S, c, { sx: hiddenX, sy, z }, dest, t);
    S.at(t, { offscreen: false });
    return t + 600;
  },
  exit(c, why) {
    if (why === 'cancel') c.apply({ offscreen: false });
  },
});
