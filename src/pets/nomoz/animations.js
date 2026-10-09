import { int, pick, rnd } from '../core/rng.js';

/*
 * NOMOZ.EXE's shared animations: reusable timed sequences of view patches
 * that several behaviors may play (`S.play('pageTurn', t)`). They select
 * frames the sprite module draws; they never decide when they run.
 */

const gaze = (c) => pick(c.rng, ['l', 'c', 'r']);

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
