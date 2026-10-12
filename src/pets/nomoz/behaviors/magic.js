import { defineActivity } from '../../core/activity.js';
import { EASE, clampPoint, moveProp, spritePx } from '../../core/choreo.js';
import { int, lerp, pick, rnd } from '../../core/rng.js';
import { CONSTELLATIONS, SIGIL_NAMES } from '../props.js';
import { LEAN, PAW, SIGN, W, anySide, maybeTransition, weighted } from './util.js';

/*
 * Magical activities: a wisp to play with, alchemy, constellation mapping
 * and small magical discoveries. Each uses temporary world props through
 * the activity stage, so nothing outlives the behavior.
 */

const lerpP = (a, b, u) => ({ sx: lerp(a.sx, b.sx, u), sy: lerp(a.sy, b.sy, u), z: lerp(a.z, b.z, u) });
const cellPx = (c, A) => (A.px() * c.pet.sprite.width) / 12;
const sgn = (v) => (v < 0 ? -1 : 1);

// A point `gap` sprite px short of `to`, on the way from `from`.
function shortOf(c, A, from, to, gap) {
  const len = Math.hypot(to.sx - from.sx, to.sy - from.sy) || 1;
  return c.geo.clamp(lerpP(from, to, Math.max(0, 1 - (gap * A.px()) / len)));
}

// A small sparkle burst prop at a world point.
function burst(st, local, t, at, tint) {
  st.prop(t, local, { kind: 'trinket', name: 'burst', tint, ...at, frame: 0, fade: 1 });
  st.prop(t + 110, local, { frame: 1 });
  st.prop(t + 220, local, { frame: 2 });
  st.prop(t + 360, local, null);
  return t + 360;
}

/* ------------------------------------------------------------------ */
/* Magical wisp play                                                   */
/* ------------------------------------------------------------------ */

/*
 * A tiny luminous wisp with its own lightweight movement: a wander with
 * momentum and bobbing through X / Y / Z, sampled into the script as
 * short glides. The cat notices it, tracks it, reaches for it, chases it
 * through different depths and pounces (it dodges at the last moment),
 * then either cups it gently and lets it go, watches it fade into the
 * distance, or sees it burst into sparkles.
 */
