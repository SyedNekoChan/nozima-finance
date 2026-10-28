import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import pet from './index.js';
import { SCHEDULER } from '../config.js';
import { PetScheduler } from '../core/scheduler.js';
import { compressBeats, makeScript } from '../core/toolkit.js';
import { createRng } from '../core/rng.js';

const REST = { view: 'front', pose: 'sit', gaze: 'c', eyes: 'open', mouth: 'idle', legs: 0, lean: 0, cue: null, item: null, book: null, crown: 0, crownLift: 0, coin: null, droop: 0, glitch: 0, fade: 1, pawL: null, pawR: null, ears: null, tail: null, focus: null, pupils: null, bookPaw: null, bookShift: 0, fx: {}, props: {} };
const mergeOps = (base, ops) => {
  const out = { ...base };
  for (const [id, spec] of ops) {
    if (spec === null) delete out[id];
    else out[id] = { ...out[id], ...spec };
  }
  return out;
};
const merge = (cur, patch) => {
  let next = patch;
  if (patch.propOps || patch.fxOps) {
    const { propOps, fxOps, ...rest } = patch;
    next = rest;
    if (propOps) next.props = mergeOps(rest.props ?? cur.props, propOps);
    if (fxOps) next.fx = mergeOps(rest.fx ?? cur.fx, fxOps);
  }
  return { ...cur, ...next };
};

/* ---------------- fixtures: a real scheduler on a fake clock ---------------- */

let now = 0;
const realPerf = Object.getOwnPropertyDescriptor(globalThis, 'performance');
beforeEach(() => {
  now = 0;
  Object.defineProperty(globalThis, 'performance', { value: { now: () => now }, configurable: true, writable: true });
  mock.timers.enable({ apis: ['setTimeout'] });
});
afterEach(() => {
  mock.timers.reset();
  Object.defineProperty(globalThis, 'performance', realPerf);
});

// Runs one behavior to completion through PetScheduler. Returns when each
// patch was applied (ms), when the behavior finished, and the final view.
function runBehavior(id, { reduced, seed = 3, mood = 'idle' }) {
  const geo = pet.world.makeGeo({ width: 1000, height: 700, spriteW: pet.sprite.width, spriteH: pet.sprite.height }, false);
  const rng = createRng(seed);
  let cur = { ...REST, sx: null, sy: null, z: 0, facing: 1, transitionMs: 0, ...pet.world.pickSpot(geo, rng, {}) };
  const applied = [];
  const t0 = now;
  const apply = (p) => {
    cur = merge(cur, p);
    applied.push({ t: now - t0, patch: p });
  };
  const ctx = () => ({ rng, pet, mood: sch.mood, compact: false, reduced: sch.reduced, geo, memory: {}, has: pet.hasCapability, get cur() { return cur; }, pickSpot: (o) => pet.world.pickSpot(geo, rng, o), apply });
  const sch = new PetScheduler({ key: `t-${id}-${seed}-${reduced}`, rng, mood, reduced, compact: false, behaviors: pet.behaviors, animations: pet.animations, getCtx: ctx, apply, resetPatch: REST });
  sch.next(id);
  const started = applied.length;
  let steps = 0;
  while (sch.last !== id && steps++ < 10000) {
    now += 10;
    mock.timers.tick(10);
    if (sch.current === null && sch.last !== id) break;
  }
  const finishedAt = now - t0;
  sch.stop();
  return { applied: applied.slice(0, applied.length), started, finishedAt, final: cur, done: sch.last === id, sch };
}

// representative multi-beat behaviors that run without moving
const REPRESENTATIVE = ['groom', 'sleep', 'lookUp', 'ponderSymbol', 'read'];
const stationary = () => REPRESENTATIVE.filter((id) => pet.behaviors.find((b) => b.id === id && !b.moves));

