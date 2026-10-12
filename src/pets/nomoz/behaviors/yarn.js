import { defineActivity } from '../../core/activity.js';
import { EASE, clampPoint, moveProp } from '../../core/choreo.js';
import { int, lerp, rnd } from '../../core/rng.js';
import { LEAN, PAW, SIGN, W, anySide, maybeTransition, other } from './util.js';

/*
 * Red yarn play: a small ball of red wool (the `yarn` world prop) and a
 * random chain of play sequences built from the shared movement and
 * grooming primitives. Every run draws its own intro, two or three
 * sequences (never the same one twice in a row, and the last run's
 * choices are less likely), speeds, directions, pauses and outro.
 *
 * Sequences (SEQUENCES below):
 *   pass          sitting, the ball is passed slowly from paw to paw
 *   rollFollow    it rolls wider; eyes and head follow, a paw reaches out
 *   batChase      batted away, tracked, a hesitant start, a rush, a pounce
 *   stalk         a still ball is stalked in a crouch: freeze, false start, pounce
 *   sendAcross    a big swat sends it across the world; a run after it
 *   lost          it rolls behind the cat; a search, a discovery, a pounce
 *   lieTap        lying down, lazy taps at a slowly rolling ball
 *   catchRelease  scooped up, caught between the paws, held, let go
 */

const BALL = 'ball';
const SIZE = 9; // the ball's width in sprite px (keeps it inside the world)
const PAWS = { dy: 22, dz: 5 }; // in front of the paws, from the sprite centre
const PAW_DX = { l: -6, r: 6 };

const lerpP = (a, b, u) => ({ sx: lerp(a.sx, b.sx, u), sy: lerp(a.sy, b.sy, u), z: lerp(a.z, b.z, u) });

// sprite px per world "cell" (1/12 of the sprite width) where the actor is
const cellPx = (c, A) => (A.px() * c.pet.sprite.width) / 12;

// A point `cells` away from `from`, heading roughly away from the cat.
function awayPoint(c, A, from, cells, dz = 0) {
  const base = Math.atan2(from.sy - A.pos.sy, from.sx - A.pos.sx);
  const a = base + rnd(c.rng, -1.2, 1.2);
  const d = cells * cellPx(c, A);
  return clampPoint(c, { sx: from.sx + Math.cos(a) * d, sy: from.sy + Math.sin(a) * d * 0.5, z: from.z + dz }, SIZE);
}

// A point `gap` sprite px short of `to`, on the way from `from`.
function shortOf(c, A, from, to, gap) {
  const len = Math.hypot(to.sx - from.sx, to.sy - from.sy) || 1;
  const k = Math.max(0, 1 - (gap * A.px()) / len);
  return c.geo.clamp(lerpP(from, to, k));
}