export const wispPlay = defineActivity({
  id: 'wispPlay',
  performance: true,
  rarity: 'rare',
  weights: W(2, 1.5),
  cooldown: 200000,
  duration: [12000, 32000],
  moves: true,
  followOn: { groom: 2, sit: 2, watchBeyond: 2, shakeOff: 2 },
  plan(c, S, st) {
    const A = st.A;
    const hue = st.variant('hue', { cyan: 3, violet: 2, gold: 2, green: 1.5 });
    const id = st.id('wisp');
    const [z0, z1] = c.geo.zRange;
    S.at(0, { pose: 'sit', legs: 0, eyes: 'open' });
    let t = rnd(c.rng, 300, 900);

    // it appears somewhere off to one side, floating at about head height
    const side = anySide(c);
    let at = clampPoint(
      c,
      {
        sx: A.pos.sx + SIGN[side] * rnd(c.rng, 6, 10) * cellPx(c, A),
        sy: A.pos.sy + rnd(c.rng, -14, 6) * A.px(),
        z: lerp(z0, z1, rnd(c.rng, 0.2, 0.9)),
      },
      11
    );
    st.prop(t, 'wisp', { kind: 'wisp', hue, ...at, phase: 0, dir: 0, fade: 0, fadeMs: 400 });
    st.prop(t + 40, 'wisp', { fade: 1 });

    // its own movement: momentum, a pull or a push, bobbing, depth
    let hx = rnd(c.rng, -1, 1);
    let hy = rnd(c.rng, -0.4, 0.4);
    let hz = rnd(c.rng, -1, 1);
    let ph = 0;
    const legs = [];
    const drift = (t0, n, { speed = 1, toward = null, avoid = null } = {}) => {
      let tt = t0;
      for (let i = 0; i < n; i++) {
        hx = hx * 0.55 + rnd(c.rng, -0.9, 0.9);
        hy = hy * 0.4 + rnd(c.rng, -0.6, 0.6);
        hz = hz * 0.55 + rnd(c.rng, -0.9, 0.9);
        if (toward) {
          hx += sgn(toward.sx - at.sx) * 0.9;
          hy += sgn(toward.sy - at.sy) * 0.5;
          hz += Math.abs(toward.z - at.z) > 15 ? sgn(toward.z - at.z) * 0.6 : 0;
        }
        if (avoid) {
          hx += sgn(at.sx - avoid.sx) * 1.1;
          hy -= 0.5;
          hz += sgn(at.z - avoid.z) * 0.6;
        }
        const len = rnd(c.rng, 2.5, 5.5) * cellPx(c, A) * speed;
        const floor = A.pos.sy + 14 * A.px(); // it stays airborne
        const to = clampPoint(
          c,
          { sx: at.sx + hx * len, sy: Math.min(floor, at.sy + hy * len * 0.6), z: at.z + hz * rnd(c.rng, 25, 70) * speed },
          11
        );
        const ms = rnd(c.rng, 450, 900) / speed;
        const dir = to.sx < at.sx ? -1 : 1;
        moveProp(S, id, at, to, tt, ms, { every: 150, ease: EASE.inOut, extra: () => ({ phase: ph++, dir }) });
        legs.push({ t: tt, ms, from: at, to });
        at = to;
        tt += ms;
      }
      return tt;
    };
    // the cat's eyes follow the wisp over a stretch of its path
    const track = (t0, t1, extra = {}) => {
      for (const leg of legs) {
        if (leg.t + leg.ms < t0 || leg.t > t1) continue;
        A.look(Math.max(t0, leg.t + leg.ms * 0.4), leg.to, extra);
      }
    };

    // noticed: ears up, wide eyes, dilated pupils
    t += 400;
    A.look(t, at, { eyes: 'wide', ears: 'perk', pupils: 3, tail: 'swish' });
    t += rnd(c.rng, 600, 1000);

    // it comes closer, curious, and the cat reaches toward it
    let t1 = drift(t, int(c.rng, 2, 3), { speed: 0.7, toward: A.world(rnd(c.rng, -18, 18), -12, 4) });
    track(t, t1, { eyes: 'open' });
    t = t1;
    const near = at.sx < A.pos.sx ? 'l' : 'r';
    S.at(t, { [PAW[near]]: at.sy < A.pos.sy - 10 * A.px() ? 'reach' : 'up', ears: 'perk' });
    t += rnd(c.rng, 300, 500);
    t1 = drift(t, 1, { speed: 1.6, avoid: A.pos });
    track(t, t1);
    S.at(t + 150, { [PAW[near]]: null });
    t = t1 + rnd(c.rng, 150, 400);

    // the chase, through depth
    const rounds = c.reduced ? 1 : int(c.rng, 1, 3);
    for (let r = 0; r < rounds; r++) {
      t1 = drift(t, int(c.rng, 2, 3), { speed: 1.25, avoid: A.pos });
      track(t, t1);
      const target = A.standFor(at, 0, rnd(c.rng, 2, 8), 0);
      if (A.dist(target) > 18) {
        t = A.walk(t + (t1 - t) * 0.4, shortOf(c, A, A.pos, target, 12), { stepMs: rnd(c.rng, 290, 370), endPose: 'crouch' });
      }
      t = Math.max(t, t1);
      A.look(t, at);
      t = S.play('wiggle', t);
      // the leap: a paw reaches out at the top, and the wisp slips away
      const tHop = t;
      const reach = at.sx < A.pos.sx ? 'l' : 'r';
      t = A.hop(t, target, { height: 9, ms: 380, land: { pose: 'sit' } });
      S.at(tHop + 160, { [PAW[reach]]: 'reach' });
      S.at(t, { [PAW[reach]]: null });
      const tDodge = drift(tHop + 120, 1, { speed: 2.2, avoid: target });
      A.look(t, at, { eyes: 'wide', ears: r % 2 ? 'flickL' : 'flickR' });
      t = Math.max(t, tDodge) + rnd(c.rng, 400, 900);
      if (c.rng() < 0.35) {
        S.at(t, { cue: '?' });
        S.at((t += 700), { cue: null });
      }
      S.at(t, { ears: null, pose: 'sit' });
    }

    // the ending
    const end = st.variant('end', { release: 3, vanish: 2, pop: 1.5 });
    if (end === 'release') {
      // it settles into the cupped paws, is held a moment and let go
      const cup = A.world(0, 12, 7);
      const m = drift(t, 1, { speed: 0.8, toward: cup });
      moveProp(S, id, at, cup, m, 700, { every: 140, ease: EASE.out });
      at = cup;
      t = m + 700;
      A.look(t, cup, { pawL: 'front', pawR: 'front', eyes: 'down', pupils: 1, tail: null });
      t += rnd(c.rng, 1000, 1600);
      S.at(t, { eyes: 'happy' });
      S.at((t += 500), { pawL: 'mid', pawR: 'mid' });
      const up = clampPoint(c, A.world(rnd(c.rng, -8, 8), -44, -20), 11);
      moveProp(S, id, at, up, t, 1600, { every: 150, ease: EASE.inOut });
      st.prop(t + 800, 'wisp', { fade: 0, fadeMs: 800 });
      A.look(t + 600, up, { pawL: null, pawR: null, eyes: 'open' });
      t += 1700;
    } else if (end === 'vanish') {
      const far = clampPoint(c, { ...at, z: z0, sy: at.sy - 20 * A.px() }, 11);
      moveProp(S, id, at, far, t, 2200, { every: 160, ease: EASE.inOut });
      st.prop(t + 1200, 'wisp', { fade: 0, fadeMs: 1000 });
      for (let u = 0; u < 2200; u += 500) A.look(t + u, lerpP(at, far, u / 2200), { pupils: 2 });
      t += 2300;
      S.at(t, { tail: 'swish' });
      S.blink(t + 400);
      t += 1200;
    } else {
      // one last loop around the cat, then a burst of sparkles
      for (let i = 1; i <= 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const p = clampPoint(c, A.world(Math.cos(a) * 22, -6 + Math.sin(a) * 4, Math.sin(a) * 28), 11);
        moveProp(S, id, at, p, t, 140, { every: 140 });
        A.look(t, p);
        at = p;
        t += 140;
      }
      st.prop(t, 'wisp', { fade: 0, fadeMs: 150 });
      burst(st, 'pop', t, at, hue);
      S.at(t, { eyes: 'wide', lean: at.sx < A.pos.sx ? 1 : -1 });
      S.at(t + 400, { lean: 0, eyes: 'happy' });
      t += 1100;
    }

    S.at(t, { pupils: null, focus: null, gaze: 'c', tail: null, ears: null, eyes: 'open' });
    return maybeTransition(S, c, t, { chance: 0.3, pool: { survey: 2, satisfied: 2, shakeParticles: 1 } }) + rnd(c.rng, 400, 900);
  },
});

