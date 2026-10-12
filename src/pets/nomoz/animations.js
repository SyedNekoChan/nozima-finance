import { int, pick, rnd } from '../core/rng.js';
import { pawSpot } from './sprites.js';

/*
 * NOMOZ.EXE's shared animations: reusable timed sequences of view patches
 * that several behaviors may play (`S.play('pageTurn', t)`). They select
 * frames the sprite module draws; they never decide when they run.
 *
 * Besides the originals there are three families of primitives:
 *   grooming     lickPaw, rubFace, cleanEar, washFace, inspectPaw, shake,
 *                satisfied (each takes { side: 'l' | 'r' } where it matters)
 *   gestures     pawTap, conjure, headTilt, nod, triumph, wiggle, knead
 *   transitions  stretchOut, yawn, survey, earFlick, tailSwish, pause,
 *                shakeParticles, adjustBook, lookToward: small optional
 *                actions that connect one activity to the next
 * Every primitive leaves the rig fields it touched back at rest unless it
 * is asked to `keep` them (so a behavior can chain it into the next move).
 */

const gaze = (c) => pick(c.rng, ['l', 'c', 'r']);
const sideOf = (c, o) => o.side || (c.rng() < 0.5 ? 'l' : 'r');
const PAW = { l: 'pawL', r: 'pawR' };
const LEAN = { l: -1, r: 1 };
const FLICK = { l: 'flickL', r: 'flickR' };