function makeBall(c, S, st, A) {
  const id = st.id(BALL);
  const B = {
    pos: null,
    roll: 0,

    place(t, p, extra = {}) {
      B.pos = clampPoint(c, p, SIZE);
      st.prop(t, BALL, { kind: 'yarn', ...B.pos, roll: B.roll, moveMs: 0, air: false, squash: 0, thread: 0, ...extra });
      return t;
    },

    // where it rests at the cat's paws (or under one paw)
    paws: (side) => A.world(side ? PAW_DX[side] : 0, PAWS.dy, PAWS.dz),

    // is it within paw's reach right now?
    near: (gap = 6) => Math.hypot(B.paws().sx - B.pos.sx, B.paws().sy - B.pos.sy) / A.px() < gap,

    // roll along the floor: the winding turns, the loose end trails
    rollTo(t, p, ms, { ease = EASE.out, watch = true, lean = true } = {}) {
      const from = B.pos;
      const to = clampPoint(c, p, SIZE);
      const dir = to.sx < from.sx ? -1 : 1;
      const r0 = B.roll;
      moveProp(S, id, from, to, t, ms, {
        every: 110,
        ease,
        extra: (u, i) => ({ roll: r0 + i * dir, thread: -dir, air: false, squash: 0 }),
      });
      B.roll = r0 + Math.round(ms / 110) * dir;
      S.prop(t + ms + 160, id, { thread: 0 });
      if (watch) B.follow(t, ms, from, to, ease, lean);
      B.pos = to;
      return t + ms;
    },

    // through the air in an arc
    arc(t, p, ms, height, { land = true } = {}) {
      const from = B.pos;
      const to = clampPoint(c, p, SIZE);
      const top = clampPoint(c, { ...lerpP(from, to, 0.5), sy: Math.min(from.sy, to.sy) - height * A.px() }, SIZE);
      moveProp(S, id, from, top, t, ms / 2, { every: 90, ease: EASE.out, extra: () => ({ air: true, thread: 0 }) });
      moveProp(S, id, top, to, t + ms / 2, ms / 2, { every: 90, ease: EASE.in, extra: () => ({ air: true }) });
      B.follow(t, ms / 2, from, top, EASE.out, false);
      B.follow(t + ms / 2, ms / 2, top, to, EASE.in, false);
      if (land) B.squash(t + ms);
      B.pos = to;
      return t + ms;
    },

    // straight down onto the floor
    drop(t, p, ms = 220) {
      const to = clampPoint(c, p, SIZE);
      moveProp(S, id, B.pos, to, t, ms, { every: 70, ease: EASE.in, extra: () => ({ air: true }) });
      B.squash(t + ms);
      B.pos = to;
      return t + ms;
    },

    squash(t) {
      S.prop(t, id, { squash: 1, air: false });
      S.prop(t + 160, id, { squash: 0 });
      return t;
    },

    // the eyes (and the head, when it is far to a side) follow the ball
    follow(t0, ms, from, to, ease = EASE.linear, lean = true) {
      for (let u = 0; u <= ms; u += 260) {
        const p = lerpP(from, to, ease(Math.min(1, u / ms)));
        const dx = (p.sx - A.pos.sx) / A.px();
        A.look(t0 + u, p, lean ? { lean: dx < -14 ? -1 : dx > 14 ? 1 : 0 } : {});
      }
    },
  };
  return B;
}

// Brings the ball to the paws: draws it in if it is close, walks to it if not.
function fetch(y, t, { stepMs = 460 } = {}) {
  const { c, S, A, B } = y;
  if (B.near(5)) return t;
  const off = Math.hypot(B.paws().sx - B.pos.sx, B.paws().sy - B.pos.sy) / A.px();

  if (off < 13 && Math.abs(B.pos.z - A.pos.z - PAWS.dz) < 30) {
    const s = B.pos.sx < A.pos.sx ? 'l' : 'r';
    S.at(t, { [PAW[s]]: 'out', lean: LEAN[s], eyes: 'open' });
    t = B.rollTo(t + 150, B.paws(), 450, { ease: EASE.inOut, lean: false });
    S.at(t, { [PAW[s]]: null, lean: 0, eyes: 'down' });
    return t + 150;
  }

  A.look(t, B.pos, { eyes: 'open' });
  t = A.walk(t + rnd(c.rng, 120, 300), A.standFor(B.pos, 0, PAWS.dy, PAWS.dz), { stepMs });
  S.at(t, { eyes: 'down', focus: null });
  // the world's edge may leave it a little off: a paw draws it in
  return B.rollTo(t + 100, B.paws(), 350, { ease: EASE.inOut, watch: false }) + 100;
}

// A pounce onto the ball from a crouch, landing with both paws on it.
function pounce(y, t, { height = 6, ms = 360 } = {}) {
  const { c, S, A, B } = y;
  const target = A.standFor(B.pos, 0, PAWS.dy, PAWS.dz);
  A.look(t, B.pos);
  t = S.play('wiggle', t);
  t = A.hop(t, target, { height, ms, land: { pose: 'crouch' } });
  S.at(t, { pose: 'sit', pawL: 'low', pawR: 'low', eyes: 'down', tail: null, ears: null, focus: null });
  B.squash(t);
  t = B.rollTo(t + 80, B.paws(), 220, { watch: false });
  t += rnd(c.rng, 450, 1000);
  S.at(t, { pawL: null, pawR: null, pupils: null });
  return t + 150;
}

