import { defineBehavior } from '../../core/behaviors.js';
import { int, pick, rnd } from '../../core/rng.js';
import { sweep } from '../../core/toolkit.js';
import { textWidth } from '../sprites.js';
import { W } from './util.js';

/* Stationary behaviors: watching, thinking, holding still. */

export const sit = defineBehavior({
  id: 'sit',
  weights: W(14, 16),
  cooldown: 6000,
  followOn: { stretch: 2, ponder: 2, observe: 2, lookUp: 2 },
  plan(c, S) {
    const hold = rnd(c.rng, 3500, 8000);
    S.at(0, { pose: 'sit', gaze: pick(c.rng, ['c', 'c', 'l', 'r']), eyes: 'open', mouth: 'idle', legs: 0 });
    for (let i = int(c.rng, 1, 3); i > 0; i--) S.blink(rnd(c.rng, 600, hold - 400));
    if (c.rng() < 0.4) S.at(rnd(c.rng, 1200, hold - 800), { gaze: pick(c.rng, ['l', 'r', 'c']) });
    return hold;
  },
});

export const observe = defineBehavior({
  id: 'observe',
  weights: W(8, 8),
  cooldown: 8000,
  plan(c, S) {
    S.at(0, { pose: c.rng() < 0.5 ? 'sit' : 'stand', legs: 0, eyes: 'open' });
    return sweep(c, S, rnd(c.rng, 300, 900), int(c.rng, 3, 5));
  },
});

export const look = defineBehavior({
  id: 'look',
  weights: W(10, 8),
  cooldown: 5000,
  plan(c, S) {
    S.at(0, { pose: 'sit', legs: 0 });
    let t = rnd(c.rng, 200, 500);
    const dirs = c.rng() < 0.5 ? ['l', 'r', 'c'] : ['r', 'l', 'c'];
    for (const g of dirs.slice(0, int(c.rng, 2, 3))) {
      S.at(t, { gaze: g });
      t += rnd(c.rng, 700, 1500);
    }
    S.at(t, { gaze: 'c' });
    return t + 300;
  },
});

export const lookUp = defineBehavior({
  id: 'lookUp',
  weights: W(6, 4),
  cooldown: 15000,
  plan(c, S) {
    const x = int(c.rng, 44, 50);
    S.at(0, { gaze: 'u', pose: 'sit', legs: 0 });
    S.at(rnd(c.rng, 300, 800), {
      item: { kind: 'text', text: pick(c.rng, ['*', '+', 'o']), x, y: 0 },
    });
    const hold = rnd(c.rng, 1800, 3600);
    S.blink(hold * 0.6);
    S.at(hold, { item: null });
    S.at(hold + 400, { gaze: 'c' });
    return hold + 800;
  },
});

export const ponder = defineBehavior({
  id: 'ponder',
  weights: W(6),
  cooldown: 12000,
  flagWeights: { approaching: 2 }, // more thoughtful near the budget limit
  plan(c, S) {
    S.at(0, { pose: 'sit', gaze: pick(c.rng, ['l', 'r', 'u']), mouth: 'think', cue: '.o?' });
    S.at(rnd(c.rng, 1200, 1800), { cue: '?' });
    const hold = rnd(c.rng, 3000, 4800);
    S.at(hold, { cue: null, mouth: 'idle', gaze: 'c' });
    return hold + 500;
  },
});

export const ponderSymbol = defineBehavior({
  id: 'ponderSymbol',
  weights: W(5, 5),
  cooldown: 20000,
  flagWeights: { approaching: 2 }, // more thoughtful near the budget limit
  plan(c, S) {
    const text = pick(c.rng, ['$?', '%?', '+1', '-5', '12%', '=?', '$$']);
    S.at(0, {
      pose: 'sit',
      gaze: 'u',
      mouth: 'think',
      item: { kind: 'text', text, x: 55 - textWidth(text), y: 0 },
    });
    const hold = rnd(c.rng, 2800, 5000);
    S.blink(hold * 0.55);
    S.at(hold, { item: null, mouth: 'idle', gaze: 'c' });
    return hold + 500;
  },
});

