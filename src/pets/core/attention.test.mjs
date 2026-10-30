import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startAttention, isNeutral, sideOf } from './attention.js';
import { AMBIENT } from '../config.js';
import { createRng } from './rng.js';

const REST = { sx: 100, offscreen: false, pose: 'sit', legs: 0, eyes: 'open', gaze: 'c', ears: null, lean: 0, tail: null, pupils: null, focus: null, mouth: 'idle', pawL: null, pawR: null, cue: null, item: null, book: null, droop: 0, glitch: 0, props: {} };
let view;
let log;
let t = 0;
beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
  view = { ...REST, props: {} };
  log = [];
  t = 0;
});
afterEach(() => mock.timers.reset());

const apply = (p) => {
  Object.assign(view, p);
  log.push([t, { ...p }]);
};
const run = (ms, step = 10) => {
  for (let i = 0; i < ms; i += step) {
    t += step;
    mock.timers.tick(step);
  }
};
const start = (seed = 1, mood = 'content') => startAttention({ rng: createRng(seed), getView: () => view, apply, timing: AMBIENT.attention, mood });

const kind = (p) => Object.keys(p).sort().join('+');

test('an idle cat shows a varied, unscripted face: glances, ears, tilts, squints, tail', () => {
  const stop = start(3);
  run(300000);
  stop();
  const kinds = new Set(log.map(([, p]) => kind(p)));
  const used = (k) => log.some(([, p]) => k in p && p[k] !== null && p[k] !== 'c' && p[k] !== 0 && p[k] !== 'open');
  for (const k of ['gaze', 'ears', 'lean', 'pupils', 'tail']) assert.ok(used(k), `${k} was never used`);
  assert.ok(log.some(([, p]) => p.eyes === 'down'), 'no squint');
  assert.ok(kinds.size >= 8, `only ${kinds.size} different patches`);
  // the face always ends up neutral again
  assert.ok(isNeutral(view), JSON.stringify(view));
  // not a metronome: the gaps between moments vary widely, with a long quiet now and then
  const starts = [];
  let prev = -1e9;
  for (const [time, p] of log) {
    if (time - prev > 2500 && Object.values(p).some((v) => v !== null && v !== 'c' && v !== 0 && v !== 'open')) starts.push(time);
    prev = time;
  }
  const gaps = starts.slice(1).map((s, i) => s - starts[i]);
  assert.ok(gaps.length >= 15, `${gaps.length} moments in five minutes`);
  assert.ok(Math.max(...gaps) - Math.min(...gaps) > 8000, 'gaps are too even');
  // it never lingers: nothing is held for long
  assert.ok(log.length < 900, 'busy as a checklist');
});

test('it never acts while a behavior has the face, and never overrides it', () => {
  const busy = [{ pawL: 'high' }, { eyes: 'closed' }, { eyes: 'wide' }, { gaze: 'l' }, { ears: 'back' }, { lean: 1 }, { tail: 'swish' }, { pupils: 3 }, { pose: 'curl' }, { pose: 'stretch' }, { legs: 1 }, { offscreen: true }, { cue: '!' }, { mouth: 'o' }, { droop: 1 }, { focus: 40 }];
  for (const b of busy) {
    view = { ...REST, ...b, props: {} };
    log = [];
    const stop = start(5);
    run(90000);
    stop();
    assert.deepEqual(log, [], `acted over ${JSON.stringify(b)}`);
  }
});

test('when a behavior takes over mid-moment it stops and gives nothing back over the behavior\'s state', () => {
  const stop = start(9);
  let taken = false;
  for (let i = 0; i < 40000 && !taken; i += 10) {
    t += 10;
    mock.timers.tick(10);
    // as soon as the cat has an ear / lean / gaze up, a behavior starts and sets its own state
    if (view.ears || view.lean || view.gaze !== 'c' || view.tail) {
      Object.assign(view, { pose: 'stand', legs: 1, ears: 'back', gaze: 'r', lean: 0, tail: 'lash' });
      taken = true;
    }
  }
  assert.ok(taken, 'no moment began');
  const n = log.length;
  run(60000);
  stop();
  assert.equal(log.length, n, 'it kept acting after the behavior took over');
  assert.equal(view.ears, 'back');
  assert.equal(view.gaze, 'r');
  assert.equal(view.tail, 'lash');
});

test('something new in the scene is noticed: the cat turns toward it with its ears up', () => {
  const stop = start(4);
  run(500);
  view.props = { coin: { sx: 400 } };
  const from = t;
  run(15000);
  const toward = log.filter(([time, p]) => time > from && p.gaze === 'r' && p.ears === 'perk');
  assert.ok(toward.length >= 1, 'did not turn toward the new thing');
  assert.ok(toward[0][0] - from < 14000);
  // an object on the left is looked at on the left
  log = [];
  view.props = { coin: { sx: 400 }, other: { sx: -200 } };
  run(15000);
  stop();
  assert.ok(log.some(([, p]) => p.gaze === 'l'), 'did not look left');
  assert.ok(isNeutral(view));
});

test('sideOf: straight ahead and unknown give no side', () => {
  assert.equal(sideOf({ sx: 100 }, 104), null);
  assert.equal(sideOf({ sx: 100 }, 20), 'l');
  assert.equal(sideOf({ sx: 100 }, 300), 'r');
  assert.equal(sideOf({ sx: 100 }, undefined), null);
});
