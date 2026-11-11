import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANIM, EVENTS, createCityAnimation } from './animate.js';
import { PARAPET_TILES } from './art.js';
import { CITY_PALETTE } from './palette.js';
import { createCityFrame, renderCity } from './render.js';

const bake = (w, h) => {
  const f = createCityFrame(w, h, { capture: true });
  f.renderRows(0, h);
  const rgba = f.finish();
  return { f, rgba };
};
const lum = (d) => {
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  return s / (d.length / 4) / 255;
};
// steady 12 fps updates, calling fn(t, rgba) after each
function drive(anim, until, fn) {
  for (let t = ANIM.minFrameMs; t <= until; t += ANIM.minFrameMs) {
    anim.update(t);
    fn?.(t, anim.rgba);
  }
}

const W = 160;
const H = 120;
const { f: frame, rgba: baked } = bake(W, H);

test('capturing for the animation leaves the still frame exactly as it was', () => {
  assert.deepEqual(baked, renderCity(W, H));
  assert.ok(frame.dynamic && frame.dynamic.F.length === W * H * 3);
});

test('it starts on the still frame', () => {
  const a = createCityAnimation(frame, baked, { seed: 1 });
  assert.equal(a.update(0), null);
  assert.equal(a.update(ANIM.minFrameMs), null);
  assert.deepEqual(a.rgba, baked);
});

test('only palette colours, the ledge never changes, and the same seed gives the same city', () => {
  const pal = new Set(CITY_PALETTE.map(([r, g, b]) => (r << 16) | (g << 8) | b));
  const ledgeFrom = (H - PARAPET_TILES[0].length) * W * 4;
  const a = createCityAnimation(frame, baked, { seed: 5 });
  const b = createCityAnimation(frame, baked, { seed: 5 });
  drive(a, 90000, (t, d) => {
    if (t % 10000 > ANIM.minFrameMs) return;
    for (let i = 0; i < d.length; i += 4) assert.ok(pal.has((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]));
    assert.deepEqual(d.subarray(ledgeFrom), baked.subarray(ledgeFrom));
  });
  drive(b, 90000);
  assert.deepEqual(a.rgba, b.rgba);
});

test('no flicker: a pixel never changes and changes back within two updates; brightness holds', () => {
  const a = createCityAnimation(frame, baked, { seed: 2 });
  const hist = [new Uint8ClampedArray(baked), new Uint8ClampedArray(baked)];
  const base = lum(baked);
  let blinks = 0;
  let changes = 0;
  drive(a, 120000, (t, d) => {
    const [p2, p1] = hist; // two and one updates ago
    for (let p = 0; p < W * H; p++) {
      const o = p * 4;
      const now = (d[o] << 16) | (d[o + 1] << 8) | d[o + 2];
      const one = (p1[o] << 16) | (p1[o + 1] << 8) | p1[o + 2];
      const two = (p2[o] << 16) | (p2[o + 1] << 8) | p2[o + 2];
      if (now !== one) changes++;
      if (now !== one && now === two) blinks++;
    }
    hist[0].set(p1);
    hist[1].set(d);
    if (t % 5000 < ANIM.minFrameMs) assert.ok(Math.abs(lum(d) - base) / base < 0.03, `brightness ${lum(d)} vs ${base}`);
  });
  // the beacons' fades are monotonic and the cars move on: almost nothing comes straight back
  assert.ok(blinks <= changes * 0.02, `${blinks} quick reversals out of ${changes} changes`);
  // light sources only: a small share of the frame changes per second
  assert.ok(changes / 120 / (W * H) < 0.01, `${((changes / 120 / (W * H)) * 100).toFixed(2)}% of the frame per second`);
});

