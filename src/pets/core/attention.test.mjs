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

// a world whose mouse can be moved about; `events` are what the watcher would have reported
function mouseWorld() {
  const w = { pos: { x: 420, y: 135 }, queue: [], rect: () => ({ x: 100, y: 100, width: 100, height: 70 }) };
  w.read = () => w.queue.splice(0);
  w.pointerPos = () => w.pos;
  return w;
}
const gazes = (from = 0) => log.filter(([time, p]) => time >= from && 'gaze' in p).map(([time, p]) => [time, p.gaze]);

test('the mouse is secondary: it earns at most a short glance to where it was, that never follows it about', () => {
  let glanced = 0;
  for (let seed = 1; seed <= 40; seed++) {
    view = { ...REST, props: {} };
    log = [];
    t = 0;
    const w = mouseWorld();
    const stop = startW(seed, 'content', w);
    run(500);
    w.queue.push({ kind: 'pointer-dwell', strength: 0.6 });
    // while it may be looking, the mouse darts from one side of the cat to the other
    let side = 0;
    for (let k = 0; k < 140; k++) {
      run(100);
      if (k % 4 === 0) w.pos = { x: side++ % 2 ? 40 : 420, y: 135 };
    }
    stop();
    assert.ok(isNeutral(view));
    const g = gazes(500).filter(([, v]) => v === 'l' || v === 'r');
    // a first look and nothing more: the eyes did not chase the mouse from side to side. (The cat's own idle glances and
    // its personality moments may add a look or two of their own over fourteen seconds; the mouse adds at most one.)
    assert.ok(g.length <= 3, `seed ${seed}: ${g.length} looks in 14 s`);
    if (g.length) glanced++;
  }
  assert.ok(glanced <= 34, 'every cat reacted to the mouse');
});

test('a mouse that moves away lets the look resolve: the eyes come back by themselves', () => {
  let resolved = 0;
  let tried = 0;
  for (let seed = 1; seed <= 60; seed++) {
    view = { ...REST, props: {} };
    log = [];
    t = 0;
    const w = mouseWorld();
    const stop = startW(seed, 'content', w);
    run(300);
    w.queue.push({ kind: 'pointer-dwell', strength: 1 });
    let lookedAt = 0;
    for (let k = 0; k < 40 && !lookedAt; k++) {
      run(50);
      if (view.gaze === 'r') lookedAt = t;
    }
    if (!lookedAt) {
      stop();
      continue;
    }
    tried++;
    w.pos = { x: 3000, y: 135 }; // it leaves, far away
    run(3500);
    stop();
    if (view.gaze === 'c' && isNeutral(view)) resolved++;
  }
  assert.ok(tried >= 3, `only ${tried} cats looked at all`);
  assert.equal(resolved, tried, 'a look did not end after the mouse left');
});

test('ten minutes of a mouse that keeps moving about near it do not make it a follower', () => {
  const total = (withMouse) => {
    let looks = 0;
    for (let seed = 1; seed <= 6; seed++) {
      view = { ...REST, props: {} };
      log = [];
      t = 0;
      const w = mouseWorld();
      const stop = startW(seed, 'content', withMouse ? w : null);
      for (let k = 0; k < 200; k++) {
        // every three seconds the mouse sweeps, or settles, close by
        if (withMouse) {
          w.pos = { x: k % 2 ? 60 : 380, y: 135 };
          w.queue.push({ kind: k % 3 ? 'pointer-fast' : 'pointer-dwell', strength: 0.7 });
        }
        run(3000);
      }
      stop();
      looks += gazes().filter(([, v]) => v === 'l' || v === 'r').length;
    }
    return looks / 6;
  };
  const base = total(false);
  const busy = total(true);
  assert.ok(busy - base <= 7, `${busy.toFixed(1)} looks in ten minutes with the mouse, ${base.toFixed(1)} without`);
});

