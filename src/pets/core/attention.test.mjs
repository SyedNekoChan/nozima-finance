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

// a clock the habituation can use under mock timers
const clock = () => t;
const startW = (seed = 1, mood = 'content', world = null) => startAttention({ rng: createRng(seed), getView: () => view, apply, timing: AMBIENT.attention, mood, world, now: clock });

test('something new and interesting in the scene is noticed: it turns toward it with its ears up, and not every time', () => {
  let noticed = 0;
  for (let seed = 1; seed <= 12; seed++) {
    view = { ...REST, props: {} };
    log = [];
    t = 0;
    const stop = startW(seed);
    run(500);
    view.props = { w: { kind: 'wisp', sx: 400, sy: 50 } };
    const from = t;
    run(20000);
    stop();
    if (log.some(([time, p]) => time > from && p.ears === 'perk') && log.some(([time, p]) => time > from && p.gaze === 'r')) noticed++;
    assert.ok(isNeutral(view), `seed ${seed}: left on ${JSON.stringify(view)}`);
  }
  assert.ok(noticed >= 5, `noticed only ${noticed} of 12`);
  assert.ok(noticed <= 11, 'it reacts to every new thing');
});

test('an episode is one connected story: notice, look, observe, lose interest, back to idle', () => {
  let story = null;
  for (let seed = 1; seed <= 20 && !story; seed++) {
    view = { ...REST, props: {} };
    log = [];
    t = 0;
    const stop = startW(seed);
    run(500);
    view.props = { y: { kind: 'yarn', sx: 500, sy: 50 } };
    run(25000);
    stop();
    const i = log.findIndex(([, p]) => p.ears === 'perk');
    if (i >= 0) story = log.slice(i);
  }
  assert.ok(story, 'no seed noticed the yarn');
  const idx = (f) => story.findIndex(([, p]) => f(p));
  const notice = idx((p) => p.ears === 'perk');
  const look = idx((p) => p.gaze === 'r');
  const settle = idx((p) => p.pupils === null && 'pupils' in p);
  const earsDown = idx((p) => p.ears === null && 'ears' in p);
  assert.ok(notice >= 0 && look > notice, 'it looks after it notices');
  assert.ok(settle > look, 'the pupils settle after the look');
  assert.ok(earsDown > settle, 'the ears relax last');
  // the pupils open (2) before they ever swell (3), and observing lasts a while
  const widen = story.findIndex(([, p]) => p.pupils === 2);
  const swell = story.findIndex(([, p]) => p.pupils === 3);
  assert.ok(widen >= 0 && (swell < 0 || widen < swell));
  assert.ok(story.find(([, p]) => p.ears === null)[0] - story[0][0] > 1500, 'it watched only an instant');
  assert.ok(isNeutral(view));
});

test('it does not keep reacting to the same persistent object, and rests between things', () => {
  let counts = [];
  for (let seed = 1; seed <= 6; seed++) {
    view = { ...REST, props: {} };
    log = [];
    t = 0;
    const stop = startW(seed);
    run(500);
    view.props = { w: { kind: 'wisp', sx: 400, sy: 50 } }; // stays there, unchanged, for ten minutes
    run(600000);
    stop();
    counts.push(log.filter(([, p]) => p.ears === 'perk' && p.pupils === 2).length + log.filter(([, p]) => p.eyes === 'wide').length);
  }
  assert.ok(Math.max(...counts) <= 4, `reacted ${Math.max(...counts)} times to an object that never changed`);
});

test('it follows a moving thing with its eyes, and a thing that goes away ends the look early', () => {
  let followed = false;
  let ended = false;
  for (let seed = 1; seed <= 20 && !(followed && ended); seed++) {
    view = { ...REST, props: {} };
    log = [];
    t = 0;
    const stop = startW(seed);
    run(500);
    view.props = { m: { kind: 'wisp', sx: 400, sy: 50 } };
    // it moves across to the left side while it is being watched
    for (let k = 0; k < 400; k++) {
      run(50);
      if (log.some(([, p]) => p.gaze === 'r') && !followed) view.props = { m: { kind: 'wisp', sx: -300, sy: 50 } };
      if (view.gaze === 'l') followed = true;
    }
    stop();
  }
  assert.ok(followed, 'it never turned to follow the moving thing');
  for (let seed = 1; seed <= 20 && !ended; seed++) {
    view = { ...REST, props: {} };
    log = [];
    t = 0;
    const stop = startW(seed);
    run(500);
    view.props = { m: { kind: 'wisp', sx: 400, sy: 50 } };
    let gone = 0;
    for (let k = 0; k < 400; k++) {
      run(50);
      if (!gone && view.gaze === 'r') {
        gone = t;
        view.props = {};
      }
    }
    stop();
    if (gone) {
      const back = log.find(([time, p]) => time > gone && p.gaze === 'c');
      ended = !!back && back[0] - gone < 4500 && isNeutral(view);
    }
  }
  assert.ok(ended, 'the look did not end when the thing went away');
});

test('the mouse: a quick sweep or a long rest nearby may be noticed, looked toward, then forgotten; it is not a constant reaction', () => {
  let reacted = 0;
  let sides = new Set();
  const rect = { x: 100, y: 100, width: 100, height: 70 };
  for (let seed = 1; seed <= 12; seed++) {
    view = { ...REST, props: {} };
    log = [];
    t = 0;
    const queue = [];
    const world = { read: () => queue.splice(0), rect: () => rect, pointerX: () => (seed % 2 ? 40 : 420) };
    const stop = startW(seed, 'content', world);
    run(1000);
    // the mouse sweeps past, every ten seconds, for five minutes
    for (let k = 0; k < 30; k++) {
      queue.push({ kind: 'pointer-fast', x: seed % 2 ? 40 : 420, strength: 0.7 });
      run(10000);
    }
    stop();
    const looks = log.filter(([, p]) => p.gaze === 'l' || p.gaze === 'r').length;
    if (looks) reacted++;
    for (const [, p] of log) if (p.gaze === 'l' || p.gaze === 'r') sides.add(seed % 2 ? 'l' : 'r');
    assert.ok(isNeutral(view));
    // thirty sweeps do not make thirty reactions
    assert.ok(log.filter(([, p]) => p.ears === 'perk').length <= 12, 'it jumps at every sweep');
  }
  assert.ok(reacted >= 6, `only ${reacted} of 12 cats ever noticed the mouse`);
  assert.ok(sides.has('l') && sides.has('r'), 'it looked the wrong way');
});

test('a cat that is busy (a behavior has the face) misses events instead of queueing them', () => {
  view = { ...REST, props: {}, pawL: 'high' };
  log = [];
  t = 0;
  const queue = [{ kind: 'pointer-fast', x: 0, strength: 1 }];
  const world = { read: () => queue.splice(0), rect: () => ({ x: 100, y: 100, width: 100, height: 70 }), pointerX: () => 0 };
  const stop = startW(2, 'content', world);
  run(5000);
  view.props = { w: { kind: 'wisp', sx: 300, sy: 50 } };
  run(20000);
  assert.deepEqual(log, []);
  // when the behavior ends, the old events are not replayed
  view.pawL = null;
  run(30000);
  stop();
  assert.ok(!log.some(([, p]) => p.eyes === 'wide'), 'it replayed a stale event');
});

test('sideOf: straight ahead and unknown give no side', () => {
  assert.equal(sideOf({ sx: 100 }, 104), null);
  assert.equal(sideOf({ sx: 100 }, 20), 'l');
  assert.equal(sideOf({ sx: 100 }, 300), 'r');
  assert.equal(sideOf({ sx: 100 }, undefined), null);
});
