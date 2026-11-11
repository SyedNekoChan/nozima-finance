/*
 * City mode's weather and sky: what the air is doing, for the atmosphere
 * (atmos.js) and the rain layer (rain.js) to show. Pure: no drawing, no
 * timers; update(t) advances it to animation time t.
 *
 * Weather moves between four states, clear, light drizzle, rain and heavy
 * rain, one step at a time (clear never jumps to a storm), and each change
 * eases in over most of a minute. Clear spells are the longest, so dry
 * weather comes round regularly; rain never settles in (a wet spell that has
 * gone on for 18 minutes only clears from then on). Surfaces soak while
 * it rains and dry slowly once it stops. Lightning belongs to the storms: it
 * only comes when the rain is heavy enough.
 *
 * The sky's rare moments, only under a clear sky: a shooting star now and
 * then (where the sky is in view), and the moon breaking through for half a
 * minute or so, its light a little stronger. One at a time, and never while
 * the city has a rare event of its own (update's `quiet`).
 *
 * It starts clear and still damp: the approved "just after the rain" city.
 */

export const WEATHER = {
  states: ['clear', 'drizzle', 'rain', 'heavy'],
  level: { clear: 0, drizzle: 0.25, rain: 0.6, heavy: 1 }, // how hard it rains
  stayMs: {
    clear: [300000, 720000],
    drizzle: [60000, 150000],
    rain: [70000, 170000],
    heavy: [45000, 110000],
  },
  // where each state goes next (with weights): one step at a time
  next: {
    clear: [['drizzle', 1]],
    drizzle: [
      ['clear', 0.5],
      ['rain', 0.5],
    ],
    rain: [
      ['drizzle', 0.55],
      ['heavy', 0.45],
    ],
    heavy: [['rain', 1]],
  },
  spellMs: 18 * 60000, // a wet spell this long only ever turns drier from here on
  firstMs: [150000, 330000], // the first clear spell
  easeMs: 45000, // rain eases from nothing to its heaviest over this long
  wet: { start: 0.55, soakMs: 45000, dryMs: 300000 },
  // lightning: only when it rains at least this hard; between flashes, at the heaviest and at that threshold
  lightning: { minRain: 0.5, heavyMs: [14000, 42000], lightMs: [50000, 140000], decayMs: 150 },
};

