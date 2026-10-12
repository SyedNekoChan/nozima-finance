import { defineActivity } from '../../core/activity.js';
import { EASE, clampPoint, moveProp } from '../../core/choreo.js';
import { int, lerp, pick, rnd } from '../../core/rng.js';
import { COIN_SYMBOL_NAMES } from '../props.js';
import { pawSpot } from '../sprites.js';
import { LEAN, PAW, SIGN, W, anySide, maybeTransition } from './util.js';

/*
 * Crafts and pastimes: tinkering with a small contraption, playing a tiny
 * instrument, playing with fantasy coins, and book antics. All of it is
 * temporary world props driven by the activity's own script.
 *
 * The coins are toys: they are pixel props with symbols on them, never
 * connected to money, balances, currencies or transactions.
 */

const lerpP = (a, b, u) => ({ sx: lerp(a.sx, b.sx, u), sy: lerp(a.sy, b.sy, u), z: lerp(a.z, b.z, u) });

function burst(st, local, t, at, tint) {
  st.prop(t, local, { kind: 'trinket', name: 'burst', tint, ...at, frame: 0, fade: 1 });
  st.prop(t + 110, local, { frame: 1 });
  st.prop(t + 220, local, { frame: 2 });
  st.prop(t + 360, local, null);
  return t + 360;
}

// Fiddling with something in front of the chest: quick alternating paws.
function fiddle(S, c, t, n) {
  for (let i = 0; i < n; i++) {
    S.at(t, i % 2 ? { pawL: 'front', pawR: 'mid' } : { pawL: 'mid', pawR: 'front' });
    t += rnd(c.rng, 140, 240);
  }
  S.at(t, { pawL: null, pawR: null });
  return t + 80;
}

/* ------------------------------------------------------------------ */
/* Invention and tinkering                                             */
/* ------------------------------------------------------------------ */

