import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { BEHAVIORS } from '../behaviors/index.js';
import { ANIMATIONS } from '../animations.js';
import { createAnimationRegistry } from '../../core/animations.js';
import { buildBehaviorSet } from '../../core/behaviors.js';
import { makeScript } from '../../core/toolkit.js';
import { createWorld } from '../../core/space.js';
import { createRng } from '../../core/rng.js';
import { normalizeManifest, selectClip, holdState } from './clips.js';
import { SHEET_MANIFEST } from './manifest.js';
import { createSheetRenderer } from './renderer.js';
import { transitionPlan } from './tail.js';
import { ANCHORS } from './anchors.js';

/*
 * Grooming, curled-up sleeping and stretching, played through complete cycles: the real behaviors' scripts, the real manifest,
 * the real renderer on a fake canvas. What is checked is what the cat shows: which art, how often it changes, that it breathes,
 * and that the crown and the chest coin stay anchored to it.
 */

const man = normalizeManifest(SHEET_MANIFEST);
const anims = createAnimationRegistry(ANIMATIONS);
const set = buildBehaviorSet(BEHAVIORS, {}, () => true);
const geo = createWorld({}).makeGeo({ width: 1280, height: 800, spriteW: 384, spriteH: 256 }, false);

const BASE = { sx: 100, sy: 100, z: 0, facing: 1, view: 'front', pose: 'sit', gaze: 'c', eyes: 'open', mouth: 'idle', legs: 0, lean: 0, cue: null, item: null, book: null, crown: 0, crownLift: 0, coin: null, droop: 0, glitch: 0, pawL: null, pawR: null, ears: null, tail: null, focus: null, pupils: null, bookPaw: null, bookShift: 0, fx: {}, props: {}, mood: 'content' };

// the beats of one run of a behavior (what the scheduler would play), with a given seed
function script(id, seed, facing = seed % 2 ? 1 : -1) {
  const b = set.find((x) => x.id === id);
  const view = { ...BASE, facing };
  const c = { rng: createRng(seed * 7919), cur: view, reduced: false, compact: false, mood: 'content', has: () => true, memory: {}, geo, pet: { sprite: { width: 96, height: 64 } }, pickSpot: () => ({ sx: 100, sy: 100, z: 0 }), apply: () => {} };
  const S = makeScript(c, anims);
  if (b.enter) b.enter(c);
  const end = b.plan(c, S);
  const beats = S.beats
    .sort((a, z) => a.t - z.t)
    .map(({ t, patch }) => {
      const { propOps, fxOps, ...rest } = patch;
      return { t, patch: rest };
    });
  return { end, beats, base: view };
}

/* ---- fakes (as in runtime.test.mjs) ------------------------------------------------------------------------------------ */

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
    fillRect: (...a) => calls.push(['fillRect', ...a]),
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

beforeEach(() => {
  now = 0;
  images = [];
  warnings = [];
  console.warn = (...m) => warnings.push(m.map(String).join(' '));
  globalThis.Image = FakeImage;
  globalThis.ImageData = class { constructor(data, width, height) { Object.assign(this, { data, width, height }); } };
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => fakeContext(96, 64) }) };
  Object.defineProperty(globalThis, 'performance', { value: { now: () => now }, configurable: true, writable: true });
  mock.timers.enable({ apis: ['setTimeout'] });
});

afterEach(() => {
  mock.timers.reset();
  console.warn = realWarn;
  delete globalThis.Image;
  delete globalThis.ImageData;
  delete globalThis.document;
  delete globalThis.matchMedia;
  Object.defineProperty(globalThis, 'performance', realPerf);
});

/*
 * Plays a script through the real renderer, one sample per 50 ms: the clip on screen, the anchors the body reported (where the
 * vanity items go), and the blits (to see a breath). The sheets are ready from the start.
 */
