import { mock } from 'node:test';
import assert from 'node:assert/strict';

import { BEHAVIORS } from '../behaviors/index.js';
import { ANIMATIONS } from '../animations.js';
import { createAnimationRegistry } from '../../core/animations.js';
import { buildBehaviorSet } from '../../core/behaviors.js';
import { makeScript } from '../../core/toolkit.js';
import { createWorld } from '../../core/space.js';
import { createRng } from '../../core/rng.js';
import { normalizeManifest } from './clips.js';
import { SHEET_MANIFEST } from './manifest.js';
import { createSheetRenderer } from './renderer.js';

/*
 * Test kit: the real behaviors' scripts played through the real sheet renderer on a fake canvas (no browser), one sample per step.
 * Call installFakes() in beforeEach and removeFakes() in afterEach.
 */

export const man = normalizeManifest(SHEET_MANIFEST);
export const anims = createAnimationRegistry(ANIMATIONS);
export const set = buildBehaviorSet(BEHAVIORS, {}, () => true);
const geo = createWorld({}).makeGeo({ width: 1280, height: 800, spriteW: 384, spriteH: 256 }, false);
export const BASE = { sx: 100, sy: 100, z: 0, facing: 1, view: 'front', pose: 'sit', gaze: 'c', eyes: 'open', mouth: 'idle', legs: 0, lean: 0, cue: null, item: null, book: null, crown: 0, crownLift: 0, coin: null, droop: 0, glitch: 0, pawL: null, pawR: null, ears: null, tail: null, focus: null, pupils: null, bookPaw: null, bookShift: 0, fx: {}, props: {}, mood: 'content' };

let now = 0;
let images = [];
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
}

function fakeContext(width, height) {
  const calls = [];
  return {
    calls,
    imageSmoothingEnabled: true,
    fillStyle: '',
    drawImage: (...a) => calls.push(['drawImage', ...a]),
    fillRect: () => {},
    clearRect: () => {},
    putImageData: () => {},
    getImageData: (x, y, w, h) => {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let i = 3; i < data.length; i += 4) data[i] = 255;
      return { data };
    },
    canvas: { width, height, isConnected: true },
  };
}

export function installFakes() {
  now = 0;
  images = [];
  warnings = [];
  console.warn = (...m) => warnings.push(m.map(String).join(' '));
  globalThis.Image = FakeImage;
  globalThis.ImageData = class {
    constructor(data, width, height) {
      Object.assign(this, { data, width, height });
    }
  };
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => fakeContext(96, 64) }) };
  Object.defineProperty(globalThis, 'performance', { value: { now: () => now }, configurable: true, writable: true });
  mock.timers.enable({ apis: ['setTimeout'] });
}

export function removeFakes() {
  mock.timers.reset();
  console.warn = realWarn;
  delete globalThis.Image;
  delete globalThis.ImageData;
  delete globalThis.document;
  Object.defineProperty(globalThis, 'performance', realPerf);
}

// plays a list of [t, patch] over a base state through the real renderer; per sample: the clip, the anchors reported, and the
// state
export function drive(beats, end, base = {}, step = 50) {
  const reports = [];
  const fallback = (ctx, p, v, body) => {
    if (!body) return;
    const r = body.paint(ctx, { light: 1, face: { kind: 'open', pupil: 2, gaze: 'c', focusX: undefined, stressed: false }, ox: 0, oy: 0, hx: 0, hy: 0, grid: [] });
    reports.push(r && r.anchor ? r.anchor : null);
  };
  const render = createSheetRenderer({ manifest: SHEET_MANIFEST, fallback });
  for (const img of images) {
    const sheet = Object.values(man.sheets).find((s) => s.src === img.src);
    img.naturalWidth = sheet.columns * sheet.frameWidth;
    img.naturalHeight = sheet.rows * sheet.frameHeight;
    img.onload();
  }
  const ctx = fakeContext(96, 64);
  const v = { ...BASE, ...base };
  let bi = 0;
  const samples = [];
  for (let t = 0; t <= end; t += step) {
    while (bi < beats.length && beats[bi].t <= t) Object.assign(v, beats[bi++].patch);
    now = 100000 + t;
    ctx.calls.length = 0;
    reports.length = 0;
    render(ctx, { ...v, frame: Math.floor(t / 700), light: 1 }, undefined);
    samples.push({ t, clip: render.clipOf(ctx), anchor: reports.at(-1) ?? null, state: { ...v } });
    mock.timers.tick(step);
  }
  assert.deepEqual(warnings.filter((w) => /nomoz sheets/.test(w)), [], 'a clip was disabled');
  return samples;
}

export function script(id, seed) {
  const b = set.find((x) => x.id === id);
  const view = { ...BASE, facing: seed % 2 ? 1 : -1 };
  const c = { rng: createRng(seed * 7919), cur: view, reduced: false, compact: false, mood: 'content', has: () => true, memory: {}, geo, pet: { sprite: { width: 96, height: 64 } }, pickSpot: () => ({ sx: 100, sy: 100, z: 0 }), apply: () => {} };
  const S = makeScript(c, anims);
  if (b.enter) b.enter(c);
  const end = b.plan(c, S);
  return { end, view, beats: S.beats.sort((a, z) => a.t - z.t).map(({ t, patch }) => ({ t, patch: Object.fromEntries(Object.entries(patch).filter(([k]) => k !== 'propOps' && k !== 'fxOps')) })) };
}

