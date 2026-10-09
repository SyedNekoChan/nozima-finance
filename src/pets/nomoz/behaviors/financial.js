import { defineBehavior } from '../../core/behaviors.js';
import { int, pick, rnd } from '../../core/rng.js';
import { textWidth } from '../sprites.js';
import { W } from './util.js';

/*
 * Financial-context behaviors. They are ordinary registered behaviors:
 *
 *  - Context-driven ones (`budgetWatch`, `relax`, the stressed pair) join the
 *    normal weighted random pool. A financial flag ('approaching') only makes
 *    them eligible or heavier; the scheduler still decides what the cat does.
 *  - Reaction-only ones (weight 0 in every mood) are never picked at random.
 *    They run only when a financial reaction (./../financial.js) offers
 *    them at a behavior boundary, and only in the moods listed in
 *    `reactMoods`, so they can never override the stressed / prosperous
 *    appearance.
 *
 * Every one is a short, subtle, purely visual sequence: no text, no
 * notification, no UI.
 */

const SYMBOLS = ['$?', '%?', '12%', '-5', '=?', '$$'];

/* Healthy state: a relaxed resting posture. Not forced; just eligible. */
export const relax = defineBehavior({
  id: 'relax',
  rarity: 'uncommon',
  weights: W(0, 5),
  cooldown: 90000,
  duration: [7000, 13000],
  followOn: { stretch: 3, sit: 2, observe: 2 },
  plan(c, S) {
    const hold = rnd(c.rng, ...this.duration);
    S.at(0, { pose: 'sit', legs: 0, gaze: 'c' });
    S.at(rnd(c.rng, 700, 1300), { eyes: 'closed', droop: 1, mouth: 'rest' });
    // slow breaths: the head rises and settles
    for (let t = rnd(c.rng, 2200, 3200); t < hold - 1500; t += rnd(c.rng, 2200, 3400)) {
      S.at(t, { droop: 0 });
      S.at(t + 900, { droop: 1 });
    }
    S.at(hold, { eyes: 'blink', droop: 0, mouth: 'idle' });
    S.at(hold + 300, { eyes: 'open' });
    return hold + 900;
  },
});

/*
 * Approaching the budget limit (flag 'approaching'): while it holds, now and
 * then the cat looks at a financial-looking symbol, grows thoughtful,
 * checks its coin or turns attentive, and sometimes looks briefly
 * concerned, then returns to what it was doing.
 */
export const budgetWatch = defineBehavior({
  id: 'budgetWatch',
  rarity: 'uncommon',
  weights: W(6, 6),
  cooldown: 70000,
  requiresFlags: ['approaching'],
  followOn: { look: 2, sit: 2, ponder: 1.5 },
  plan(c, S) {
    const content = c.mood === 'content';
    S.at(0, { pose: 'sit', legs: 0, eyes: 'open', gaze: 'c' });
    let t = rnd(c.rng, 300, 800);

    const kind = pick(c.rng, ['symbol', 'coin', 'attentive']);

    if (kind === 'symbol') {
      const text = pick(c.rng, SYMBOLS);
      S.at(t, { gaze: 'u', mouth: 'think', item: { kind: 'text', text, x: 55 - textWidth(text), y: 0 } });
      t += rnd(c.rng, 2200, 3600);
      S.blink(t - 600);
      S.at(t, { item: null, mouth: 'idle', gaze: 'c' });
    } else if (kind === 'coin') {
      if (!content) S.at(t, { eyes: 'down', item: { kind: 'coin', x: 24, y: 46, spark: false } });
      const n = int(c.rng, 4, 6);
      for (let i = 0; i < n; i++) {
        S.at(
          t + i * 500,
          content
            ? { item: { kind: 'sparkle', x: i % 2 ? 35 : 16, y: i % 2 ? 31 : 34 } }
            : { item: { kind: 'coin', x: 24, y: 46, spark: i % 2 === 0 } }
        );
      }
      t += n * 500 + 300;
      S.at(t, { item: null, eyes: 'open' });
    } else {
      // a more attentive posture: upright, eyes wide, a careful look around
      S.at(t, { pose: 'stand', legs: 0, eyes: 'wide', gaze: pick(c.rng, ['l', 'r']) });
      S.at((t += rnd(c.rng, 900, 1400)), { eyes: 'open', gaze: pick(c.rng, ['r', 'l']) });
      S.at((t += rnd(c.rng, 900, 1400)), { gaze: 'c' });
      S.at((t += 500), { pose: 'sit' });
    }

    // sometimes a flicker of concern before it moves on
    if (c.rng() < 0.5) {
      t += 400;
      S.at(t, { eyes: 'wide', mouth: 'think', cue: '?', gaze: pick(c.rng, ['l', 'r']) });
      t += rnd(c.rng, 900, 1500);
      S.at(t, { eyes: 'open', mouth: 'idle', cue: null, gaze: 'c' });
    }

    return t + 900;
  },
});

/* ---- Reaction-only behaviors (offered by financial reactions) ------- */

