import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmotion, NO_EMOTION } from './emotion.js';
import { PERSONALITY } from '../nomoz/config.js';

let t = 0;
let beh = null;
const make = (traits = PERSONALITY) => {
  t = 1000;
  beh = null;
  return createEmotion({ traits, now: () => t, sources: { behavior: () => beh } });
};
const advance = (ms, step = 1000, tick = (e) => e.tick({})) => {
  for (let i = 0; i < ms; i += step) {
    t += step;
    tick(EM);
  }
};
let EM;
const fresh = (traits) => (EM = make(traits));

test('a new cat is content, and stays content on its own', () => {
  fresh();
  assert.deepEqual({ kind: EM.get().kind, level: EM.get().level, startled: EM.get().startled }, { kind: 'content', level: 0, startled: false });
  assert.deepEqual(NO_EMOTION, { kind: 'content', level: 0, startled: false });
  // with the pointer moving about (so it never gets drowsy), nothing stirs
  for (let i = 0; i < 600; i++) {
    t += 1000;
    EM.tick({ activityAt: t });
  }
  assert.equal(EM.get().kind, 'content');
});

test('noticing something new makes it curious, then it fades back to content by itself', () => {
  fresh();
  EM.note('noticed', 0.85);
  assert.equal(EM.get().kind, 'curious');
  assert.ok(EM.get().level > 0.3);
  advance(10000, 1000, (e) => e.tick({ activityAt: t }));
  assert.equal(EM.get().kind, 'curious', 'it does not drop it at once');
  advance(75000, 1000, (e) => e.tick({ activityAt: t }));
  assert.equal(EM.get().kind, 'content');
});

test('something it has seen before (a habituated one) barely stirs it', () => {
  fresh();
  EM.note('noticed', 0.85 * Math.pow(0.55, 3));
  assert.equal(EM.get().kind, 'content');
});

test('one sweep of the mouse is nothing; repeated disturbance irritates, mildly, and it passes', () => {
  fresh();
  EM.note('disturb');
  assert.equal(EM.get().kind, 'content');
  for (let i = 0; i < 3; i++) {
    advance(12000, 1000, (e) => e.tick({ activityAt: t }));
    EM.note('disturb');
  }
  assert.equal(EM.get().kind, 'irritated');
  assert.ok(EM.get().charge.irritated <= PERSONALITY.cap.irritated);
  advance(120000, 1000, (e) => e.tick({ activityAt: t }));
  assert.equal(EM.get().kind, 'content');
});

test('playing (yarn) makes it playful, a calm enjoyable thing settles it', () => {
  fresh();
  EM.note('play');
  assert.equal(EM.get().kind, 'playful');
  beh = { last: 'groom', at: 1 };
  EM.tick({ activityAt: t }); // primes
  beh = { last: 'groom', at: 2 };
  EM.tick({ activityAt: t });
  assert.equal(EM.get().kind, 'content', 'grooming settled the playfulness');
});

test('a finished behavior is turned into an event once, and what finished before the first look is ignored', () => {
  fresh();
  beh = { last: 'yarnPlay', at: 5 };
  EM.tick({ activityAt: t });
  assert.equal(EM.get().kind, 'content', 'stale');
  EM.tick({ activityAt: t });
  assert.equal(EM.get().kind, 'content');
  beh = { last: 'yarnPlay', at: 9 };
  EM.tick({ activityAt: t });
  assert.equal(EM.get().kind, 'playful');
  // the same finish is not counted twice
  const before = EM.get().charge.playful;
  EM.tick({ activityAt: t });
  assert.ok(EM.get().charge.playful <= before);
});

test('the first behavior after a quiet start counts', () => {
  fresh();
  EM.tick({ activityAt: t });
  beh = { last: 'treasure', at: 3 };
  EM.tick({ activityAt: t });
  assert.ok(EM.get().charge.playful > 0);
});

