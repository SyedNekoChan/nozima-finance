import { test } from 'node:test';
import assert from 'node:assert/strict';
import pet from './index.js';
import { makeScript } from '../core/toolkit.js';
import { createRng } from '../core/rng.js';

/*
 * Plays every behavior's plan headlessly (no timers, no canvas) over several
 * seeds, moods and layer sizes, applying its beats in order the way usePet
 * merges patches, and checks the poses it produces.
 */
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

const METRICS = [[{ width: 1000, height: 700 }, false], [{ width: 380, height: 600 }, true]];

// Runs one behavior; calls onBeat(before, after, beat) for every applied beat. Returns the final view or null if not eligible.
function play(b, mood, seed, onBeat = () => {}) {
  const [m, compact] = METRICS[seed % 2];
  const geo = pet.world.makeGeo({ ...m, spriteW: pet.sprite.width, spriteH: pet.sprite.height }, compact);
  const rng = createRng(seed * 7919 + b.id.length);
  let cur = { ...REST, sx: null, sy: null, z: 0, facing: 1, transitionMs: 0, ...pet.world.pickSpot(geo, rng, {}) };
  const c = {
    rng, pet, mood, compact, reduced: false, geo, memory: {}, has: pet.hasCapability,
    get cur() { return cur; },
    pickSpot: (o) => pet.world.pickSpot(geo, rng, o),
    apply: (p) => { cur = merge(cur, p); },
  };
  if (b.eligible && !b.eligible(c)) return null;
  const S = makeScript(c, pet.animations);
  b.enter?.(c);
  b.plan(c, S);
  for (const beat of S.beats.sort((a, z) => a.t - z.t)) {
    const before = cur;
    cur = merge(cur, beat.patch);
    onBeat(before, cur, beat);
  }
  b.exit?.(c, 'done');
  return cur;
}

const runnable = (b, mood) => (b.weights?.[mood] ?? (b.moods.includes(mood) ? 1 : 0)) > 0 || b.reactMoods.includes(mood);
const WALKING = new Set(['stand', 'crouch', 'low']);

test('every behavior plans without throwing', () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (const b of pet.behaviors) for (const mood of ['idle', 'content', 'stressed']) if (runnable(b, mood)) for (let s = 1; s <= 10; s++) play(b, mood, s);
  } finally {
    console.warn = warn;
  }
});

test('legs only move in a pose that has a gait (a seated cat must not slide)', () => {
  const bad = new Map();
  for (const b of pet.behaviors) {
    for (const mood of ['idle', 'content', 'stressed']) {
      if (!runnable(b, mood)) continue;
      for (let s = 1; s <= 25; s++) {
        play(b, mood, s, (_, cur) => {
          const walking = cur.legs === 1 || cur.legs === 2;
          if ((walking && !WALKING.has(cur.pose)) || (cur.legs === 3 && cur.pose !== 'stand')) {
            bad.set(b.id, `${bad.get(b.id) ? bad.get(b.id) + ', ' : ''}legs ${cur.legs} while ${cur.pose}`.slice(0, 120));
          }
        });
      }
    }
  }
  assert.deepEqual([...bad], []);
});

test('edgeExit walks out and in standing, and ends seated with its legs still', () => {
  const b = pet.behaviors.find((x) => x.id === 'edgeExit');
  for (const mood of ['idle', 'content']) {
    for (let s = 1; s <= 20; s++) {
      const poses = new Set();
      const end = play(b, mood, s, (_, cur) => cur.legs && poses.add(cur.pose));
      assert.deepEqual([...poses], ['stand']);
      assert.equal(end.pose, 'sit');
      assert.equal(end.legs, 0);
      assert.equal(end.view, 'front');
      assert.equal(end.offscreen, false);
    }
  }
});