export const SKY = {
  starMs: [200000, 520000], // between shooting stars (clear sky only)
  starLifeMs: [650, 1100],
  moonMs: [260000, 620000], // between the moon breaking through (clear sky only)
  moonRiseMs: 9000,
  moonHoldMs: [20000, 45000],
  moonFallMs: 12000,
};

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createEnvironment({ seed = 1 } = {}) {
  const random = rng(seed);
  const between = ([lo, hi]) => lo + (hi - lo) * random();
  const W = WEATHER;

  // what update() returns (the same object every time)
  const env = {
    weather: 'clear', // the state it is in (or heading for)
    rain: 0, // how hard it rains now, 0..1, easing toward the state's level
    wet: W.wet.start, // how wet the surfaces are, 0..1
    flash: 0, // lightning now, 0..1
    flashX: 0.5, // where along the horizon (0..1 across)
    flashId: 0, // counts flashes (a new one starts a new bolt)
    moon: 0, // the moon's extra light, 0..1
    star: null, // a shooting star in flight: { id, t0, life, seed }
  };

  let nextWeatherAt = between(W.firstMs);
  let nextFlashAt = Infinity;
  let pulses = []; // [start ms, strength] of the current flash
  let nextStarAt = between(SKY.starMs);
  let nextMoonAt = between(SKY.moonMs);
  let moon = null; // { t0, hold }
  let wetSince = null; // when the current wet spell began
  let starId = 0;
  let last = 0;
  const log = [];

  function step(to, t) {
    env.weather = to;
    nextWeatherAt = t + between(W.stayMs[to]);
    log.push({ t, kind: 'weather', state: to });
  }

  function pick(options) {
    let r = random() * options.reduce((s, o) => s + o[1], 0);
    for (const [name, w] of options) {
      r -= w;
      if (r <= 0) return name;
    }
    return options[options.length - 1][0];
  }

  function flashGap() {
    // heavier rain, closer storm: flashes come more often
    const k = Math.min(1, Math.max(0, (env.rain - W.lightning.minRain) / (1 - W.lightning.minRain)));
    const lo = W.lightning.lightMs[0] + (W.lightning.heavyMs[0] - W.lightning.lightMs[0]) * k;
    const hi = W.lightning.lightMs[1] + (W.lightning.heavyMs[1] - W.lightning.lightMs[1]) * k;
    return between([lo, hi]);
  }

  function strike(t) {
    // one flash, sometimes with a second, fainter flicker a moment later: never a strobe
    pulses = [[t, 0.75 + 0.25 * random()]];
    if (random() < 0.55) pulses.push([t + 140 + random() * 120, 0.35 + 0.3 * random()]);
    env.flashX = 0.15 + 0.7 * random();
    env.flashId++;
    log.push({ t, kind: 'lightning' });
  }

  function startStar(t) {
    env.star = { id: ++starId, t0: t, life: between(SKY.starLifeMs), seed: Math.floor(random() * 1e9) };
    log.push({ t, kind: 'star' });
  }

  function startMoon(t) {
    moon = { t0: t, hold: between(SKY.moonHoldMs) };
    log.push({ t, kind: 'moon' });
  }

  return {
    env,
    /* Advance to animation time t (ms). quiet: something else is happening (a city event), so no sky moment starts now. */
    update(t, quiet = false) {
      const dt = Math.max(0, Math.min(2000, t - last));
      last = t;

      // the weather's next step (a long wet spell only clears from here on)
      if (t >= nextWeatherAt) {
        const order = W.states;
        const drier = order[Math.max(0, order.indexOf(env.weather) - 1)];
        step(wetSince !== null && t - wetSince > W.spellMs ? drier : pick(W.next[env.weather]), t);
      }
      if (env.weather === 'clear') wetSince = null;
      else if (wetSince === null) wetSince = t;
      // rain eases toward its state's level
      const target = W.level[env.weather];
      const d = dt / W.easeMs;
      env.rain = env.rain < target ? Math.min(target, env.rain + d) : Math.max(target, env.rain - d);
      // surfaces soak while it rains and dry slowly after
      if (env.rain > 0.05) env.wet = Math.min(1, env.wet + (dt / W.wet.soakMs) * env.rain);
      else env.wet = Math.max(0, env.wet - dt / W.wet.dryMs);

      // lightning, in storms only
      if (env.rain >= W.lightning.minRain) {
        if (nextFlashAt === Infinity) nextFlashAt = t + flashGap();
        if (t >= nextFlashAt) {
          strike(t);
          nextFlashAt = t + flashGap();
        }
      } else nextFlashAt = Infinity;
      let f = 0;
      for (const [p, s] of pulses) if (t >= p) f = Math.max(f, s * Math.exp(-(t - p) / W.lightning.decayMs));
      env.flash = f > 0.01 ? f : 0;

      // the clear sky's moments
      const clear = env.rain < 0.02;
      if (env.star && t > env.star.t0 + env.star.life) env.star = null;
      if (t >= nextStarAt) {
        if (clear && !env.star && !quiet && !moon) startStar(t);
        nextStarAt = t + between(SKY.starMs);
      }
      if (moon) {
        const u = t - moon.t0;
        const fall = u - SKY.moonRiseMs - moon.hold;
        env.moon = u < SKY.moonRiseMs ? u / SKY.moonRiseMs : fall < 0 ? 1 : Math.max(0, 1 - fall / SKY.moonFallMs);
        // clouds coming over put it away sooner
        if (!clear) env.moon = Math.max(0, env.moon - dt / 4000);
        if (fall > SKY.moonFallMs || (!clear && env.moon === 0)) moon = null;
      } else env.moon = 0;
      if (t >= nextMoonAt) {
        if (clear && !moon && !quiet && !env.star) startMoon(t);
        nextMoonAt = t + between(SKY.moonMs);
      }
      return env;
    },
    /* Tests and tools: go to a weather state now (easing as usual), or make a sky moment happen. */
    force(state, t = last) {
      if (!W.level.hasOwnProperty(state)) throw new Error(`no weather state ${state}`);
      step(state, t);
    },
    trigger(kind, t = last) {
      if (kind === 'lightning') strike(t);
      else if (kind === 'star') startStar(t);
      else if (kind === 'moon') startMoon(t);
      else throw new Error(`no sky event ${kind}`);
    },
    log: () => log,
  };
}