export const stillness = defineBehavior({
  id: 'stillness',
  weights: W(3, 4),
  cooldown: 60000,
  followOn: { stretch: 4, look: 3 },
  plan(c, S) {
    const hold = rnd(c.rng, 12000, 26000);
    S.at(0, { pose: 'sit', gaze: pick(c.rng, ['c', 'l', 'r']), legs: 0, eyes: 'open' });
    for (let i = int(c.rng, 1, 2); i > 0; i--) S.blink(rnd(c.rng, 3000, hold - 1000));
    return hold;
  },
});

/* B. Watching beyond the screen: no object, only a distant point. */
export const watchBeyond = defineBehavior({
  id: 'watchBeyond',
  rarity: 'uncommon',
  weights: W(7, 6),
  cooldown: 25000,
  duration: [6000, 14000],
  followOn: { sit: 2, observe: 2, idea: 2 },
  plan(c, S) {
    const hold = rnd(c.rng, ...this.duration);
    S.at(0, { pose: 'sit', legs: 0, eyes: 'open', gaze: 'u' });
    // something far away catches its attention
    S.at(rnd(c.rng, 250, 500), { eyes: 'wide' });
    S.at(rnd(c.rng, 900, 1300), { eyes: 'open' });

    // it follows the distant point slowly, now and then re-fixing on it
    let t = rnd(c.rng, 1600, 2800);
    while (t < hold - 1800) {
      S.at(t, { gaze: pick(c.rng, ['u', 'u', 'l', 'r']) });
      if (c.rng() < 0.3) S.blink(t + rnd(c.rng, 300, 900));
      t += rnd(c.rng, 1400, 3200);
    }

    // loses it, glances once at where it was, and settles
    S.at(hold, { gaze: pick(c.rng, ['l', 'r']) });
    S.at(hold + 700, { gaze: 'c' });
    return hold + 1200;
  },
});

/* D. The long pause: an unexpectedly long stillness with tiny natural movements. */
export const longPause = defineBehavior({
  id: 'longPause',
  rarity: 'extremelyRare',
  weights: W(2.5, 2),
  cooldown: 150000,
  duration: [28000, 55000],
  followOn: { stretch: 3, look: 2, watchBeyond: 2 },
  plan(c, S) {
    const hold = rnd(c.rng, ...this.duration);
    S.at(0, { pose: 'sit', legs: 0, eyes: 'open', gaze: pick(c.rng, ['c', 'l', 'r']), mouth: 'idle' });

    // sparse blinks
    for (let t = rnd(c.rng, 2500, 6000); t < hold - 1500; t += rnd(c.rng, 3500, 9000)) S.blink(t);

    // an occasional shift of gaze that returns on its own
    for (let t = rnd(c.rng, 6000, 11000); t < hold - 4000; t += rnd(c.rng, 8000, 15000)) {
      S.at(t, { gaze: pick(c.rng, ['l', 'r', 'u']) });
      S.at(t + rnd(c.rng, 1500, 3500), { gaze: 'c' });
    }

    // tiny movements: a one-pixel lean, a slow nod of the head
    for (let t = rnd(c.rng, 5000, 12000); t < hold - 3000; t += rnd(c.rng, 9000, 18000)) {
      if (c.rng() < 0.5) {
        const lean = c.rng() < 0.5 ? -1 : 1;
        S.at(t, { lean });
        S.at(t + 900, { lean: 0 });
      } else {
        S.at(t, { droop: 1 });
        S.at(t + rnd(c.rng, 1400, 2400), { droop: 0 });
      }
    }

    S.at(hold - 400, { gaze: 'c', lean: 0, droop: 0 });
    return hold;
  },
});

/* I. An idea occurs: a thinking pose and a tiny pixel symbol above the head. */
export const idea = defineBehavior({
  id: 'idea',
  rarity: 'uncommon',
  weights: W(5, 4),
  cooldown: 45000,
  followOn: { look: 2, sit: 2, ponder: 1.5 },
  plan(c, S) {
    S.at(0, { pose: 'sit', legs: 0, eyes: 'open', mouth: 'think', gaze: pick(c.rng, ['l', 'r', 'c']) });
    // the cat stops, then the symbol appears above its head
    const t0 = rnd(c.rng, 500, 1100);
    const t1 = S.play('ideaGlyph', t0, { name: 'bulb' });
    // and it brightens as the symbol goes
    S.at(t1, { eyes: 'wide', mouth: 'idle', gaze: 'c' });
    S.at(t1 + 700, { eyes: 'open' });
    return t1 + 1400;
  },
});
