import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANIM, createCityAnimation } from './animate.js';
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
// run with the animation's own scheduling, calling fn(t, rgba, box) after every update
function drive(anim, until, fn) {
  let t = 0;
  while (t < until) {
    const next = anim.nextDue(t);
    assert.ok(next - t >= ANIM.minFrameMs - 1e-9, `scheduled ${next - t} ms ahead`);
    t = next;
    const box = anim.update(t);
    fn?.(t, anim.rgba, box);
  }
}

const W = 160;
const H = 120;
const { f: frame, rgba: baked } = bake(W, H);

test('capturing for the animation leaves the still frame exactly as it was', () => {
  assert.deepEqual(baked, renderCity(W, H));
  assert.ok(frame.dynamic && frame.dynamic.F.length === W * H * 3);
});

test('it starts on the still frame: nothing changes until the effects ease in', () => {
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

test('calm: few pixels change, none chatter, and the overall brightness holds', () => {
  const a = createCityAnimation(frame, baked, { seed: 2 });
  const prev = new Uint8ClampedArray(baked);
  const counts = new Uint16Array(W * H);
  const base = lum(baked);
  let changes = 0;
  drive(a, 126000, (t, d) => {
    if (t > 6000) {
      for (let p = 0; p < W * H; p++) {
        const o = p * 4;
        if (d[o] !== prev[o] || d[o + 1] !== prev[o + 1] || d[o + 2] !== prev[o + 2]) {
          counts[p]++;
          changes++;
        }
      }
      if (t % 5000 < ANIM.minFrameMs) assert.ok(Math.abs(lum(d) - base) / base < 0.02, `brightness ${lum(d)} vs ${base}`);
    }
    prev.set(d);
  });
  // over two minutes after the onset
  const perSecond = changes / 120 / (W * H);
  assert.ok(perSecond < 0.02, `${(perSecond * 100).toFixed(2)}% of the frame changes per second`);
  // pixels that change more than once every 4 s on average: only the beacons blink that fast
  const beaconArea = frame.dynamic.beacons.reduce((s, b) => s + b.w * b.h, 0);
  const busy = counts.filter((c) => c > 30).length;
  assert.ok(busy <= beaconArea + W * H * 0.005, `${busy} busy pixels`);
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
    // on and off about every two seconds: 24 s holds roughly 10-15 changes, never a flicker
    assert.ok(flips >= 6 && flips <= 20, `beacon ${i}: ${flips} changes in 24 s`);
  }
  // not in step: at some moment one is on while another is off
  assert.ok(series.some((s) => s.some((v) => v !== s[0])));
});

test('window changes are rare and cars are occasional', () => {
  const a = createCityAnimation(frame, baked, { seed: 4 });
  drive(a, 300000);
  const { windowEvents, carsSeen, litDelta } = a.stats();
  assert.ok(windowEvents >= 15 && windowEvents <= 70, `${windowEvents} window changes in 5 min`);
  assert.ok(carsSeen >= 5 && carsSeen <= 45, `${carsSeen} cars in 5 min`);
  assert.ok(Math.abs(litDelta) <= 8, `lit windows drifted by ${litDelta}`);
});

test('car lights move along the avenue by whole pixels, a pixel at a time', () => {
  const W2 = 240;
  const { f, rgba } = bake(W2, 170); // big enough for the avenue to run a long way
  const a = createCityAnimation(f, rgba, { seed: 6 });
  let prev = a.stats().carPixels;
  let moves = 0;
  drive(a, 240000, () => {
    const now = a.stats().carPixels;
    now.forEach((p, i) => {
      const q = prev[i];
      if (p < 0 || q < 0 || p === q) return; // appearing, hidden, gone or still
      const d = Math.max(Math.abs((p % W2) - (q % W2)), Math.abs(((p / W2) | 0) - ((q / W2) | 0)));
      moves++;
      assert.ok(d <= 1, `a car light jumped ${d} px`);
    });
    prev = now;
  });
  assert.ok(moves > 10, `cars only moved ${moves} times`);
});
