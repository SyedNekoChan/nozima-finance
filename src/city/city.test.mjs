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

test('two or three aircraft warning lights, on the tallest towers in view, never crowded', () => {
  for (const [w, h, most] of [
    [480, 266, 3],
    [427, 206, 3],
    [256, 309, 3],
    [282, 98, 3],
    [130, 249, 2],
    [107, 157, 2],
  ]) {
    const f = createCityFrame(w, h);
    f.renderRows(0, h);
    const rgba = f.finish();
    assert.ok(f.beacons >= 2 && f.beacons <= most, `${w}x${h}: ${f.beacons} beacons`);
    // and nothing else in the frame is beacon red
    let red = 0;
    for (let i = 0; i < rgba.length; i += 4) if (rgba[i] === 0xff && rgba[i + 1] === 0x44 && rgba[i + 2] === 0x36) red++;
    assert.ok(red <= f.beacons * 3, `${w}x${h}: ${red} beacon-red pixels`);
  }
});

test('the neon sign still shows on a phone', () => {
  const rgba = renderCity(130, 249);
  const neon = new Set([0x5e1630, 0xa82f5c, 0xec5f92]);
  let n = 0;
  for (let i = 0; i < rgba.length; i += 4) if (neon.has((rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2])) n++;
  assert.ok(n >= 4, `only ${n} neon pixels`);
});

test('observation mode: the layer can cover the whole screen while the scene is composed for the main area', () => {
  for (const [w, h, dpr, top, bottom] of [
    [1440, 900, 1, 42, 840],
    [390, 844, 2, 49, 800],
    [844, 390, 3, 41, 350],
  ]) {
    const l = cityLayout(w, h, dpr, null, null, { top, bottom });
    assert.equal(l.view.y0 % 4, 0, 'the rows above the view keep the dither in phase');
    // the view's rows land on the main area, to within a city pixel
    const viewTop = l.offsetY + l.view.y0 * l.scale;
    const viewBottom = viewTop + l.view.h * l.scale;
    assert.ok(Math.abs(viewBottom - bottom * dpr) < 1, `bottom ${viewBottom} vs ${bottom * dpr}`);
    assert.ok(viewTop <= top * dpr && viewTop > top * dpr - l.scale, `top ${viewTop} vs ${top * dpr}`);
    // and the buffer still covers the whole canvas
    assert.ok(l.offsetY <= 0 && l.offsetY + l.h * l.scale >= l.devH);
    assert.ok(l.w * l.scale >= l.devW);
  }
  // without a view, the layout is the one it always was
  const plain = cityLayout(1440, 820, 1);
  assert.deepEqual(plain.view, { y0: 0, h: plain.h });
});

test('the extended frame shows the same scene in the view, the sky above it and the ledge below', () => {
  const w = 130;
  const vh = 200;
  const y0 = 60;
  const below = 22;
  const h = y0 + vh + below;
  const plain = renderCity(w, vh);
  const f = createCityFrame(w, h, { view: { y0, h: vh } });
  f.renderRows(0, h);
  const ext = f.finish();
  // the view region is the plain frame (bar a little bloom at its very top, from the light above it)
  let differ = 0;
  for (let y = 0; y < vh; y++) {
    for (let x = 0; x < w; x++) {
      const a = (y * w + x) * 4;
      const b = ((y + y0) * w + x) * 4;
      if (plain[a] === ext[b] && plain[a + 1] === ext[b + 1] && plain[a + 2] === ext[b + 2]) continue;
      differ++;
      assert.ok(y < 8, `row ${y} of the view differs`);
    }
  }
  assert.ok(differ / (w * vh) < 0.01, `${differ} pixels differ`);
  // below the view: the ledge, the colour of its bottom row all the way down
  const last = ((y0 + vh - 1) * w) * 4;
  for (let y = y0 + vh; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    assert.deepEqual([ext[o], ext[o + 1], ext[o + 2]], [ext[last + x * 4], ext[last + x * 4 + 1], ext[last + x * 4 + 2]]);
  }
  // above it the view carries on up into the sky: the top rows are open sky (rays that rise)
  const cam = f.camera;
  const dir = [0, 0, 0];
  rayDir(cam, w / 2, 1, dir);
  assert.ok(dir[1] > 0, 'no sky above the view on a phone');
});

