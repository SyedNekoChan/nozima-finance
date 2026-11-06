import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CITY_PIXEL_CSS, cityLayout } from './layout.js';
import { CITY_PALETTE } from './palette.js';
import { PARAPET_KEY, PARAPET_TILES, HELIPAD, PLANT, SIGN, BEACON } from './art.js';
import { CAMERA_HEIGHT, createCity, makeCamera, project, rayDir } from './scene.js';
import { createCityFrame, renderCity } from './render.js';

const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

test('a city pixel is a whole number of device pixels, the same size on every viewport', () => {
  for (const [w, h, dpr] of [
    [1440, 820, 1],
    [1440, 820, 2],
    [375, 640, 3],
    [320, 470, 2],
    [844, 300, 3],
    [1366, 600, 1.25],
    [390, 700, 2.625],
  ]) {
    const l = cityLayout(w, h, dpr);
    assert.ok(Number.isInteger(l.scale) && l.scale >= 1);
    assert.equal(l.scale, Math.max(1, Math.round(CITY_PIXEL_CSS * dpr)));
    // the buffer covers the canvas, overshooting by less than one city pixel, never scaled
    assert.ok(l.w * l.scale >= l.devW && (l.w - 1) * l.scale < l.devW);
    assert.ok(l.h * l.scale >= l.devH && (l.h - 1) * l.scale < l.devH);
    assert.ok(l.offsetX <= 0 && l.offsetX > -l.scale);
    assert.equal(l.offsetY + l.h * l.scale, l.devH); // flush with the bottom edge
  }
});

test('measured device-pixel sizes are used as given', () => {
  const l = cityLayout(100.5, 50.25, 2, 201, 101);
  assert.equal(l.devW, 201);
  assert.equal(l.devH, 101);
});

test('the authored art is well formed and uses the palette', () => {
  const hexes = new Set(CITY_PALETTE.map((p) => `#${p.map((v) => v.toString(16).padStart(2, '0')).join('')}`));
  for (const hex of Object.values(PARAPET_KEY)) if (hex) assert.ok(hexes.has(hex), hex);
  for (const grid of [...PARAPET_TILES, HELIPAD, PLANT, SIGN]) {
    const width = grid[0].length;
    for (const row of grid) assert.equal(row.length, width);
  }
  for (const t of PARAPET_TILES) {
    assert.equal(t.length, PARAPET_TILES[0].length);
    for (const row of t) for (const ch of row) assert.ok(ch in PARAPET_KEY, `unknown parapet key ${ch}`);
  }
  assert.equal(BEACON.length, 5);
});

test('every roof is below the viewer, so every roof is seen from above', () => {
  const city = createCity();
  let n = 0;
  for (let j = 0; j < 40; j++) {
    for (let i = -20; i < 20; i++) {
      for (const b of city.block(i, j).boxes) {
        assert.ok(b.y1 < CAMERA_HEIGHT - 10, `box at ${i},${j} reaches ${b.y1}`);
        assert.ok(b.x1 > b.x0 && b.z1 > b.z0 && b.y1 > b.y0);
        n++;
      }
    }
  }
  assert.ok(n > 1000);
  // the viewer's own tower and what is behind it is not modelled
  assert.equal(city.block(1, -1).boxes.length, 0);
});

test('the camera looks steeply down at the bottom edge in every shape of screen', () => {
  const d = [0, 0, 0];
  for (const [w, h] of [
    [480, 267],
    [125, 230],
    [110, 240],
    [280, 100],
    [640, 220],
    [90, 260], // 9:26, taller than any phone
  ]) {
    const cam = makeCamera(w, h);
    rayDir(cam, w / 2, h, d);
    const below = (-Math.asin(d[1]) * 180) / Math.PI;
    // wide screens keep the distant lights at the top, so their bottom edge is a little less steep (62 degrees at least; a phone on its side gives up the distant lights for it)
    assert.ok(below > 60 && below <= 86.01, `${w}x${h}: bottom edge ${below.toFixed(1)} deg below the horizon`);
    assert.ok((cam.pitch * 180) / Math.PI > 35, `${w}x${h}: centre only ${((cam.pitch * 180) / Math.PI).toFixed(1)} deg down`);
    rayDir(cam, w / 2, 0, d);
    const topBelow = (-Math.asin(d[1]) * 180) / Math.PI;
    assert.ok(topBelow > -4 && topBelow < 30, `${w}x${h}: top edge ${topBelow.toFixed(1)} deg`);
    // a point straight ahead projects back where its ray came from
    rayDir(cam, w * 0.3, h * 0.6, d);
    const p = project(cam, cam.pos[0] + d[0] * 500, cam.pos[1] + d[1] * 500, cam.pos[2] + d[2] * 500);
    assert.ok(Math.abs(p.x - w * 0.3) < 1e-6 && Math.abs(p.y - h * 0.6) < 1e-6);
  }
});

test('a frame is deterministic, opaque and drawn only in palette colours', () => {
  const a = renderCity(96, 64);
  const b = renderCity(96, 64);
  assert.equal(a.length, 96 * 64 * 4);
  assert.deepEqual(a, b);
  const pal = new Set(CITY_PALETTE.map(([r, g, bb]) => (r << 16) | (g << 8) | bb));
  for (let i = 0; i < a.length; i += 4) {
    assert.equal(a[i + 3], 255);
    assert.ok(pal.has((a[i] << 16) | (a[i + 1] << 8) | a[i + 2]), `pixel ${i / 4} off palette`);
  }
});

test('rendering in slices gives the same frame as rendering at once', () => {
  const whole = renderCity(80, 120);
  const f = createCityFrame(80, 120);
  for (let y = 0; y < 120; y += 7) f.renderRows(y, y + 7);
  assert.deepEqual(f.finish(), whole);
});

test('the scene stays dark enough for white UI text on top of it', () => {
  for (const [w, h] of [
    [240, 134],
    [125, 230],
  ]) {
    const rgba = renderCity(w, h);
    let sum = 0;
    let bright = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      const l = lum(rgba[i], rgba[i + 1], rgba[i + 2]);
      sum += l;
      if (l > 0.5) bright++;
    }
    const n = rgba.length / 4;
    assert.ok(sum / n < 0.11, `${w}x${h}: mean luminance ${(sum / n).toFixed(3)}`);
    // lights are points, not areas
    assert.ok(bright / n < 0.02, `${w}x${h}: ${((100 * bright) / n).toFixed(1)}% bright pixels`);
  }
});

test('the parapet runs along the bottom edge', () => {
  const w = 64;
  const h = 48;
  const rgba = renderCity(w, h);
  const rows = PARAPET_TILES[0].length;
  const last = PARAPET_TILES[0][rows - 1][0];
  const hex = PARAPET_KEY[last];
  const want = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
  const o = ((h - 1) * w + 3) * 4;
  assert.deepEqual([rgba[o], rgba[o + 1], rgba[o + 2]], want);
});
