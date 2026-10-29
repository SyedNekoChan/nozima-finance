import { test } from 'node:test';
import assert from 'node:assert/strict';
import pet from './index.js';
import { makeScript } from '../core/toolkit.js';
import { createRng } from '../core/rng.js';
import { footprint } from '../core/choreo.js';
import { crosses, nextSide, overlaps } from '../core/layering.js';

/*
 * The treasure coins are world props drawn behind or in front of the pet by
 * their depth. A coin must never change sides while it overlaps the pet's
 * body (it would jump through it): its moves go round the pet, and the orbit
 * ring is wider than the cat.
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

test('treasure coins never switch sides of the pet while overlapping its body', () => {
  const b = pet.behaviors.find((x) => x.id === 'treasure');
  let runs = 0;
  let overlapping = 0;
  const bad = [];
  for (let seed = 1; seed <= 60; seed++) {
    const compact = seed % 2 === 1;
    const m = compact ? { width: 380, height: 600 } : { width: 1000, height: 700 };
    const geo = pet.world.makeGeo({ ...m, spriteW: pet.sprite.width, spriteH: pet.sprite.height }, compact);
    const rng = createRng(seed * 7919 + b.id.length);
    let cur = { ...REST, sx: null, sy: null, z: 0, facing: 1, transitionMs: 0, ...pet.world.pickSpot(geo, rng, {}) };
    const c = { rng, pet, mood: 'content', compact, reduced: false, geo, memory: {}, has: pet.hasCapability, get cur() { return cur; }, pickSpot: (o) => pet.world.pickSpot(geo, rng, o), apply: (p) => { cur = merge(cur, p); } };
    if (b.eligible && !b.eligible(c)) continue;
    runs++;
    const S = makeScript(c, pet.animations);
    b.enter?.(c);
    b.plan(c, S);
    const mem = {};
    const lag = {};
    for (const beat of S.beats.sort((a, z) => a.t - z.t)) {
      cur = merge(cur, beat.patch);
      const fp = footprint(c, cur.z, 11);
      for (const id of Object.keys(mem)) if (!cur.props?.[id]) delete mem[id];
      for (const [id, p] of Object.entries(cur.props || {})) {
        const touching = crosses(mem[id] ? mem[id].at : p, p, cur, fp.hw, fp.hh);
        if (overlaps(p, cur, fp.hw, fp.hh)) overlapping++;
        const next = nextSide(mem[id], p.z > cur.z, touching, beat.t);
        if (next.forced) bad.push(`seed ${seed} ${id} t=${Math.round(beat.t)} forced to switch while overlapping (z ${Math.round(p.z)} vs ${Math.round(cur.z)}, dx ${Math.round(p.sx-cur.sx)} dy ${Math.round(p.sy-cur.sy)}, was ${mem[id].front})`);
        if (mem[id] && next.front !== mem[id].front && touching) bad.push(`seed ${seed} ${id} t=${Math.round(beat.t)} switched while overlapping`);
        mem[id] = { ...next, at: { sx: p.sx, sy: p.sy } };
        // the drawn side may lag the planned one only briefly
        lag[id] = next.front === p.z > cur.z ? 0 : (lag[id] || beat.t);
        if (lag[id] && beat.t - lag[id] > 700) bad.push(`seed ${seed} ${id} t=${Math.round(beat.t)} drawn on the wrong side for ${Math.round(beat.t - lag[id])} ms`);
      }
    }
  }
  assert.ok(runs > 20, 'enough eligible runs');
  assert.ok(overlapping > 100, 'the coins do pass the pet (the test sees overlap)');
  assert.deepEqual(bad, []);
});

test('layering: a glide that crosses the body counts as touching even when both ends are clear', () => {
  const pet = { sx: 0, sy: 0 };
  const a = { sx: -100, sy: 0 };
  const b = { sx: 100, sy: 0 };
  assert.equal(overlaps(a, pet, 30, 40, 6), false);
  assert.equal(overlaps(b, pet, 30, 40, 6), false);
  assert.equal(crosses(a, b, pet, 30, 40, 6), true);
  assert.equal(crosses(a, { sx: -100, sy: 90 }, pet, 30, 40, 6), false);
  // so a side change is deferred while such a glide is in flight, then released once the prop settles clear
  let m = nextSide(undefined, false, false, 0);
  m = nextSide(m, true, crosses(a, b, pet, 30, 40, 6), 100);
  assert.equal(m.front, false);
  m = nextSide(m, true, crosses(b, b, pet, 30, 40, 6), 200);
  assert.equal(m.front, true);
});