function play(sc, { tail = 800 } = {}) {
  const anchors = [];
  const fallback = (ctx, p, v, body) => {
    if (!body) return;
    const r = body.paint(ctx, { light: 1, face: { kind: 'open', pupil: 2, gaze: 'c', focusX: undefined, stressed: false }, ox: 0, oy: 0, hx: 0, hy: 0, grid: [] });
    anchors.push(r && r.anchor ? r.anchor : null);
  };
  const render = createSheetRenderer({ manifest: SHEET_MANIFEST, fallback });
  for (const img of images) {
    const sheet = Object.values(man.sheets).find((s) => s.src === img.src);
    img.naturalWidth = sheet.columns * sheet.frameWidth;
    img.naturalHeight = sheet.rows * sheet.frameHeight;
    img.onload();
  }
  const ctx = fakeContext(96, 64);
  const v = { ...sc.base };
  const t0 = 100000;
  const samples = [];
  let bi = 0;
  for (let t = 0; t <= sc.end + tail; t += 50) {
    while (bi < sc.beats.length && sc.beats[bi].t <= t) Object.assign(v, sc.beats[bi++].patch);
    now = t0 + t;
    ctx.calls.length = 0;
    anchors.length = 0;
    render(ctx, { ...v, frame: Math.floor(t / 700), light: 1 }, undefined);
    const blits = ctx.calls.filter((c) => c[0] === 'drawImage' && c.length === 10);
    samples.push({ t, clip: render.clipOf(ctx), state: { ...v }, anchor: anchors[anchors.length - 1] ?? null, split: blits.filter((c) => c[5] === 50).length });
    mock.timers.tick(50);
  }
  assert.deepEqual(warnings.filter((w) => /nomoz sheets/.test(w)), [], 'a clip was disabled');
  return samples;
}

// consecutive runs of the same clip: [[clip, ms], ...]
const runs = (samples) => {
  const out = [];
  for (const s of samples) {
    if (out.length && out.at(-1)[0] === s.clip) out.at(-1)[1] += 50;
    else out.push([s.clip, 50]);
  }
  return out;
};

// the manifest as it was: grooming art only for one paw at 'mid' / 'high' with the other down
const OLD = (() => {
  const i = man.select.findIndex((r) => r.clip === 'sit_groom');
  const rest = man.select.filter((r) => r.clip !== 'sit_groom');
  const oldRules = [
    { when: { pose: 'sit', view: 'front', pawL: ['mid', 'high'], pawR: false }, clip: 'sit_groom' },
    { when: { pose: 'sit', view: 'front', pawR: ['mid', 'high'], pawL: false }, clip: 'sit_groom' },
  ];
  return { ...man, select: [...rest.slice(0, i), ...oldRules, ...rest.slice(i)] };
})();

/* ---- grooming ---------------------------------------------------------------------------------------------------- */

test('grooming: any raised paw of a grooming move selects the grooming art, whatever the eyes, droop, gaze or lean are doing', () => {
  const sel = (o) => selectClip(man, { ...BASE, ...o }).id;
  for (const eyes of ['open', 'closed', 'down', 'blink', 'happy']) {
    for (const droop of [0, 1]) {
      for (const paw of ['mid', 'high', 'face', 'ear', 'front']) {
        assert.equal(sel({ pawL: paw, eyes, droop, lean: 1, gaze: 'l' }), 'sit_groom', `left ${paw} ${eyes} ${droop}`);
        assert.equal(sel({ pawR: paw, eyes, droop, ears: 'back' }), 'sit_groom', `right ${paw} ${eyes} ${droop}`);
      }
      for (const [l, r] of [['high', 'high'], ['face', 'high'], ['high', 'face']]) assert.equal(sel({ pawL: l, pawR: r, eyes, droop }), 'sit_groom', `washing ${l}/${r}`);
    }
  }
});

test('grooming: other gestures keep the art they always had (casting and brewing hold both paws out)', () => {
  const sel = (o) => selectClip(man, { ...BASE, ...o }).id;
  assert.equal(sel({ pawL: 'front', pawR: 'front' }), 'idle_front');
  assert.equal(sel({ pawL: 'mid', pawR: 'mid' }), 'idle_front');
  assert.equal(sel({ pawL: 'front', pawR: 'mid' }), 'idle_front');
  assert.equal(sel({ pawL: 'up' }), 'idle_front');
  assert.equal(sel({ pawR: 'low' }), 'idle_front');
  assert.equal(sel({ pawL: 'reach' }), 'idle_front');
  assert.equal(sel({ eyes: 'closed', droop: 1 }), 'sit_doze');
  // blinks, closed and happy eyes are drawn live on the sitting art: the head never swaps to another frame for them
  for (const eyes of ['blink', 'closed', 'happy']) assert.equal(sel({ eyes }), 'idle_front', eyes);
  assert.equal(sel({ pose: 'stand', view: 'front', legs: 1, pawL: 'high' }), 'walk_front', 'standing, a paw does not change the art');
});

