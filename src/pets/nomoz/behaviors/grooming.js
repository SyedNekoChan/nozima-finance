import { defineActivity } from '../../core/activity.js';
import { int, rnd } from '../../core/rng.js';
import { W, anySide, other, weighted } from './util.js';

/*
 * Self-grooming: a chain of grooming moves (the animations lickPaw,
 * rubFace, cleanEar, washFace, inspectPaw) whose order, side, count and
 * timing are drawn each time, ending with a shake or a satisfied pose.
 * Stationary, so it also runs under reduced motion (more slowly).
 */

// What naturally follows each move (a nudge, not a script).
const NEXT = {
  lickPaw: { rubFace: 4, cleanEar: 3, lickPaw: 1, inspectPaw: 1 },
  rubFace: { lickPaw: 4, cleanEar: 2, washFace: 1 },
  cleanEar: { lickPaw: 3, rubFace: 2, washFace: 1 },
  washFace: { lickPaw: 2, inspectPaw: 2, cleanEar: 1 },
  inspectPaw: { lickPaw: 4, rubFace: 1 },
};

export const groom = defineActivity({
  id: 'groom',
  weights: W(6, 5),
  cooldown: 45000,
  duration: [5000, 18000],
  followOn: { sit: 2, observe: 2, tired: 1.5, sleep: 1.5, pawCheck: 0.5 },
  plan(c, S, st) {
    S.at(0, { pose: 'sit', legs: 0, eyes: 'open', mouth: 'idle', lean: 0, gaze: 'c' });
    let t = rnd(c.rng, 300, 900);

    let side = anySide(c);
    let move = st.variant('opener', { lickPaw: 5, washFace: 2, inspectPaw: 2 });
    const moves = int(c.rng, 2, c.reduced ? 3 : 6);

    for (let i = 0; i < moves; i++) {
      t = S.play(move, t, { side });

      // between moves: a short gap, now and then a glance or a blink
      t += rnd(c.rng, 120, 500);
      if (c.rng() < 0.2) t = S.play(c.rng() < 0.5 ? 'earFlick' : 'lookToward', t) + rnd(c.rng, 100, 300);
      else if (c.rng() < 0.25) {
        S.blink(t);
        t += 400;
      }

      // done with one side: the other side starts again from a lick
      if ((move === 'rubFace' || move === 'cleanEar') && c.rng() < 0.4) {
        side = other(side);
        move = 'lickPaw';
      } else {
        move = weighted(c.rng, NEXT[move]);
      }
    }

    // the finish: a shake, a satisfied pose, or both
    const finish = st.variant('finish', { shake: 3, satisfied: 3, both: 1.2 });
    if (finish !== 'satisfied') t = S.play('shake', t + 200, { motes: c.rng() < 0.5 ? 'fur' : null, c: 'S' }) + 200;
    if (finish !== 'shake') t = S.play('satisfied', t + 150);
    return t + rnd(c.rng, 400, 900);
  },
});