export const tinker = defineActivity({
  id: 'tinker',
  performance: true,
  rarity: 'veryRare',
  weights: W(1.5, 1.2),
  cooldown: 300000,
  duration: [16000, 32000],
  moves: true,
  followOn: { inspect: 2, pawCheck: 3, sit: 2, groom: 1.5 },
  plan(c, S, st) {
    const A = st.A;
    const variant = st.variant('device', { bot: 3, clock: 2, lamp: 2, orrery: 2 });
    let ph = 0;
    S.at(0, { pose: 'sit', legs: 0, eyes: 'open' });
    let t = rnd(c.rng, 300, 700);

    // the base, and a few parts scattered around it
    const dev = clampPoint(c, A.world(rnd(c.rng, -3, 3), 20, 8), 18);
    st.prop(t, 'dev', { kind: 'device', variant, ...dev, parts: 1, state: 'off', turn: 0, phase: 0, fade: 0 });
    st.prop(t + 40, 'dev', { fade: 1 });
    const parts = ['gear', 'spring', 'bolt', 'lens'].sort(() => c.rng() - 0.5).slice(0, 2);
    const homes = parts.map((name, i) => {
      const at = clampPoint(c, A.world((i % 2 ? 1 : -1) * rnd(c.rng, 18, 23), rnd(c.rng, 18, 24), rnd(c.rng, -4, 8)), 11);
      st.prop(t + 150 + i * 120, `p${i}`, { kind: 'trinket', name, ...at, fade: 0 });
      st.prop(t + 190 + i * 120, `p${i}`, { fade: 1 });
      return at;
    });
    t += 700;
    t = S.play('survey', t);
    S.at(t, { eyes: 'down', pupils: 0, ears: 'perk' });

    // assembled part by part: each is fetched with a paw and fitted
    homes.forEach((at, i) => {
      const s = at.sx < A.pos.sx ? 'l' : 'r';
      A.look(t, at, { [PAW[s]]: 'out', lean: LEAN[s] });
      t += rnd(c.rng, 300, 500);
      moveProp(S, st.id(`p${i}`), at, { ...dev, z: dev.z + 1 }, t, rnd(c.rng, 500, 800), { every: 110, ease: EASE.inOut });
      S.at(t + 200, { [PAW[s]]: null, lean: 0 });
      t += 800;
      st.prop(t, `p${i}`, null);
      st.prop(t, 'dev', { parts: i + 2 });
      S.at(t, { eyes: 'down', mouth: 'think', focus: null, gaze: 'c' });
      t = fiddle(S, c, t, int(c.rng, 3, 5));
      S.at(t, { mouth: 'idle' });
      t += rnd(c.rng, 200, 400);
    });

    // examined, and turned around to see its side
    S.at(t, { lean: -1 });
    S.at((t += rnd(c.rng, 500, 800)), { lean: 1 });
    S.at((t += rnd(c.rng, 500, 800)), { lean: 0, pawL: 'low' });
    st.prop(t + 150, 'dev', { turn: 1 });
    S.at((t += 300), { pawL: null });
    t = S.play('headTilt', t + 200, { side: anySide(c) });
    S.at(t, { pawR: 'low' });
    st.prop(t + 150, 'dev', { turn: 0 });
    S.at((t += 300), { pawR: null });

    // a test: it misbehaves, harmlessly
    const tap = (tt) => {
      const s = anySide(c);
      S.at(tt, { [PAW[s]]: 'low' });
      S.at(tt + 180, { [PAW[s]]: null });
      return tt + 260;
    };
    t = tap(t + 300);
    st.prop(t, 'dev', { state: 'on', phase: ph++ });
    S.at(t, { eyes: 'wide' });
    t += rnd(c.rng, 400, 700);
    const fault = st.variant('fault', { spark: 2, smoke: 2, jitter: 2 });
    st.prop(t, 'dev', { state: fault });
    for (let i = 0; i < 8; i++) st.prop(t + i * 140, 'dev', { phase: ph++ });
    if (fault === 'spark') {
      S.at(t, { ears: 'back', lean: dev.sx < A.pos.sx ? 1 : -1, eyes: 'wide', pupils: 3 });
    } else if (fault === 'smoke') {
      S.at(t + 300, { eyes: 'closed', mouth: 'o', ears: 'back' });
      S.at(t + 900, { mouth: 'idle', eyes: 'open' });
    } else {
      // it hops about; the eyes follow and a paw steadies it
      for (let i = 0; i < 4; i++) S.at(t + i * 280, { gaze: i % 2 ? 'l' : 'r' });
      S.at(t + 900, { pawL: 'front', pawR: 'front', gaze: 'c' });
    }
    t += 1200;
    st.prop(t, 'dev', { state: 'off' });
    S.at(t, { ears: null, lean: 0, pawL: null, pawR: null, pupils: 0 });
    if (fault === 'smoke') t = S.play('shake', t + 100);

    // adjustments: thought, fiddling, taps
    for (let a = int(c.rng, 1, 2); a > 0; a--) {
      S.at(t, { mouth: 'think', gaze: 'u', eyes: 'open' });
      t += rnd(c.rng, 600, 1100);
      S.at(t, { gaze: 'c', eyes: 'down' });
      t = fiddle(S, c, t, int(c.rng, 4, 7));
      st.prop(t, 'dev', { phase: ph++ });
      t += rnd(c.rng, 200, 400);
    }
    S.at(t, { mouth: 'idle' });

    // the retest: it works
    t = tap(t);
    st.prop(t, 'dev', { state: 'on' });
    const tRun = t;
    const run = rnd(c.rng, 1600, 2600);
    for (let u = 0; u < run; u += 200) st.prop(t + u, 'dev', { phase: ph++ });
    S.at(t, { eyes: 'wide', ears: 'perk' });
    S.at(t + 500, { eyes: 'open' });
    t = S.play('triumph', t + 800, { side: anySide(c) });
    t = Math.max(t, tRun + run);

    // packed away
    st.prop(t, 'dev', { state: 'off' });
    st.prop(t + 300, 'dev', { fade: 0, fadeMs: 700 });
    S.at(t, { pupils: null, focus: null, ears: null, eyes: 'open' });
    return maybeTransition(S, c, t + 800, { chance: 0.4, pool: { inspectPaw: 3, satisfied: 2, survey: 1 } }) + rnd(c.rng, 300, 700);
  },
});

/* ------------------------------------------------------------------ */
/* Music and rhythm                                                    */
/* ------------------------------------------------------------------ */

// Note colours per key (low to high), as palette keys of the sprite fx.
const NOTE_C = ['C', 'C', 'N', 'N', 'G', 'G', 'V', 'V'];
const RHYTHMS = {
  even: [1, 1, 1, 1],
  swing: [1.4, 0.6, 1.4, 0.6],
  skip: [1, 0.5, 0.5, 1, 1],
  waltz: [1.2, 0.9, 0.9],
};

