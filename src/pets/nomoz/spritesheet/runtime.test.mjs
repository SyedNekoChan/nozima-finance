import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodePng } from './png.mjs';
import { normalizeManifest, selectClip, frameAt } from './clips.js';
import { SHEET_MANIFEST } from './manifest.js';
import { getSheetImage } from './loader.js';
import { createSheetRenderer } from './renderer.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/* Fakes: just enough browser for the loader and renderer              */
/* ------------------------------------------------------------------ */

let now = 0;
let images = []; // every FakeImage created, in order
let warnings = [];
const realWarn = console.warn;
const realPerf = Object.getOwnPropertyDescriptor(globalThis, 'performance');

class FakeImage {
  constructor() {
    this.naturalWidth = 0;
    this.naturalHeight = 0;
    images.push(this);
  }
  set src(v) {
    this._src = v;
  }
  get src() {
    return this._src;
  }
  load(w, h) {
    this.naturalWidth = w;
    this.naturalHeight = h;
    this.onload();
  }
  fail() {
    this.onerror();
  }
}

// a 2d context that records its calls; `alpha(x, y)` supplies silhouette pixels
function fakeContext(width, height, alpha = () => 255) {
  const calls = [];
  const g = {
    calls,
    imageSmoothingEnabled: true,
    fillStyle: '',
    drawImage: (...a) => calls.push(['drawImage', ...a]),
    fillRect: (...a) => calls.push(['fillRect', ...a]),
    clearRect: (...a) => calls.push(['clearRect', ...a]),
    getImageData: (x, y, w, h) => {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) data[(j * w + i) * 4 + 3] = alpha(x + i, y + j);
      return { data };
    },
    canvas: { width, height, isConnected: true },
  };
  return g;
}

beforeEach(() => {
  now = 0;
  images = [];
  warnings = [];
  console.warn = (m) => warnings.push(String(m));
  globalThis.Image = FakeImage;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => fakeContext(96, 64) }) };
  Object.defineProperty(globalThis, 'performance', { value: { now: () => now }, configurable: true, writable: true });
  mock.timers.enable({ apis: ['setTimeout'] });
});

afterEach(() => {
  mock.timers.reset();
  console.warn = realWarn;
  delete globalThis.Image;
  delete globalThis.document;
  delete globalThis.matchMedia;
  Object.defineProperty(globalThis, 'performance', realPerf);
});

const advance = (ms) => {
  now += ms;
  mock.timers.tick(ms);
};

// Two-clip manifest on a 96 x 64 two-frame sheet; `uid` keeps the loader cache apart.
let uid = 0;
function setup(extra = {}) {
  const src = `sheet${++uid}.png`;
  const manifest = {
    sheets: { s: { src, frameWidth: 96, frameHeight: 64, columns: 2, rows: 1 } },
    clips: {
      walk: { sheet: 's', frames: [0, 1], ms: [100, 300] },
      pose: { sheet: 's', frames: [1], lighting: 'baked' },
      shot: { sheet: 's', frames: [0, 1], ms: 100, loop: false, next: 'pose' },
      ...extra.clips,
    },
    select: extra.select || [
      { when: { pose: 'stand', legs: 1 }, clip: 'walk' },
      { when: { pose: 'stand', legs: 3 }, clip: 'shot' },
      { when: { pose: 'sit' }, clip: 'pose' },
    ],
  };
  const calls = [];
  const fallback = (ctx, p, v, body) => {
    calls.push({ p, body });
    if (body) {
      body.painted = body.paint(ctx, { light: 1, face: null, ox: 0, oy: 0, hx: 0, hy: 0, grid: [] });
    }
  };
  const render = createSheetRenderer({ manifest, fallback });
  return { src, render, calls, ctx: fakeContext(96, 64), image: () => images.find((i) => i.src === src) };
}
const P = (o) => ({ pose: 'sit', legs: 0, light: 1, ...o });
const shown = (ctx) => ctx.calls.filter((c) => c[0] === 'drawImage' && c[1] && c[1].naturalWidth).map((c) => c[2]); // source x of each sheet blit

/* ------------------------------------------------------------------ */
/* Loader                                                              */
/* ------------------------------------------------------------------ */