/* ------------------------------------------------------------------ */
/* Arcane alchemy                                                      */
/* ------------------------------------------------------------------ */

/*
 * Recipes: the liquid's starting and finished colour, the ingredients that
 * float in, and the expected outcome. One brew in four surprises the cat
 * with a different outcome.
 */
const RECIPES = {
  moonbrew: { start: 'teal', end: 'violet', ingredients: ['herb', 'crystal'], outcome: 'sparkle' },
  emberTonic: { start: 'red', end: 'gold', ingredients: ['shroom', 'gem'], outcome: 'puff' },
  starSyrup: { start: 'silver', end: 'teal', ingredients: ['star', 'feather'], outcome: 'float' },
  verdantDraught: { start: 'green', end: 'gold', ingredients: ['herb', 'shroom', 'crystal'], outcome: 'overflow' },
  glimmerMix: { start: 'violet', end: 'ember', ingredients: ['gem', 'feather'], outcome: 'transform' },
};
const OUTCOMES = { sparkle: 3, puff: 2, float: 2, overflow: 1.5, transform: 1.5 };

export const alchemy = defineActivity({
  id: 'alchemy',
  performance: true,
  rarity: 'veryRare',
  weights: W(1.5, 1.2),
  cooldown: 300000,
  duration: [16000, 32000],
  moves: true,
  followOn: { shakeOff: 4, groom: 2, sit: 2 },
  plan(c, S, st) {
    const A = st.A;
    const recipe = RECIPES[st.variant('recipe', { moonbrew: 1, emberTonic: 1, starSyrup: 1, verdantDraught: 1, glimmerMix: 1 })];
    const surprise = c.rng() < 0.25;
    const outcome = surprise ? weighted(c.rng, { ...OUTCOMES, [recipe.outcome]: 0 }) : recipe.outcome;
    let liquid = recipe.start;
    let ph = 0;

    S.at(0, { pose: 'sit', legs: 0, eyes: 'open', mouth: 'idle' });
    let t = rnd(c.rng, 300, 700);

    // the vessel appears before its paws
    const pot = clampPoint(c, A.world(rnd(c.rng, -4, 4), 20, 8), 18);
    st.prop(t, 'pot', { kind: 'vessel', ...pot, liquid, phase: 0, fade: 0 });
    st.prop(t + 40, 'pot', { fade: 1 });
    burst(st, 'b0', t + 100, { ...pot, sy: pot.sy - 6 * A.px(), z: pot.z + 1 }, 'violet');
    S.at(t + 200, { eyes: 'down', ears: 'perk' });
    t += rnd(c.rng, 800, 1300);
    const above = { ...pot, sy: pot.sy - 10 * A.px(), z: pot.z + 1 };

    // ingredients float in and drop into the brew
    recipe.ingredients.forEach((name, i) => {
      const s = i % 2 ? 'r' : 'l';
      const from = clampPoint(c, A.world(SIGN[s] * rnd(c.rng, 18, 24), rnd(c.rng, -8, 6), rnd(c.rng, -10, 10)), 11);
      st.prop(t, `ing${i}`, { kind: 'trinket', name, ...from, fade: 0, glow: true, glowHue: 'violet' });
      st.prop(t + 40, `ing${i}`, { fade: 1 });
      A.look(t + 200, from, { [PAW[s]]: 'up' });
      t += rnd(c.rng, 500, 800);
      moveProp(S, st.id(`ing${i}`), from, above, t, 800, { every: 120, ease: EASE.inOut });
      for (let u = 0; u < 800; u += 300) A.look(t + u, lerpP(from, above, u / 800));
      t += 800;
      S.at(t, { [PAW[s]]: null, eyes: 'down' });
      moveProp(S, st.id(`ing${i}`), above, { ...pot, z: pot.z + 1 }, t, 260, { every: 90, ease: EASE.in });
      st.prop(t + 260, `ing${i}`, null);
      liquid = i === recipe.ingredients.length - 1 ? liquid : pick(c.rng, ['teal', 'violet', 'green', 'red', 'gold']);
      st.prop(t + 260, 'pot', { boil: true, liquid, phase: ph++ });
      st.prop(t + 700, 'pot', { boil: false, phase: ph++ });
      t += 800;
    });

    // stirring, round and round
    const rounds = int(c.rng, 2, 4);
    S.at(t, { pose: 'sit', eyes: 'down', pupils: 0, mouth: 'think' });
    for (let r = 0; r < rounds; r++) {
      for (const k of [0, 1, 2, 1]) {
        st.prop(t, 'pot', { stir: k, phase: ph++ });
        S.at(t, { pawL: k === 0 ? 'low' : 'front', pawR: k === 2 ? 'low' : 'front' });
        t += rnd(c.rng, 200, 280);
      }
    }
    st.prop(t, 'pot', { stir: null, liquid: recipe.end, glow: true, phase: ph++ });
    S.at(t, { pawL: null, pawR: null, mouth: 'idle', eyes: 'wide' });
    t += rnd(c.rng, 600, 900);

    // a sample rises in a vial; examined, tapped, its colour changes
    const s = anySide(c);
    const eye = clampPoint(c, A.world(SIGN[s] * 15, -10, 7), 11);
    st.prop(t, 'vial', { kind: 'trinket', name: 'vial', tint: recipe.end, ...above, fade: 1 });
    moveProp(S, st.id('vial'), above, eye, t, 900, { every: 120, ease: EASE.out });
    t += 900;
    A.look(t, eye, { eyes: 'down', lean: LEAN[s], ears: 'perk' });
    t += rnd(c.rng, 800, 1300);
    S.at(t, { [PAW[s]]: 'up', lean: 0 });
    const tints = ['gold', 'violet', 'green', 'teal', 'red'].filter((x) => x !== recipe.end);
    const odd = pick(c.rng, tints);
    for (let i = 0; i < 4; i++) {
      st.prop(t, 'vial', { tint: i % 2 ? recipe.end : odd, glow: i % 2 === 0 });
      t += 160;
    }
    S.at(t, { [PAW[s]]: null, eyes: 'wide' });
    t += rnd(c.rng, 500, 900);
    // poured back
    moveProp(S, st.id('vial'), eye, above, t, 700, { every: 120, ease: EASE.inOut });
    t += 700;
    st.prop(t, 'vial', { fade: 0, fadeMs: 200 });
    st.prop(t, 'pot', { liquid: surprise ? odd : recipe.end, boil: true, phase: ph++ });
    t += 400;

    // the result
    if (surprise) t = S.play('headTilt', t, { side: s, cue: '?' });
    if (outcome === 'sparkle') {
      burst(st, 'b1', t, above, 'gold');
      burst(st, 'b2', t + 200, { ...above, sx: above.sx + 5 * A.px() }, 'violet');
      S.at(t, { eyes: 'happy', tail: 'swish' });
      t += 1100;
    } else if (outcome === 'puff') {
      for (let f = 0; f < 4; f++) st.prop(t + f * 150, 'smoke', { kind: 'trinket', name: 'puff', frame: f, ...above, sy: above.sy - f * 2 * A.px() });
      st.prop(t + 700, 'smoke', null);
      S.at(t + 150, { eyes: 'closed', ears: 'back', mouth: 'o' });
      S.at(t + 700, { mouth: 'idle' });
      t = S.play('shake', t + 800) + 200;
    } else if (outcome === 'float') {
      const up = clampPoint(c, A.world(rnd(c.rng, -10, 10), -50, -40), 11);
      st.prop(t, 'bubble', { kind: 'trinket', name: 'star', tint: 'cyan', ...above });
      moveProp(S, st.id('bubble'), above, up, t, 2000, { every: 150, ease: EASE.inOut, extra: (u, i) => ({ frame: i }) });
      st.prop(t + 1300, 'bubble', { fade: 0, fadeMs: 700 });
      for (let u = 0; u < 2000; u += 400) A.look(t + u, lerpP(above, up, u / 2000), { pupils: 2 });
      t += 2100;
      S.at(t, { eyes: 'happy', focus: null });
      t += 600;
    } else if (outcome === 'overflow') {
      st.prop(t, 'pot', { overflow: true, boil: true });
      for (let i = 0; i < 8; i++) st.prop(t + i * 140, 'pot', { phase: ph++ });
      S.at(t + 100, { lean: A.pos.sx < pot.sx ? -1 : 1, ears: 'back', eyes: 'wide' });
      t += 1200;
      st.prop(t, 'pot', { overflow: false, boil: false });
      S.at(t, { lean: 0, ears: null });
      t = S.play('survey', t + 200);
    } else {
      // a small transformation: something alive flutters out
      st.prop(t, 'pot', { glow: true, vapor: true });
      const out = pick(c.rng, ['moth', 'flower']);
      st.prop(t + 300, 'born', { kind: 'trinket', name: out, ...above, fade: 1 });
      S.at(t + 300, { eyes: 'wide', ears: 'perk', lean: A.pos.sx < pot.sx ? -1 : 1 });
      const away = clampPoint(c, A.world(rnd(c.rng, -30, 30), -46, -50), 11);
      moveProp(S, st.id('born'), above, away, t + 900, 1800, { every: 140, ease: EASE.inOut, extra: (u, i) => ({ frame: i }) });
      st.prop(t + 2000, 'born', { fade: 0, fadeMs: 700 });
      A.look(t + 1300, away, { lean: 0, eyes: 'happy' });
      t += 2800;
    }

    // the vessel cools and fades away
    st.prop(t, 'pot', { vapor: true, glow: false, boil: false });
    st.prop(t + 400, 'pot', { fade: 0, fadeMs: 800 });
    S.at(t, { pupils: null, focus: null, gaze: 'c', eyes: 'open', tail: null, ears: null, lean: 0 });
    t += 1300;
    return maybeTransition(S, c, t, { chance: 0.4, pool: { shakeParticles: 2, satisfied: 2, inspectPaw: 1 } }) + rnd(c.rng, 300, 700);
  },
});