export const music = defineActivity({
  id: 'music',
  performance: true,
  rarity: 'veryRare',
  weights: W(1.8, 1.6),
  cooldown: 240000,
  duration: [10000, 30000],
  moves: true,
  followOn: { sit: 2, stillness: 2, groom: 1.5 },
  plan(c, S, st) {
    const A = st.A;
    const variant = st.variant('instrument', { keys: 3, chimes: 2 });
    const side = anySide(c);
    S.at(0, { pose: 'sit', legs: 0, eyes: 'open' });
    let t = rnd(c.rng, 300, 700);

    // the instrument appears: a keyboard before its paws or chimes beside it
    const at =
      variant === 'keys'
        ? clampPoint(c, A.world(0, 22, 8), 26)
        : clampPoint(c, A.world(SIGN[side] * 24, -4, -4), 26);
    st.prop(t, 'inst', { kind: 'instrument', variant, ...at, key: -1, fade: 0 });
    st.prop(t + 40, 'inst', { fade: 1 });
    burst(st, 'b', t + 100, { ...at, z: at.z + 1 }, 'cyan');
    S.at(t + 300, { eyes: variant === 'keys' ? 'down' : 'open', gaze: variant === 'keys' ? 'c' : side, ears: 'perk' });
    t += 900;

    let noteKey = 0;
    const note = (tt, key, big = false) => {
      const s = key < 4 ? 'l' : 'r';
      const paw = variant === 'keys' ? (key < 4 ? 'pawL' : 'pawR') : PAW[side];
      const lv = variant === 'keys' ? 'low' : 'out';
      st.prop(tt, 'inst', { key });
      S.at(tt, { [paw]: lv, ...(variant === 'keys' ? { [key < 4 ? 'pawR' : 'pawL']: null } : {}) });
      S.at(tt + 120, { [paw]: null });
      // a note rises beside the head and fades
      const k = `n${noteKey++ % 4}`;
      const x = (variant === 'keys' ? s : side) === 'l' ? int(c.rng, 3, 8) : int(c.rng, 47, 52);
      S.fx(tt, k, { kind: 'note', n: big ? 1 : 0, x, y: 24, c: NOTE_C[key] });
      S.fx(tt + 200, k, { y: 18 });
      S.fx(tt + 400, k, { y: 12, a: 0.7 });
      S.fx(tt + 600, k, null);
      st.prop(tt + 200, 'inst', { key: -1 });
    };

    // tests a few single notes, listening between them
    for (let i = int(c.rng, 2, 4); i > 0; i--) {
      note(t, int(c.rng, 0, 7));
      t += 250;
      S.at(t, { ears: c.rng() < 0.5 ? 'flickL' : 'flickR', gaze: 'u' });
      t += rnd(c.rng, 500, 1000);
      S.at(t, { ears: 'perk', gaze: variant === 'keys' ? 'c' : side });
      if (c.rng() < 0.3) t = S.play('headTilt', t, { side: anySide(c) });
    }

    // a performance: a short motif, or (sometimes) a long absorbed one
    const absorbed = c.rng() < 0.3;
    const len = absorbed ? int(c.rng, 14, 24) : int(c.rng, 5, 9);
    const rhythm = RHYTHMS[st.variant('rhythm', { even: 2, swing: 2, skip: 1.5, waltz: 1.5 })];
    const beat = rnd(c.rng, 200, 320);
    let key = int(c.rng, 0, 7);
    S.at(t, { tail: 'swish', eyes: absorbed ? 'closed' : 'down', pupils: 1 });
    for (let i = 0; i < len; i++) {
      key = Math.max(0, Math.min(7, key + pick(c.rng, [-2, -1, -1, 1, 1, 2, 0])));
      note(t, key, i % rhythm.length === 0);
      // the head keeps the beat
      if (i % rhythm.length === 0) {
        S.at(t, { droop: 1 });
        S.at(t + 120, { droop: 0 });
      }
      if (absorbed && i === Math.floor(len / 2)) S.at(t, { eyes: 'happy' });
      t += beat * rhythm[i % rhythm.length];
    }
    S.at(t, { droop: 0 });

    // listens to the last notes fade
    t += 200;
    S.at(t, { eyes: 'closed', gaze: 'u', ears: 'perk' });
    t += rnd(c.rng, 900, 1600);
    S.at(t, { eyes: 'open', gaze: 'c', tail: null });

    // a closing flourish and a bow of the head, or a small triumph
    if (c.rng() < 0.5) {
      note(t, 6, true);
      note(t + 150, 7, true);
      t = S.play('nod', t + 400);
    } else {
      t = S.play('triumph', t + 200, { side: anySide(c) });
    }
    st.prop(t + 200, 'inst', { fade: 0, fadeMs: 700 });
    S.at(t, { pupils: null, ears: null });
    return t + 1000 + rnd(c.rng, 300, 700);
  },
});

