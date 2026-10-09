import { defineEncounter, gazeToward } from '../../core/encounter.js';
import { createRng, int, pick, rnd } from '../../core/rng.js';
import { travel } from '../../core/toolkit.js';
import { SCHEDULER } from '../../config.js';
import { ENCOUNTERS } from '../config.js';

/*
 * NOMOZ.EXE's rare environmental encounters. Each is one registered
 * behavior built by defineEncounter(): the shared scaffolding spawns the
 * prop, has the cat notice it, hesitate and approach; these modules supply
 * the investigation (`examine`) and the way out (`depart`).
 *
 * Neither reads or shows application data, and neither is connected to the
 * financial state or events. The pet's appearance stays whatever the
 * financial state says; only gaze, lean and position change.
 */

// Re-roll the prop's displacement at irregular steps (the encounter's own timeline).
function ticks(S, rng, id, from, to, every, start = 1) {
  let n = start;
  for (let u = from; u < to; u += rnd(rng, ...every)) S.prop(u, id, { phase: n++ });
  return n;
}

/* ------------------------------------------------------------------ */
/* Rare encounter: miniature terminal                                  */
/* ------------------------------------------------------------------ */

const TERM = ENCOUNTERS.terminal;

export const miniTerminal = defineEncounter({
  ...TERM,

  // a decorative glyph from the configured set, picked per encounter
  appear: (c) => ({ glyph: pick(c.rng, TERM.glyphs), lit: 0 }),

  examine(S, c, run, t0) {
    let t = t0;
    const id = run.id;
    const toward = run.facing;

    // studies the dark screen
    S.at(t, { eyes: 'wide', gaze: run.gaze });
    S.at((t += rnd(c.rng, 700, 1100)), { eyes: 'open' });
    t += rnd(c.rng, ...TERM.screen.wake);

    // the screen wakes with a cursor, and the cat leans in a little
    S.prop(t, id, { lit: 1 });
    S.at(t, { eyes: 'wide', lean: toward });
    S.at(t + 350, { lean: 0 });
    t += rnd(c.rng, ...TERM.screen.wake);

    // exactly one decorative character appears
    S.prop(t, id, { lit: 2 });
    S.at(t, { eyes: 'wide', gaze: run.gaze });
    S.at(t + 500, { eyes: 'open' });
    const shown = rnd(c.rng, ...TERM.screen.visible);

    // it watches the character, then a subtle change of gaze
    S.blink(t + shown * 0.45);
    S.at(t + shown * 0.7, { gaze: 'u' });
    S.at(t + shown * 0.9, { gaze: run.gaze });
    t += shown;

    // the terminal falls quiet again
    S.prop(t, id, { lit: 0 });
    t += rnd(c.rng, ...TERM.screen.afterglow);
    return t;
  },

  depart(S, c, run, t) {
    // turns away, and the terminal fades once the cat has gone a couple of steps
    const dest = run.away(rnd(c.rng, 4, 7));
    S.at(t, { gaze: gazeToward(run.stop, dest), eyes: 'open' });
    const end = travel(S, c, run.stop, dest, t + 200, SCHEDULER.stepMs);
    S.prop(t + 200 + SCHEDULER.stepMs * 2, run.id, { fade: 0 });
    S.prop(t + 200 + SCHEDULER.stepMs * 2 + 1200, run.id, null);
    return Math.max(end, t + 200 + SCHEDULER.stepMs * 2 + 1300);
  },
});

/* ------------------------------------------------------------------ */
/* Rare encounter: mysterious depth anomaly                            */
/* ------------------------------------------------------------------ */

const DIS = ENCOUNTERS.distortion;

export const depthAnomaly = defineEncounter({
  ...DIS,

  // a different tear each time; it takes shape over a moment
  appear: (c) => ({ seed: int(c.rng, 1, 9999), phase: 0, coherence: 0.25, near: 0, intensity: 0 }),

  examine(S, c, run, t0) {
    const id = run.id;
    let t = t0;

    // it takes shape as it fades in
    [0.45, 0.7, 0.9, 1].forEach((v, i) => S.prop(run.tSpawn + 150 + i * 250, id, { coherence: v }));

    // it reacts to the cat's proximity
    S.prop(t, id, { near: 0.6 });
    const study = rnd(c.rng, ...DIS.inspect);
    ticks(S, c.rng, id, t, t + study, [380, 620]);

    // inspects: gaze wanders over it; once, the cat adjusts its position
    const looks = [run.gaze, 'u', run.gaze, 'c', run.gaze];
    let u = t + 500;
    for (const g of looks) {
      if (u > t + study - 600) break;
      S.at(u, { gaze: g });
      if (c.rng() < 0.3) S.blink(u + 500);
      u += rnd(c.rng, 900, 1700);
    }

    const end = t + study;
    if (c.rng() < 0.65 && !c.reduced) {
      const closer = c.geo.clamp({
        sx: run.stop.sx + (run.spawn.sx - run.stop.sx) * 0.18,
        sy: run.stop.sy + (run.spawn.sy - run.stop.sy) * 0.12,
        z: run.stop.z,
      });
      const tn = t + study * 0.5;
      travel(S, c, run.stop, closer, tn, SCHEDULER.stepMs, 3);
      S.at(tn + SCHEDULER.stepMs * 3, { facing: run.facing, gaze: run.gaze });
      run.stop = closer;
      S.prop(tn, id, { near: 1 });
    }
    t = end;

    // it shifts and intensifies; the cat flinches back a little
    S.prop(t, id, { intensity: 2, near: 1 });
    ticks(S, c.rng, id, t, t + rnd(c.rng, ...DIS.intensify.hold), [110, 170], 100);
    S.at(t, { eyes: 'wide', lean: -run.facing, gaze: run.gaze });
    S.at(t + 450, { lean: 0 });
    return t + rnd(c.rng, 700, 1000);
  },

  depart(S, c, run, t) {
    const id = run.id;
    // it cautiously retreats while the distortion loses coherence and goes
    const dest = run.away(rnd(c.rng, ...DIS.intensify.retreatCells));
    S.at(t, { gaze: gazeToward(run.stop, dest), eyes: 'open' });
    const end = travel(S, c, run.stop, dest, t + 150, 440);

    [0.75, 0.5, 0.3, 0.12].forEach((v, i) =>
      S.prop(t + 250 + i * 330, id, { coherence: v, intensity: Math.max(0, 1.4 - i * 0.5), near: 0.4 })
    );
    S.prop(t + 250 + 4 * 330, id, { fade: 0, coherence: 0 });
    const gone = t + 250 + 4 * 330 + 900;
    S.prop(gone, id, null);

    // it remains where it naturally reached: a pause, one glance back, on with the day
    const rest = Math.max(end, gone) + rnd(c.rng, 500, 900);
    S.at(rest, { gaze: gazeToward(dest, run.spawn) });
    S.blink(rest + 900);
    S.at(rest + 1700, { gaze: 'c' });
    return rest + 2000;
  },
});
