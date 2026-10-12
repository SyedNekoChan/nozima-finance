import { defineBehavior } from '../../core/behaviors.js';
import { pick, rnd } from '../../core/rng.js';
import { W, anySide } from './util.js';

/*
 * Small connecting actions that also stand on their own: brief, common,
 * stationary. They make the gaps between longer activities feel lived in
 * (the same primitives are offered inside activities as optional
 * transitions, see maybeTransition in ./util.js).
 */

/* Inspecting a paw, sometimes with a quick lick. */
export const pawCheck = defineBehavior({
  id: 'pawCheck',
  weights: W(4, 3),
  cooldown: 35000,
  followOn: { groom: 2, sit: 2 },
  plan(c, S) {
    S.at(0, { pose: 'sit', legs: 0 });
    const t = S.play('inspectPaw', rnd(c.rng, 300, 700), { side: anySide(c) });
    return t + rnd(c.rng, 500, 1100);
  },
});

/* A brief survey of the surroundings, ears turning with the gaze. */
export const survey = defineBehavior({
  id: 'survey',
  weights: W(3, 3),
  cooldown: 25000,
  followOn: { walk: 2, sit: 2 },
  plan(c, S) {
    S.at(0, { pose: 'sit', legs: 0, eyes: 'open' });
    let t = S.play('survey', rnd(c.rng, 200, 500));
    if (c.rng() < 0.4) t = S.play('earFlick', t + 200);
    return t + rnd(c.rng, 400, 900);
  },
});

/* A yawn, sometimes growing into a full stretch. */
export const yawn = defineBehavior({
  id: 'yawn',
  weights: W(3, 2),
  cooldown: 40000,
  followOn: { tired: 2, sleep: 1.5, groom: 1.5 },
  plan(c, S) {
    S.at(0, { pose: 'sit', legs: 0 });
    let t = S.play('yawn', rnd(c.rng, 200, 600));
    if (c.rng() < 0.35) t = S.play('stretchOut', t + 200);
    return t + rnd(c.rng, 500, 1000);
  },
});

/*
 * Shaking off leftover magic. Rare on its own; magical activities make it
 * a likely next step through their followOn.
 */
export const shakeOff = defineBehavior({
  id: 'shakeOff',
  weights: W(0.6, 0.6),
  cooldown: 30000,
  followOn: { groom: 2, sit: 2 },
  plan(c, S) {
    S.at(0, { pose: 'sit', legs: 0 });
    let t = S.play('shakeParticles', rnd(c.rng, 200, 500), { c: pick(c.rng, ['C', 'V', 'G']) });
    if (c.rng() < 0.4) t = S.play('pause', t + 100);
    return t + rnd(c.rng, 400, 800);
  },
});