/* ------------------------------------------------------------------ */
/* Currency and treasure play (pure toys)                              */
/* ------------------------------------------------------------------ */

export const treasure = defineActivity({
  id: 'treasure',
  performance: true,
  rarity: 'veryRare',
  weights: W(1.4, 2.6),
  cooldown: 240000,
  duration: [12000, 28000],
  moves: true,
  followOn: { coinPolish: 2, crown: 2, sit: 2 },
  plan(c, S, st) {
    const A = st.A;
    const n = int(c.rng, 3, 5);
    S.at(0, { pose: 'sit', legs: 0, eyes: 'open' });
    let t = rnd(c.rng, 300, 700);

    // a few fantasy coins drift into view, turning, and settle before it
    const coins = [...Array(n).keys()].map((i) => ({
      id: `coin${i}`,
      sym: pick(c.rng, COIN_SYMBOL_NAMES),
      at: clampPoint(c, A.world(rnd(c.rng, -24, 24), rnd(c.rng, -22, -6), rnd(c.rng, -12, 12)), 11),
    }));
    coins.forEach((k, i) => {
      st.prop(t + i * 140, k.id, { kind: 'trinket', name: 'coin', sym: k.sym, turn: i % 4, ...k.at, fade: 0, fadeMs: 400 });
      st.prop(t + i * 140 + 40, k.id, { fade: 1 });
    });
    S.at(t + 200, { eyes: 'wide', gaze: 'u', ears: 'perk', pupils: 3 });
    t += n * 140 + 300;
    const turnCoin = (k, from, every = 140, count = 6) => {
      for (let j = 0; j < count; j++) st.prop(from + j * every, k.id, { turn: j % 4 });
      st.prop(from + count * every, k.id, { turn: 0 });
    };
    coins.forEach((k, i) => {
      const floor = clampPoint(c, A.world(-14 + (i * 28) / Math.max(1, n - 1), 23, 7), 11);
      moveProp(S, st.id(k.id), k.at, floor, t + i * 90, 900, { every: 110, ease: EASE.in });
      turnCoin(k, t + i * 90, 150, 6);
      k.at = floor;
    });
    t += 900 + n * 90 + 200;
    S.at(t, { eyes: 'down', gaze: 'c', pupils: 1 });
    t += rnd(c.rng, 500, 900);

    const games = st.some('game', { stack: 3, sort: 2, balance: 2.5, symbol: 2.5, orbit: 2 }, int(c.rng, 2, 3));
    for (const game of games) {
      if (game === 'stack') {
        const base = A.world(rnd(c.rng, -4, 4), 24, 8);
        coins.forEach((k, i) => {
          const s = k.at.sx < A.pos.sx ? 'l' : 'r';
          S.at(t, { [PAW[s]]: 'low' });
          const to = clampPoint(c, { ...base, sy: base.sy - i * 2 * A.px(), z: base.z + i * 0.1 }, 11);
          moveProp(S, st.id(k.id), k.at, to, t + 100, 400, { every: 100, ease: EASE.inOut });
          k.at = to;
          S.at(t + 300, { [PAW[s]]: null });
          t += rnd(c.rng, 450, 700);
        });
        // the stack wobbles; a paw steadies it
        for (let j = 0; j < 4; j++) {
          const top = coins[n - 1];
          st.prop(t + j * 120, top.id, { sx: top.at.sx + (j % 2 ? 1 : -1) * A.px(), moveMs: 100 });
        }
        st.prop(t + 480, coins[n - 1].id, { sx: coins[n - 1].at.sx });
        S.at(t + 200, { pawL: 'front', pawR: 'front', eyes: 'wide' });
        t += 700;
        S.at(t, { pawL: null, pawR: null, eyes: 'happy' });
        t += rnd(c.rng, 600, 1000);
        S.at(t, { eyes: 'down' });
      } else if (game === 'sort') {
        // two little heaps, by symbol
        const first = coins[0].sym;
        coins.forEach((k, i) => {
          const s = k.sym === first ? 'l' : 'r';
          S.at(t, { [PAW[s]]: 'out', gaze: s });
          const to = clampPoint(c, A.world(SIGN[s] * (14 + (i % 2) * 4), 23 - (i % 3), 7 + i * 0.1), 11);
          moveProp(S, st.id(k.id), k.at, to, t + 120, 450, { every: 110, ease: EASE.inOut });
          k.at = to;
          S.at(t + 350, { [PAW[s]]: null });
          t += rnd(c.rng, 500, 750);
        });
        S.at(t, { gaze: 'l' });
        S.at((t += 500), { gaze: 'r' });
        t = S.play('nod', t + 400);
        S.at(t, { gaze: 'c' });
      } else if (game === 'balance') {
        // one coin on the tip of a raised paw
        const k = pick(c.rng, coins);
        const s = anySide(c);
        const [px, py] = pawSpot('up', s);
        const tip = A.world(px - 28, py - 34, 9);
        S.at(t, { [PAW[s]]: 'up', gaze: 'u', eyes: 'open', pupils: 2 });
        moveProp(S, st.id(k.id), k.at, tip, t, 500, { every: 100, ease: EASE.out });
        t += 600;
        for (let j = 0; j < 6; j++) {
          st.prop(t + j * 160, k.id, { sx: tip.sx + (j % 2 ? 1 : -1) * A.px(), turn: j % 2 ? 1 : 0, moveMs: 140 });
          if (j % 2) S.at(t + j * 160, { lean: LEAN[s] * (j % 4 === 1 ? 1 : 0) });
        }
        t += 6 * 160;
        if (c.rng() < 0.6) {
          st.prop(t, k.id, { sx: tip.sx, turn: 0 });
          S.at(t, { eyes: 'happy', lean: 0 });
          t += 900;
          moveProp(S, st.id(k.id), tip, k.at, t, 500, { every: 100, ease: EASE.inOut });
          S.at(t + 300, { [PAW[s]]: null, eyes: 'open' });
          t += 700;
        } else {
          // it slips off and rolls away
          const lost = clampPoint(c, A.world(SIGN[s] * rnd(c.rng, 14, 20), 24, 9), 11);
          moveProp(S, st.id(k.id), tip, lost, t, 600, { every: 90, ease: EASE.in });
          turnCoin(k, t, 110, 5);
          S.at(t, { [PAW[s]]: null, ears: 'back', eyes: 'wide', lean: 0 });
          A.look(t + 300, lost);
          k.at = lost;
          t += 900;
          S.at(t, { ears: null, eyes: 'happy' });
          t += 600;
        }
      } else if (game === 'symbol') {
        // lifted to the face; the symbol puzzles, then pleases
        const k = pick(c.rng, coins);
        const s = k.at.sx < A.pos.sx ? 'l' : 'r';
        const face = A.world(SIGN[s] * 9, -2, 10);
        S.at(t, { [PAW[s]]: 'mid' });
        moveProp(S, st.id(k.id), k.at, face, t, 600, { every: 100, ease: EASE.out });
        turnCoin(k, t, 150, 4);
        t += 700;
        S.at(t, { eyes: 'down', pupils: 0, gaze: s, lean: LEAN[s] });
        t += rnd(c.rng, 700, 1100);
        S.at(t, { cue: '?' });
        t += rnd(c.rng, 700, 1000);
        S.at(t, { cue: '!', eyes: 'wide' });
        S.at((t += 600), { cue: null, eyes: 'happy', lean: 0 });
        t += 500;
        moveProp(S, st.id(k.id), face, k.at, t, 500, { every: 100, ease: EASE.in });
        S.at(t + 200, { [PAW[s]]: null, eyes: 'down', pupils: 1, gaze: 'c' });
        t += 700;
      } else {
        // magic sets them orbiting, in front of and behind the cat
        S.at(t, { pawL: 'up', pawR: 'up', eyes: 'open', gaze: 'u', pupils: 0 });
        const dur = rnd(c.rng, 2000, 3400);
        const a0 = rnd(c.rng, 0, Math.PI * 2);
        const w = (c.rng() < 0.5 ? -1 : 1) * 2.2;
        for (let u = 0; u <= dur; u += 130) {
          coins.forEach((k, i) => {
            const a = a0 + (i * Math.PI * 2) / n + (w * u) / 1000;
            st.prop(t + u, k.id, {
              ...clampPoint(c, A.world(Math.cos(a) * 22, -4 + Math.sin(a) * 3, Math.sin(a) * 26), 11),
              moveMs: 130,
              ease: 'linear',
              turn: Math.floor(u / 130 + i) % 4,
            });
          });
        }
        S.at(t + 400, { pawL: null, pawR: null, tail: 'swish' });
        t += dur;
        coins.forEach((k, i) => {
          const to = clampPoint(c, A.world(-14 + (i * 28) / Math.max(1, n - 1), 23, 7), 11);
          st.prop(t + i * 60, k.id, { ...to, moveMs: 500, ease: 'out', turn: 0 });
          k.at = to;
        });
        t += 700;
        S.at(t, { tail: null, gaze: 'c', eyes: 'down' });
      }
      t += rnd(c.rng, 300, 700);
    }

    // and they go: dissolving into sparkles, or floating away
    const away = c.rng() < 0.5;
    coins.forEach((k, i) => {
      if (away) {
        const up = clampPoint(c, { ...k.at, sy: k.at.sy - rnd(c.rng, 30, 46) * A.px(), z: k.at.z - 40 }, 11);
        moveProp(S, st.id(k.id), k.at, up, t + i * 120, 1200, { every: 120, ease: EASE.inOut, extra: (u, j) => ({ turn: j % 4 }) });
        st.prop(t + i * 120 + 600, k.id, { fade: 0, fadeMs: 600 });
      } else {
        st.prop(t + i * 150, k.id, { fade: 0, fadeMs: 200 });
        burst(st, `b${i}`, t + i * 150, k.at, 'gold');
      }
    });
    S.at(t, { gaze: away ? 'u' : 'c', eyes: away ? 'open' : 'wide' });
    t += n * 150 + (away ? 1300 : 500);
    S.at(t, { eyes: 'happy', pupils: null, ears: null, gaze: 'c', focus: null });
    return t + rnd(c.rng, 700, 1200);
  },
});