test('feelings do not flicker: a rival must beat the current one by a margin and after a minimum dwell', () => {
  fresh();
  EM.note('noticed', 1);
  assert.equal(EM.get().kind, 'curious');
  EM.note('play');
  EM.note('play');
  assert.equal(EM.get().kind, 'curious', 'held for the dwell');
  const kinds = new Set();
  for (let i = 0; i < 300; i++) {
    t += 1000;
    EM.tick({ activityAt: t });
    kinds.add(EM.get().kind);
  }
  assert.ok(kinds.size <= 3, [...kinds].join());
});

test('an irritated cat is not playful, however much play it is offered', () => {
  fresh();
  for (let i = 0; i < 5; i++) EM.note('disturb');
  assert.equal(EM.get().kind, 'irritated');
  EM.note('play');
  EM.note('play');
  assert.equal(EM.get().kind, 'irritated', JSON.stringify(EM.get()));
});

test('personality: gain scales how strongly the same event charges, the cap limits how far', () => {
  const eager = { ...PERSONALITY, gain: { ...PERSONALITY.gain, curious: 2 } };
  const aloof = { ...PERSONALITY, gain: { ...PERSONALITY.gain, curious: 0.4 } };
  fresh(eager);
  EM.note('noticed', 0.8);
  const a = EM.get().charge.curious;
  fresh(aloof);
  EM.note('noticed', 0.8);
  const b = EM.get().charge.curious;
  assert.ok(a > b * 3);
  fresh();
  for (let i = 0; i < 20; i++) EM.note('noticed', 1);
  assert.ok(EM.get().charge.curious <= PERSONALITY.cap.curious);
  assert.equal(aloof.cap.curious, PERSONALITY.cap.curious);
  assert.equal(EM.get().kind, 'curious');
});

/* ---- sleepiness ---------------------------------------------------------------------------------------------- */

test('sleepiness develops gradually: not within minutes, not while there is activity', () => {
  fresh();
  advance(5 * 60000, 1000); // five minutes of nothing at all
  assert.notEqual(EM.get().kind, 'sleepy');
  fresh();
  // eleven minutes, but the mouse keeps moving somewhere on the page
  advance(11 * 60000, 1000, (e) => e.tick({ activityAt: t }));
  assert.equal(EM.get().kind, 'content');
});

test('after a long stretch with nothing at all it gets drowsy, and activity wakes it up', () => {
  fresh();
  advance(12 * 60000, 1000);
  assert.equal(EM.get().kind, 'sleepy');
  assert.ok(EM.get().level > 0);
  EM.note('return');
  advance(60000, 1000, (e) => e.tick({ activityAt: t }));
  assert.notEqual(EM.get().kind, 'sleepy');
});

test('even a cat left completely alone for hours is sleepy for a small share of the time (never predominantly)', () => {
  fresh();
  let sleepy = 0;
  let total = 0;
  let longest = 0;
  let run = 0;
  for (let i = 0; i < 4 * 3600; i++) {
    t += 1000;
    EM.tick({});
    total++;
    if (EM.get().kind === 'sleepy') (sleepy++, run++);
    else run = 0;
    longest = Math.max(longest, run);
  }
  assert.ok(sleepy / total < 0.2, `sleepy ${(100 * sleepy / total).toFixed(1)}% of the time`);
  assert.ok(sleepy > 0, 'it never got drowsy at all');
  assert.ok(longest * 1000 <= PERSONALITY.sleepy.maxDwellMs + 6000, `drowsy for ${longest}s at a stretch`);
});

test('having slept clears the drowsiness and it does not return soon', () => {
  fresh();
  advance(12 * 60000, 1000);
  assert.equal(EM.get().kind, 'sleepy');
  beh = { last: 'sleep', at: 1 };
  EM.tick({});
  EM.tick({});
  beh = { last: 'sleep', at: 2 };
  EM.tick({});
  assert.notEqual(EM.get().kind, 'sleepy');
  advance(5 * 60000, 1000);
  assert.notEqual(EM.get().kind, 'sleepy');
});

