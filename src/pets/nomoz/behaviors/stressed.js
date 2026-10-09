import { defineBehavior } from '../../core/behaviors.js';
import { int, rnd } from '../../core/rng.js';
import { travel } from '../../core/toolkit.js';
import { SCHEDULER } from '../../config.js';
import { W } from './util.js';

/* Stressed-state behaviors: tense, small, restrained. */

function nervousSteps(c, S, passes) {
  const step = c.geo.cell * c.geo.scaleAt(c.cur.z);
  const dir = c.rng() < 0.5 ? -1 : 1;
  let t = 0;
  for (let i = 0; i < passes; i++) {
    const out = c.geo.clamp({
      sx: c.cur.sx + dir * step * int(c.rng, 1, 2),
      sy: c.cur.sy,
      z: c.cur.z,
    });
    t = travel(S, c, c.cur, out, t + (i ? 500 : 0), SCHEDULER.nervousStepMs);
    t = travel(S, c, out, c.cur, t + 700, SCHEDULER.nervousStepMs);
  }
  return t + rnd(c.rng, 1500, 2800);
}

export const shuffle = defineBehavior({
  id: 'shuffle',
  weights: W(0, 0, 22),
  cooldown: 2000,
  moves: true,
  plan: (c, S) => nervousSteps(c, S, 1),
});

export const pace = defineBehavior({
  id: 'pace',
  weights: W(0, 0, 10),
  cooldown: 12000,
  moves: true,
  plan: (c, S) => nervousSteps(c, S, 2),
});

export const flinch = defineBehavior({
  id: 'flinch',
  weights: W(0, 0, 22),
  cooldown: 2000,
  moves: true,
  plan(c, S) {
    const lean = c.rng() < 0.5 ? -1 : 1;
    S.at(0, { lean });
    S.at(450, { lean: 0 });
    S.at(900, { lean: -lean });
    S.at(1300, { lean: 0 });
    return rnd(c.rng, 2200, 3500);
  },
});

export const nervousLook = defineBehavior({
  id: 'nervousLook',
  weights: W(0, 0, 14),
  cooldown: 8000,
  moves: true,
  plan(c, S) {
    let t = 0;
    for (let i = int(c.rng, 3, 5); i > 0; i--) {
      S.at(t, { cue: i % 2 ? '!' : '?' });
      t += rnd(c.rng, 350, 800);
    }
    S.at(t, { cue: null });
    return t + rnd(c.rng, 1200, 2500);
  },
});

export const still = defineBehavior({
  id: 'still',
  weights: W(0, 0, 14),
  cooldown: 0,
  plan(c, S) {
    S.at(0, { lean: 0, legs: 0, pose: 'sit' });
    return rnd(c.rng, 2500, 5000);
  },
});