/* ------------------------------------------------------------------ */
/* Book and object antics                                              */
/* ------------------------------------------------------------------ */

const TINTS = ['cyan', 'violet', 'red', 'green', 'gold'];

const ANTICS = {
  // small books stacked into a tower (which may topple)
  stack(y, t) {
    const { c, S, st, A } = y;
    const n = int(c.rng, 3, 4);
    const books = [...Array(n).keys()].map((i) => {
      const at = clampPoint(c, A.world((i % 2 ? 1 : -1) * rnd(c.rng, 15, 23), rnd(c.rng, 20, 25), rnd(c.rng, -6, 8)), 11);
      st.prop(t + i * 120, `tome${i}`, { kind: 'trinket', name: 'tome', tint: TINTS[i % TINTS.length], ...at, fade: 0 });
      st.prop(t + i * 120 + 40, `tome${i}`, { fade: 1 });
      return { id: `tome${i}`, at };
    });
    t += n * 120 + 500;
    S.at(t, { eyes: 'down', ears: 'perk' });
    t += 400;
    const base = A.world(rnd(c.rng, -3, 3), 24, 9);
    const place = (b, i) => {
      const s = b.at.sx < A.pos.sx ? 'l' : 'r';
      A.look(t, b.at, { [PAW[s]]: c.rng() < 0.5 ? 'out' : 'up' });
      const to = clampPoint(c, { ...base, sy: base.sy - i * 5 * A.px(), z: base.z + i * 0.1 }, 11);
      moveProp(S, st.id(b.id), b.at, to, t + 200, rnd(c.rng, 500, 800), { every: 110, ease: EASE.inOut });
      b.at = to;
      t += 1000;
      S.at(t - 200, { [PAW[s]]: null });
    };
    books.forEach(place);
    S.at(t, { focus: null, gaze: 'c', eyes: 'open' });

    // the tower wobbles
    const top = books[n - 1];
    for (let j = 0; j < 4; j++) st.prop(t + j * 150, top.id, { sx: top.at.sx + (j % 2 ? 1 : -1) * A.px(), moveMs: 130 });
    t += 600;
    if (c.rng() < 0.35) {
      // and topples: the top books slide off; restacked in a hurry
      const fallen = books.slice(-2);
      fallen.forEach((b, i) => {
        const to = clampPoint(c, A.world((i ? 1 : -1) * rnd(c.rng, 12, 18), 24, 8), 11);
        moveProp(S, st.id(b.id), b.at, to, t + i * 100, 400, { every: 90, ease: EASE.in });
        b.at = to;
      });
      S.at(t, { ears: 'back', eyes: 'wide', lean: c.rng() < 0.5 ? -1 : 1 });
      t += 900;
      S.at(t, { ears: null, lean: 0 });
      fallen.forEach((b) => place(b, books.indexOf(b)));
    } else {
      st.prop(t, top.id, { sx: top.at.sx });
      S.at(t, { pawL: 'front', pawR: 'front' });
      S.at((t += 500), { pawL: null, pawR: null });
    }
    t = S.play('satisfied', t + 100);
    books.forEach((b, i) => st.prop(t + i * 100, b.id, { fade: 0, fadeMs: 500 }));
    return t + n * 100 + 500;
  },

  // loose pages float about; lined up; one escapes and is swatted back
  pages(y, t) {
    const { c, S, st, A } = y;
    const n = 3;
    const pages = [...Array(n).keys()].map((i) => {
      const at = clampPoint(c, A.world(rnd(c.rng, -24, 24), rnd(c.rng, -18, 4), rnd(c.rng, -10, 10)), 11);
      st.prop(t + i * 150, `page${i}`, { kind: 'trinket', name: 'page', ...at, frame: 0, fade: 0 });
      st.prop(t + i * 150 + 40, `page${i}`, { fade: 1 });
      return { id: `page${i}`, at };
    });
    t += 700;
    // they flutter
    for (let u = 0; u < 1400; u += 200) pages.forEach((p, i) => st.prop(t + u, p.id, { frame: (u / 200 + i) % 2 }));
    S.at(t, { gaze: 'u', eyes: 'wide', ears: 'perk' });
    t += 1400;
    // ordered with gestures into a neat row
    S.at(t, { pawL: 'up', pawR: 'up', eyes: 'open' });
    pages.forEach((p, i) => {
      const to = clampPoint(c, A.world((i - 1) * 12, -28, 4), 11);
      moveProp(S, st.id(p.id), p.at, to, t + i * 200, 700, { every: 110, ease: EASE.inOut });
      p.at = to;
    });
    t += 1200;
    S.at(t, { pawL: null, pawR: null });
    // one escapes upward and gets a swat
    const p = pick(c.rng, pages);
    const s = p.at.sx < A.pos.sx ? 'l' : 'r';
    const off = clampPoint(c, { ...p.at, sy: p.at.sy - 14 * A.px(), sx: p.at.sx + SIGN[s] * 10 * A.px() }, 11);
    moveProp(S, st.id(p.id), p.at, off, t, 600, { every: 110, ease: EASE.out, extra: (u, i) => ({ frame: i % 2 }) });
    A.look(t + 300, off, { eyes: 'wide' });
    t += 700;
    S.at(t, { [PAW[s]]: 'reach' });
    if (!c.reduced && c.rng() < 0.5) {
      S.at(t, { pose: 'stand' });
      t = A.hop(t + 100, A.pos, { height: 5, ms: 320, land: { pose: 'sit' } });
    } else t += 300;
    moveProp(S, st.id(p.id), off, p.at, t, 500, { every: 110, ease: EASE.inOut });
    S.at(t, { [PAW[s]]: null, eyes: 'happy' });
    t += 900;
    // the pages fold away
    pages.forEach((q, i) => st.prop(t + i * 120, q.id, { fade: 0, fadeMs: 500 }));
    S.at(t, { eyes: 'open', focus: null, gaze: 'c', ears: null });
    return t + 700;
  },

  // a book drifts upward out of reach; a reach, a hop, then magic
  drift(y, t) {
    const { c, S, st, A } = y;
    const s = anySide(c);
    const lap = A.world(SIGN[s] * 10, 23, 8);
    const tint = pick(c.rng, TINTS);
    st.prop(t, 'tome', { kind: 'trinket', name: 'tome', tint, ...lap, fade: 0 });
    st.prop(t + 40, 'tome', { fade: 1 });
    S.at(t + 200, { eyes: 'down' });
    t += 700;
    const high = clampPoint(c, A.world(SIGN[s] * 12, -30, 6), 11);
    moveProp(S, st.id('tome'), lap, high, t, 2000, { every: 140, ease: EASE.inOut });
    for (let u = 0; u < 2000; u += 400) A.look(t + u, lerpP(lap, high, u / 2000), { eyes: 'open' });
    t += 900;
    S.at(t, { [PAW[s]]: 'reach', gaze: 'u' });
    t += 1100;
    if (!c.reduced) {
      S.at(t, { pose: 'stand', [PAW[s]]: null });
      t = A.hop(t + 100, A.pos, { height: 6, ms: 340, land: { pose: 'sit' } });
      S.at(t, { ears: 'back' });
      t += 500;
    }
    // magic it is
    S.at(t, { ears: null });
    t = S.play('conjure', t, { side: s, c: 'V', keep: true });
    moveProp(S, st.id('tome'), high, lap, t, 1200, { every: 140, ease: EASE.inOut });
    st.prop(t, 'tome', { glow: true, glowHue: 'violet' });
    S.fx(t + 300, 'conjure', null);
    t += 1200;
    S.at(t, { [PAW[s]]: null, eyes: 'down', pupils: null, ears: null, focus: null, gaze: 'c' });
    return y.readIt(st, t);
  },

  // a book lies a little way off; fetched with magic, landing in its paws
  retrieve(y, t) {
    const { c, S, st, A } = y;
    const s = anySide(c);
    const far = clampPoint(c, A.world(SIGN[s] * rnd(c.rng, 26, 38), rnd(c.rng, 14, 24), rnd(c.rng, -40, 20)), 11);
    st.prop(t, 'tome', { kind: 'trinket', name: 'tome', tint: pick(c.rng, TINTS), ...far, fade: 0 });
    st.prop(t + 40, 'tome', { fade: 1 });
    t += 500;
    A.look(t, far, { ears: SIGN[s] < 0 ? 'flickL' : 'flickR' });
    t += rnd(c.rng, 800, 1300);
    if (c.rng() < 0.4) t = S.play('yawn', t);
    S.at(t, { [PAW[s]]: 'out', ears: 'perk', pupils: 0 });
    const lap = A.world(0, 23, 8);
    st.prop(t + 200, 'tome', { glow: true, glowHue: 'cyan' });
    moveProp(S, st.id('tome'), far, lap, t + 200, 1500, { every: 140, ease: EASE.inOut });
    for (let u = 0; u < 1500; u += 400) A.look(t + 200 + u, lerpP(far, lap, u / 1500));
    t += 1700;
    S.at(t, { [PAW[s]]: null, eyes: 'down', pupils: null, ears: null, focus: null, gaze: 'c' });
    return y.readIt(st, t);
  },
};

