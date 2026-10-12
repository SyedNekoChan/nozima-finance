import { defineActivity } from '../../core/activity.js';
import { clampPoint } from '../../core/choreo.js';
import { int, lerp, pick, rnd } from '../../core/rng.js';
import { PAW, W, anySide, maybeTransition } from './util.js';

/*
 * Eating: a small bowl (the `bowl` world prop) appears a few steps away.
 * The cat notices it, approaches, sniffs, sometimes hesitates or prods the
 * rim, then eats in several short phases (head down, chewing, the food
 * level dropping) with pauses to look around, licks its mouth and leaves;
 * the bowl fades once it has gone. Length and interludes vary per run;
 * the stage removes the bowl on completion or interruption.
 */

const BOWL = 'bowl';
const AT = { dy: 21, dz: 6 }; // the bowl in front of the paws, from the sprite centre

export const eat = defineActivity({
  id: 'eat',
  performance: true,
  rarity: 'rare',
  weights: W(2.5, 2),
  cooldown: 240000,
  duration: [14000, 32000],
  moves: true,
  followOn: { groom: 6, stretch: 2, tired: 2, sleep: 1.5 },
  plan(c, S, st) {
    const A = st.A;
    const food = st.variant('food', { kibble: 3, fish: 2, cream: 1.5 });
    S.at(0, { pose: 'sit', legs: 0, eyes: 'open', mouth: 'idle' });
    let t = rnd(c.rng, 400, 1000);

    // the bowl appears a few steps away, with a little glint
    const cell = (A.px() * c.pet.sprite.width) / 12;
    const a = rnd(c.rng, 0, Math.PI * 2);
    const d = rnd(c.rng, 5, 9) * cell;
    const spot = clampPoint(
      c,
      { sx: A.pos.sx + Math.cos(a) * d, sy: A.pos.sy + AT.dy * A.px() + Math.sin(a) * d * 0.4, z: A.pos.z + rnd(c.rng, -70, 60) },
      16
    );
    st.prop(t, BOWL, { kind: 'bowl', ...spot, fill: 3, food, seed: int(c.rng, 0, 99), fade: 0, glint: true });
    st.prop(t + 40, BOWL, { fade: 1 });
    st.prop(t + 1100, BOWL, { glint: false });

    // noticed: ears up, a look, a sniff of the air
    t += rnd(c.rng, 300, 600);
    A.look(t, spot, { eyes: 'wide', ears: 'perk' });
    t += rnd(c.rng, 800, 1400);
    S.at(t, { eyes: 'open', ears: null, gaze: 'u', focus: null });
    for (let i = int(c.rng, 1, 2); i > 0; i--) {
      S.at((t += 200), { droop: 1 });
      S.at((t += 180), { droop: 0 });
    }
    if (c.rng() < 0.3) t = S.play('headTilt', t + 200, { side: anySide(c) });

    // approach
    t = A.walk(t + rnd(c.rng, 200, 600), A.standFor(spot, 0, AT.dy, AT.dz), {
      stepMs: rnd(c.rng, 420, 540),
      endPose: 'stand',
    });

    // inspect: head down to sniff, perhaps hesitate and prod the rim
    S.at(t, { pose: 'low', eyes: 'down', ears: 'perk', focus: null });
    for (let i = int(c.rng, 2, 4); i > 0; i--) {
      S.at((t += rnd(c.rng, 180, 260)), { droop: 1 });
      S.at((t += rnd(c.rng, 160, 240)), { droop: 0 });
    }
    if (c.rng() < 0.45) {
      // a hesitation: up again, a look at the bowl, a careful paw
      S.at((t += 300), { pose: 'stand', eyes: 'open', ears: null });
      t += rnd(c.rng, 500, 1100);
      const s = anySide(c);
      S.at(t, { pose: 'crouch', [PAW[s]]: 'low', eyes: 'down' });
      S.at((t += rnd(c.rng, 250, 400)), { [PAW[s]]: null });
      t += rnd(c.rng, 300, 600);
    }

    // settles to eat: crouched (the head goes down from there) or seated
    const seated = c.rng() < 0.35;
    S.at((t += 250), { pose: seated ? 'sit' : 'crouch', eyes: 'open', ears: null });
    t += rnd(c.rng, 300, 600);

    // eats in short phases; the food goes down; it looks up in between
    const phases = int(c.rng, 2, 4);
    for (let p = 0; p < phases; p++) {
      S.at(t, { pose: 'low', eyes: c.rng() < 0.5 ? 'closed' : 'down' });
      const bites = int(c.rng, 4, 9);
      for (let i = 0; i < bites; i++) {
        S.at((t += rnd(c.rng, 170, 280)), { mouth: 'chew', droop: i % 2 });
        S.at((t += rnd(c.rng, 150, 240)), { mouth: 'idle', droop: 0 });
        if (c.rng() < 0.12) t += rnd(c.rng, 200, 500);
      }
      st.prop(t, BOWL, { fill: Math.max(0, Math.round(lerp(3, 0, (p + 1) / phases))) });

      if (p < phases - 1) {
        // a pause: up, a look around, maybe a lick of the lips or an ear flick
        S.at((t += 200), { pose: seated ? 'sit' : 'crouch', eyes: 'open' });
        const look = pick(c.rng, ['survey', 'lick', 'ear', 'still']);
        if (look === 'survey') t = S.play('survey', t + 150);
        else if (look === 'lick') {
          for (let i = 0; i < 2; i++) {
            S.at((t += 200), { mouth: 'lick' });
            S.at((t += 180), { mouth: 'idle' });
          }
        } else if (look === 'ear') t = S.play('earFlick', t + 150);
        else t += rnd(c.rng, 600, 1400);
        t += rnd(c.rng, 200, 500);
      }
    }

    // done: licks its mouth, a contented moment
    S.at((t += 250), { pose: 'sit', eyes: 'open', mouth: 'idle', droop: 0 });
    for (let i = int(c.rng, 2, 4); i > 0; i--) {
      S.at((t += rnd(c.rng, 180, 260)), { mouth: 'lick' });
      S.at((t += rnd(c.rng, 150, 220)), { mouth: 'idle' });
    }
    t = maybeTransition(S, c, t + 200, { chance: 0.45, pool: { satisfied: 3, lickPaw: 2, yawn: 1 } });

    // and wanders off; the bowl fades once it has gone a few steps
    const away = A.world(rnd(c.rng, -1, 1) < 0 ? -rnd(c.rng, 14, 24) : rnd(c.rng, 14, 24), rnd(c.rng, -10, 4), rnd(c.rng, -40, 40));
    const t1 = A.walk(t + 200, away, { stepMs: rnd(c.rng, 440, 540) });
    st.prop(t + 1200, BOWL, { fade: 0, fadeMs: 900 });
    return Math.max(t1, t + 2200) + rnd(c.rng, 300, 700);
  },
});