test('loader: one entry per url, listeners fire once on ready', () => {
  const a = getSheetImage('l1.png');
  assert.equal(getSheetImage('l1.png'), a);
  assert.equal(a.status, 'loading');
  let n = 0;
  a.listeners.add(() => n++);
  images[0].load(96, 64);
  assert.equal(a.status, 'ready');
  assert.equal(n, 1);
  assert.equal(a.listeners.size, 0);
  images[0].onload(); // a duplicate event changes nothing
  assert.equal(n, 1);
});

test('loader: failures are permanent and a throwing listener does not break others', () => {
  const a = getSheetImage('l2.png');
  let ok = 0;
  a.listeners.add(() => {
    throw new Error('boom');
  });
  a.listeners.add(() => ok++);
  images[0].fail();
  assert.equal(a.status, 'failed');
  assert.equal(ok, 1);
  assert.equal(getSheetImage('l2.png'), a);
  assert.equal(images.length, 1, 'no retry');
});

test('loader: a zero-size image counts as failed; no Image global fails without throwing', () => {
  getSheetImage('l3.png');
  images[0].load(0, 0);
  assert.equal(getSheetImage('l3.png').status, 'failed');
  delete globalThis.Image;
  assert.equal(getSheetImage('l4.png').status, 'failed');
});

/* ------------------------------------------------------------------ */
/* Fallback                                                            */
/* ------------------------------------------------------------------ */

test('renderer: procedural while loading, sheet once ready', () => {
  const { render, calls, ctx, image } = setup();
  render(ctx, P({}), null);
  assert.equal(calls.at(-1).body, null, 'loading draws procedurally');
  image().load(192, 64);
  assert.ok(calls.at(-1).body, 'redrawn with the sheet when it settles');
});

test('renderer: a failed sheet or an undersized one draws procedurally and disables the clip', () => {
  let t = setup();
  t.render(t.ctx, P({}), null);
  t.image().fail();
  assert.equal(t.calls.at(-1).body, null);
  assert.ok(warnings.some((w) => /disabled/.test(w)));

  images = [];
  t = setup();
  t.render(t.ctx, P({}), null);
  t.image().load(96, 64); // needs 192 x 64
  assert.equal(t.calls.at(-1).body, null);
  assert.ok(warnings.some((w) => /smaller than its frame grid/.test(w)));
});

test('renderer: a state with no clip is drawn procedurally', () => {
  const { render, calls, ctx, image } = setup();
  render(ctx, P({}), null);
  image().load(192, 64);
  render(ctx, P({ pose: 'curl' }), null);
  assert.equal(calls.at(-1).body, null);
});

test('renderer: an unusable manifest returns the fallback itself', () => {
  const fallback = () => {};
  assert.equal(createSheetRenderer({ manifest: { sheets: {}, clips: {}, select: [] }, fallback }), fallback);
  assert.equal(createSheetRenderer({ manifest: null, fallback }), fallback);
});

test('renderer: if the body fails to paint, that frame is redrawn procedurally', () => {
  const src = `sheet${++uid}.png`;
  const manifest = {
    sheets: { s: { src, frameWidth: 96, frameHeight: 64, columns: 1, rows: 1 } },
    clips: { c: { sheet: 's', frames: [0] } },
    select: [{ when: {}, clip: 'c' }],
  };
  const seen = [];
  const fallback = (ctx, p, v, body) => {
    seen.push(!!body);
    if (body) throw new Error('boom');
  };
  const ctx = fakeContext(96, 64);
  const render = createSheetRenderer({ manifest, fallback });
  render(ctx, P({}), null);
  images[0].load(96, 64);
  assert.deepEqual(seen.slice(-2), [true, false]);
  render(ctx, P({}), null);
  assert.equal(seen.at(-1), false, 'the failing clip stays disabled');
});

/* ------------------------------------------------------------------ */
/* Playback and frame timing                                           */
/* ------------------------------------------------------------------ */

const frameX = (ctx) => shown(ctx).at(-1);

test('playback: frames advance on their own durations and loop', () => {
  const { render, ctx, image } = setup();
  render(ctx, P({ pose: 'stand', legs: 1 }), null);
  image().load(192, 64);
  assert.equal(frameX(ctx), 0);
  advance(99);
  assert.equal(frameX(ctx), 0);
  advance(2);
  assert.equal(frameX(ctx), 96);
  advance(300);
  assert.equal(frameX(ctx), 0, 'looped');
});