test('grooming: the bridge between two moves keeps the art, ends on time, and lets a blink or a shake take over at once', () => {
  const g = man.clips.sit_groom;
  const idle = man.clips.idle_front;
  assert.ok(g.hold && g.hold.to.includes('idle_front'));
  let s = holdState(g, idle, null, 1000);
  assert.deepEqual([s.keep, s.wait], [true, 560]);
  s = holdState(g, idle, s.pending, 1300);
  assert.deepEqual([s.keep, s.wait], [true, 260]);
  s = holdState(g, idle, s.pending, 1560);
  assert.equal(s.keep, false, 'the bridge is over');
  // wanted back to the grooming art: nothing is pending any more
  assert.equal(holdState(g, g, { since: 1000 }, 1100).pending, null);
  // a blink, the dozing art or the settled pose are not bridged
  for (const id of ['sit_doze', 'walk_front']) assert.equal(holdState(g, man.clips[id], null, 0).keep, false, id);
  // other clips have no bridge
  assert.equal(holdState(idle, g, null, 0).keep, false);
});

test('grooming: a whole routine keeps one art through its moves instead of flipping between several every few hundred ms', () => {
  let before = 0;
  let after = 0;
  let boundaries = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const sc = script('groom', seed);
    // what the same states showed with the old selection rules (a paw at 'mid' / 'high' and the other down, nothing else)
    const v = { ...sc.base };
    const naive = [];
    for (let t = 0, bi = 0; t <= sc.end; t += 50) {
      while (bi < sc.beats.length && sc.beats[bi].t <= t) Object.assign(v, sc.beats[bi++].patch);
      naive.push({ clip: selectClip(OLD, v).id });
    }
    const flips = (r) => r.filter(([, ms], i) => i > 0 && i < r.length - 1 && ms < 600).length;
    const cut = (arr) => arr.reduce((o, s) => (o.length && o.at(-1)[0] === s.clip ? (o.at(-1)[1] += 50, o) : [...o, [s.clip, 50]]), []);
    before += flips(cut(naive));
    const played = runs(play(sc));
    after += flips(played);
    boundaries += played.filter(([c]) => c === 'sit_groom').length;
    // between its first and its last grooming sample the cat never shows the dozing art
    const names = played.map(([c]) => c);
    const first = names.indexOf('sit_groom');
    const last = names.lastIndexOf('sit_groom');
    assert.ok(!names.slice(first, last + 1).includes('sit_doze'), `seed ${seed}: dozed in the middle of grooming: ${names.join(' ')}`);
  }
  assert.ok(before >= 60, `the unbridged script flipped only ${before} times (the check has lost its teeth)`);
  assert.ok(after <= before * 0.2, `${after} short swaps in 12 routines, ${before} without the fix`);
  assert.ok(after <= 12 * 3, `${after} short swaps in 12 routines`);
  assert.ok(boundaries >= 12);
});

test('grooming: it does not hold the grooming art after the routine is over', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const sc = script('groom', seed);
    const samples = play(sc, { tail: 2000 });
    const lastRaised = samples.filter((s) => s.state.pawL || s.state.pawR).at(-1);
    const stillGroom = samples.filter((s) => s.t > lastRaised.t && s.clip === 'sit_groom').length * 50;
    assert.ok(stillGroom <= 650, `seed ${seed}: ${stillGroom} ms of grooming art after the paws came down for good`);
    assert.notEqual(samples.at(-1).clip, 'sit_groom');
  }
});

/* ---- curled-up sleeping ------------------------------------------------------------------------------------------ */

// seeds whose sleep ends curled up
const curlSeeds = [];
for (let seed = 1; seed <= 80 && curlSeeds.length < 6; seed++) if (script('sleep', seed).beats.some((b) => b.patch.pose === 'curl')) curlSeeds.push(seed);

test('curled sleeping: the sleep scripts used here do curl up (the checks below have something to check)', () => {
  assert.ok(curlSeeds.length >= 5, `${curlSeeds.length} seeds`);
});

test('curled sleeping: it breathes (the upper body rises and falls a row), steadily, for as long as it sleeps', () => {
  assert.deepEqual(man.clips.curl.breathe, { cut: 50, ms: 4200 });
  for (const seed of curlSeeds.slice(0, 3)) {
    const samples = play(script('sleep', seed));
    const inCurl = samples.filter((s) => s.clip === 'curl');
    assert.ok(inCurl.length >= 100, `seed ${seed}: only ${inCurl.length} samples curled`);
    // a breath is the two-blit draw (the art above the cut dropped a row): present, and absent, in alternation, about every 4.2 s
    const breaths = inCurl.map((s) => s.split > 0);
    const edges = breaths.filter((b, i) => i && b !== breaths[i - 1]).length;
    const seconds = (inCurl.length * 50) / 1000;
    assert.ok(breaths.some(Boolean) && !breaths.every(Boolean), `seed ${seed}: it never breathes`);
    assert.ok(edges >= Math.floor(seconds / 4.2) * 2 - 2, `seed ${seed}: ${edges} breath changes in ${seconds} s`);
    assert.ok(edges <= (seconds / 4.2) * 2 + 4, `seed ${seed}: ${edges} breath changes in ${seconds} s (twitching)`);
  }
});