test('a throttled background tab does not fast-forward the feelings', () => {
  fresh();
  for (let i = 0; i < 20; i++) {
    t += 60000; // one tick a minute
    EM.tick({});
  }
  assert.notEqual(EM.get().kind, 'sleepy');
});

/* ---- startle, display gaps, weights ------------------------------------------------------------------------------ */

test('a start is a short reflex, not a state', () => {
  fresh();
  EM.note('startle');
  assert.equal(EM.get().startled, true);
  t += 2000;
  assert.equal(EM.get().startled, true);
  t += 1000;
  assert.equal(EM.get().startled, false);
  assert.ok(['content', 'curious'].includes(EM.get().kind));
});

test('ordinary attention and curiosity never start the startle reflex or owe a composing blink', () => {
  fresh();
  for (const e of ['noticed', 'noticed:yarn', 'disturb', 'return', 'play', 'comfort']) EM.note(e, 1);
  assert.equal(EM.get().startled, false);
  assert.equal(EM.takeCompose(), false);
});

test('after a genuine start a composing blink is owed once, and only for a while', () => {
  fresh();
  EM.note('startle');
  assert.equal(EM.takeCompose(), true);
  assert.equal(EM.takeCompose(), false, 'once');
  EM.note('startle');
  t += PERSONALITY.composeMs + 1;
  assert.equal(EM.takeCompose(), false, 'it came too late to matter');
});

test('a finished startle behavior is a genuine start', () => {
  fresh();
  beh = { last: 'sit', at: 1 };
  EM.tick({});
  beh = { last: 'startle', at: 2 };
  EM.tick({});
  assert.equal(EM.get().startled, true);
  assert.equal(EM.takeCompose(), true);
});

test('flavoured displays are rationed: at most once per their gap', () => {
  fresh();
  assert.equal(EM.permit('huff'), true);
  t += 10000;
  assert.equal(EM.permit('huff'), false);
  t += PERSONALITY.displayGapMs.huff;
  assert.equal(EM.permit('huff'), true);
  assert.equal(EM.permit('anythingElse'), true);
});

test('moment weights: content leaves them alone; every emotion keeps the TOTAL, so it changes which moment, not how often', () => {
  fresh();
  const w = { glance: 3.5, listen: 2.5, tilt: 2, squint: 2, tail: 1.8, alert: 0.8, sly: 0.7 };
  assert.deepEqual(EM.shape(w, { kind: 'content', level: 0 }), w);
  const total = (o) => Object.values(o).reduce((s, v) => s + v, 0);
  for (const kind of ['curious', 'playful', 'sleepy', 'irritated']) {
    for (const level of [0.2, 0.6, 1]) {
      const out = EM.shape(w, { kind, level });
      assert.ok(Math.abs(total(out) - total(w)) < 1e-9, `${kind} ${level}`);
      assert.ok(Object.values(out).every((v) => v >= 0));
    }
  }
  const sleepy = EM.shape(w, { kind: 'sleepy', level: 1 });
  assert.ok(sleepy.squint > w.squint && sleepy.slowBlink > 0 && sleepy.alert < w.alert);
  const irr = EM.shape(w, { kind: 'irritated', level: 1 });
  assert.ok(irr.huff > 0 && irr.tilt < w.tilt && irr.sly < w.sly);
  const cur = EM.shape(w, { kind: 'curious', level: 1 });
  assert.ok(cur.tilt > w.tilt);
  // partial intensity is partial
  assert.ok(EM.shape(w, { kind: 'curious', level: 0.3 }).tilt < cur.tilt);
});

test('keyboard use (reported as activity) keeps it from ever getting drowsy, however long it goes on', () => {
  fresh();
  for (let i = 0; i < 60 * 60; i++) {
    t += 1000;
    EM.tick({ activityAt: t - 500 }); // a key pressed every second or so
  }
  assert.equal(EM.get().charge.sleepy, 0);
  assert.equal(EM.get().kind, 'content');
});

test('events that do not exist are ignored; no emotion layer without traits is not an error to call', () => {
  fresh();
  EM.note('nonsense');
  assert.equal(EM.get().kind, 'content');
});