test('beacons blink slowly, each on its own clock', () => {
  const a = createCityAnimation(frame, baked, { seed: 3 });
  assert.ok(frame.dynamic.beacons.length >= 2);
  const series = [];
  drive(a, 30000, (t) => {
    if (t > 6000) series.push(a.stats().beaconLevels.map((k) => (k > 0.55 ? 1 : 0)));
  });
  const n = series[0].length;
  for (let i = 0; i < n; i++) {
    const flips = series.filter((s, j) => j && s[i] !== series[j - 1][i]).length;
    assert.ok(flips >= 6 && flips <= 20, `beacon ${i}: ${flips} changes in 24 s`);
  }
  assert.ok(series.some((s) => s.some((v) => v !== s[0])), 'beacons in step');
});

test('rooms switch now and then, traffic is light, the lit share holds', () => {
  const a = createCityAnimation(frame, baked, { seed: 4 });
  drive(a, 300000);
  const { windowEvents, carsSeen, litDelta } = a.stats();
  assert.ok(windowEvents >= 40 && windowEvents <= 140, `${windowEvents} room changes in 5 min`);
  // two or three on the avenue at the start, then one every half minute or so
  assert.ok(carsSeen >= 5 && carsSeen <= 20, `${carsSeen} cars in 5 min`);
  assert.ok(Math.abs(litDelta) <= 10, `lit rooms drifted by ${litDelta}`);
});

test('cars drive the avenue a pixel at a time, one way each, for a long way', () => {
  const W2 = 240;
  const { f, rgba } = bake(W2, 170);
  const a = createCityAnimation(f, rgba, { seed: 6 });
  let prev = a.stats().carPixels;
  let moves = 0;
  const seen = new Map(); // car slot -> visible updates in its current trip
  const trips = [];
  drive(a, 900000, () => {
    const { carPixels: now, carDirs } = a.stats();
    now.forEach((p, i) => {
      const q = prev[i];
      if (p >= 0) seen.set(i, (seen.get(i) || 0) + 1);
      if (p === -2 && seen.get(i)) {
        trips.push(seen.get(i));
        seen.delete(i);
      }
      if (p < 0 || q < 0 || p === q) return;
      const dx = Math.abs((p % W2) - (q % W2));
      const dy = ((p / W2) | 0) - ((q / W2) | 0);
      moves++;
      assert.ok(Math.max(dx, Math.abs(dy)) <= 1, `a car light jumped ${Math.max(dx, Math.abs(dy))} px`);
      // oncoming cars come down the screen toward the viewer, receding ones go up it
      if (dy) assert.equal(Math.sign(dy), carDirs[i] < 0 ? 1 : -1, 'a car changed direction');
    });
    prev = now;
  });
  assert.ok(moves > 200, `cars only moved ${moves} times`);
  trips.sort((x, y) => x - y);
  const median = trips[Math.floor(trips.length / 2)] * (ANIM.minFrameMs / 1000);
  assert.ok(trips.length >= 10 && median >= 25, `${trips.length} trips, median ${median.toFixed(1)} s in view`);
});

test('a quiet night avenue: never more than 7 cars in view, a few at a time, with gaps between them', () => {
  const { f, rgba } = bake(130, 249); // a phone: the screen that shows most of the avenue
  for (const seed of [8, 9]) {
    const a = createCityAnimation(f, rgba, { seed });
    let ticks = 0;
    let sum = 0;
    let max = 0;
    let lulls = 0;
    drive(a, 20 * 60000, (t) => {
      if (t < 60000) return;
      const st = a.stats();
      const visible = st.carLevels.filter((l) => l >= 0.12).length;
      ticks++;
      sum += visible;
      max = Math.max(max, visible);
      if (visible <= 2) lulls++;
      // lanes keep their spacing: no two cars in one lane ever close up (one speed per lane)
      for (let i = 0; i < st.carLanes.length; i++) {
        for (let j = i + 1; j < st.carLanes.length; j++) {
          if (st.carLanes[i] < 0 || st.carLanes[i] !== st.carLanes[j]) continue;
          assert.ok(Math.abs(st.carZ[i] - st.carZ[j]) >= ANIM.traffic.gap - 1, 'two cars too close in a lane');
        }
      }
    });
    const mean = sum / ticks;
    assert.ok(max <= 7, `${max} cars in view at once`);
    assert.ok(mean >= 2 && mean <= 5.5, `${mean.toFixed(1)} cars in view on average`);
    assert.ok(lulls / ticks > 0.03, `quiet spells only ${((100 * lulls) / ticks).toFixed(1)}% of the time`);
  }
});