test('playback: the clock starts when the first frame is shown, not when requested', () => {
  const { render, ctx, image } = setup();
  render(ctx, P({ pose: 'stand', legs: 1 }), null);
  advance(5000); // still loading
  image().load(192, 64);
  assert.equal(frameX(ctx), 0);
  advance(90);
  assert.equal(frameX(ctx), 0);
});

test('playback: unrelated state changes do not restart the running clip', () => {
  const { render, ctx, image } = setup();
  render(ctx, P({ pose: 'stand', legs: 1 }), null);
  image().load(192, 64);
  advance(150);
  render(ctx, P({ pose: 'stand', legs: 1, gaze: 'l', eyes: 'closed' }), null);
  assert.equal(frameX(ctx), 96, 'still on frame 2');
});

test('playback: a one-shot ends, then follows next', () => {
  const { render, ctx, image } = setup();
  render(ctx, P({ pose: 'stand', legs: 3 }), null);
  image().load(192, 64);
  advance(100);
  assert.equal(frameX(ctx), 96);
  advance(150); // finished: `pose` (frame 1) takes over and stays
  assert.equal(frameX(ctx), 96);
  advance(5000);
  assert.equal(frameX(ctx), 96);
});

test('playback: redraw timers stop for a disconnected canvas and a still frame schedules none', () => {
  const { render, ctx, image } = setup();
  render(ctx, P({ pose: 'stand', legs: 1 }), null);
  image().load(192, 64);
  const n = ctx.calls.length;
  ctx.canvas.isConnected = false;
  advance(1000);
  assert.equal(ctx.calls.length, n, 'no redraw after detach');

  const s = setup();
  s.render(s.ctx, P({}), null);
  s.image().load(192, 64);
  const m = s.ctx.calls.length;
  advance(5000);
  assert.equal(s.ctx.calls.length, m, 'single-frame clip never redraws');
});

test('playback: reduced motion shows the still frame and schedules nothing', () => {
  globalThis.matchMedia = () => ({ matches: true });
  const { render, ctx, image } = setup({ clips: { walk: { sheet: 's', frames: [0, 1], ms: 100, still: 1 } } });
  render(ctx, P({ pose: 'stand', legs: 1 }), null);
  image().load(192, 64);
  assert.equal(frameX(ctx), 96);
  const n = ctx.calls.length;
  advance(2000);
  assert.equal(ctx.calls.length, n);
});

test('playback: redraws are flagged replay; direct renders are not', () => {
  const { render, ctx, image, calls } = setup();
  render(ctx, P({ pose: 'stand', legs: 1 }), null);
  assert.equal(calls.at(-1).p.replay, undefined);
  image().load(192, 64);
  assert.equal(calls.at(-1).p.replay, true);
});

/* ------------------------------------------------------------------ */
/* Scaling, placement and transparency                                 */
/* ------------------------------------------------------------------ */

test('painting: frames are blitted 1:1 with smoothing off, feet on the canvas bottom', () => {
  const { render, ctx, image } = setup();
  render(ctx, P({ pose: 'stand', legs: 1 }), null);
  image().load(192, 64);
  const blit = ctx.calls.filter((c) => c[0] === 'drawImage').at(-1);
  const [, , sx, sy, sw, sh, dx, dy, dw, dh] = blit;
  assert.deepEqual([sw, sh], [dw, dh], 'no scaling');
  assert.deepEqual([sx, sy, sw, sh], [0, 0, 96, 64]);
  assert.deepEqual([dx, dy], [0, 0], '96 x 64 frame on a 96 x 64 canvas');
  assert.equal(ctx.imageSmoothingEnabled, false);
});

test('painting: a larger canvas centres the frame on the bottom edge', () => {
  const { render, image } = setup();
  const ctx = fakeContext(120, 80);
  render(ctx, P({ pose: 'stand', legs: 1 }), null);
  image().load(192, 64);
  const [, , , , , , dx, dy] = ctx.calls.filter((c) => c[0] === 'drawImage').at(-1);
  assert.deepEqual([dx, dy], [12, 16]);
});