/* ------------------------------------------------------------------ */
/* Constellation mapping                                               */
/* ------------------------------------------------------------------ */

/*
 * The cat unfolds a small star chart, traces it with a paw, then looks up:
 * a patch of sky fades in above it with a scrambled figure. It points the
 * stars bright, nudges the stray ones into place, a star or two arrives
 * from deep in the distance, the lines are drawn, and the figure is
 * recognised.
 */
export const constellation = defineActivity({
  id: 'constellation',
  performance: true,
  rarity: 'veryRare',
  weights: W(1.2, 1),
  cooldown: 360000,
  duration: [14000, 28000],
  moves: true,
  followOn: { watchBeyond: 3, sit: 2, groom: 1.5 },
  plan(c, S, st) {
    const A = st.A;
    const name = st.variant('figure', { cat: 1, fish: 1, crown: 1, key: 1, spiral: 1 });
    const fig = CONSTELLATIONS[name];
    S.at(0, { pose: 'sit', legs: 0, eyes: 'open' });
    let t = rnd(c.rng, 300, 700);

    // the chart, unrolled at its paws
    const chart = clampPoint(c, A.world(0, 22, 7), 24);
    st.prop(t, 'chart', { kind: 'chart', ...chart, unfold: 0, fade: 0 });
    st.prop(t + 40, 'chart', { fade: 1 });
    S.at(t + 200, { pawL: 'low', pawR: 'low', eyes: 'down' });
    st.prop(t + 500, 'chart', { unfold: 1 });
    st.prop(t + 800, 'chart', { unfold: 2 });
    S.at(t + 900, { pawL: null, pawR: null });
    t += 1200;

    // traced with a paw, star to star
    for (let i = 0; i < 6; i++) {
      st.prop(t, 'chart', { mark: i });
      S.at(t, { pawL: i < 3 ? 'low' : null, pawR: i < 3 ? null : 'low', gaze: i < 2 ? 'l' : i > 3 ? 'r' : 'c', pupils: 0 });
      t += rnd(c.rng, 300, 520);
    }
    st.prop(t, 'chart', { mark: null });
    S.at(t, { pawL: null, pawR: null, gaze: 'c' });
    t += 300;

    // looks up: the sky above it (or beside it, if there is no room above)
    let sky = clampPoint(c, A.world(0, -44, -30), 44);
    if (Math.abs(sky.sy - A.world(0, -44, -30).sy) > 10 * A.px()) {
      sky = clampPoint(c, A.world(A.pos.sx < c.geo.width / 2 ? 44 : -44, -16, -30), 44);
    }
    const k = spritePx(c, sky.z);
    const starAt = ([x, y]) => ({ sx: sky.sx + (x - 22) * k, sy: sky.sy + (y - 14) * k, z: sky.z });
    const n = fig.stars.length;
    const strays = [...Array(n).keys()].sort(() => c.rng() - 0.5);
    const arriving = strays.slice(0, int(c.rng, 1, 2));
    const scrambled = new Set(strays.slice(2, 4));
    const stars = fig.stars.map(([x, y], i) => (scrambled.has(i) ? [x + int(c.rng, -6, 6), y + int(c.rng, -4, 4)] : [x, y]));

    S.at(t, { gaze: 'u', eyes: 'wide', ears: 'perk' });
    st.prop(t, 'sky', { kind: 'sky', ...sky, stars, links: fig.links, lit: 0, drawn: 0, hidden: arriving, found: false, fade: 0 });
    st.prop(t + 40, 'sky', { fade: 1 });
    t += rnd(c.rng, 700, 1100);

    // it points them bright, one after another
    for (let i = 1; i <= n; i++) {
      if (i % 3 === 1) S.at(t, { pawR: i % 2 ? 'up' : 'reach', pawL: null });
      if (i % 3 === 2) S.at(t, { pawL: i % 2 ? 'reach' : 'up', pawR: null });
      st.prop(t, 'sky', { lit: i });
      A.look(t, starAt(fig.stars[i - 1]));
      t += rnd(c.rng, 220, 380);
    }
    S.at(t, { pawL: null, pawR: null, eyes: 'open' });
    t += 300;

    // the strays are nudged into place
    for (const i of scrambled) {
      const s = stars[i][0] < 22 ? 'l' : 'r';
      S.at(t, { [PAW[s]]: 'up' });
      const [x0, y0] = stars[i];
      const [x1, y1] = fig.stars[i];
      for (let u = 1; u <= 4; u++) {
        stars[i] = [Math.round(lerp(x0, x1, u / 4)), Math.round(lerp(y0, y1, u / 4))];
        st.prop(t + u * 160, 'sky', { stars: [...stars] });
      }
      A.look(t, starAt(fig.stars[i]));
      t += 4 * 160 + 200;
      S.at(t, { [PAW[s]]: null });
    }

    // the missing ones arrive from deep in the distance
    let hidden = [...arriving];
    for (const i of arriving) {
      const dest = starAt(fig.stars[i]);
      const from = clampPoint(c, { ...dest, sx: dest.sx + rnd(c.rng, -60, 60), z: c.geo.zRange[0] }, 11);
      st.prop(t, `far${i}`, { kind: 'trinket', name: 'star', tint: 'cyan', ...from, fade: 0, fadeMs: 400 });
      st.prop(t + 40, `far${i}`, { fade: 1 });
      moveProp(S, st.id(`far${i}`), from, dest, t, 1500, { every: 140, ease: EASE.inOut, extra: (u, j) => ({ frame: j }) });
      for (let u = 0; u < 1500; u += 400) A.look(t + u, lerpP(from, dest, u / 1500), { pupils: 3 });
      t += 1500;
      hidden = hidden.filter((h) => h !== i);
      st.prop(t, `far${i}`, null);
      st.prop(t, 'sky', { hidden: [...hidden] });
      t += 300;
    }

    // the lines, drawn one by one; the figure appears
    S.at(t, { pupils: 0, eyes: 'open' });
    for (let i = 1; i <= fig.links.length; i++) {
      st.prop(t, 'sky', { drawn: i });
      const [a, b] = fig.links[i - 1];
      A.look(t, starAt(fig.stars[c.rng() < 0.5 ? a : b]));
      t += rnd(c.rng, 180, 300);
    }
    t += 300;
    st.prop(t, 'sky', { found: true });
    S.at(t, { eyes: 'wide', cue: '!', ears: 'perk', focus: null, gaze: 'u' });
    t += rnd(c.rng, 800, 1200);
    S.at(t, { cue: null });
    t = S.play('triumph', t, { side: anySide(c) });
    t += rnd(c.rng, 800, 1500);

    // the sky fades and the chart is rolled up
    st.prop(t, 'sky', { fade: 0, fadeMs: 900 });
    S.at(t + 600, { pawL: 'low', pawR: 'low', eyes: 'down', gaze: 'c' });
    st.prop(t + 800, 'chart', { unfold: 1 });
    st.prop(t + 1100, 'chart', { unfold: 0 });
    st.prop(t + 1400, 'chart', { fade: 0, fadeMs: 500 });
    S.at(t + 1300, { pawL: null, pawR: null, eyes: 'open', pupils: null, ears: null });
    return t + 2000 + rnd(c.rng, 300, 700);
  },
});