test('curled sleeping: every change of pose around sleep is an intentional beat (settle / rise), never a bare cut between sleeping poses', () => {
  const LIE = /^(curl|loaf_front|low_front)$/;
  for (const seed of curlSeeds) {
    const names = runs(play(script('sleep', seed))).map(([c]) => c);
    for (let i = 1; i < names.length; i++) {
      if (!LIE.test(names[i]) && !LIE.test(names[i - 1])) continue;
      assert.ok(transitionPlan(names[i - 1], names[i]), `seed ${seed}: a bare cut ${names[i - 1]} -> ${names[i]}`);
    }
  }
  assert.ok(transitionPlan('curl', 'loaf_front') && transitionPlan('loaf_front', 'curl'), 'turning over settles');
});

test('curled sleeping: turning over is one change (the lift and the turn together), not a lift, a mirror flip and a settle', () => {
  for (const seed of curlSeeds) {
    const sc = script('sleep', seed);
    let prev = sc.base.facing;
    let pose = sc.base.pose;
    for (const { patch } of sc.beats) {
      if ('facing' in patch && patch.facing !== prev) {
        if (!('pose' in patch) && !('legs' in patch)) assert.fail(`seed ${seed}: the cat was mirrored in place while asleep (${JSON.stringify(patch)}) when pose was ${pose}`);
        prev = patch.facing;
      }
      if ('pose' in patch) pose = patch.pose;
    }
  }
});

test('curled sleeping: no run of the sleep shows a sleeping pose for a fraction of a second between others (no twitching)', () => {
  for (const seed of curlSeeds) {
    const r = runs(play(script('sleep', seed)));
    r.forEach(([c, ms], i) => {
      if (/^(curl|loaf_front)$/.test(c) && i > 0 && i < r.length - 1) assert.ok(ms >= 600, `seed ${seed}: ${c} for ${ms} ms between ${r[i - 1][0]} and ${r[i + 1][0]}`);
    });
  }
});

/* ---- stretching -------------------------------------------------------------------------------------------------- */

test('stretching: the stretch art has measured crown and chest anchors, and they sit on the head and under it', () => {
  const a = ANCHORS.stretch[0];
  assert.deepEqual(a.crown, [19, 35]);
  assert.deepEqual(a.chest, [21, 42]);
  // the ear tips are at row 32 (x 18-19 and 27-28): the crown is between them, three rows below
  assert.equal(a.crown[1], 32 + 3);
  assert.ok(a.crown[0] >= 18 && a.crown[0] + 8 <= 29 + 1);
  assert.ok(a.chest[1] > a.crown[1] + 4, 'the coin is under the crown');
});

test('stretching: through complete stretch cycles the crown and the chest coin are anchored on every sample, entering, holding and leaving', () => {
  let stretching = 0;
  for (let seed = 1; seed <= 6; seed++) {
    for (const id of ['stretch', 'sleep']) {
      const samples = play(script(id, seed));
      samples.forEach((s, i) => {
        // from the beat before the pose changes to the stretch to the beat after it is left (the squash beats at each end)
        const near = [samples[i - 2], samples[i - 1], s, samples[i + 1], samples[i + 2]].some((x) => x && x.state.pose === 'stretch');
        if (!near) return;
        stretching++;
        assert.ok(s.anchor, `seed ${seed} ${id} t=${s.t}: no anchors`);
        assert.ok(s.anchor.hx > -50, `seed ${seed} ${id} t=${s.t}: no crown (${s.clip})`);
        assert.ok(s.anchor.chest, `seed ${seed} ${id} t=${s.t}: no chest coin (${s.clip})`);
      });
    }
  }
  assert.ok(stretching > 300, `${stretching} samples near a stretch`);
});

test('stretching: the anchors follow the squash beats at each end (they move with the body, not off it)', () => {
  const sc = script('stretch', 3);
  const samples = play(sc);
  const first = samples.findIndex((s) => s.state.pose === 'stretch');
  const entering = samples.slice(Math.max(0, first - 3), first + 1);
  const hold = samples.find((s) => s.clip === 'stretch');
  assert.ok(entering.every((s) => s.anchor && s.anchor.chest));
  const leaving = samples.slice(samples.findIndex((s, i) => i > first && s.state.pose === 'sit'));
  assert.ok(leaving.slice(0, 6).every((s) => s.anchor && s.anchor.chest), 'leaving');
  assert.ok(hold.anchor.hy === 35 - 3 && hold.anchor.hx === 19 - 12, 'on the stretch art the crown slot is the measured one');
});