test('a cat that is busy (a behavior has the face) misses events instead of queueing them', () => {
  view = { ...REST, props: {}, pawL: 'high' };
  log = [];
  t = 0;
  const queue = [{ kind: 'pointer-fast', x: 0, strength: 1 }];
  const world = { read: () => queue.splice(0), rect: () => ({ x: 100, y: 100, width: 100, height: 70 }), pointerPos: () => ({ x: 0, y: 135 }) };
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

test('over a long idle session the pace is unhurried, varied and has real quiet stretches (pacing guard)', () => {
  for (const seed of [2, 5, 9]) {
    view = { ...REST, props: {} };
    log = [];
    t = 0;
    const stop = startW(seed);
    run(20 * 60 * 1000, 20);
    stop();
    const starts = [];
    let prev = -1e9;
    for (const [time] of log) {
      if (time - prev > 2600) starts.push(time);
      prev = time;
    }
    const gaps = starts.slice(1).map((x, i) => (x - starts[i]) / 1000).sort((a, b) => a - b);
    const med = gaps[gaps.length >> 1];
    assert.ok(starts.length >= 50 && starts.length <= 130, `seed ${seed}: ${starts.length} moments in twenty minutes`);
    assert.ok(med >= 9 && med <= 22, `seed ${seed}: median gap ${med}s`);
    assert.ok(gaps[0] >= 5, `seed ${seed}: two moments ${gaps[0]}s apart`);
    assert.ok(gaps.filter((g) => g > 24).length >= 6, `seed ${seed}: too few quiet stretches`);
    assert.ok(gaps.at(-1) < 70, 'a quiet stretch that long looks like a hang');
    assert.ok(isNeutral(view));
  }
});

test('a running behavior has priority even in a neutral pause: nothing starts, and a look under way is handed back', () => {
  let running = null;
  const IDLE = ['sit', 'observe'];
  const busy = () => !!running && !IDLE.includes(running);
  const start2 = (seed) => startAttention({ rng: createRng(seed), getView: () => view, apply, timing: AMBIENT.attention, mood: 'content', busy, now: clock });
  // 1: busy for ten minutes -> never acts
  running = 'eat';
  view = { ...REST, props: {} };
  log = [];
  t = 0;
  let stop = start2(3);
  run(10 * 60 * 1000, 50);
  stop();
  assert.deepEqual(log, []);
  // quietly sitting behaviors do not count as busy
  running = 'observe';
  log = [];
  t = 0;
  stop = start2(3);
  run(120000, 20);
  stop();
  assert.ok(log.length > 3, 'it should act beside a quiet sitting behavior');
  // 2: a behavior starts in the middle of a look: the cat is given its rest back, nothing stays held
  let handed = 0;
  for (let seed = 1; seed <= 15; seed++) {
    running = null;
    view = { ...REST, props: {} };
    log = [];
    t = 0;
    const s2 = start2(seed);
    let began = false;
    for (let i = 0; i < 3000 && !began; i++) {
      run(10);
      if (view.gaze !== 'c' || view.ears || view.lean || view.pupils !== null || view.tail || view.eyes !== 'open') began = true;
    }
    if (!began) {
      s2();
      continue;
    }
    running = 'eat'; // the behavior has started but its first beat is still to come
    run(6000, 50);
    s2();
    assert.ok(isNeutral(view), `seed ${seed}: left on ${JSON.stringify(view)}`);
    handed++;
  }
  assert.ok(handed >= 10);
});

test('sideOf: straight ahead and unknown give no side', () => {
  assert.equal(sideOf({ sx: 100 }, 104), null);
  assert.equal(sideOf({ sx: 100 }, 20), 'l');
  assert.equal(sideOf({ sx: 100 }, 300), 'r');
  assert.equal(sideOf({ sx: 100 }, undefined), null);
});

/* ---- emotion: it colours the idle face and never changes whether or when anything happens ---------------------------- */

import { createEmotion } from './emotion.js';
import { PERSONALITY } from '../nomoz/config.js';

// an emotion held at full strength (the real weights, the real display rationing), counting what it is told
const held = (kind, level = 1) => {
  const real = createEmotion({ traits: PERSONALITY, now: () => t });
  const heard = [];
  return {
    heard,
    get: () => ({ kind, level: kind === 'content' ? 0 : level, startled: false, charge: {} }),
    shape: (w, emo) => real.shape(w, emo),
    permit: (n) => real.permit(n),
    note: (n, m) => heard.push([n, m]),
    tick: () => {},
  };
};
const startE = (emotion, seed = 1, world = null) => startAttention({ rng: createRng(seed), getView: () => view, apply, timing: AMBIENT.attention, mood: 'content', world, emotion, now: clock });
const episodes = () => log.filter(([, p]) => p.eyes === 'wide' || p.ears === 'perk' || p.ears === 'back').length;

test('a content cat is exactly the cat without any emotion layer', () => {
  for (const seed of [2, 3, 8]) {
    view = { ...REST, props: {} };
    log = [];
    t = 0;
    const a = startAttention({ rng: createRng(seed), getView: () => view, apply, timing: AMBIENT.attention, mood: 'content', now: clock });
    run(300000);
    a();
    const without = log;
    view = { ...REST, props: {} };
    log = [];
    t = 0;
    const b = startE(held('content'), seed);
    run(300000);
    b();
    assert.deepEqual(log, without, `seed ${seed}`);
  }
});

test('each emotion has its own tells, and the content cat never shows them', () => {
  const tell = {
    irritated: ([, p]) => p.ears === 'back',
    playful: ([, p]) => p.tail === 'swish' && p.pupils === 3 && p.ears === 'perk',
    sleepy: ([, p]) => p.eyes === 'blink' && p.pupils === 1,
    curious: ([, p]) => p.pupils === 3 && p.lean !== undefined && p.lean !== 0,
  };
  for (const [kind, is] of Object.entries(tell)) {
    let shown = 0;
    let baseline = 0;
    for (let seed = 1; seed <= 6; seed++) {
      for (const [k, tally] of [[kind, 'shown'], ['content', 'baseline']]) {
        view = { ...REST, props: {} };
        log = [];
        t = 0;
        const stop = startE(held(k), seed);
        run(300000);
        stop();
        assert.ok(isNeutral(view), `${k}: left on ${JSON.stringify(view)}`);
        const n = log.filter(is).length;
        if (tally === 'shown') shown += n;
        else baseline += n;
      }
    }
    assert.ok(shown > baseline * 1.5 + 3, `${kind}: ${shown} tells against ${baseline} when content`);
    if (kind === 'irritated' || kind === 'playful' || kind === 'sleepy') assert.equal(baseline, 0, `${kind}: its tell appears when content`);
  }
});

test('irritation tells in the tail first, then the ears, and never in wide eyes', () => {
  let huffs = 0;
  for (let seed = 1; seed <= 8; seed++) {
    view = { ...REST, props: {} };
    log = [];
    t = 0;
    const stop = startE(held('irritated'), seed);
    run(600000);
    stop();
    assert.ok(!log.some(([, p]) => p.tail === 'lash'), 'lash is the stressed look');
    const i = log.findIndex(([, p]) => p.ears === 'back');
    if (i >= 0) {
      huffs++;
      assert.ok(!log.some(([time, p]) => p.eyes === 'wide' && time > log[i][0] - 800 && time < log[i][0] + 2800), 'wide eyes in a huff');
      assert.ok(log.slice(0, i).some(([time, p]) => p.tail === 'swish' && time >= log[i][0] - 2500), 'the ears moved before the tail');
    }
  }
  assert.ok(huffs >= 6);
});

test('emotion changes which moment, not how often: the pace is the same for every emotion', () => {
  const count = (k, seed) => {
    view = { ...REST, props: {} };
    log = [];
    t = 0;
    const stop = startE(held(k), seed);
    run(600000);
    stop();
    let n = 0;
    let prev = -1e9;
    for (const [time, p] of log) {
      if (time - prev > 2500 && Object.values(p).some((v) => v !== null && v !== 'c' && v !== 0 && v !== 'open')) n++;
      prev = time;
    }
    return n;
  };
  for (const seed of [1, 2, 3]) {
    const base = count('content', seed);
    for (const k of ['curious', 'playful', 'sleepy', 'irritated']) {
      const n = count(k, seed);
      assert.ok(n > base * 0.7 && n < base * 1.35, `${k} seed ${seed}: ${n} moments against ${base}`);
    }
  }
});

test('a flavoured moment is rationed: an irritated cat huffs now and then, not on a clock', () => {
  view = { ...REST, props: {} };
  log = [];
  t = 0;
  const stop = startE(held('irritated'), 4);
  run(600000);
  stop();
  const times = log.filter(([, p]) => p.ears === 'back').map(([time]) => time);
  assert.ok(times.length >= 3);
  const gaps = times.slice(1).map((x, i) => x - times[i]).filter((g) => g > 3000);
  assert.ok(Math.min(...gaps) >= PERSONALITY.displayGapMs.huff - 2000, `two huffs ${Math.min(...gaps)} ms apart`);
});

test('emotion never overrides a behavior and never acts when the rig is not neutral', () => {
  const busy = [{ pawL: 'high' }, { eyes: 'closed' }, { gaze: 'l' }, { ears: 'back' }, { tail: 'swish' }, { pupils: 3 }, { pose: 'curl' }, { legs: 1 }, { offscreen: true }, { droop: 1 }];
  for (const kind of ['curious', 'playful', 'sleepy', 'irritated']) {
    for (const b of busy) {
      view = { ...REST, ...b, props: {} };
      log = [];
      t = 0;
      const stop = startE(held(kind), 5);
      run(60000);
      stop();
      assert.deepEqual(log, [], `${kind} acted over ${JSON.stringify(b)}`);
    }
  }
  // and a behavior that takes over mid-moment keeps the face
  view = { ...REST, props: {} };
  log = [];
  t = 0;
  const stop = startE(held('irritated'), 7);
  let taken = false;
  for (let i = 0; i < 80000 && !taken; i += 10) {
    run(10, 10);
    if (view.ears || view.gaze !== 'c' || view.tail) {
      Object.assign(view, { pose: 'stand', legs: 1, ears: 'perk', gaze: 'r', tail: 'lash' });
      taken = true;
    }
  }
  const n = log.length;
  run(60000);
  stop();
  assert.ok(taken);
  assert.equal(log.length, n);
  assert.deepEqual([view.ears, view.gaze, view.tail], ['perk', 'r', 'lash']);
});

test('habituation and rest are untouched: an object that never changes is noticed as rarely whatever the cat feels', () => {
  for (const kind of ['content', 'curious', 'playful', 'sleepy', 'irritated']) {
    let worst = 0;
    for (let seed = 1; seed <= 6; seed++) {
      view = { ...REST, props: {} };
      log = [];
      t = 0;
      const e = held(kind);
      const stop = startE(e, seed);
      run(500);
      view.props = { w: { kind: 'wisp', sx: 400, sy: 50 } };
      run(600000);
      stop();
      worst = Math.max(worst, e.heard.filter(([n]) => n === 'noticed').length);
    }
    assert.ok(worst <= 4, `${kind}: noticed a static object ${worst} times`);
  }
});

test('it tells the emotion what it takes notice of, how often, and what disturbs it', () => {
  let noticedAny = 0;
  for (let seed = 1; seed <= 10; seed++) {
    view = { ...REST, props: {} };
    log = [];
    t = 0;
    const w = mouseWorld();
    const e = held('content');
    const stop = startE(e, seed, w);
    run(500);
    view.props = { y: { kind: 'yarn', sx: 400, sy: 50 } };
    run(300);
    w.queue.push({ kind: 'pointer-fast', strength: 0.6 }, { kind: 'return', strength: 0.5 });
    run(30000);
    stop();
    const heard = e.heard.map(([n]) => n);
    assert.ok(heard.includes('disturb'), `seed ${seed}: ${heard.join()}`);
    assert.ok(heard.includes('return'));
    // each noticed thing is reported once as a thing and once as its kind; the mouse is a glance and is never reported as excitement
    assert.equal(heard.filter((n) => n === 'noticed').length, heard.filter((n) => n === 'noticed:yarn').length);
    if (heard.includes('noticed')) noticedAny++;
  }
  assert.ok(noticedAny >= 3, `the yarn was noticed in only ${noticedAny} of 10 runs`);
});

test('ordinary wide-eyed attention is not a startle: no composing blink, no reflex, and the episode is the one it always was', () => {
  for (let seed = 1; seed <= 12; seed++) {
    view = { ...REST, props: {} };
    log = [];
    t = 0;
    const em = createEmotion({ traits: PERSONALITY, now: () => t });
    const stop = startE(em, seed);
    run(500);
    view.props = { d: { kind: 'distortion', sx: 400, sy: 50 } }; // interest .9: sometimes met with wide eyes
    run(25000);
    stop();
    assert.equal(em.get().startled, false, `seed ${seed}`);
    assert.equal(em.takeCompose(), false, `seed ${seed}`);
    // the slow, composing blink (a long blink with small pupils) is not part of an ordinary look
    assert.ok(!log.some(([, p]) => p.eyes === 'blink' && p.pupils === 1), `seed ${seed}`);
  }
});

test('a genuine start is followed, at the next idle moment, by one slow composing blink, and the pace does not change', () => {
  const count = (compose) => {
    view = { ...REST, props: {} };
    log = [];
    t = 0;
    const em = createEmotion({ traits: PERSONALITY, now: () => t });
    const stop = startE(em, 5);
    run(1000);
    if (compose) em.note('startle');
    run(120000);
    stop();
    let n = 0;
    let prev = -1e9;
    for (const [time, p] of log) {
      if (time - prev > 2500 && Object.values(p).some((v) => v !== null && v !== 'c' && v !== 0 && v !== 'open')) n++;
      prev = time;
    }
    return { n, slow: log.filter(([, p]) => p.eyes === 'blink' && p.pupils === 1).length, first: log.findIndex(([, p]) => p.eyes === 'blink' && p.pupils === 1) };
  };
  const calm = count(false);
  const startled = count(true);
  assert.equal(calm.slow, 0);
  assert.equal(startled.slow, 1, 'one composing blink');
  assert.ok(startled.first >= 0 && startled.first < 3, 'it came at the first idle moment');
  assert.ok(Math.abs(startled.n - calm.n) <= 3, `${startled.n} moments against ${calm.n}`);
});

test('keyboard activity keeps it from artificial sleepiness; without it a long idle stretch does make it drowsy', () => {
  const run15 = (typing) => {
    view = { ...REST, props: {} };
    log = [];
    t = 0;
    const em = createEmotion({ traits: PERSONALITY, now: () => t });
    const w = { read: () => [], rect: () => null, pointerPos: () => null, lastActivity: () => (typing ? Math.max(0, t - 800) : 0) };
    const stop = startE(em, 2, w);
    let sleepy = 0;
    for (let i = 0; i < 15 * 60; i++) {
      run(1000, 100);
      if (em.get().kind === 'sleepy') sleepy++;
    }
    stop();
    return { sleepy, charge: em.get().charge.sleepy };
  };
  const typing = run15(true);
  const idle = run15(false);
  assert.equal(typing.sleepy, 0);
  assert.equal(typing.charge, 0);
  assert.ok(idle.sleepy > 0, 'it never got drowsy');
});