const SEQUENCES = {
  pass(y, t) {
    const { c, S, A, B } = y;
    t = fetch(y, t);
    S.at(t, { pose: 'sit', legs: 0, eyes: 'down', pupils: 2, lean: 0 });
    let s = B.pos.sx < A.pos.sx ? 'l' : 'r';
    for (let i = int(c.rng, 2, 5); i > 0; i--) {
      const o = other(s);
      S.at(t, { [PAW[s]]: 'low' });
      t += rnd(c.rng, 160, 320);
      S.at(t, { [PAW[s]]: null });
      t = B.rollTo(t, B.paws(o), rnd(c.rng, 650, 1300), { ease: EASE.inOut, lean: false });
      S.at(t, { [PAW[o]]: 'low', eyes: 'down' });
      t += rnd(c.rng, 200, 520);
      if (c.rng() < 0.25) {
        // holds it there and looks up a moment
        S.at(t, { gaze: 'u', eyes: 'open', focus: null });
        t += rnd(c.rng, 500, 1100);
        S.at(t, { gaze: 'c', eyes: 'down' });
      }
      S.at(t, { [PAW[o]]: null });
      s = o;
    }
    return t + 200;
  },

  rollFollow(y, t) {
    const { c, S, A, B } = y;
    t = fetch(y, t);
    for (let i = int(c.rng, 2, 3); i > 0; i--) {
      const s = anySide(c);
      const push = other(s);
      S.at(t, { [PAW[push]]: 'low', eyes: 'down' });
      t += 180;
      S.at(t, { [PAW[push]]: null, eyes: 'open' });
      const far = A.world(SIGN[s] * rnd(c.rng, 12, 17), PAWS.dy + rnd(c.rng, -1, 2), PAWS.dz);
      t = B.rollTo(t, far, rnd(c.rng, 900, 1500));
      S.at(t, { [PAW[s]]: 'out', lean: LEAN[s] });
      t += rnd(c.rng, 250, 500);
      t = B.rollTo(t, B.paws(), rnd(c.rng, 600, 900), { ease: EASE.inOut });
      S.at(t, { [PAW[s]]: null, lean: 0, eyes: 'down' });
      t += rnd(c.rng, 300, 800);
    }
    return t;
  },

  batChase(y, t) {
    const { c, S, A, B } = y;
    t = fetch(y, t);
    // anticipation, then the bat
    S.at(t, { pose: 'crouch', eyes: 'wide', pupils: 3, ears: 'perk', tail: 'swish' });
    t += rnd(c.rng, 300, 700);
    const s = anySide(c);
    S.at(t, { [PAW[s]]: 'out', lean: LEAN[s] });
    S.at(t + 130, { [PAW[s]]: null, lean: 0 });
    t += 120;
    B.squash(t);

    // it shoots off, often through depth; the cat tracks it
    const from = B.pos;
    const dest = awayPoint(c, A, from, rnd(c.rng, 7, 12), rnd(c.rng, -120, 90));
    const ms = rnd(c.rng, 1200, 2000);
    B.rollTo(t, dest, ms, { watch: false });
    const watchMs = ms * rnd(c.rng, 0.3, 0.5);
    B.follow(t, watchMs, from, dest, EASE.out);

    // the chase: a hesitant start, then a rush
    let tc = t + watchMs;
    const target = A.standFor(dest, 0, PAWS.dy, PAWS.dz);
    if (A.dist(target) > 16) {
      const pre = shortOf(c, A, A.pos, target, 10);
      tc = A.walk(tc, lerpP(A.pos, pre, 0.3), { stepMs: rnd(c.rng, 400, 460), endPose: 'stand' });
      tc = A.walk(tc, pre, { stepMs: rnd(c.rng, 230, 280), endPose: 'crouch' });
    }
    tc = Math.max(tc, t + ms) + rnd(c.rng, 150, 400);
    return pounce(y, tc);
  },

  stalk(y, t) {
    const { c, S, A, B } = y;
    // a still ball a little way off (nudged out first if it is at the paws)
    if (B.near(10)) {
      const s = anySide(c);
      S.at(t, { [PAW[s]]: 'low' });
      S.at(t + 160, { [PAW[s]]: null });
      t = B.rollTo(t + 160, awayPoint(c, A, B.pos, rnd(c.rng, 5, 8), rnd(c.rng, -60, 60)), rnd(c.rng, 1400, 2200));
    }

    A.look(t, B.pos, { pose: 'crouch', legs: 0, eyes: 'wide', pupils: 3, ears: 'perk', tail: 'still' }, true);
    t += rnd(c.rng, 500, 900);

    // creeps in, freezing between advances
    const target = A.standFor(B.pos, 0, PAWS.dy, PAWS.dz);
    const start = A.pos;
    const pre = shortOf(c, A, start, target, 12);
    const legs = A.dist(pre) > 10 ? int(c.rng, 1, 3) : 0;
    for (let i = 0; i < legs; i++) {
      const g = A.gazeAt(B.pos);
      t = A.walk(t, lerpP(start, pre, (i + 1) / legs), {
        stepMs: rnd(c.rng, 680, 860),
        pose: 'crouch',
        endPose: 'crouch',
        gaze: g === 'u' ? 'c' : g,
      });
      S.at(t, { eyes: 'wide', ears: i % 2 ? 'flickL' : 'perk', tail: 'still' });
      t += rnd(c.rng, 500, 1600);
    }

    // a false start, sometimes
    if (c.rng() < 0.4) {
      const toward = B.pos.sx < A.pos.sx ? -1 : 1;
      S.at(t, { lean: toward, ears: 'perk' });
      S.at(t + 200, { lean: 0 });
      t += rnd(c.rng, 400, 900);
    }
    return pounce(y, t, { height: 7, ms: 300 });
  },

  sendAcross(y, t) {
    const { c, S, A, B } = y;
    t = fetch(y, t);
    const far = A.pos.sx < c.geo.width / 2 ? 'r' : 'l';

    // wind-up and a big swat
    S.at(t, { [PAW[far]]: 'mid', lean: -LEAN[far], eyes: 'wide', pupils: 3 });
    t += rnd(c.rng, 200, 320);
    S.at(t, { [PAW[far]]: 'out', lean: LEAN[far] });
    S.at(t + 160, { [PAW[far]]: null, lean: 0 });
    B.squash(t);

    // across the world, deeper or nearer
    const z = A.pos.z + rnd(c.rng, -140, 60);
    const b = c.geo.bounds(Math.max(c.geo.zRange[0], Math.min(c.geo.zRange[1], z)));
    const sx = far === 'r' ? lerp(A.pos.sx, b.maxX, rnd(c.rng, 0.75, 1)) : lerp(A.pos.sx, b.minX, rnd(c.rng, 0.75, 1));
    const dest = clampPoint(c, { sx, sy: B.pos.sy + rnd(c.rng, -40, 40), z }, SIZE);
    t = B.rollTo(t, dest, rnd(c.rng, 2000, 3200));
    S.at(t, { ears: 'perk', lean: 0 });
    t += rnd(c.rng, 200, 500);

    // runs after it, slows near it, has a sniff
    const target = A.standFor(dest, 0, PAWS.dy, PAWS.dz);
    if (A.dist(target) > 20) t = A.walk(t, shortOf(c, A, A.pos, target, 14), { stepMs: rnd(c.rng, 270, 320), endPose: 'stand' });
    t = A.walk(t, target, { stepMs: 520, endPose: 'stand' });
    S.at(t, { pose: 'low', eyes: 'down', focus: null });
    for (let i = int(c.rng, 1, 3); i > 0; i--) {
      S.at((t += 220), { droop: 1 });
      S.at((t += 200), { droop: 0 });
    }
    S.at((t += 200), { pose: 'sit' });

    // and bats it back into play
    const s = anySide(c);
    S.at((t += 250), { [PAW[s]]: 'out' });
    S.at(t + 150, { [PAW[s]]: null });
    const back = clampPoint(c, lerpP(B.pos, y.origin, rnd(c.rng, 0.35, 0.6)), SIZE);
    return B.rollTo(t + 100, back, rnd(c.rng, 1200, 1800)) + 200;
  },

  lost(y, t) {
    const { c, S, A, B } = y;
    t = fetch(y, t);
    const s = anySide(c);
    S.at(t, { [PAW[s]]: 'low' });
    S.at(t + 160, { [PAW[s]]: null });
    // it rolls round behind the cat, out of sight
    const hide = A.world(SIGN[other(s)] * rnd(c.rng, 1, 4), 16, -35);
    t = B.rollTo(t + 160, hide, rnd(c.rng, 700, 1000), { watch: false });

    // where did it go?
    S.at(t, { eyes: 'down', gaze: 'c', focus: null });
    t += rnd(c.rng, 400, 700);
    S.at(t, { eyes: 'wide', cue: '?', ears: 'perk', gaze: 'l' });
    S.at((t += rnd(c.rng, 500, 900)), { gaze: 'r', ears: 'flickR' });
    S.at((t += rnd(c.rng, 500, 900)), { cue: null, ears: null, gaze: 'c' });
    if (c.rng() < 0.6) {
      S.at(t, { pose: 'low', eyes: 'down' });
      t += rnd(c.rng, 600, 1100);
      S.at(t, { pose: 'sit', eyes: 'open' });
      t += 200;
    }

    // pads off a few steps to look, which uncovers the ball where it sat
    const dir = anySide(c);
    t = A.walk(t, A.world(SIGN[dir] * rnd(c.rng, 14, 20), rnd(c.rng, -3, 3), rnd(c.rng, -10, 10)), { stepMs: 460 });
    A.look(t, B.pos, { eyes: 'wide', cue: '!', ears: 'perk' }, true);
    t += rnd(c.rng, 600, 900);
    S.at(t, { cue: null, eyes: 'open' });

    // and a happy pounce back to it
    const target = A.standFor(B.pos, 0, PAWS.dy, PAWS.dz);
    if (A.dist(target) > 30) t = A.walk(t, shortOf(c, A, A.pos, target, 12), { stepMs: 380, endPose: 'crouch' });
    return pounce(y, t + 150, { height: 5, ms: 340 });
  },

  lieTap(y, t) {
    const { c, S, A, B } = y;
    t = fetch(y, t);
    S.at(t, { pose: 'crouch', eyes: 'down' });
    S.at((t += 260), { pose: 'loaf', eyes: 'down', tail: null });
    t += rnd(c.rng, 500, 900);

    // out to one side, then slowly past the paws; a lazy tap as it passes
    let s = anySide(c);
    t = B.rollTo(t, A.world(SIGN[s] * 14, PAWS.dy + 2, PAWS.dz + 1), 900, { lean: false });
    for (let i = int(c.rng, 2, 3); i > 0; i--) {
      const o = other(s);
      const mid = A.world(SIGN[s] * rnd(c.rng, 1, 4), PAWS.dy + 2, PAWS.dz + 1);
      t = B.rollTo(t, mid, rnd(c.rng, 1300, 2100), { ease: EASE.linear, lean: false });
      S.at(t, { [PAW[s]]: 'low' });
      S.at(t + 220, { [PAW[s]]: null });
      // the tap sends it on a little faster, a little off its line
      const to = A.world(SIGN[o] * rnd(c.rng, 10, 15), PAWS.dy + rnd(c.rng, 0, 4), PAWS.dz + rnd(c.rng, -2, 8));
      t = B.rollTo(t + 60, to, rnd(c.rng, 900, 1500), { lean: false });
      if (c.rng() < 0.4) {
        S.at(t, { eyes: 'closed' });
        S.at((t += rnd(c.rng, 400, 800)), { eyes: 'down' });
      }
      if (c.rng() < 0.35) S.at(t, { tail: 'swish' });
      t += rnd(c.rng, 300, 700);
      s = o;
    }
    S.at(t, { pose: 'crouch', tail: null });
    S.at((t += 250), { pose: 'sit', eyes: 'open' });
    return t + 200;
  },

  catchRelease(y, t) {
    const { c, S, A, B } = y;
    t = fetch(y, t);
    const s = anySide(c);
    // scoops it up and tosses it
    S.at(t, { [PAW[s]]: 'low', eyes: 'open', pupils: 3 });
    S.at((t += 140), { [PAW[s]]: 'mid', gaze: 'u' });
    t = B.arc(t, A.world(0, 11, 7), rnd(c.rng, 650, 900), rnd(c.rng, 16, 26), { land: false });

    // caught between both paws, held a moment
    S.at(t - 60, { pawL: 'mid', pawR: 'mid', eyes: 'down', gaze: 'c', pupils: 2 });
    t += rnd(c.rng, 500, 900);
    if (c.rng() < 0.5) {
      for (let i = int(c.rng, 2, 3); i > 0; i--) {
        S.at(t, { mouth: 'chew' });
        S.at((t += 150), { mouth: 'idle' });
        t += rnd(c.rng, 150, 260);
      }
    }
    if (c.rng() < 0.4) {
      S.at(t, { eyes: 'happy' });
      S.at((t += rnd(c.rng, 500, 800)), { eyes: 'down' });
    }

    // and lets it go
    S.at(t, { pawL: 'low', pawR: 'low' });
    t = B.drop(t + 60, B.paws());
    S.at(t + 100, { pawL: null, pawR: null });
    t = B.rollTo(t + 120, A.world(anySide(c) === 'l' ? -rnd(c.rng, 4, 8) : rnd(c.rng, 4, 8), PAWS.dy, PAWS.dz), rnd(c.rng, 500, 800));
    S.at(t, { pupils: null });
    return t + 200;
  },
};

