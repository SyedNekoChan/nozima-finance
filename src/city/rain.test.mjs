import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RAIN, createRain } from './rain.js';
import { createCityFrame } from './render.js';

const bake = (w, h, view) => {
  const f = createCityFrame(w, h, { capture: true, view });
  f.renderRows(0, h);
  f.finish();
  return f;
};
const env = (o = {}) => ({ weather: 'clear', rain: 0, wet: 0.55, flash: 0, flashX: 0.5, flashId: 0, moon: 0, star: null, ...o });
const lit = (rgba) => {
  let n = 0;
  for (let i = 0; i < rgba.length; i += 4) if (rgba[i] + rgba[i + 1] + rgba[i + 2] > 0) n++;
  return n;
};

// a desktop-like frame (no sky in view) and a phone in observation mode (the sky above the view)
const desk = bake(200, 125);
const phone = bake(130, 282, { y0: 60, h: 200 });

test('dry weather: nothing to draw, and it says so (the layer stays hidden)', () => {
  const r = createRain(desk, { seed: 1 });
  for (let t = 84; t < 5000; t += 84) assert.equal(r.update(t, 84, env()), false);
  assert.equal(lit(r.rgba), 0);
  for (let i = 3; i < r.rgba.length; i += 4) assert.equal(r.rgba[i], 255); // opaque black: adds nothing on screen
});

test('rain: more drops the harder it rains, faint, light only, and gone again when it stops', () => {
  const r = createRain(desk, { seed: 2 });
  const counts = [];
  for (const rain of [0.25, 0.6, 1]) {
    let n = 0;
    for (let t = 0; t < 3000; t += 84) {
      assert.equal(r.update(t, 84, env({ rain })), true);
      n += lit(r.rgba);
      for (let i = 0; i < r.rgba.length; i += 4) assert.ok(Math.max(r.rgba[i], r.rgba[i + 1], r.rgba[i + 2]) < 0.4 * 255, 'a drop too bright');
    }
    counts.push(n);
  }
  assert.ok(counts[0] > 0 && counts[0] < counts[1] && counts[1] < counts[2], counts.join(' < '));
  // at the heaviest, still a small share of the picture
  assert.ok(counts[2] / 36 / (r.w * r.h) < 0.06, `${((counts[2] / 36 / (r.w * r.h)) * 100).toFixed(1)}% of the pixels`);
  r.update(4000, 84, env());
  r.update(4084, 84, env());
  assert.equal(lit(r.rgba), 0);
  assert.equal(r.update(4168, 84, env()), false);
});

test('shooting stars and bolts only where the sky is in view', () => {
  assert.equal(createRain(desk).hasSky, false);
  const r = createRain(phone, { seed: 4 });
  assert.equal(r.hasSky, true);
  const sky = phone.dynamic.view.y0; // the rows above the view are where the sky is
  // a shooting star crossing
  let drawn = 0;
  for (let t = 0; t <= 1000; t += 84) {
    r.update(t, 84, env({ star: { id: 1, t0: 0, life: 1000, seed: 77 } }));
    for (let p = 0; p < r.w * r.h; p++) {
      if (!r.rgba[p * 4]) continue;
      drawn++;
      assert.ok(((p / r.w) | 0) < sky + 40, 'a star below the skyline');
    }
  }
  assert.ok(drawn > 0, 'no star drawn');
  // a bolt while the flash is bright, nothing once it fades
  r.update(1100, 84, env({ rain: 0, flash: 0.9, flashX: 0.4, flashId: 3 }));
  assert.ok(lit(r.rgba) > 3, 'no bolt');
  r.update(1184, 84, env({ flash: 0.1 }));
  assert.equal(lit(r.rgba), 0);
  // and on a frame with no sky, neither is drawn
  const d = createRain(desk);
  assert.equal(d.update(0, 84, env({ flash: 1, star: { id: 1, t0: 0, life: 1000, seed: 77 } })), false);
});

// a screen held upright: the tallest view, the one with the most open air in front of the towers
const tall = bake(130, 282, { y0: 16, h: 251 });

test('rain stays out there: never on or below the parapet, never through a building nearer than it', () => {
  const ledge = tall.dynamic.ledgeTop;
  const depth = tall.dynamic.depth;
  const nearest = Math.min(...RAIN.layers.map((L) => L.depth[0]));
  for (const rain of [0.25, 0.6, 1]) {
    const r = createRain(tall, { seed: 5 });
    let t = 0;
    for (let k = 0; k < 80; k++) {
      r.update((t += 84), 84, env({ rain }));
      for (let p = 0; p < r.w * r.h; p++) {
        const o = p * 4;
        if (!(r.rgba[o] | r.rgba[o + 1] | r.rgba[o + 2])) continue;
        assert.ok(((p / r.w) | 0) < ledge, `rain on the parapet at row ${(p / r.w) | 0}`);
        assert.ok(depth[p] > nearest, `rain in front of a surface ${depth[p]} m away`);
      }
    }
  }
});

test('rain falls across the whole city: no stream, no column, every part of the width', () => {
  for (const f of [tall, desk]) {
    const r = createRain(f, { seed: 6 });
    const cols = new Float64Array(r.w);
    let t = 0;
    for (let k = 0; k < 30; k++) r.update((t += 84), 84, env({ rain: 1 }));
    for (let k = 0; k < 120; k++) {
      r.update((t += 84), 84, env({ rain: 1 }));
      for (let p = 0; p < r.w * r.h; p++) if (r.rgba[p * 4 + 2]) cols[p % r.w]++;
    }
    const total = cols.reduce((a, b) => a + b, 0);
    const third = [0, 1, 2].map((k) => cols.slice(Math.floor((k * r.w) / 3), Math.floor(((k + 1) * r.w) / 3)).reduce((a, b) => a + b, 0) / total);
    for (const share of third) assert.ok(share > 0.22 && share < 0.45, `thirds ${third.map((v) => (v * 100).toFixed(0)).join('/')}`);
    // no column carries a stream: the busiest column is not far above the average
    const mean = total / r.w;
    assert.ok(Math.max(...cols) < mean * 2.5, `a column with ${(Math.max(...cols) / mean).toFixed(1)}x the average`);
  }
});

test('three depth layers: farther is finer, shorter, slower and fainter', () => {
  const [far, mid, near] = RAIN.layers;
  assert.deepEqual(RAIN.layers.map((L) => L.name), ['distant', 'middle', 'exterior']);
  assert.ok(far.depth[0] >= mid.depth[1] - 1 && mid.depth[0] >= near.depth[1] - 1, 'layers overlap in depth');
  for (const [a, b] of [
    [far, mid],
    [mid, near],
  ]) {
    for (const key of ['len', 'speed', 'light']) assert.ok(a[key][0] < b[key][0] && a[key][1] < b[key][1], `${a.name} vs ${b.name}: ${key}`);
  }
  // the nearest layer stays clear of the viewer's own building
  assert.ok(near.depth[0] >= 30);
});
