import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ATMOS, createAtmosphere } from './atmos.js';
import { PARAPET_TILES } from './art.js';
import { createCityFrame } from './render.js';

const W = 200;
const H = 150;
const frame = createCityFrame(W, H, { capture: true });
frame.renderRows(0, H);
frame.finish();
const dyn = frame.dynamic;

test('the atmosphere is light only, bounded, and never over the ledge', () => {
  const air = createAtmosphere(frame, { seed: 1 });
  assert.equal(air.w, Math.ceil(W / ATMOS.cell));
  const out = air.update(20000);
  const ledgeRow = Math.ceil((H - PARAPET_TILES[0].length) / ATMOS.cell);
  for (let c = 0; c < air.w * air.h; c++) {
    const o = c * 4;
    assert.equal(out[o + 3], 255);
    for (let k = 0; k < 3; k++) assert.ok(out[o + k] <= ATMOS.max * 255 + 1);
    if (((c / air.w) | 0) >= ledgeRow) assert.equal(out[o] + out[o + 1] + out[o + 2], 0, 'light over the ledge');
  }
});

test('it is a picture of time alone: the same t gives the same air (so a still frame stays still)', () => {
  const a = createAtmosphere(frame, { seed: 9 });
  const b = createAtmosphere(frame, { seed: 9 });
  a.update(5000);
  const one = new Uint8ClampedArray(a.update(0));
  assert.deepEqual(new Uint8ClampedArray(b.update(0)), one);
});

test('it moves, and moves smoothly: no cell jumps between one update and the next', () => {
  const air = createAtmosphere(frame, { seed: 2 });
  let prev = new Uint8ClampedArray(air.update(10000));
  let moving = 0;
  let worst = 0;
  for (let t = 10083; t < 40000; t += 83) {
    const out = air.update(t);
    for (let i = 0; i < out.length; i += 4) {
      const d = Math.max(Math.abs(out[i] - prev[i]), Math.abs(out[i + 1] - prev[i + 1]), Math.abs(out[i + 2] - prev[i + 2]));
      if (d) moving++;
      if (d > worst) worst = d;
    }
    prev = new Uint8ClampedArray(out);
  }
  assert.ok(moving > 0, 'the air does not move');
  assert.ok(worst <= 8, `a cell changed by ${worst}/255 in one update`);
});

test('mist lies in the streets and between the towers, never over the roofs that rise above it', () => {
  const air = createAtmosphere(frame, { seed: 3 });
  const out = air.update(15000);
  const C = ATMOS.cell;
  let roofCells = 0;
  let worst = 0;
  for (let gy = 0; gy < air.h; gy++) {
    for (let gx = 0; gx < air.w; gx++) {
      // cells whose rays meet a surface above both mist layers, with no haze, glint or sign in front
      let clear = true;
      for (let dy = 0; dy < C && clear; dy++) {
        for (let dx = 0; dx < C; dx++) {
          const x = gx * C + dx;
          const y = gy * C + dy;
          if (x >= W || y >= H - PARAPET_TILES[0].length) continue;
          const p = y * W + x;
          if (dyn.slabs[0][p] || dyn.slabs[1][p] || dyn.haze[p] > 0.01 || dyn.sign[p] || dyn.S[p * 3] + dyn.S[p * 3 + 1] + dyn.S[p * 3 + 2] > 0.01) clear = false;
        }
      }
      if (!clear) continue;
      roofCells++;
      const o = (gy * air.w + gx) * 4;
      worst = Math.max(worst, (out[o] + out[o + 1] + out[o + 2]) / 3 / 255);
    }
  }
  assert.ok(roofCells > 20, `only ${roofCells} high-roof cells to check`);
  // only the thin high veil (and the odd halo or shaft at an edge) reaches them
  assert.ok(worst < 0.09, `a high roof is under ${worst.toFixed(3)} of mist`);
});

test('the air adds only a little light overall (the UI stays readable over it)', () => {
  const air = createAtmosphere(frame, { seed: 4 });
  for (const t of [0, 30000, 60000, 90000]) {
    const out = air.update(t);
    let s = 0;
    for (let i = 0; i < out.length; i += 4) s += (0.2126 * out[i] + 0.7152 * out[i + 1] + 0.0722 * out[i + 2]) / 255;
    const mean = s / (out.length / 4);
    assert.ok(mean < 0.05, `mean light added ${mean.toFixed(3)} at ${t} ms`);
  }
});
