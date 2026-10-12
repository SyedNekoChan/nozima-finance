import { defineActivity } from '../../core/activity.js';
import { defineBehavior } from '../../core/behaviors.js';
import { clampPoint, createActor } from '../../core/choreo.js';
import { clamp, int, lerp, pick, rnd } from '../../core/rng.js';
import { flick, sweep, travel, zBand } from '../../core/toolkit.js';
import { SCHEDULER } from '../../config.js';
import { SIGN, W, weighted } from './util.js';

/* Behaviors that move the pet through the X / Y / Z world. */

const AMBIENT_MS = SCHEDULER.ambientMs;

/*
 * Walking and exploring: each walk draws a route style, so the cat does
 * not shuttle back and forth along one line. Headings avoid doubling back
 * on the previous walk's direction and mix in vertical and depth travel.
 *
 *   stroll      the original: a nearby spot, sometimes a distracted stop
 *   meander     two or three short legs with pauses: a look, a sniff, an ear
 *   purposeful  one long brisk leg, tail up
 *   cautious    slow steps, partly crouched, freezing to listen
 *   playful     a pounce on an imaginary speck along the way
 *   depthArc    deep into (or out of) the scene, then across
 */
const ROUTES = { stroll: 3, meander: 2.5, purposeful: 2, cautious: 1.5, playful: 1.2, depthArc: 1.5 };