/* ------------------------------------------------------------------ */
/* Magical discovery                                                   */
/* ------------------------------------------------------------------ */

/*
 * A strange floating symbol appears. The cat approaches cautiously,
 * examines it from several sides, touches it, and something happens: a
 * sparkle burst, a harmless transformation, an unexpected object, or the
 * symbol simply vanishes. Self-contained: everything goes with it.
 */
export const discovery = defineActivity({
  id: 'discovery',
  performance: true,
  rarity: 'veryRare',
  weights: W(1.2, 1),
  cooldown: 300000,
  duration: [12000, 26000],
  moves: true,
  followOn: { survey: 3, shakeOff: 2, ponder: 2, sit: 2 },
  plan(c, S, st) {
    const A = st.A;
    const shape = pick(c.rng, SIGIL_NAMES);
    const tint = pick(c.rng, ['violet', 'cyan', 'gold', 'green']);
    const id = st.id('sigil');
    S.at(0, { pose: 'sit', legs: 0, eyes: 'open' });
    let t = rnd(c.rng, 400, 900);

    // it appears, floating a little above the floor
    const dir = anySide(c);
    let at = clampPoint(
      c,
      {
        sx: A.pos.sx + SIGN[dir] * rnd(c.rng, 6, 9) * cellPx(c, A),
        sy: A.pos.sy + rnd(c.rng, -6, 8) * A.px(),
        z: A.pos.z + rnd(c.rng, -80, 60),
      },
      11
    );
    st.prop(t, 'sigil', { kind: 'trinket', name: 'sigil', shape, tint, ...at, frame: 0, fade: 0, fadeMs: 900 });
    st.prop(t + 40, 'sigil', { fade: 1 });
    const tSpawn = t;

    // noticed: a freeze, wide eyes
    t += rnd(c.rng, 500, 900);
    A.look(t, at, { eyes: 'wide', ears: 'perk', pupils: 3, tail: 'still' }, true);
    t += rnd(c.rng, 900, 1600);
    if (c.rng() < 0.4) {
      S.at(t, { cue: '?' });
      S.at((t += 800), { cue: null });
    }

    // a cautious approach, crouched, with a pause on the way
    const stop = A.standFor(at, SIGN[at.sx < A.pos.sx ? 'l' : 'r'] * 15, rnd(c.rng, 2, 8), 0);
    const half = lerpP(A.pos, stop, 0.5);
    t = A.walk(t, half, { stepMs: rnd(c.rng, 650, 800), pose: 'crouch', endPose: 'crouch', gaze: A.gazeAt(at) === 'u' ? 'c' : A.gazeAt(at) });
    S.at(t, { ears: 'flickL' });
    t += rnd(c.rng, 600, 1300);
    t = A.walk(t, stop, { stepMs: rnd(c.rng, 650, 800), pose: 'crouch', endPose: 'sit' });
    A.look(t, at, { ears: 'perk' }, true);
    t += rnd(c.rng, 500, 900);

    // examined from several angles
    const views = int(c.rng, 1, 2);
    for (let v = 0; v < views; v++) {
      const s = c.rng() < 0.5 ? 'l' : 'r';
      const around = A.standFor(at, SIGN[s] * rnd(c.rng, 12, 16), rnd(c.rng, -2, 8), rnd(c.rng, -25, 25));
      t = A.walk(t, around, { stepMs: 600, endPose: 'sit' });
      A.look(t, at, { lean: at.sx < A.pos.sx ? -1 : 1 }, true);
      t += rnd(c.rng, 600, 1000);
      t = S.play('headTilt', t, { side: at.sx < A.pos.sx ? 'l' : 'r' });
      if (c.rng() < 0.5) {
        S.at(t, { pose: 'low', eyes: 'down' });
        for (let i = 0; i < 2; i++) {
          S.at((t += 200), { droop: 1 });
          S.at((t += 180), { droop: 0 });
        }
        S.at((t += 200), { pose: 'sit', eyes: 'open' });
      }
      S.at(t, { lean: 0 });
      t += rnd(c.rng, 300, 600);
    }

    // touches it
    const s = at.sx < A.pos.sx ? 'l' : 'r';
    S.at(t, { [PAW[s]]: at.sy < A.pos.sy - 8 * A.px() ? 'up' : 'out', lean: LEAN[s], pupils: 2 });
    t += rnd(c.rng, 250, 400);
    S.at(t, { [PAW[s]]: null, lean: 0 });

    // and something happens
    const outcome = st.variant('outcome', { burst: 3, transform: 2.5, object: 2, vanish: 1.5 });
    for (let u = tSpawn; u < t; u += 250) st.prop(u, 'sigil', { frame: Math.round((u - tSpawn) / 250) });
    if (outcome === 'burst') {
      st.prop(t, 'sigil', { fade: 0, fadeMs: 150 });
      burst(st, 'b', t, at, tint);
      burst(st, 'b2', t + 180, { ...at, sy: at.sy - 4 * A.px() }, 'gold');
      S.at(t, { eyes: 'wide', ears: 'back', lean: -LEAN[s] });
      S.at(t + 500, { eyes: 'happy', ears: null, lean: 0 });
      t += 1300;
    } else if (outcome === 'transform') {
      const into = pick(c.rng, ['flower', 'moth', 'gem', 'key']);
      st.prop(t, 'sigil', { fade: 0, fadeMs: 200 });
      burst(st, 'b', t, at, tint);
      st.prop(t + 200, 'new', { kind: 'trinket', name: into, ...at, fade: 0, fadeMs: 300 });
      st.prop(t + 240, 'new', { fade: 1 });
      S.at(t, { eyes: 'wide' });
      t += 900;
      S.at(t, { eyes: 'down', pupils: 1 });
      t += rnd(c.rng, 900, 1400);
      if (into === 'moth') {
        const away = clampPoint(c, { ...at, sy: at.sy - 40 * A.px(), z: at.z - 60 }, 11);
        moveProp(S, st.id('new'), at, away, t, 1600, { every: 140, ease: EASE.inOut, extra: (u, i) => ({ frame: i }) });
        for (let u = 0; u < 1600; u += 400) A.look(t + u, lerpP(at, away, u / 1600), { eyes: 'open' });
        st.prop(t + 900, 'new', { fade: 0, fadeMs: 700 });
        t += 1700;
      } else {
        S.at(t, { eyes: 'happy' });
        st.prop(t + 600, 'new', { fade: 0, fadeMs: 600 });
        t += 1300;
      }
    } else if (outcome === 'object') {
      // something unexpected drops out of it
      const what = pick(c.rng, ['tome', 'fish', 'feather', 'star']);
      const floor = clampPoint(c, { ...at, sy: A.pos.sy + 22 * A.px(), z: at.z }, 11);
      st.prop(t, 'sigil', { fade: 0, fadeMs: 400 });
      st.prop(t, 'new', { kind: 'trinket', name: what, ...at, fade: 1 });
      moveProp(S, st.id('new'), at, floor, t + 100, 500, { every: 80, ease: EASE.in });
      A.look(t + 300, floor, { eyes: 'wide', ears: 'perk' });
      t += 900;
      S.at(t, { pose: 'low', eyes: 'down' });
      S.at((t += 500), { droop: 1 });
      S.at((t += 250), { droop: 0 });
      S.at((t += 300), { pose: 'sit', eyes: 'happy' });
      st.prop(t + 400, 'new', { fade: 0, fadeMs: 600 });
      t += 1100;
    } else {
      // it simply blinks out: where did it go?
      st.prop(t, 'sigil', { fade: 0, fadeMs: 80 });
      S.at(t, { eyes: 'wide' });
      t += 500;
      S.at(t, { [PAW[s]]: 'out', focus: null });
      S.at((t += 300), { [PAW[s]]: null });
      t = S.play('survey', t + 100);
      S.at(t, { cue: '?' });
      S.at((t += 900), { cue: null });
    }

    S.at(t, { pupils: null, focus: null, tail: null, ears: null, eyes: 'open', gaze: 'c' });
    return maybeTransition(S, c, t, { chance: 0.45, pool: { shakeParticles: 2, survey: 2, inspectPaw: 1, pause: 2 } }) + rnd(c.rng, 300, 700);
  },
});