/* ------------------------------------------------------------------ */
/* The rare events                                                    */
/* ------------------------------------------------------------------ */

const E = (() => {
  const { f, rgba } = bake(240, 170);
  return { f, rgba };
})();
// run until the current event is over (or `max` ms), returning the time
function finish(a, t, max = 600000) {
  const end = t + max;
  while (a.stats().event && t < end) {
    t += ANIM.minFrameMs;
    a.update(t);
  }
  return t;
}
const roomPixels = (d, base) => {
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] !== base[i] || d[i + 1] !== base[i + 1] || d[i + 2] !== base[i + 2]) n++;
  return n;
};

test('events are rare, one at a time, minutes apart, never the same kind twice running', () => {
  for (const seed of [31, 32]) {
    const a = createCityAnimation(E.f, E.rgba, { seed });
    drive(a, 3 * 3600000);
    const log = a.stats().events;
    const starts = log.filter((e) => e.phase === 'start');
    // a handful an hour: not a show
    assert.ok(starts.length >= 9 && starts.length <= 24, `${starts.length} events in 3 h`);
    assert.ok(starts[0].t >= EVENTS.firstMs[0], 'the first came too soon');
    for (let i = 0; i < log.length; i++) {
      // strictly alternating: start, end, start, end...
      assert.equal(log[i].phase, i % 2 ? 'end' : 'start');
      if (i % 2) assert.equal(log[i].kind, log[i - 1].kind);
      if (i && !(i % 2)) assert.ok(log[i].t - log[i - 1].t >= EVENTS.gapMs[0] - 1, 'two events too close together');
    }
    for (let i = 1; i < starts.length; i++) assert.notEqual(starts[i].kind, starts[i - 1].kind);
    assert.deepEqual([...new Set(starts.map((e) => e.kind))].sort(), ['activation', 'emergency', 'outage']);
  }
});

test('no event starts while the sky has a moment of its own, and none starts over another', () => {
  const a = createCityAnimation(E.f, E.rgba, { seed: 33 });
  for (let t = ANIM.minFrameMs; t < 3600000; t += ANIM.minFrameMs) a.update(t, true);
  assert.equal(a.stats().events.length, 0);
  assert.equal(a.trigger('outage'), true);
  assert.equal(a.trigger('activation'), false, 'started over a running event');
  assert.equal(a.trigger('emergency'), false);
});

test('outage: a few floors of one building go dark together, then every room comes back', () => {
  const a = createCityAnimation(E.f, E.rgba, { seed: 34 });
  drive(a, 10000);
  const before = new Uint8ClampedArray(a.rgba);
  const lit0 = a.stats().litRooms;
  assert.equal(a.trigger('outage', 10000), true);
  let t = 10000;
  for (; t < 12000; t += ANIM.minFrameMs) a.update(t);
  const s = a.stats();
  const out = lit0 - s.litRooms;
  assert.ok(out >= EVENTS.outage.minRooms && out <= EVENTS.outage.maxRooms + 2, `${out} rooms went dark`);
  assert.ok(s.held >= EVENTS.outage.minRooms);
  assert.ok(roomPixels(a.rgba, before) > 0, 'nothing went dark on screen');
  // dark for a while...
  for (; t < 10000 + EVENTS.outage.darkMs[0] - 1000; t += ANIM.minFrameMs) a.update(t);
  assert.ok(a.stats().litRooms <= lit0 - out + 3, 'came back too soon');
  // ...then all back, and the rooms free again
  t = finish(a, t);
  assert.equal(a.stats().event, null);
  assert.equal(a.stats().held, 0);
  assert.ok(Math.abs(a.stats().litRooms - lit0) <= 3, `${a.stats().litRooms} lit after, ${lit0} before`);
  const log = a.stats().events;
  const took = log[1].t - log[0].t;
  assert.ok(took >= EVENTS.outage.darkMs[0] && took <= EVENTS.outage.darkMs[1] + EVENTS.outage.backMs[1] + 500, `${took} ms`);
});

