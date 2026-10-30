import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { LOOK_BEFORE, firstMove, planLookBefore } from './lookahead.js';
import { PetScheduler } from './scheduler.js';
import { defineBehavior } from './behaviors.js';
import { createRng } from './rng.js';

const REST = { sx: 300, sy: 200, pose: 'sit', legs: 0, eyes: 'open', gaze: 'c', ears: null, lean: 0, tail: null, pupils: null, focus: null, mouth: 'idle', pawL: null, pawR: null, cue: null, item: null, book: null, droop: 0, glitch: 0, props: {}, offscreen: false };
const walk = { id: 'walk', moves: true };
const beatsRight = [{ t: 0, patch: { view: 'side' } }, { t: 200, patch: { sx: 520 } }];
const ok = (over = {}) => ({ rng: createRng(1), behavior: walk, beats: beatsRight, view: REST, source: 'pool', mood: 'content', reduced: false, memory: {}, now: 100000, ...over });
const saved = { ...LOOK_BEFORE };
beforeEach(() => Object.assign(LOOK_BEFORE, { chance: 1 }));
afterEach(() => Object.assign(LOOK_BEFORE, saved));

test('firstMove: the direction of the first real move, short moves do not count', () => {
  assert.equal(firstMove(beatsRight, REST), 220);
  assert.equal(firstMove([{ t: 0, patch: { sx: 310 } }, { t: 5, patch: { sx: 100 } }], REST), -200);
  assert.equal(firstMove([{ t: 0, patch: { sx: 305 } }], REST), null);
  assert.equal(firstMove([{ t: 0, patch: { eyes: 'closed' } }], REST), null);
});

test('it only runs up to a calm walk the cat chose itself, never for a reaction, a forced run, reduced motion or stress', () => {
  assert.ok(planLookBefore(ok()));
  for (const over of [{ source: 'reaction' }, { source: 'forced' }, { reduced: true }, { mood: 'stressed' }, { behavior: { id: 'retreat', moves: true } }, { behavior: { id: 'walk', moves: false } }, { behavior: null }]) {
    assert.equal(planLookBefore(ok(over)), null, JSON.stringify(over));
  }
  // not while a behavior has the cat or it is not sitting still
  for (const view of [{ ...REST, pawL: 'high' }, { ...REST, eyes: 'closed' }, { ...REST, gaze: 'l' }, { ...REST, pose: 'curl' }, { ...REST, legs: 1 }, { ...REST, offscreen: true }]) assert.equal(planLookBefore(ok({ view })), null);
  // no destination to look toward
  assert.equal(planLookBefore(ok({ beats: [{ t: 0, patch: { eyes: 'open' } }] })), null);
});

test('it is occasional: a chance, and a rest between two run-ups', () => {
  LOOK_BEFORE.chance = 0.4;
  const memory = {};
  let hits = 0;
  let t = 100000;
  const rng = createRng(7);
  for (let i = 0; i < 400; i++) {
    t += 6000;
    if (planLookBefore(ok({ rng, memory, now: t }))) hits++;
  }
  // one every 20 s at most, and only some of the walks: well under half of 400 walks six seconds apart
  assert.ok(hits > 15 && hits < 110, `${hits} run-ups in 400 walks`);
  const m2 = {};
  assert.ok(planLookBefore(ok({ memory: m2, now: 100000 })) || true);
  LOOK_BEFORE.chance = 1;
  const first = planLookBefore(ok({ memory: m2, now: 100000 }));
  assert.ok(first);
  assert.equal(planLookBefore(ok({ memory: m2, now: 105000 })), null, 'twice within the rest');
  assert.ok(planLookBefore(ok({ memory: m2, now: 100000 + LOOK_BEFORE.minGapMs + 1 })));
});

