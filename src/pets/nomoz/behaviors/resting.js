import { defineBehavior } from '../../core/behaviors.js';
import { int, pick, rnd } from '../../core/rng.js';
import { W, weighted } from './util.js';

/* Resting behaviors. */

/*
 * J. Falling asleep. It settles gradually in one of three ways: nodding
 * off where it sits (the original), lying down sphinx-like, or curling up
 * with its head on its paws; sometimes it first turns about and kneads.
 * Asleep it breathes with `z` cues and now and then stirs, flicks an ear,
 * swishes its tail, half-wakes, shifts position, or dreams (tiny symbols,
 * rarely a faint magical shimmer). It wakes naturally, often with a yawn
 * and a stretch.
 */
const DREAMS = ['fish', 'moon', 'star', 'yarn', 'coin', 'mouse'];

export const sleep = defineBehavior({
  id: 'sleep',
  rarity: 'rare',
  weights: W(4),
  cooldown: 90000,
  duration: [9000, 24000],
  followOn: { stretch: 5, groom: 2, yawn: 1.5 },
  plan(c, S) {
    const style = weighted(c.rng, { sit: 1, loaf: 1.3, curl: 1.6 });
    let t;
    let facing = c.cur.facing || 1;

    if (style === 'sit') {
      t = S.play('dropOff', 0);
    } else {
      S.at(0, { pose: 'sit', legs: 0, gaze: 'c', mouth: 'rest', eyes: 'open' });
      t = rnd(c.rng, 300, 700);
      // turns about on the spot before lying down
      if (!c.reduced && c.rng() < 0.5) {
        for (let i = int(c.rng, 1, 2); i > 0; i--) {
          facing = -facing;
          S.at(t, { pose: 'stand', facing, legs: 1 });
          S.at(t + 250, { legs: 2 });
          S.at(t + 500, { legs: 0 });
          t += rnd(c.rng, 650, 900);
        }
        S.at(t, { pose: 'sit' });
        t += 200;
      }
      if (c.rng() < 0.6) t = S.play('knead', t);
      if (c.rng() < 0.5) t = S.play('yawn', t);
      // settles down gradually
      S.at(t, { pose: 'crouch', eyes: 'down', legs: 0 });
      S.at((t += 350), { pose: 'loaf', eyes: 'down' });
      t += rnd(c.rng, 900, 1600);
      S.at(t, { eyes: 'closed' });
      if (style === 'curl') {
        // curls up, head down onto its paws
        t += rnd(c.rng, 900, 1500);
        S.at(t, { pose: 'curl', eyes: 'closed', droop: 0 });
      }
      t += 600;
      S.at(t, { cue: 'z' });
    }

    const asleep = rnd(c.rng, ...this.duration);
    const end = t + asleep;
    for (let u = t + 1600, i = 0; u < end; u += 1600, i++) {
      S.at(u, { cue: i % 2 ? 'z' : 'zZ' });
    }

    // what happens while it sleeps
    let pose = style === 'sit' ? 'sit' : style;
    const dreamY = style === 'sit' ? 12 : style === 'loaf' ? 16 : 22;
    let u = t + rnd(c.rng, 2500, 4500);
    while (u < end - 3000) {
      const ev = weighted(c.rng, {
        stir: 3,
        ear: 3,
        tail: 2,
        turn: style === 'sit' ? 0 : 1.5,
        dream: 2,
        shimmer: 0.6,
        halfWake: 1,
      });
      if (ev === 'stir') {
        S.at(u, { droop: 1 });
        if (pose !== 'sit') S.at(u + 150, { pawL: 'low' });
        S.at(u + rnd(c.rng, 500, 800), { droop: 0, pawL: null });
        u += 900;
      } else if (ev === 'ear') {
        u = S.play('earFlick', u);
      } else if (ev === 'tail') {
        u = S.play('tailSwish', u);
      } else if (ev === 'turn') {
        // shifts position: lifts a little, turns over, settles again
        facing = -facing;
        S.at(u, { pose: 'loaf', droop: 0 });
        S.at(u + 400, { facing });
        pose = pose === 'curl' || c.rng() < 0.5 ? 'curl' : 'loaf';
        S.at(u + 900, { pose });
        u += 1300;
      } else if (ev === 'dream' || ev === 'shimmer') {
        // a few tiny dream symbols drift up and fade (or a faint shimmer)
        const n = int(c.rng, 2, 3);
        for (let i = 0; i < n; i++) {
          const k = `dream${i}`;
          const x = int(c.rng, 4, 16);
          const t0 = u + i * 450;
          const spec =
            ev === 'dream'
              ? { kind: 'dream', name: pick(c.rng, DREAMS), x, y: dreamY, a: 0.75 }
              : { kind: 'mote', c: pick(c.rng, ['V', 'C']), x: int(c.rng, 4, 51), y: int(c.rng, dreamY, 52), size: 1 };
          S.fx(t0, k, spec);
          S.fx(t0 + 450, k, ev === 'dream' ? { y: dreamY - 3, a: 0.6 } : { a: 0.5 });
          S.fx(t0 + 900, k, ev === 'dream' ? { y: dreamY - 6, a: 0.35 } : { a: 0.9 });
          S.fx(t0 + 1300, k, null);
        }
        u += n * 450 + 1000;
      } else {
        // half-wakes, eyes barely open, and drifts off again
        S.at(u, { eyes: 'down', cue: null });
        if (c.rng() < 0.4) S.play('earFlick', u + 200);
        S.at(u + rnd(c.rng, 700, 1200), { eyes: 'closed' });
        u += 1500;
      }
      u += rnd(c.rng, 1800, 4200);
    }

    // waking
    let w;
    if (style === 'sit') {
      w = S.play('wakeUp', end);
      S.at(w, { droop: 0, mouth: 'idle', pose: 'sit' });
    } else {
      S.at(end, { cue: null, eyes: 'blink' });
      S.at(end + 300, { eyes: 'down' });
      w = end + rnd(c.rng, 600, 1000);
      if (pose === 'curl') {
        S.at(w, { pose: 'loaf', eyes: 'open', droop: 0 });
        w += rnd(c.rng, 600, 1000);
      }
      if (c.rng() < 0.5) w = S.play('yawn', w);
      if (!c.reduced && c.rng() < 0.55) {
        S.at(w, { pose: 'crouch' });
        w = S.play('stretchOut', w + 250);
      } else {
        S.at(w, { pose: 'crouch', eyes: 'open' });
        S.at((w += 300), { pose: 'sit', mouth: 'idle' });
      }
    }
    S.clearFx(w);
    S.at(w, { mouth: 'idle', ears: null, tail: null, pawL: null, pawR: null, cue: null });
    return w + 1000;
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