const SEQUENCE_WEIGHTS = {
  pass: 3,
  rollFollow: 3,
  batChase: 3,
  stalk: 2.5,
  sendAcross: 2,
  lost: 1.5,
  lieTap: 2,
  catchRelease: 2.5,
};

export const yarnPlay = defineActivity({
  id: 'yarnPlay',
  performance: true,
  rarity: 'uncommon',
  weights: W(4, 2.5),
  cooldown: 110000,
  duration: [15000, 45000],
  moves: true,
  followOn: { groom: 4, stretch: 2, sit: 2, tired: 1.5 },
  plan(c, S, st) {
    const A = st.A;
    const B = makeBall(c, S, st, A);
    const y = { c, S, st, A, B, origin: A.pos };

    S.at(0, { pose: 'sit', legs: 0, eyes: 'open', mouth: 'idle', lean: 0 });
    let t = rnd(c.rng, 300, 800);

    // intro: it rolls in, is conjured, or is simply there
    const intro = st.variant('intro', { rollIn: 3, conjure: 2, found: 2 });
    if (intro === 'conjure') {
      const s = anySide(c);
      t = S.play('conjure', t, { side: s, c: 'O', keep: true });
      S.fx(t, 'conjure', null);
      S.at(t, { [PAW[s]]: null, pupils: null });
      B.place(t, B.paws(), { fade: 0, fadeMs: 250 });
      st.prop(t + 40, BALL, { fade: 1 });
      B.squash(t + 120);
      S.at(t + 120, { eyes: 'wide', ears: 'perk' });
      t += rnd(c.rng, 600, 1000);
      S.at(t, { eyes: 'down', ears: null });
    } else {
      const start = awayPoint(c, A, A.world(0, PAWS.dy, 0), rnd(c.rng, 6, 11), rnd(c.rng, -100, 60));
      B.place(t, start, { fade: 0 });
      st.prop(t + 40, BALL, { fade: 1 });
      t += rnd(c.rng, 500, 900);
      A.look(t, B.pos, { eyes: 'wide', ears: 'perk', pupils: 3 });
      t += rnd(c.rng, 500, 1000);
      S.at(t, { ears: null, eyes: 'open' });
      if (intro === 'rollIn') {
        // it rolls toward the cat and is stopped with a paw
        t = B.rollTo(t, A.world(rnd(c.rng, -10, 10), PAWS.dy, PAWS.dz), rnd(c.rng, 1500, 2400));
        t = fetch(y, t);
      }
    }

    // the play itself: two or three sequences
    const seqs = st.some('seq', SEQUENCE_WEIGHTS, int(c.rng, 2, 3));
    for (const name of seqs) {
      t = SEQUENCES[name](y, t);
      S.at(t, { pupils: null, tail: null, ears: null, lean: 0 });
      t += rnd(c.rng, 250, 900);
      if (c.rng() < 0.25) t = S.play(c.rng() < 0.5 ? 'earFlick' : 'pause', t);
    }

    // outro: it is left behind, dissolves, or is swatted off into the distance
    const outro = st.variant('outro', { leave: 2, dissolve: 2, swat: 1.5 });
    S.at(t, { pose: 'sit', legs: 0, eyes: 'open', pupils: null });
    if (outro === 'dissolve') {
      A.look(t, B.pos, { eyes: 'wide' });
      st.prop(t, 'puff', { kind: 'trinket', name: 'burst', tint: 'rose', ...B.pos, z: B.pos.z + 1, frame: 0 });
      st.prop(t + 120, 'puff', { frame: 1 });
      st.prop(t + 240, 'puff', { frame: 2 });
      st.prop(t + 120, BALL, { fade: 0, fadeMs: 240 });
      st.prop(t + 420, 'puff', null);
      t += 700;
      S.at(t, { eyes: 'happy', focus: null });
      t += rnd(c.rng, 700, 1100);
    } else if (outro === 'swat') {
      t = fetch(y, t);
      const s = anySide(c);
      S.at(t, { [PAW[s]]: 'out', lean: LEAN[s] });
      S.at(t + 150, { [PAW[s]]: null, lean: 0 });
      const deep = { ...awayPoint(c, A, B.pos, rnd(c.rng, 5, 8), 0), z: c.geo.zRange[0] };
      const ms = rnd(c.rng, 1800, 2600);
      B.rollTo(t + 100, deep, ms);
      st.prop(t + 100 + ms * 0.5, BALL, { fade: 0, fadeMs: Math.round(ms * 0.5) });
      t += 100 + ms;
    } else {
      // a last gentle nudge, then it turns away and leaves it be
      t = B.rollTo(t, awayPoint(c, A, B.pos, rnd(c.rng, 2, 4), 0), rnd(c.rng, 800, 1200));
      const away = A.world(-SIGN[B.pos.sx < A.pos.sx ? 'l' : 'r'] * rnd(c.rng, 14, 22), rnd(c.rng, -6, 6), rnd(c.rng, -30, 30));
      S.at(t, { focus: null });
      const t1 = A.walk(t + 300, away, { stepMs: 480 });
      st.prop(t + 900, BALL, { fade: 0, fadeMs: 900 });
      t = Math.max(t1, t + 1900);
    }

    S.at(t, { focus: null, gaze: 'c' });
    t = maybeTransition(S, c, t, { chance: 0.35, pool: { lickPaw: 3, satisfied: 2, survey: 1, stretchOut: 1 } });
    return t + rnd(c.rng, 400, 900);
  },
});