test('a run-up is brief, varied, looks the way it will walk, and puts the rig back before the walk begins', () => {
  const shapes = new Set();
  const leads = [];
  for (let seed = 1; seed <= 200; seed++) {
    for (const [sx, want] of [[520, 'r'], [40, 'l']]) {
      const r = planLookBefore(ok({ rng: createRng(seed), beats: [{ t: 0, patch: { sx } }] }));
      assert.ok(r.lead >= 350 && r.lead <= 1200, `lead ${r.lead}`);
      leads.push(r.lead);
      // only gaze, ears and head lean; never position, pose, eyes, pupils or anything a behavior owns
      for (const b of r.beats) assert.deepEqual(Object.keys(b.patch).filter((k) => !['gaze', 'ears', 'lean'].includes(k)), []);
      const ts = r.beats.map((b) => b.t);
      assert.deepEqual(ts, [...ts].sort((a, b) => a - b));
      const reset = r.beats.at(-1);
      assert.deepEqual(reset.patch, { gaze: 'c', ears: null, lean: 0 });
      assert.ok(reset.t < r.lead && reset.t >= r.lead - 30);
      // the final look is toward the destination
      const lastGaze = [...r.beats].reverse().find((b) => b.patch.gaze && b.patch.gaze !== 'c');
      assert.equal(lastGaze.patch.gaze, want);
      shapes.add(r.beats.map((b) => Object.keys(b.patch).join('+')).join('>'));
    }
  }
  assert.ok(shapes.size >= 4, `only ${shapes.size} shapes`);
  assert.ok(new Set(leads.map((l) => Math.round(l / 100))).size >= 6, 'the same lead every time');
});

/* ---- through a real scheduler on a fake clock ---------------------------------------------------------------------- */

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

function schedule({ how, seed = 1, reduced = false }) {
  now = 0;
  let cur = { ...REST };
  const applied = [];
  const apply = (p) => {
    cur = { ...cur, ...p };
    applied.push({ t: now, patch: p });
  };
  const stroll = defineBehavior({
    id: 'walk',
    moves: true,
    supported: true,
    moods: ['idle', 'content'],
    plan(c, S) {
      S.at(0, { view: 'side' });
      S.at(300, { sx: 600 });
      S.at(900, { eyes: 'closed' });
      return 1200;
    },
  });
  const rng = createRng(seed);
  const sch = new PetScheduler({
    key: `look-${how}-${seed}`, rng, mood: 'content', reduced, compact: false, behaviors: [stroll], animations: {},
    getCtx: () => ({ rng, mood: 'content', reduced, get cur() { return cur; }, apply, memory: {} }), apply, resetPatch: { gaze: 'c', ears: null, lean: 0 },
    lookBefore: (o) => planLookBefore({ ...o, rng }),
  });
  if (how === 'pool') sch.next();
  else if (how === 'forced') sch.next('walk');
  else {
    sch.queued = 'walk'; // a reaction waiting for the boundary
    sch.next();
  }
  for (let i = 0; i < 400; i++) {
    now += 10;
    mock.timers.tick(10);
  }
  sch.stop();
  return applied;
}

test('through the scheduler: the walk starts a moment later with a look first, and its own script is untouched', () => {
  const a = schedule({ how: 'pool', seed: 1 });
  const first = a.find((x) => x.patch.view === 'side');
  const move = a.find((x) => x.patch.sx === 600);
  const look = a.find((x) => x.patch.gaze === 'r');
  assert.ok(look && look.t < first.t, 'no look before the walk');
  assert.ok(first.t >= 350 && first.t <= 1200);
  assert.equal(move.t - first.t, 300, 'the walk\'s own timing changed');
  assert.equal(a.find((x) => x.patch.eyes === 'closed').t - first.t, 900);
  // the rig is back at rest before the walk's first beat, and nothing the walk owns was touched earlier
  const before = a.filter((x) => x.t < first.t);
  assert.deepEqual(before.filter((x) => Object.keys(x.patch).some((k) => !['gaze', 'ears', 'lean'].includes(k))), []);
  assert.deepEqual(before.at(-1).patch, { gaze: 'c', ears: null, lean: 0 });
});

test('through the scheduler: a reaction, a forced run and reduced motion start at once, as always', () => {
  for (const how of ['forced', 'reaction']) {
    const a = schedule({ how });
    assert.equal(a[0].t, 0, how);
    assert.equal(a[0].patch.view, 'side', how);
    assert.ok(!a.some((x) => x.patch.gaze), `${how}: looked first`);
  }
  const r = schedule({ how: 'pool', reduced: true });
  assert.ok(!r.some((x) => x.patch.gaze === 'r'), 'reduced motion looked first');
});