test('normal motion: beats and completion keep their planned times exactly', () => {
  for (const id of stationary()) {
    const b = pet.behaviors.find((x) => x.id === id);
    // the plan the scheduler will see (same seed, same context)
    const geo = pet.world.makeGeo({ width: 1000, height: 700, spriteW: pet.sprite.width, spriteH: pet.sprite.height }, false);
    const rng = createRng(3);
    let cur = { ...REST, sx: null, sy: null, z: 0, facing: 1, transitionMs: 0, ...pet.world.pickSpot(geo, rng, {}) };
    const c = { rng, pet, mood: 'idle', compact: false, reduced: false, geo, memory: {}, has: pet.hasCapability, get cur() { return cur; }, pickSpot: (o) => pet.world.pickSpot(geo, rng, o), apply: (p) => (cur = merge(cur, p)) };
    const S = makeScript(c, pet.animations);
    b.enter?.(c);
    const planned = b.plan(c, S);
    const run = runBehavior(id, { reduced: false });
    assert.ok(run.done, `${id} completes`);
    const times = S.beats.sort((a, z) => a.t - z.t).map((x) => x.t);
    const got = run.applied.slice(0, times.length).map((x) => x.t);
    got.forEach((t, i) => assert.ok(Math.abs(t - times[i]) <= 20, `${id}: beat ${i} at ${t} ms, planned ${times[i]}`));
    assert.ok(Math.abs(run.finishedAt - Math.max(planned, SCHEDULER.minBehaviorMs)) <= 30, `${id}: finished ${run.finishedAt}, planned ${planned}`);
  }
});

function planOf(id, reduced, seed) {
  const b = pet.behaviors.find((x) => x.id === id);
  const geo = pet.world.makeGeo({ width: 1000, height: 700, spriteW: pet.sprite.width, spriteH: pet.sprite.height }, false);
  const rng = createRng(seed);
  let cur = { ...REST, sx: null, sy: null, z: 0, facing: 1, transitionMs: 0, ...pet.world.pickSpot(geo, rng, {}) };
  const c = { rng, pet, mood: 'idle', compact: false, reduced, geo, memory: {}, has: pet.hasCapability, get cur() { return cur; }, pickSpot: (o) => pet.world.pickSpot(geo, rng, o), apply: (p) => (cur = merge(cur, p)) };
  const S = makeScript(c, pet.animations);
  b.enter?.(c);
  const planned = b.plan(c, S);
  return { planned, beats: S.beats.length };
}

test('reduced motion: representative behaviors play at the reduced factor, finish, and end in the same posture', () => {
  const rows = [];
  const posture = (v) => Object.fromEntries(Object.keys(REST).map((k) => [k, v[k]]));
  for (const id of stationary()) {
    for (const seed of [3, 4, 5]) {
      const n = runBehavior(id, { reduced: false, seed });
      const r = runBehavior(id, { reduced: true, seed });
      assert.ok(n.done && r.done, `${id} seed ${seed} completes in both modes`);
      const plan = planOf(id, true, seed); // plans may branch on c.reduced, so compare each run with its own plan
      const want = Math.max(plan.planned * SCHEDULER.reducedDurationFactor, SCHEDULER.minBehaviorMs);
      assert.ok(Math.abs(r.finishedAt - want) <= 30, `${id}: reduced run took ${r.finishedAt} ms, expected ${Math.round(want)}`);
      assert.ok(r.finishedAt <= plan.planned || plan.planned < SCHEDULER.minBehaviorMs, `${id}: reduced is not shorter than its own plan`);
      assert.ok(r.applied.length <= plan.beats + 1, `${id}: more steps than beats`);
      assert.deepEqual(posture(r.final), posture(n.final), `${id}: final posture differs`);
      rows.push({ id, seed, normalMs: n.finishedAt, reducedMs: r.finishedAt, normalSteps: n.applied.length, reducedSteps: r.applied.length });
    }
  }
  const sum = (k) => rows.reduce((t, x) => t + x[k], 0);
  assert.ok(sum('reducedMs') < sum('normalMs') * 0.7, `reduced ${sum('reducedMs')} ms vs normal ${sum('normalMs')} ms overall`);
  assert.ok(sum('reducedSteps') < sum('normalSteps'), 'reduced motion should apply fewer steps overall');
  if (process.env.SHOW_TIMING) console.table(rows);
});

test('reduced motion: every behavior that can run keeps its final state and valid values', () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (const b of pet.behaviors) {
      if (b.moves || !(b.moods.includes('idle') || b.weights?.idle > 0)) continue;
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const geo = pet.world.makeGeo({ width: 1000, height: 700, spriteW: pet.sprite.width, spriteH: pet.sprite.height }, seed % 2 === 0);
        const rng = createRng(seed * 31 + b.id.length);
        let cur = { ...REST, sx: null, sy: null, z: 0, facing: 1, transitionMs: 0, ...pet.world.pickSpot(geo, rng, {}) };
        const c = { rng, pet, mood: 'idle', compact: geo.compact, reduced: true, geo, memory: {}, has: pet.hasCapability, get cur() { return cur; }, pickSpot: (o) => pet.world.pickSpot(geo, rng, o), apply: (p) => (cur = merge(cur, p)) };
        if (b.eligible && !b.eligible(c)) continue;
        const S = makeScript(c, pet.animations);
        b.enter?.(c);
        b.plan(c, S);
        const beats = S.beats.sort((a, z) => a.t - z.t);
        const full = beats.reduce((v, x) => merge(v, x.patch), cur);
        const folded = compressBeats(beats, SCHEDULER.reducedDurationFactor, SCHEDULER.reducedBeatSlotMs).reduce((v, x) => merge(v, x.patch), cur);
        assert.deepEqual(folded, full, `${b.id} seed ${seed}: compressing beats changed the final view`);
      }
    }
  } finally {
    console.warn = warn;
  }
});