export const bookAntics = defineActivity({
  id: 'bookAntics',
  performance: true,
  rarity: 'rare',
  weights: W(2, 1.6),
  cooldown: 180000,
  duration: [9000, 24000],
  moves: true,
  requires: ['vanity:book'],
  followOn: { read: 3, sit: 2, groom: 1.5 },
  plan(c, S, st) {
    const y = {
      c,
      S,
      st,
      A: st.A,
      // the fetched book is opened in its lap and read a moment
      readIt(stage, t) {
        stage.prop(t, 'tome', { fade: 0, fadeMs: 200 });
        S.at(t + 100, { book: 0, eyes: 'open' });
        S.at(t + 500, { eyes: 'down' });
        let u = t + rnd(c.rng, 1200, 2000);
        for (let i = int(c.rng, 1, 2); i > 0; i--) {
          S.play('pageTurn', u);
          u += rnd(c.rng, 1500, 2500);
        }
        if (c.rng() < 0.4) u = S.play('adjustBook', u);
        S.at(u, { eyes: 'open' });
        S.at(u + 400, { book: null });
        return u + 700;
      },
    };
    S.at(0, { pose: 'sit', legs: 0, eyes: 'open' });
    let t = rnd(c.rng, 300, 700);
    const picks = st.some('antic', { stack: 3, pages: 2, drift: 2, retrieve: 2 }, c.rng() < 0.3 ? 2 : 1);
    for (const name of picks) {
      t = ANTICS[name](y, t);
      t += rnd(c.rng, 400, 900);
    }
    S.at(t, { pupils: null, focus: null, gaze: 'c' });
    return maybeTransition(S, c, t, { chance: 0.35, pool: { survey: 2, pause: 2, stretchOut: 1 } }) + rnd(c.rng, 300, 600);
  },
});