// A point `cells` away on a fresh heading (not straight back the way it came).
function routePoint(c, from, cells, dz) {
  const m = c.memory || {};
  const prev = m.walkHeading;
  let a = rnd(c.rng, 0, Math.PI * 2);
  for (let i = 0; i < 3 && prev !== undefined; i++) {
    const back = Math.abs(((a - (prev + Math.PI) + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (back > 0.9) break;
    a = rnd(c.rng, 0, Math.PI * 2);
  }
  m.walkHeading = a;
  const d = cells * c.geo.cell * c.geo.scaleAt(from.z);
  const [z0, z1] = c.geo.zRange;
  return c.geo.clamp({
    sx: from.sx + Math.cos(a) * d,
    sy: from.sy + Math.sin(a) * d * 0.6,
    z: clamp(from.z + dz, z0, z1),
  });
}

export const walk = defineActivity({
  id: 'walk',
  weights: W(16, 10),
  cooldown: 3000,
  moves: true,
  followOn: { sit: 3, observe: 3, inspect: 3, curious: 2, survey: 1.5 },
  plan(c, S, st) {
    const A = st.A;
    const m = c.memory || {};
    const style = weighted(c.rng, { ...ROUTES, [m.walkStyle]: (ROUTES[m.walkStyle] || 0) * 0.3 });
    m.walkStyle = style;
    const far = c.compact ? 0.7 : 1;
    let t = 0;

    if (style === 'meander') {
      for (let i = int(c.rng, 2, 3); i > 0; i--) {
        t = A.walk(t, routePoint(c, A.pos, rnd(c.rng, 3, 6) * far, rnd(c.rng, -50, 50)), {
          stepMs: rnd(c.rng, 480, 560),
          endPose: 'stand',
        });
        const pause = pick(c.rng, ['look', 'sniff', 'ear', 'still']);
        if (pause === 'look') t = sweep(c, S, t + 150, int(c.rng, 1, 2));
        else if (pause === 'sniff') {
          S.at(t, { pose: 'low', eyes: 'down' });
          S.at((t += rnd(c.rng, 500, 900)), { pose: 'stand', eyes: 'open' });
        } else if (pause === 'ear') t = S.play('earFlick', t + 100);
        else t += rnd(c.rng, 400, 1000);
        t += rnd(c.rng, 150, 400);
      }
      S.at(t, { pose: 'sit', legs: 0 });
      return t + rnd(c.rng, 700, 1500);
    }

    if (style === 'purposeful') {
      S.at(0, { tail: 'up' });
      t = A.walk(0, routePoint(c, A.pos, rnd(c.rng, 8, 12) * far, rnd(c.rng, -80, 80)), {
        stepMs: rnd(c.rng, 360, 410),
      });
      S.at(t, { tail: null });
      if (c.rng() < 0.5) t = S.play('lookToward', t + 200);
      return t + rnd(c.rng, 600, 1400);
    }

    if (style === 'cautious') {
      const dest = routePoint(c, A.pos, rnd(c.rng, 4, 7) * far, rnd(c.rng, -60, 60));
      const mid = { sx: lerp(A.pos.sx, dest.sx, 0.5), sy: lerp(A.pos.sy, dest.sy, 0.5), z: lerp(A.pos.z, dest.z, 0.5) };
      S.at(0, { ears: 'perk', eyes: 'wide' });
      t = A.walk(200, mid, { stepMs: rnd(c.rng, 640, 760), pose: 'crouch', endPose: 'crouch' });
      // freezes to listen
      S.at(t, { ears: c.rng() < 0.5 ? 'flickL' : 'flickR', gaze: pick(c.rng, ['l', 'r', 'u']) });
      t += rnd(c.rng, 700, 1600);
      S.at(t, { ears: 'perk', gaze: 'c', eyes: 'open' });
      t = A.walk(t, dest, { stepMs: rnd(c.rng, 560, 680), pose: c.rng() < 0.5 ? 'crouch' : 'stand' });
      S.at(t, { ears: null });
      return sweep(c, S, t + 300, int(c.rng, 1, 3)) + rnd(c.rng, 300, 800);
    }

    if (style === 'playful' && !c.reduced) {
      const dest = routePoint(c, A.pos, rnd(c.rng, 4, 7) * far, rnd(c.rng, -50, 50));
      const part = { sx: lerp(A.pos.sx, dest.sx, 0.45), sy: lerp(A.pos.sy, dest.sy, 0.45), z: lerp(A.pos.z, dest.z, 0.45) };
      t = A.walk(0, part, { stepMs: rnd(c.rng, 420, 480), endPose: 'crouch' });
      // a glinting speck on the floor ahead catches its eye
      const hopTo = c.geo.clamp({ sx: lerp(part.sx, dest.sx, 0.25), sy: lerp(part.sy, dest.sy, 0.25), z: lerp(part.z, dest.z, 0.25) });
      const speck = A.world(0, 23, 4, hopTo);
      st.prop(t, 'speck', { kind: 'trinket', name: 'star', tint: 'silver', glow: false, ...speck, fade: 0, fadeMs: 300 });
      st.prop(t + 40, 'speck', { fade: 1 });
      A.look(t, speck, { eyes: 'wide', pupils: 3, tail: 'swish' });
      t = S.play('wiggle', t + 300);
      t = A.hop(t, hopTo, { height: 6, ms: 360 });
      st.prop(t, 'speck', { fade: 0, fadeMs: 120 });
      // pinned! ...nothing there
      S.at(t, { pose: 'sit', pawL: 'low', pawR: 'low', eyes: 'down' });
      S.at((t += rnd(c.rng, 500, 800)), { pawL: null, pawR: null, cue: '?' });
      S.at((t += 700), { cue: null, pupils: null, tail: null, eyes: 'open', focus: null });
      t = A.walk(t + 200, dest, { stepMs: rnd(c.rng, 420, 480) });
      return t + rnd(c.rng, 600, 1400);
    }

    if (style === 'depthArc') {
      const [z0, z1] = c.geo.zRange;
      const deeper = c.cur.z > (z0 + z1) / 2;
      const dz = (deeper ? -1 : 1) * rnd(c.rng, 100, 160);
      t = A.walk(0, routePoint(c, A.pos, rnd(c.rng, 1.5, 3), dz), { stepMs: rnd(c.rng, 460, 520), depthWeight: 0.6, endPose: 'stand' });
      if (c.rng() < 0.5) t = S.play('lookToward', t + 100);
      t = A.walk(t + 150, routePoint(c, A.pos, rnd(c.rng, 4, 7) * far, rnd(c.rng, -30, 30)), { stepMs: rnd(c.rng, 460, 520) });
      return t + rnd(c.rng, 700, 1500);
    }

    // stroll (also the playful walk's stand-in under reduced motion)
    const dest = c.pickSpot({
      near: { sx: c.cur.sx, sy: c.cur.sy, radius: c.compact ? 150 : 340 },
      zRange: zBand(c, 90),
    });
    const stepMs = rnd(c.rng, 440, 520);

    // occasionally stop partway, as though distracted
    if (c.mood === 'idle' && c.rng() < 0.35) {
      const f = rnd(c.rng, 0.35, 0.65);
      const mid = {
        sx: lerp(c.cur.sx, dest.sx, f),
        sy: lerp(c.cur.sy, dest.sy, f),
        z: lerp(c.cur.z, dest.z, f),
      };
      const t1 = travel(S, c, c.cur, mid, 0, stepMs);
      S.at(t1, { eyes: 'wide', cue: '?', gaze: 'c' });
      S.at(t1 + 1500, { eyes: 'open', cue: null });
      const t2 = travel(S, c, mid, dest, t1 + 1700, stepMs);
      return t2 + rnd(c.rng, 800, 1800);
    }

    return travel(S, c, c.cur, dest, 0, stepMs) + rnd(c.rng, 800, 1800);
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

/*
 * Peeking in from an edge, then investigating. Each peek varies:
 *   edge      the nearer side (usually), the farther side, or the bottom
 *   how much  ears and eyes, the head, or head and shoulders
 *   how often once, or a few times (moving along the edge while hidden)
 *   then      withdraw and walk in later, come in cautiously, or come in to
 *             inspect a small curious thing that is lying near the edge
 * The pet leaves its spot while faded out (as before), so nothing is seen
 * to jump.
 */
export const peek = defineActivity({
  id: 'peek',
  weights: W(4),
  cooldown: 60000,
  moves: true,
  followOn: { look: 2, sit: 2, survey: 2 },
  plan(c, S, st) {
    const W_ = c.geo.width;
    const H_ = c.geo.height;
    const left = c.cur.sx < W_ / 2;
    const edge = weighted(c.rng, { near: 3, far: 1, bottom: 1.2 });
    const fromLeft = edge === 'near' ? left : !left;
    const [z0, z1] = c.geo.zRange;
    const z = lerp(z0, z1, rnd(c.rng, 0.3, 0.8));
    const [hw, hh] = c.geo.half(z);
    const b = c.geo.bounds(z);
    const bottom = edge === 'bottom';

    const along = () => (bottom ? lerp(b.minX, b.maxX, c.rng()) : lerp(b.minY, b.maxY, c.rng()));
    let lane = along();
    const hidden = () =>
      bottom ? { sx: lane, sy: H_ + hh * 1.3, z } : { sx: fromLeft ? -hw * 1.3 : W_ + hw * 1.3, sy: lane, z };
    // v: how much of the cat shows (0.22 ears and eyes .. 0.6 head and shoulders)
    const shown = (v) =>
      bottom
        ? { sy: H_ + hh - 2 * hh * v }
        : { sx: fromLeft ? -hw + 2 * hw * v : W_ + hw - 2 * hw * v };
    const inward = bottom ? 'u' : fromLeft ? 'r' : 'l';

    // leave while faded out, then come up to the edge
    S.at(0, { fade: 0 });
    S.at(AMBIENT_MS + 60, {
      ...hidden(),
      transitionMs: 0,
      offscreen: true,
      facing: bottom ? c.cur.facing : fromLeft ? 1 : -1,
      gaze: inward === 'u' ? 'c' : inward,
      legs: 0,
      pose: 'sit',
    });
    S.at(AMBIENT_MS + 160, { fade: 1 });

    let t = AMBIENT_MS + 300;
    const times = Number(weighted(c.rng, { 1: 3, 2: 2, 3: 1 }));
    let v = pick(c.rng, [0.22, 0.4, 0.6]);
    for (let i = 0; i < times; i++) {
      const ms = rnd(c.rng, 900, 1500);
      S.at(t, { ...shown(v), transitionMs: ms, ease: 'out' });
      t += ms;
      // looks: wide-eyed the first time, then an ear, a tilt, a glance
      if (i === 0) S.at(t, { eyes: 'wide', ears: 'perk' });
      S.blink(t + rnd(c.rng, 300, 600), i === 0 ? 'wide' : 'open');
      const g = pick(c.rng, bottom ? ['l', 'r', 'c'] : [inward, 'u', inward]);
      S.at(t + rnd(c.rng, 700, 1000), { gaze: g, ears: c.rng() < 0.5 ? 'flickL' : null, eyes: 'open', lean: c.rng() < 0.3 ? 1 : 0 });
      t += rnd(c.rng, 1200, 2000);
      S.at(t, { ears: null, lean: 0 });
      if (i < times - 1) {
        // ducks back, moves along the edge unseen, and peeks again
        const back = rnd(c.rng, 500, 900);
        S.at(t, { ...hidden(), transitionMs: back, ease: 'out' });
        t += back + rnd(c.rng, 700, 2000);
        lane = along();
        S.at(t - 150, { ...hidden(), transitionMs: 0 });
        v = pick(c.rng, [0.22, 0.4, 0.6]);
      }
    }

    const at = { ...hidden(), ...shown(v) };
    const then = weighted(c.rng, { withdraw: 2, approach: 2, investigate: 1.5 });

    if (then === 'withdraw') {
      const out = hidden();
      S.at(t, { ...out, transitionMs: 1100, ease: 'out' });
      t += 1100 + rnd(c.rng, 2200, 4000);
      t = travel(S, c, out, c.pickSpot({}), t);
      S.at(t, { offscreen: false });
      return t + 600;
    }

    // comes in: crouched and slow, then sits and takes the place in
    const inside = c.geo.clamp(
      bottom
        ? { sx: at.sx, sy: b.maxY - rnd(c.rng, 2, 5) * c.geo.cell, z }
        : { sx: fromLeft ? b.minX + rnd(c.rng, 2, 5) * c.geo.cell : b.maxX - rnd(c.rng, 2, 5) * c.geo.cell, sy: at.sy, z }
    );
    t = travel(S, c, at, inside, t, rnd(c.rng, 620, 720), 30, 0, { pose: 'crouch', endPose: 'sit' });
    S.at(t, { offscreen: false });

    if (then === 'investigate') {
      // something small lies a little further in: a sniff, a careful paw
      const A = createActor(c, S, inside);
      const s = bottom ? (c.rng() < 0.5 ? 'l' : 'r') : fromLeft ? 'r' : 'l';
      const thing = clampPoint(c, A.world(SIGN[s] * rnd(c.rng, 14, 18), 22, 6), 11);
      const name = pick(c.rng, ['feather', 'gem', 'flower', 'key', 'star']);
      st.prop(t, 'thing', { kind: 'trinket', name, tint: 'cyan', ...thing, fade: 0 });
      st.prop(t + 40, 'thing', { fade: 1 });
      A.look(t + 300, thing, { eyes: 'wide', ears: 'perk' });
      t += rnd(c.rng, 900, 1400);
      t = A.walk(t, A.standFor(thing, SIGN[s] * 7, 22, 6), { stepMs: 650, pose: 'crouch', endPose: 'crouch' });
      S.at(t, { pose: 'low', eyes: 'down' });
      S.at((t += 250), { droop: 1 });
      S.at((t += 200), { droop: 0 });
      S.at((t += 300), { pose: 'crouch', [s === 'l' ? 'pawL' : 'pawR']: 'low' });
      S.at((t += 250), { [s === 'l' ? 'pawL' : 'pawR']: null });
      // it answers with a glint and is gone
      st.prop(t, 'thing', { glow: true, glowHue: 'cyan' });
      st.prop(t + 400, 'thing', { fade: 0, fadeMs: 400 });
      S.at(t, { eyes: 'wide', pose: 'sit' });
      t += 900;
      S.at(t, { eyes: 'happy' });
      t += 700;
    }
    S.at(t, { eyes: 'open', focus: null, gaze: 'c' });
    return sweep(c, S, t + 200, int(c.rng, 1, 2)) + 300;
  },
  exit(c, why) {
    if (why === 'cancel') c.apply({ offscreen: false });
  },
});