/* A successful income: a brief contented glance. */
export const incomeGlance = defineBehavior({
  id: 'incomeGlance',
  weights: W(0),
  reactMoods: ['idle', 'content'],
  plan(c, S) {
    const g = pick(c.rng, ['l', 'r']);
    S.at(0, { pose: 'sit', legs: 0, gaze: g });
    if (c.mood === 'content') S.at(300, { item: { kind: 'sparkle', x: 16, y: 34 } });
    else S.at(300, { eyes: 'happy' });
    const t = rnd(c.rng, 1500, 2300);
    S.at(t, { item: null, eyes: 'open', gaze: 'c' });
    return t + 700;
  },
});

/* A successful expense: a momentary thoughtful glance. */
export const expenseGlance = defineBehavior({
  id: 'expenseGlance',
  weights: W(0),
  reactMoods: ['idle', 'content'],
  plan(c, S) {
    S.at(0, { pose: 'sit', legs: 0, gaze: pick(c.rng, ['l', 'r']), mouth: 'think' });
    S.at(rnd(c.rng, 600, 900), { gaze: 'u' });
    const t = rnd(c.rng, 1700, 2500);
    S.blink(t - 500);
    S.at(t, { mouth: 'idle', gaze: 'c' });
    return t + 600;
  },
});

/* A completed transfer: a short pause and acknowledgement. */
export const transferNod = defineBehavior({
  id: 'transferNod',
  weights: W(0),
  reactMoods: ['idle', 'content'],
  plan(c, S) {
    const first = pick(c.rng, ['l', 'r']);
    S.at(0, { pose: 'sit', legs: 0, gaze: first });
    S.at(rnd(c.rng, 500, 700), { gaze: first === 'l' ? 'r' : 'l' });
    S.at(rnd(c.rng, 1100, 1400), { gaze: 'c' });
    S.blink(1700);
    return 2400;
  },
});

/* A meaningful change of overall position (idle <-> healthy): a look of interest. */
export const interest = defineBehavior({
  id: 'interest',
  weights: W(0),
  reactMoods: ['idle', 'content'],
  plan(c, S) {
    S.at(0, { pose: 'sit', legs: 0, eyes: 'wide', gaze: 'u' });
    S.at(rnd(c.rng, 900, 1300), { eyes: 'open', gaze: pick(c.rng, ['l', 'r']) });
    S.at(rnd(c.rng, 1900, 2500), { gaze: 'c' });
    S.blink(2900);
    return 3500;
  },
});

/* Recovery from stress: a breath-like pause, then attention back to the coin. */
export const relief = defineBehavior({
  id: 'relief',
  weights: W(0),
  reactMoods: ['idle', 'content'],
  plan(c, S) {
    // a slow breath out: the head settles
    S.at(0, { pose: 'sit', legs: 0, lean: 0, gaze: 'c', eyes: 'closed', droop: 1, mouth: 'rest' });
    S.at(rnd(c.rng, 1500, 2100), { eyes: 'blink', droop: 0, mouth: 'idle' });
    S.at(2300, { eyes: 'open' });

    // attention returns to its coin
    let t = 2700;
    if (c.mood === 'content') {
      for (let i = 0; i < 3; i++) S.at(t + i * 500, { item: { kind: 'sparkle', x: i % 2 ? 35 : 16, y: i % 2 ? 31 : 34 } });
      t += 1700;
    } else {
      S.at(t, { eyes: 'down', item: { kind: 'coin', x: 24, y: 46, spark: false } });
      t += 1800;
    }
    S.at(t, { item: null, eyes: 'open', gaze: 'c' });
    return t + 800;
  },
});

/* ---- Stressed state: restrained reactions ---------------------------- */

/* A startled pause: a small tense lean, a stilled moment. */
export const startle = defineBehavior({
  id: 'startle',
  rarity: 'uncommon',
  weights: W(0, 0, 5),
  cooldown: 45000,
  moves: true, // a lean is a motion; reduced motion skips it
  followOn: { still: 3, nervousLook: 2 },
  plan(c, S) {
    const lean = c.rng() < 0.5 ? -1 : 1;
    S.at(0, { pose: 'sit', legs: 0, lean, cue: '!' });
    S.at(450, { lean: 0 });
    S.at(1500, { cue: null });
    return rnd(c.rng, 2400, 3400);
  },
});

/* An unsettled inspection of its surroundings: quick looks, no movement. */
export const unsettledLook = defineBehavior({
  id: 'unsettledLook',
  rarity: 'uncommon',
  weights: W(0, 0, 5),
  cooldown: 40000,
  followOn: { still: 3 },
  plan(c, S) {
    S.at(0, { pose: 'sit', legs: 0, cue: '?' });
    let t = 0;
    for (const g of ['l', 'r', pick(c.rng, ['u', 'l', 'r'])]) {
      S.at(t, { gaze: g });
      t += rnd(c.rng, 600, 1000);
    }
    // now and then the unease shows as a tiny glitch
    if (c.rng() < 0.3) t = S.play('glitchBurst', t) + 300;
    S.at(t, { gaze: 'c', cue: null });
    return t + rnd(c.rng, 1400, 2200);
  },
});