test('compressBeats: scales time, folds close beats in order, keeps overlay-operation order', () => {
  const beats = [
    { t: 0, patch: { eyes: 'blink' } },
    { t: 140, patch: { eyes: 'open' } },
    { t: 1000, patch: { fxOps: [['a', { kind: 'orb' }]] } },
    { t: 1100, patch: { fxOps: [['a', null]], gaze: 'l' } },
    { t: 1200, patch: { fx: {}, fxOps: [['b', { kind: 'rune' }]] } },
    { t: 4000, patch: { pose: 'sit' } },
  ];
  const out = compressBeats(beats, 0.5, 150);
  assert.deepEqual(out.map((x) => x.t), [0, 500, 600, 2000]);
  assert.deepEqual(out[0].patch, { eyes: 'open' }); // the blink never shows
  assert.equal(out[1].patch.gaze, 'l'); // 1000 and 1100 fall in one slot
  const view = out.reduce((v, x) => merge(v, x.patch), { ...REST });
  const direct = beats.reduce((v, x) => merge(v, x.patch), { ...REST });
  assert.deepEqual(view, direct);
  assert.deepEqual(Object.keys(view.fx), ['b']);
  assert.deepEqual(beats[0], { t: 0, patch: { eyes: 'blink' } }, 'input is not mutated');
});

/* ---------------- the reduced-motion policy, end to end through the scheduler ---------------- */

test('reduced motion: nothing the scheduler applies moves, leans, glitches or walks the pet', () => {
  const warn = console.warn;
  console.warn = () => {};
  const found = [];
  try {
    for (const b of pet.behaviors) {
      if (b.moves) continue;
      for (const mood of ['idle', 'content', 'stressed']) {
        if (!(b.weights?.[mood] > 0 || (!b.weights && b.moods.includes(mood)) || b.reactMoods.includes(mood))) continue;
        for (const seed of [1, 2]) {
          const r = runBehavior(b.id, { reduced: true, seed, mood });
          if (!r.applied.length) continue; // not eligible for this context
          assert.ok(r.done, `${b.id} (${mood}) completes under reduced motion`);
          for (const { patch } of r.applied) {
            for (const key of ['sx', 'sy', 'z', 'lean', 'glitch', 'offscreen']) if (key in patch && patch[key]) found.push(`${b.id}: ${key}`);
            if (patch.transitionMs > 0) found.push(`${b.id}: transitionMs ${patch.transitionMs}`);
            if (patch.legs === 1 || patch.legs === 2 || patch.legs === 3) found.push(`${b.id}: legs ${patch.legs}`);
            if (patch.propOps?.some(([, spec]) => spec)) found.push(`${b.id}: world prop`);
          }
          const rest = r.final;
          assert.equal(rest.lean, 0, `${b.id}: ends leaning`);
          assert.equal(rest.glitch, 0, `${b.id}: ends glitching`);
          assert.equal(rest.legs, 0, `${b.id}: ends mid-step`);
          assert.deepEqual(rest.fx, {}, `${b.id}: overlay effects left behind`);
          assert.deepEqual(rest.props, {}, `${b.id}: props left behind`);
        }
      }
    }
  } finally {
    console.warn = warn;
  }
  assert.deepEqual([...new Set(found)], []);
});

test('normal motion still uses leans and glitches (the policy is reduced-only)', () => {
  const seen = new Set();
  for (const id of ['groom', 'unsettledLook']) {
    for (const seed of [1, 2, 3, 4]) {
      const r = runBehavior(id, { reduced: false, seed, mood: id === 'unsettledLook' ? 'stressed' : 'idle' });
      for (const { patch } of r.applied) {
        if (patch.lean) seen.add('lean');
        if (patch.glitch) seen.add('glitch');
      }
    }
  }
  assert.deepEqual([...seen].sort(), ['glitch', 'lean']);
});