test('the middle distance: towers where a portrait screen looked across a gap, the avenue still running through', async () => {
  const { MIDDLE } = await import('./scene.js');
  const portrait = cityLayout(390, 844, 2, null, null, { top: 49, bottom: 800 });
  const f = createCityFrame(portrait.w, portrait.h, { capture: true, view: portrait.view });
  f.renderRows(0, portrait.h);
  f.finish();
  const cam = f.camera;
  const dyn = f.dynamic;
  const dir = [0, 0, 0];
  // the rows that look 2.8-4.5 km ahead: most of them now meet a building, not the ground
  let rows = 0;
  let built = 0;
  for (let y = portrait.view.y0; y < portrait.h; y++) {
    rayDir(cam, portrait.w / 2, y + 0.5, dir);
    const ground = dir[1] < 0 ? cam.pos[1] / -dir[1] : Infinity;
    if (!(ground * Math.abs(dir[2]) > 2800 && ground * Math.abs(dir[2]) < 4500)) continue;
    rows++;
    for (let x = 0; x < portrait.w; x++) {
      rayDir(cam, x + 0.5, y + 0.5, dir);
      const g = cam.pos[1] / -dir[1];
      if (dyn.depth[y * portrait.w + x] < g - 5) built++;
    }
  }
  assert.ok(rows >= 8, `${rows} rows in the middle distance`);
  assert.ok(built / (rows * portrait.w) > 0.6, `only ${((100 * built) / (rows * portrait.w)).toFixed(0)}% of the middle distance is built`);
  // the avenue is never built on, and it stays in view as it recedes through the middle distance
  const ax = MIDDLE.avenue.x;
  let seen = 0;
  let points = 0;
  for (let z = MIDDLE.from[1]; z <= MIDDLE.to[0]; z += 100) {
    const p = project(cam, ax, 0, z);
    if (!p || p.x < 0 || p.x >= portrait.w || p.y < portrait.view.y0 || p.y >= dyn.ledgeTop) continue;
    points++;
    if (dyn.depth[Math.floor(p.y) * portrait.w + Math.floor(p.x)] > p.depth - 40) seen++;
  }
  for (const blk of f.city.blocks()) for (const bx of blk.boxes) assert.ok(bx.x1 <= ax - GRID_HALF || bx.x0 >= ax + GRID_HALF, 'a building on the avenue');
  assert.ok(points >= 10 && seen / points > 0.8, `the avenue is in view at ${seen} of ${points} points`);
});

const GRID_HALF = 18; // half the avenue's width

test('the middle distance changes nothing a desktop or a phone on its side shows, and every building keeps its windows', async () => {
  const scene = await import('./scene.js');
  const { MIDDLE } = scene;
  const frames = () =>
    [
      [1440, 900, 1, 42, 840],
      [1280, 720, 1, 0, 720],
      [844, 390, 2, 41, 350],
      [390, 844, 2, 49, 800],
    ].map(([w, h, dpr, top, bottom]) => {
      const l = cityLayout(w, h, dpr, null, null, { top, bottom });
      const f = createCityFrame(l.w, l.h, { capture: true, view: l.view });
      f.renderRows(0, l.h);
      f.finish();
      return { l, dyn: f.dynamic, ids: new Map(f.city.blocks().flatMap((blk) => blk.boxes.map((bx) => [bx.b.key, bx.b.id]))) };
    });
  const withLayer = frames();
  // the same city without it
  const saved = { base: MIDDLE.base, h: MIDDLE.avenue.h, clusters: MIDDLE.clusters };
  MIDDLE.base = 0;
  MIDDLE.avenue.h = 0;
  MIDDLE.clusters = [];
  let without;
  try {
    without = frames();
  } finally {
    MIDDLE.base = saved.base;
    MIDDLE.avenue.h = saved.h;
    MIDDLE.clusters = saved.clusters;
  }
  withLayer.forEach((a, n) => {
    const b = without[n];
    const { w } = a.l;
    const portrait = n === 3;
    for (let p = a.l.view.y0 * w; p < a.dyn.ledgeTop * w; p++) {
      if (portrait && a.dyn.depth[p] > 2600) continue; // the portrait's middle distance itself changed, on purpose
      assert.equal(a.dyn.depth[p], b.dyn.depth[p], `frame ${n}: what pixel ${p} sees changed`);
      assert.equal(a.dyn.winKey[p], b.dyn.winKey[p], `frame ${n}: window at ${p} changed`);
      assert.equal(a.dyn.winLit[p], b.dyn.winLit[p], `frame ${n}: lit window at ${p} changed`);
    }
    assert.deepEqual(
      a.dyn.beacons.map((bc) => [bc.sx, bc.sy]),
      b.dyn.beacons.map((bc) => [bc.sx, bc.sy])
    );
    // every building is numbered as before, so it keeps its pattern of lit windows
    for (const [key, id] of b.ids) if (a.ids.has(key)) assert.equal(a.ids.get(key), id, `${key} renumbered`);
  });
});
