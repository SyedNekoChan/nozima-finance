import { defineActivity } from '../../core/activity.js';
import { clampPoint } from '../../core/choreo.js';
import { int, pick, rnd } from '../../core/rng.js';
import { LEAN, PAW, SIGN, W, anySide, maybeTransition, other } from './util.js';

/*
 * Terminal use: the cat conjures its own miniature terminal (the
 * `terminal` world prop, the same object as the rare encounter) beside it
 * and works at it: inspects it, types in bursts, waits while it
 * processes, studies the output, corrects a mistake, runs the task and
 * reacts. The screen only ever shows abstract pixel bars, a spinner, a
 * progress bar and a check or a mark: a pet prop, never application UI or
 * data.
 */

const TERM = 'term';

export const terminalWork = defineActivity({
  id: 'terminalWork',
  performance: true,
  rarity: 'veryRare',
  weights: W(1.5, 1.2),
  cooldown: 300000,
  duration: [14000, 32000],
  moves: true,
  followOn: { ponder: 2, stretch: 2, pawCheck: 2, sit: 2 },
  plan(c, S, st) {
    const A = st.A;
    const s = anySide(c); // the terminal stands on this side
    const near = PAW[s];
    const far = PAW[other(s)];
    const seed = int(c.rng, 1, 9999);
    let ph = 0;
    S.at(0, { pose: 'sit', legs: 0, eyes: 'open', mouth: 'idle' });
    let t = rnd(c.rng, 300, 700);

    // conjured a little way off, then approached and looked over
    t = S.play('conjure', t, { side: s, c: 'C' });
    S.at(t, { [near]: null, pupils: null });
    const spot = clampPoint(c, A.world(SIGN[s] * 30, 14, -8), 24);
    st.prop(t, TERM, { kind: 'terminal', ...spot, lit: 0, fade: 0 });
    st.prop(t + 40, TERM, { fade: 1 });
    t += 600;
    A.look(t, spot, { ears: 'perk' });
    t += rnd(c.rng, 500, 900);
    t = A.walk(t, A.standFor(spot, SIGN[s] * 21, 14, -8), { stepMs: rnd(c.rng, 480, 560) });
    A.look(t, spot, { lean: LEAN[s], eyes: 'open' });
    S.at((t += rnd(c.rng, 500, 900)), { lean: 0 });
    if (c.rng() < 0.4) t = S.play('headTilt', t, { side: s });

    // it wakes with a cursor; a session begins
    S.at(t, { [near]: 'out' });
    S.at(t + 160, { [near]: null });
    st.prop(t + 160, TERM, { lit: 1 });
    S.at(t + 200, { eyes: 'wide' });
    t += rnd(c.rng, 700, 1100);
    st.prop(t, TERM, { lit: 3, seed, lines: 0, typing: 0, mode: null, progress: null });
    S.at(t, { eyes: 'down', pupils: 0, gaze: s });
    t += 300;

    // typing: the near paw on the keys, the other now and then
    let lines = 0;
    let typed = 0;
    const type = (n, fast = false) => {
      for (let i = 0; i < n; i++) {
        const lv = i % 2 ? 'out' : 'low';
        S.at(t, { [near]: lv, [far]: !fast && c.rng() < 0.2 ? 'low' : null });
        typed += 1;
        if (typed > 13) {
          lines = Math.min(4, lines + 1);
          typed = 0;
        }
        st.prop(t, TERM, { typing: typed, lines, key: int(c.rng, 0, 7) });
        if (fast && i % 3 === 0) {
          S.fx(t, `k${i % 2}`, { kind: 'mote', x: s === 'l' ? int(c.rng, 6, 12) : int(c.rng, 43, 49), y: int(c.rng, 42, 48), c: 'C' });
          S.fx(t + 120, `k${i % 2}`, null);
        }
        t += fast ? rnd(c.rng, 60, 100) : rnd(c.rng, 130, 240);
      }
      S.at(t, { [near]: null, [far]: null });
      st.prop(t, TERM, { key: null });
      t += 100;
    };
    const busy = (ms) => {
      st.prop(t, TERM, { mode: 'busy' });
      for (let u = 0; u < ms; u += 180) st.prop(t + u, TERM, { phase: ph++ });
      t += ms;
      st.prop(t, TERM, { mode: null });
    };

    const bursts = int(c.rng, 2, 4);
    for (let b = 0; b < bursts; b++) {
      const fast = c.rng() < 0.2;
      if (fast) S.at(t, { eyes: 'wide', ears: 'back', tail: 'swish' });
      type(int(c.rng, 5, 12), fast);
      if (fast) S.at(t, { ears: null, tail: null, eyes: 'down' });

      // waits while it processes
      const wait = pick(c.rng, ['tap', 'tilt', 'watch']);
      const ms = rnd(c.rng, 700, 1500);
      const t0 = t;
      busy(ms);
      if (wait === 'tap') S.play('pawTap', t0 + 100, { side: other(s), taps: int(c.rng, 2, 4) });
      else if (wait === 'tilt') S.play('headTilt', t0 + 200, { side: s });
      else S.blink(t0 + ms * 0.5, 'down');

      // the output: studied with a lean
      lines = Math.min(4, lines + 1);
      typed = 0;
      st.prop(t, TERM, { lines, typing: null });
      S.at(t, { lean: LEAN[s], eyes: 'down', pupils: 0 });
      t += rnd(c.rng, 700, 1400);
      S.at(t, { lean: 0 });

      // an apparent mistake, corrected
      if (c.rng() < 0.35) {
        st.prop(t, TERM, { mode: 'err' });
        S.at(t, { ears: 'flickR', eyes: 'wide' });
        t += rnd(c.rng, 500, 900);
        st.prop(t, TERM, { mode: null });
        S.at(t, { ears: null, eyes: 'down', mouth: 'think' });
        for (let k = int(c.rng, 3, 6); k > 0; k--) {
          S.at(t, { [near]: k % 2 ? 'out' : null });
          st.prop(t, TERM, { typing: k + 2 });
          t += 90;
        }
        S.at(t, { mouth: 'idle' });
        type(int(c.rng, 3, 6));
      }
      if (lines >= 4) {
        st.prop(t, TERM, { lines: 0 }); // the screen scrolls clear
        lines = 0;
      }
      t += rnd(c.rng, 200, 500);
    }

    // runs it: a decisive tap, a progress bar, a result
    S.at(t, { [near]: 'up', eyes: 'open' });
    S.at((t += 250), { [near]: 'out' });
    S.at((t += 150), { [near]: null });
    st.prop(t, TERM, { typing: null, progress: 0, mode: 'busy' });
    const run = rnd(c.rng, 1200, 2000);
    for (let u = 0; u <= run; u += 160) st.prop(t + u, TERM, { progress: Math.min(1, u / run), phase: ph++ });
    S.at(t + run * 0.5, { eyes: 'down' });
    t += run;
    const ok = c.rng() < 0.75;
    st.prop(t, TERM, { mode: ok ? 'ok' : 'err', progress: null });

    // and reacts, subtly or, now and then, with a small triumph
    if (ok) {
      if (c.rng() < 0.3) t = S.play('triumph', t + 150, { side: other(s) });
      else {
        S.at(t, { eyes: 'happy' });
        t = S.play('nod', t + 300) + rnd(c.rng, 400, 800);
      }
    } else {
      t = S.play('headTilt', t + 150, { side: s, cue: '?' });
      S.at(t, { mouth: 'think' });
      type(int(c.rng, 4, 7));
      st.prop(t, TERM, { mode: 'busy' });
      busy(rnd(c.rng, 600, 1000));
      st.prop(t, TERM, { mode: 'ok' });
      S.at(t, { mouth: 'idle', eyes: 'happy' });
      t += rnd(c.rng, 700, 1100);
    }

    // the terminal powers down and goes
    st.prop(t, TERM, { lit: 0, mode: null });
    st.prop(t + 300, TERM, { fade: 0, fadeMs: 700 });
    S.at(t, { pupils: null, focus: null, gaze: 'c', eyes: 'open', lean: 0 });
    t += 900;
    return maybeTransition(S, c, t, { chance: 0.4, pool: { stretchOut: 2, inspectPaw: 2, yawn: 1 } }) + rnd(c.rng, 300, 700);
  },
});