test('transparency: the lit silhouette covers only opaque pixels', () => {
  // opaque square at x 40..47, y 40..47; everything else transparent
  const alpha = (x, y) => (x >= 40 && x < 48 && y >= 40 && y < 48 ? 255 : 0);
  globalThis.document = { createElement: () => ({ getContext: () => fakeContext(96, 64, alpha) }) };
  const { render, ctx, image } = setup();
  render(ctx, P({ pose: 'stand', legs: 1 }), null);
  image().load(192, 64);
  const lit = ctx.calls.filter((c) => c[0] === 'fillRect');
  assert.ok(lit.length > 0, 'edges are rim lit');
  for (const [, x, y] of lit) assert.ok(x >= 40 && x < 48 && y >= 40 && y < 48, `rim pixel ${x},${y} outside the sprite`);
});

test('transparency: a baked-lighting clip adds no rim light', () => {
  const { render, ctx, image } = setup();
  render(ctx, P({}), null); // `pose` clip is lighting: baked
  image().load(192, 64);
  assert.equal(ctx.calls.filter((c) => c[0] === 'fillRect').length, 0);
});

/* ------------------------------------------------------------------ */
/* Shipped sheets                                                      */
/* ------------------------------------------------------------------ */

test('shipped sheets: hard alpha, <= 32 colours, dimensions match the frame grid', () => {
  const man = normalizeManifest(SHEET_MANIFEST);
  let checked = 0;
  for (const sheet of Object.values(man.sheets)) {
    const file = join(HERE, 'sheets', sheet.src.split('/').pop());
    const img = decodePng(readFileSync(file));
    assert.equal(img.width, sheet.columns * sheet.frameWidth, `${sheet.id} width`);
    assert.equal(img.height, sheet.rows * sheet.frameHeight, `${sheet.id} height`);
    const colours = new Set();
    for (let i = 0; i < img.rgba.length; i += 4) {
      const a = img.rgba[i + 3];
      assert.ok(a === 0 || a === 255, `${sheet.id}: partial alpha ${a}`);
      if (a) colours.add((img.rgba[i] << 16) | (img.rgba[i + 1] << 8) | img.rgba[i + 2]);
    }
    assert.ok(colours.size <= 32, `${sheet.id}: ${colours.size} colours`);
    checked++;
  }
  assert.equal(checked, readdirSync(join(HERE, 'sheets')).filter((f) => f.endsWith('.png')).length, 'every sheet file is registered');
});

test('shipped manifest: every clip loops through frameAt without gaps', () => {
  const man = normalizeManifest(SHEET_MANIFEST);
  for (const clip of Object.values(man.clips)) {
    let last = null;
    for (let t = 0; t < clip.total * 2; t += 10) {
      const f = frameAt(clip, t);
      assert.ok(f.index >= 0 && f.index < clip.frames.length, `${clip.id} @${t}`);
      last = f;
    }
    assert.ok(last);
    if (clip.next) assert.ok(Object.hasOwn(man.clips, clip.next), `${clip.id}.next -> ${clip.next}`);
  }
  assert.ok(selectClip(man, { pose: 'sit', view: 'front', legs: 0 }));
});

/* ------------------------------------------------------------------ */
/* Manifest hardening                                                  */
/* ------------------------------------------------------------------ */

test('manifest: a clip whose next names no clip (or an inherited key) is made safe', () => {
  for (const next of ['nope', 'constructor', 'toString']) {
    const m = normalizeManifest({
      sheets: { s: { src: 'a.png', frameWidth: 2, frameHeight: 2, columns: 1, rows: 1 } },
      clips: { a: { sheet: 's', frames: [0], loop: false, next } },
      select: [{ when: {}, clip: 'a' }],
    });
    assert.equal(m.clips.a.next, null, next);
  }
});

test('manifest: inherited names cannot stand in for sheets or clips', () => {
  const m = normalizeManifest({
    sheets: { s: { src: 'a.png', frameWidth: 2, frameHeight: 2, columns: 1, rows: 1 } },
    clips: { a: { sheet: 'constructor', frames: [0] }, b: { sheet: 's', frames: [0] } },
    select: [{ when: {}, clip: 'toString' }, { when: {}, clip: 'b' }],
  });
  assert.deepEqual(Object.keys(m.clips), ['b']);
  assert.equal(m.select.length, 1);
});
