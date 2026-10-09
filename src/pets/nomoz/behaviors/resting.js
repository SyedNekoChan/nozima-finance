import { defineBehavior } from '../../core/behaviors.js';
import { rnd } from '../../core/rng.js';
import { W } from './util.js';

/* Resting behaviors. */

/* J. Falling asleep: settles gradually, sleeps a random while, wakes naturally. */
export const sleep = defineBehavior({
  id: 'sleep',
  rarity: 'rare',
  weights: W(4),
  cooldown: 90000,
  duration: [8000, 20000],
  followOn: { stretch: 5 },
  plan(c, S) {
    const asleep = rnd(c.rng, ...this.duration);
    const t = S.play('dropOff', 0);

    for (let u = t + 1600, i = 0; u < t + asleep; u += 1600, i++) {
      S.at(u, { cue: i % 2 ? 'z' : 'zZ' });
    }

    const end = S.play('wakeUp', t + asleep);
    S.at(end, { droop: 0, mouth: 'idle', pose: 'sit' });
    return end + 1000;
  },
});

export const tired = defineBehavior({
  id: 'tired',
  weights: W(5, 2),
  cooldown: 40000,
  followOn: { stretch: 3 },
  plan(c, S) {
    const dur = rnd(c.rng, 3000, 6000);
    S.at(0, { pose: 'sit', eyes: 'closed', mouth: 'rest', legs: 0, cue: 'z' });
    S.at(dur * 0.5, { cue: null });
    S.at(dur, { eyes: 'blink' });
    S.at(dur + 200, { eyes: 'open', mouth: 'idle', pose: 'sit' });
    return dur + 800;
  },
});

export const stretch = defineBehavior({
  id: 'stretch',
  weights: W(5, 6),
  cooldown: 30000,
  plan(c, S) {
    const hold = rnd(c.rng, 1800, 3000);
    S.at(0, { pose: 'stretch', eyes: 'closed', mouth: 'rest', legs: 0 });
    S.at(hold, { pose: 'sit', mouth: 'idle' });
    S.blink(hold + 100);
    return hold + 700;
  },
});