test('activation: floors of a dark building light up room by room, hold, then go dark again', () => {
  const a = createCityAnimation(E.f, E.rgba, { seed: 35 });
  drive(a, 5000);
  const lit0 = a.stats().litRooms;
  assert.equal(a.trigger('activation', 5000), true);
  const held = a.stats().held;
  assert.ok(held >= EVENTS.activation.minRooms && held <= EVENTS.activation.maxRooms, `${held} rooms`);
  // gradual: never more than a couple of rooms at once
  let t = 5000;
  let prev = a.stats().litRooms;
  let maxStep = 0;
  for (; t < 5000 + EVENTS.activation.riseMs[1] + 1000; t += ANIM.minFrameMs) {
    a.update(t);
    const n = a.stats().litRooms;
    maxStep = Math.max(maxStep, n - prev);
    prev = n;
  }
  assert.ok(maxStep <= 3, `${maxStep} rooms lit in one update`);
  assert.ok(prev - lit0 >= held - 4, `only ${prev - lit0} of ${held} lit`);
  t = finish(a, t);
  assert.equal(a.stats().held, 0);
  assert.ok(Math.abs(a.stats().litRooms - lit0) <= 4, 'they did not go dark again');
});

test('emergency vehicle: a lane to itself, faster than the traffic, red and blue, the full length of the avenue', () => {
  const a = createCityAnimation(E.f, E.rgba, { seed: 36 });
  let t = 0;
  let started = false;
  while (!started && t < 600000) {
    t += ANIM.minFrameMs;
    a.update(t);
    started = a.trigger('emergency', t);
  }
  assert.ok(started, 'never found a free lane');
  const zs = [];
  const colours = new Set();
  const start = t;
  while (a.stats().event === 'emergency') {
    t += ANIM.minFrameMs;
    a.update(t);
    const st = a.stats();
    if (!st.emergency) continue;
    zs.push(st.emergency.z);
    if (st.emergency.siren) colours.add(st.emergency.siren[2] > 0.5 ? 'blue' : 'red');
    // nobody else in its lane while it drives
    st.carLanes.forEach((l) => assert.notEqual(l, st.emergency.lane, 'a car in the emergency lane'));
    // its light shows among the lights the atmosphere glows round
    if (st.emergency.siren) assert.ok(a.lights().some((l) => l.kind === 'siren' && l.on));
  }
  const secs = (t - start) / 1000;
  const speed = ANIM.traffic.zFar / secs;
  assert.ok(speed >= EVENTS.emergency.speed[0] - 1.5 && speed <= EVENTS.emergency.speed[1] + 1.5, `${speed.toFixed(1)} m/s`);
  assert.ok(speed > ANIM.traffic.speed[1], 'no faster than the traffic');
  assert.ok(Math.max(...zs) - Math.min(...zs) > ANIM.traffic.zFar * 0.95, 'not the full length');
  assert.deepEqual([...colours].sort(), ['blue', 'red']);
  assert.ok(!a.lights().some((l) => l.kind === 'siren' && l.on), 'its light outlived it');
});

test('events stay in the palette and off the ledge, and the lit share returns', () => {
  const pal = new Set(CITY_PALETTE.map(([r, g, b]) => (r << 16) | (g << 8) | b));
  const a = createCityAnimation(frame, baked, { seed: 37 });
  const ledgeFrom = (H - PARAPET_TILES[0].length) * W * 4;
  let t = 0;
  for (const kind of EVENTS.kinds) {
    while (!a.trigger(kind, t) && t < 3600000) {
      t += ANIM.minFrameMs;
      a.update(t);
    }
    t = finish(a, t);
    const d = a.rgba;
    for (let i = 0; i < d.length; i += 4) assert.ok(pal.has((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]));
    assert.deepEqual(d.subarray(ledgeFrom), baked.subarray(ledgeFrom));
  }
  assert.ok(Math.abs(a.stats().litDelta) <= 10);
});
