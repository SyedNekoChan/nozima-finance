import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startAmbientBlink } from './ambient.js';
import { AMBIENT } from '../config.js';
import { createRng } from './rng.js';

let view;
let log;
beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
  view = { eyes: 'open', offscreen: false, sx: 100 };
  log = [];
});
afterEach(() => mock.timers.reset());

let t = 0;
const apply = (p) => {
  Object.assign(view, p);
  log.push([t, p.eyes]);
};
const run = (ms, step = 10) => {
  for (let i = 0; i < ms; i += step) {
    t += step;
    mock.timers.tick(step);
  }
};
const start = (seed = 1) => {
  t = 0;
  return startAmbientBlink({ rng: createRng(seed), getView: () => view, apply, timing: AMBIENT.blink });
};

test('an awake cat blinks regularly: every few seconds, a short closure', () => {
  const stop = start();
  run(120000);
  stop();
  const closes = log.filter(([, e]) => e === 'blink');
  assert.ok(closes.length >= 15, `only ${closes.length} blinks in two minutes`);
  // every closure is reopened after closedMs, and the eyes are never left shut
  assert.equal(view.eyes, 'open');
  log.forEach(([time, e], i) => {
    if (e === 'blink') {
      assert.equal(log[i + 1]?.[1], 'open');
      assert.ok(Math.abs(log[i + 1][0] - time - AMBIENT.blink.closedMs) <= 20);
    }
  });
  // the longest stare is bounded by the configured interval
  const gaps = closes.slice(1).map(([time], i) => time - closes[i][0]);
  assert.ok(Math.max(...gaps) <= AMBIENT.blink.everyMs[1] + AMBIENT.blink.closedMs + 50, `longest stare ${Math.max(...gaps)} ms`);
  assert.ok(Math.min(...gaps) >= AMBIENT.blink.closedMs + AMBIENT.blink.doubleGapMs - 30);
  assert.ok(gaps.some((g) => g < 1000), 'a quick double blink happens now and then');
});

test('it never overrides or interrupts a behavior\'s own expression', () => {
  for (const eyes of ['closed', 'down', 'wide', 'happy', 'blink']) {
    view = { eyes, offscreen: false, sx: 100 };
    log = [];
    const stop = start(2);
    run(60000);
    stop();
    assert.deepEqual(log, [], `${eyes}: ambient blinker touched the eyes`);
    assert.equal(view.eyes, eyes);
  }
  // off screen and before placement
  for (const v of [{ eyes: 'open', offscreen: true, sx: 5 }, { eyes: 'open', offscreen: false, sx: null }]) {
    view = v;
    log = [];
    const stop = start(3);
    run(30000);
    stop();
    assert.deepEqual(log, []);
  }
});

test('a behavior that changes the eyes during a blink keeps its change', () => {
  const stop = start(4);
  run(AMBIENT.blink.firstMs[1]); // first blink has happened by now
  while (view.eyes !== 'blink') run(10);
  view.eyes = 'wide'; // a behavior takes over mid-blink
  run(500);
  assert.equal(view.eyes, 'wide');
  stop();
  assert.equal(view.eyes, 'wide');
});

test('stop() cancels the timer and reopens eyes it left closed', () => {
  const stop = start(5);
  while (view.eyes !== 'blink') run(10);
  stop();
  assert.equal(view.eyes, 'open');
  const n = log.length;
  run(60000);
  assert.equal(log.length, n, 'no activity after stop');
});

test('it resumes after a behavior expression ends', () => {
  view.eyes = 'closed';
  const stop = start(6);
  run(20000);
  assert.deepEqual(log, []);
  view.eyes = 'open';
  run(AMBIENT.blink.retryMs[1] + AMBIENT.blink.everyMs[1]);
  stop();
  assert.ok(log.some(([, e]) => e === 'blink'));
});
