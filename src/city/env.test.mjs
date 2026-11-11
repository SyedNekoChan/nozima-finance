import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKY, WEATHER, createEnvironment } from './env.js';

const STEP = 250; // ms per update (the city updates every 84 ms; the weather moves slowly)

// run an environment for `hours`, calling fn(t, env) after each update
function run(seed, hours, fn) {
  const e = createEnvironment({ seed });
  for (let t = STEP; t <= hours * 3600000; t += STEP) fn(t, e.update(t), e);
  return e;
}

test('it starts clear and damp, as the approved city', () => {
  const e = createEnvironment({ seed: 1 });
  const env = e.update(0);
  assert.equal(env.weather, 'clear');
  assert.equal(env.rain, 0);
  assert.equal(env.wet, WEATHER.wet.start);
  assert.equal(env.flash, 0);
  assert.equal(env.moon, 0);
  assert.equal(env.star, null);
});

test('rain never settles in: clear, dry spells come round regularly and take most of the time', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    let clearMs = 0;
    let longestWet = 0;
    let wetSince = null;
    const states = new Set();
    let dry = 0; // surfaces fully dry
    run(seed, 12, (t, env) => {
      states.add(env.weather);
      if (env.rain === 0) {
        clearMs += STEP;
        if (wetSince !== null) longestWet = Math.max(longestWet, t - wetSince);
        wetSince = null;
      } else if (wetSince === null) wetSince = t;
      if (env.wet === 0) dry += STEP;
    });
    assert.deepEqual([...states].sort(), ['clear', 'drizzle', 'heavy', 'rain'], `seed ${seed}: not every state came`);
    const share = clearMs / (12 * 3600000);
    assert.ok(share > 0.35 && share < 0.85, `seed ${seed}: dry ${(share * 100).toFixed(0)}% of the time`);
    // no rainy spell goes on for hours
    assert.ok(longestWet < WEATHER.spellMs + 8 * 60000, `seed ${seed}: rained for ${(longestWet / 60000).toFixed(0)} min on end`);
    assert.ok(dry > 0, `seed ${seed}: the city never dried out`);
  }
});

test('the weather changes one step at a time and eases between states', () => {
  const order = WEATHER.states;
  run(7, 8, (t, env, e) => {
    const log = e.log().filter((x) => x.kind === 'weather');
    for (let i = 1; i < log.length; i++) assert.equal(Math.abs(order.indexOf(log[i].state) - order.indexOf(log[i - 1].state)), 1);
  });
  // easing: the rain never jumps
  let prev = 0;
  run(8, 6, (t, env) => {
    assert.ok(Math.abs(env.rain - prev) <= STEP / WEATHER.easeMs + 1e-9, 'the rain jumped');
    prev = env.rain;
  });
});

test('surfaces soak in the rain and dry slowly after it', () => {
  const e = createEnvironment({ seed: 3 });
  e.force('drizzle', 0);
  let t = 0;
  for (; t < 120000; t += STEP) e.update(t);
  e.force('rain', t);
  for (const end = t + 180000; t < end; t += STEP) e.update(t);
  const soaked = e.env.wet;
  assert.ok(soaked > 0.95, `wet ${soaked}`);
  e.force('drizzle', t);
  for (const end = t + 60000; t < end; t += STEP) e.update(t);
  e.force('clear', t);
  // it stops raining over a few seconds of easing, then dries over minutes, never at once
  for (const end = t + 30000; t < end; t += STEP) e.update(t);
  const afterRain = e.env.wet;
  assert.ok(afterRain > 0.8, `dried too fast: ${afterRain}`);
  let prev = afterRain;
  let dryAt = null;
  for (const end = t + 600000; t < end; t += STEP) {
    const env = e.update(t);
    if (env.weather !== 'clear') break; // the next spell came
    assert.ok(env.wet <= prev + 1e-9, 'got wetter in clear weather');
    assert.ok(prev - env.wet <= STEP / WEATHER.wet.dryMs + 1e-9, 'dried in a jump');
    prev = env.wet;
    if (dryAt === null && env.wet === 0) dryAt = t;
  }
  assert.ok(dryAt !== null, 'never dried');
});

test('lightning belongs to the storms: never in light rain or clear weather, never a strobe', () => {
  for (const seed of [11, 12, 13]) {
    let flashes = 0;
    let lastStrike = -Infinity;
    run(seed, 12, (t, env, e) => {
      const log = e.log();
      const last = log[log.length - 1];
      if (last && last.kind === 'lightning' && last.t === t) {
        assert.ok(env.rain >= WEATHER.lightning.minRain, `lightning at rain ${env.rain}`);
        assert.ok(t - lastStrike >= WEATHER.lightning.heavyMs[0] - 1, 'strikes too close together');
        lastStrike = t;
        flashes++;
      }
      if (env.rain < WEATHER.lightning.minRain && t - lastStrike > 2000) assert.equal(env.flash, 0);
      assert.ok(env.flash <= 1);
    });
    assert.ok(flashes > 0, `seed ${seed}: no storm in 12 hours`);
  }
  // a flash is over in well under a second
  const e = createEnvironment({ seed: 1 });
  e.update(1000);
  e.trigger('lightning', 1000);
  assert.ok(e.update(1000).flash > 0.5);
  assert.equal(e.update(2200).flash, 0);
});

test('shooting stars and the moon come rarely, only under a clear sky, one at a time', () => {
  for (const seed of [21, 22, 23]) {
    let stars = 0;
    let moons = 0;
    run(seed, 12, (t, env, e) => {
      const log = e.log();
      const last = log[log.length - 1];
      if (last && last.t === t && (last.kind === 'star' || last.kind === 'moon')) {
        assert.ok(env.rain < 0.02, `${last.kind} under rain ${env.rain}`);
        if (last.kind === 'star') stars++;
        else moons++;
      }
      if (env.star) assert.ok(env.moon === 0 || e.log().some((x) => x.kind === 'moon' && x.t < env.star.t0), 'two sky moments started together');
      if (env.star) assert.ok(t - env.star.t0 <= SKY.starLifeMs[1], 'a star that lasts');
    });
    // a few an hour at most
    assert.ok(stars >= 3 && stars <= 12 * 3600000 / SKY.starMs[0], `seed ${seed}: ${stars} shooting stars in 12 h`);
    assert.ok(moons >= 2 && moons <= 12 * 3600000 / SKY.moonMs[0], `seed ${seed}: ${moons} moon breaks in 12 h`);
  }
});

test('no sky moment starts while the city has an event of its own', () => {
  const e = createEnvironment({ seed: 5 });
  for (let t = STEP; t < 6 * 3600000; t += STEP) {
    e.update(t, true);
    assert.equal(e.env.star, null);
    assert.equal(e.env.moon, 0);
  }
});

test('the same seed gives the same weather', () => {
  const a = [];
  const b = [];
  run(4, 3, (t, env) => a.push(env.rain, env.wet, env.flash));
  run(4, 3, (t, env) => b.push(env.rain, env.wet, env.flash));
  assert.deepEqual(a, b);
});