export const ANIMATIONS = [
  // a quick blink
  { id: 'blink', steps: [[0, { eyes: 'blink' }], [140, { eyes: 'open' }]] },

  // turn a page: the right page lifts, stands on its edge, lands
  {
    id: 'pageTurn',
    steps: [
      [0, { book: 1 }],
      [180, { book: 2 }],
      [380, { book: 0 }],
    ],
  },

  // look up from the page, then back down
  {
    id: 'lookUpFromBook',
    build(S, c, t0) {
      const t1 = t0 + rnd(c.rng, 900, 1800);
      S.at(t0, { eyes: 'open', gaze: gaze(c) });
      S.at(t1, { eyes: 'down', gaze: 'c' });
      return t1;
    },
  },

  // lift the chest coin, turn it over, put it back
  {
    id: 'coinTurn',
    build(S, c, t0) {
      let t = t0;
      S.at(t, { eyes: 'down' });
      // lift
      S.at((t += 350), { coin: { dx: 0, dy: -2, turn: 0 } });
      S.at((t += 350), { coin: { dx: 0, dy: -5, turn: 0 } });
      // turn over (one frame per step; a still face-and-back under reduced motion)
      const frames = c.reduced ? [3] : [1, 2, 3, 4];
      const turns = int(c.rng, 1, 2);
      for (let k = 0; k < turns; k++) {
        for (const turn of frames) S.at((t += c.reduced ? 700 : 170), { coin: { dx: 0, dy: -5, turn } });
        S.at((t += 600), { coin: { dx: 0, dy: -5, turn: 0 } });
      }
      // a pleased moment, then put it away
      S.at((t += 500), { coin: { dx: 0, dy: -2, turn: 0 } });
      S.at((t += 350), { coin: null, eyes: 'open' });
      return t;
    },
  },

  // adjust the crown: lift a pixel, nudge side to side, settle
  {
    id: 'crownAdjust',
    build(S, c, t0) {
      let t = t0;
      S.at(t, { gaze: 'u' });
      const nudges = [[1, -1], [-1, -1], [1, 0], [0, 0]];
      for (const [x, y] of nudges.slice(0, int(c.rng, 3, 4))) {
        S.at((t += rnd(c.rng, 380, 620)), { crown: x, crownLift: y });
      }
      S.at((t += 400), { crown: 0, crownLift: 0, gaze: 'c' });
      return t;
    },
  },

  // eyes droop, close, the head sinks
  {
    id: 'dropOff',
    build(S, c, t0) {
      let t = t0;
      S.at(t, { pose: 'sit', legs: 0, gaze: 'c', mouth: 'rest' });
      S.at((t += rnd(c.rng, 900, 1500)), { eyes: 'down' });
      S.at((t += rnd(c.rng, 900, 1500)), { eyes: 'blink' });
      S.at((t += 200), { eyes: 'down', droop: 1 });
      // a slow nod: the head catches itself once
      if (c.rng() < 0.6) {
        S.at((t += rnd(c.rng, 800, 1400)), { eyes: 'open', droop: 0 });
        S.at((t += rnd(c.rng, 500, 900)), { eyes: 'down', droop: 1 });
      }
      S.at((t += rnd(c.rng, 900, 1500)), { eyes: 'closed', droop: 1, cue: 'z' });
      return t;
    },
  },

  // wake naturally: the eyes open, a stretch of the head, back to normal
  {
    id: 'wakeUp',
    build(S, c, t0) {
      let t = t0;
      S.at(t, { cue: null, eyes: 'blink' });
      S.at((t += 300), { eyes: 'down', droop: 1 });
      S.at((t += rnd(c.rng, 500, 900)), { eyes: 'open', droop: 0, mouth: 'idle', gaze: gaze(c) });
      S.at((t += 700), { eyes: 'blink' });
      S.at((t += 150), { eyes: 'open', gaze: 'c' });
      return t;
    },
  },

  // a brief glitch: two or three short row slips (no flicker)
  {
    id: 'glitchBurst',
    build(S, c, t0) {
      let t = t0;
      for (let i = int(c.rng, 2, 3); i > 0; i--) {
        S.at(t, { glitch: int(c.rng, 1, 2) });
        t += rnd(c.rng, 90, 150);
        S.at(t, { glitch: 0 });
        t += rnd(c.rng, 200, 520);
      }
      return t;
    },
  },

  /* ---- grooming -------------------------------------------------- */

  // raise a paw to the mouth and lick it in short strokes
  {
    id: 'lickPaw',
    build(S, c, t0, o = {}) {
      const s = sideOf(c, o);
      const k = PAW[s];
      let t = t0;
      S.at(t, { [k]: 'mid', eyes: 'down', gaze: s });
      S.at((t += rnd(c.rng, 220, 380)), { [k]: 'high', eyes: 'closed', lean: c.rng() < 0.5 ? LEAN[s] : 0 });
      const licks = o.licks ?? int(c.rng, 3, 6);
      for (let i = 0; i < licks; i++) {
        S.at((t += rnd(c.rng, 150, 260)), { mouth: 'lick' });
        S.at((t += rnd(c.rng, 130, 220)), { mouth: 'idle' });
        if (c.rng() < 0.18) t += rnd(c.rng, 250, 600); // a pause between strokes
      }
      if (!o.keep) S.at((t += 180), { [k]: null, eyes: 'open', lean: 0, gaze: 'c', mouth: 'idle' });
      return t;
    },
  },

  // rub the cheek with a damp paw: strokes from the mouth over the face
  {
    id: 'rubFace',
    build(S, c, t0, o = {}) {
      const s = sideOf(c, o);
      const k = PAW[s];
      let t = t0;
      S.at(t, { [k]: 'high', eyes: 'closed', lean: LEAN[s] });
      for (let i = int(c.rng, 2, 4); i > 0; i--) {
        S.at((t += rnd(c.rng, 200, 320)), { [k]: 'face', droop: c.rng() < 0.4 ? 1 : 0 });
        S.at((t += rnd(c.rng, 200, 320)), { [k]: 'high', droop: 0 });
      }
      if (c.rng() < 0.5) S.at(t - 120, { ears: FLICK[s] });
      if (!o.keep) S.at((t += 200), { [k]: null, eyes: 'open', lean: 0, droop: 0, ears: null });
      return t;
    },
  },

  // clean around the ear: the head tips toward the paw, the ear flattens
  {
    id: 'cleanEar',
    build(S, c, t0, o = {}) {
      const s = sideOf(c, o);
      const k = PAW[s];
      let t = t0;
      S.at(t, { [k]: 'face', eyes: 'closed', lean: LEAN[s], droop: 1 });
      S.at((t += rnd(c.rng, 200, 320)), { [k]: 'ear', ears: FLICK[s] });
      for (let i = int(c.rng, 2, 4); i > 0; i--) {
        S.at((t += rnd(c.rng, 220, 360)), { [k]: 'face' });
        S.at((t += rnd(c.rng, 220, 360)), { [k]: 'ear', ears: c.rng() < 0.5 ? 'back' : FLICK[s] });
      }
      if (!o.keep) S.at((t += 220), { [k]: null, eyes: 'open', lean: 0, droop: 0, ears: null });
      return t;
    },
  },

  // wash the face with both paws at once, the head bobbing into them
  {
    id: 'washFace',
    build(S, c, t0, o = {}) {
      let t = t0;
      S.at(t, { pawL: 'high', pawR: 'high', eyes: 'closed', droop: 1 });
      for (let i = int(c.rng, 3, 6); i > 0; i--) {
        const flip = i % 2 === 0;
        S.at((t += rnd(c.rng, 200, 300)), {
          pawL: flip ? 'face' : 'high',
          pawR: flip ? 'high' : 'face',
          droop: flip ? 0 : 1,
        });
      }
      if (!o.keep) S.at((t += 220), { pawL: null, pawR: null, eyes: 'open', droop: 0 });
      return t;
    },
  },

  // stop and look a paw over, toes spread; sometimes a quick lick
  {
    id: 'inspectPaw',
    build(S, c, t0, o = {}) {
      const s = sideOf(c, o);
      const k = PAW[s];
      let t = t0;
      S.at(t, { [k]: 'mid', eyes: 'down', gaze: s, pupils: 1, ears: 'perk' });
      S.at((t += rnd(c.rng, 600, 1100)), { [k]: 'front', gaze: 'c' });
      S.at((t += rnd(c.rng, 400, 800)), { [k]: 'mid', gaze: s });
      t += rnd(c.rng, 300, 700);
      if (c.rng() < 0.45) t = S.play('lickPaw', t, { side: s, licks: int(c.rng, 1, 2), keep: true });
      if (!o.keep) S.at((t += 200), { [k]: null, eyes: 'open', gaze: 'c', pupils: null, ears: null, mouth: 'idle', lean: 0 });
      return t;
    },
  },

  // a quick shake of the head (and, with motes, the fur sheds a few specks)
  {
    id: 'shake',
    build(S, c, t0, o = {}) {
      let t = t0;
      S.at(t, { eyes: 'closed', ears: 'flick' });
      const n = int(c.rng, 4, 6);
      for (let i = 0; i < n; i++) {
        S.at(t, { lean: i % 2 ? 1 : -1 });
        if (o.motes) {
          const x = i % 2 ? int(c.rng, 46, 53) : int(c.rng, 2, 9);
          S.fx(t, `shake${i}`, { kind: o.motes === 'fur' ? 'mote' : 'spark', x, y: int(c.rng, 8, 30), c: o.c || 'S' });
          S.fx(t + rnd(c.rng, 200, 380), `shake${i}`, null);
        }
        t += rnd(c.rng, 80, 120);
      }
      S.at(t, { lean: 0, ears: null });
      S.at((t += 200), { eyes: 'open' });
      return t;
    },
  },

  // a contented pose: soft eyes, the tail swishing, a slow blink
  {
    id: 'satisfied',
    build(S, c, t0) {
      let t = t0;
      S.at(t, { eyes: 'happy', mouth: 'idle', tail: 'swish', lean: 0, pawL: null, pawR: null });
      t += rnd(c.rng, 900, 1700);
      S.at(t, { eyes: 'closed' });
      S.at((t += rnd(c.rng, 400, 700)), { eyes: 'open', tail: null });
      return t + 200;
    },
  },

  /* ---- gestures ---------------------------------------------------- */

  // tap a paw on the floor in a small rhythm (impatience, thought)
  {
    id: 'pawTap',
    build(S, c, t0, o = {}) {
      const s = sideOf(c, o);
      const k = PAW[s];
      let t = t0;
      for (let i = o.taps ?? int(c.rng, 3, 6); i > 0; i--) {
        S.at(t, { [k]: 'low' });
        S.at((t += rnd(c.rng, 140, 220)), { [k]: null });
        t += rnd(c.rng, 160, 420);
      }
      return t;
    },
  },

  // a paw rises and a small spark gathers on it
  {
    id: 'conjure',
    build(S, c, t0, o = {}) {
      const s = sideOf(c, o);
      const [x, y] = pawSpot('up', s);
      let t = t0;
      S.at(t, { [PAW[s]]: 'up', gaze: s, ears: 'perk', pupils: 0 });
      S.fx((t += 250), 'conjure', { kind: 'spark', x, y: y - 4, c: o.c || 'C' });
      S.fx((t += 180), 'conjure', { kind: 'spark', x, y: y - 4, c: 'W', big: true });
      S.fx((t += 220), 'conjure', { kind: 'spark', x, y: y - 4, c: o.c || 'C' });
      if (!o.keep) S.fx((t += 200), 'conjure', null);
      return t;
    },
  },

  // a puzzled tilt of the head with one ear tipped
  {
    id: 'headTilt',
    build(S, c, t0, o = {}) {
      const s = sideOf(c, o);
      let t = t0;
      S.at(t, { lean: LEAN[s], ears: FLICK[s], eyes: 'wide', ...(o.cue ? { cue: o.cue } : {}) });
      t += rnd(c.rng, 700, 1300);
      S.at(t, { lean: 0, ears: null, eyes: 'open', ...(o.cue ? { cue: null } : {}) });
      return t + 150;
    },
  },

  // a small nod (or two)
  {
    id: 'nod',
    build(S, c, t0) {
      let t = t0;
      for (let i = int(c.rng, 1, 2); i > 0; i--) {
        S.at(t, { droop: 1 });
        S.at((t += rnd(c.rng, 160, 240)), { droop: 0 });
        t += rnd(c.rng, 120, 220);
      }
      return t;
    },
  },

  // a small triumphant gesture: a paw up, bright eyes, a twinkle
  {
    id: 'triumph',
    build(S, c, t0, o = {}) {
      const s = sideOf(c, o);
      const [x, y] = pawSpot('up', s);
      let t = t0;
      S.at(t, { [PAW[s]]: 'up', eyes: 'happy', tail: 'swish', ears: 'perk' });
      S.fx(t + 120, 'triumph', { kind: 'spark', x, y: y - 5, c: 'G', big: true });
      S.fx(t + 420, 'triumph', { kind: 'spark', x: x + LEAN[s] * 2, y: y - 7, c: 'W', x2: true });
      S.fx(t + 720, 'triumph', null);
      t += rnd(c.rng, 900, 1300);
      S.at(t, { [PAW[s]]: null, eyes: 'open', tail: null, ears: null });
      return t + 150;
    },
  },

  // the hindquarters wiggle before a pounce (the lean rocks, the tail lashes)
  {
    id: 'wiggle',
    build(S, c, t0) {
      let t = t0;
      S.at(t, { pose: 'crouch', legs: 0, tail: 'swish', pupils: 3, ears: 'perk' });
      for (let i = int(c.rng, 4, 7); i > 0; i--) {
        S.at(t, { lean: i % 2 ? 1 : -1 });
        t += rnd(c.rng, 90, 140);
      }
      S.at(t, { lean: 0 });
      return t + rnd(c.rng, 80, 260);
    },
  },

  // kneading before settling: paws press down in turn
  {
    id: 'knead',
    build(S, c, t0) {
      let t = t0;
      S.at(t, { eyes: 'down', pose: 'sit' });
      for (let i = int(c.rng, 4, 7); i > 0; i--) {
        S.at(t, { pawL: i % 2 ? 'low' : null, pawR: i % 2 ? null : 'low' });
        t += rnd(c.rng, 260, 420);
      }
      S.at(t, { pawL: null, pawR: null });
      return t + 100;
    },
  },

  /* ---- transitions ------------------------------------------------- */

  // a full stretch, often with a yawn
  {
    id: 'stretchOut',
    build(S, c, t0) {
      let t = t0;
      const yawn = c.rng() < 0.6;
      S.at(t, { pose: 'stretch', eyes: 'closed', mouth: yawn ? 'o' : 'rest', ears: yawn ? 'back' : null, legs: 0 });
      t += rnd(c.rng, 1200, 2200);
      S.at(t, { pose: 'sit', mouth: 'idle', ears: null });
      S.blink(t + 120);
      return t + 450;
    },
  },

  {
    id: 'yawn',
    build(S, c, t0) {
      let t = t0;
      S.at(t, { mouth: 'o', eyes: 'closed', ears: 'back', droop: 1 });
      t += rnd(c.rng, 700, 1200);
      S.at(t, { mouth: 'idle', ears: null, droop: 0 });
      S.blink(t + 200);
      return t + 450;
    },
  },

  // a brief survey of the surroundings, ears turning with the gaze
  {
    id: 'survey',
    build(S, c, t0) {
      let t = t0;
      const order = c.rng() < 0.5 ? ['l', 'u', 'r'] : ['r', 'l', 'u'];
      for (const g of order.slice(0, int(c.rng, 2, 3))) {
        S.at(t, { gaze: g, ears: g === 'l' ? 'flickL' : g === 'r' ? 'flickR' : 'perk' });
        S.at(t + 260, { ears: null });
        t += rnd(c.rng, 600, 1200);
      }
      S.at(t, { gaze: 'c' });
      return t + 200;
    },
  },

  {
    id: 'earFlick',
    build(S, c, t0) {
      const e = pick(c.rng, ['flickL', 'flickR', 'flick']);
      S.at(t0, { ears: e });
      S.at(t0 + rnd(c.rng, 180, 280), { ears: null });
      return t0 + 400;
    },
  },

  {
    id: 'tailSwish',
    build(S, c, t0) {
      S.at(t0, { tail: 'swish' });
      const t = t0 + rnd(c.rng, 1400, 2600);
      S.at(t, { tail: null });
      return t;
    },
  },

  // a pause before choosing the next thing: still, a blink, a breath
  {
    id: 'pause',
    build(S, c, t0) {
      const t = t0 + rnd(c.rng, 700, 1500);
      S.blink(t0 + rnd(c.rng, 200, 500));
      if (c.rng() < 0.4) S.at(t0 + 300, { gaze: gaze(c) });
      S.at(t, { gaze: 'c' });
      return t;
    },
  },

  // shake off leftover magic: a head shake that sheds a few sparks
  {
    id: 'shakeParticles',
    build(S, c, t0, o = {}) {
      return S.play('shake', t0, { motes: 'spark', c: o.c || pick(c.rng, ['C', 'V', 'G']) });
    },
  },

  // nudge the open book into place
  {
    id: 'adjustBook',
    build(S, c, t0) {
      let t = t0;
      const d = c.rng() < 0.5 ? -1 : 1;
      S.at(t, { bookShift: d, eyes: 'down' });
      S.at((t += rnd(c.rng, 260, 420)), { bookShift: -d });
      S.at((t += rnd(c.rng, 260, 420)), { bookShift: 0 });
      return t + 150;
    },
  },

  // look toward a side (or up) with the ears turned that way
  {
    id: 'lookToward',
    build(S, c, t0, o = {}) {
      const g = o.gaze || pick(c.rng, ['l', 'r', 'u']);
      S.at(t0, { gaze: g, ears: g === 'l' ? 'flickL' : g === 'r' ? 'flickR' : 'perk' });
      S.at(t0 + 300, { ears: null });
      const t = t0 + rnd(c.rng, 700, 1400);
      S.at(t, { gaze: 'c' });
      return t;
    },
  },

  // the idea symbol: appears above the head, blinks once, goes
  {
    id: 'ideaGlyph',
    build(S, c, t0, opts = {}) {
      const name = opts.name || 'bulb';
      let t = t0;
      S.at(t, { item: { kind: 'glyph', name, frame: 0, x: 26, y: 0 }, gaze: 'u' });
      S.at((t += 250), { item: { kind: 'glyph', name, frame: 1, x: 26, y: 0 } });
      S.at((t += 200), { item: { kind: 'glyph', name, frame: 0, x: 26, y: 0 } });
      t += rnd(c.rng, 1400, 2400);
      S.at(t, { item: null });
      return t;
    },
  },
];
