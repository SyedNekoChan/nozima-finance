import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchWorld } from './worldwatch.js';

// minimal event targets
function target() {
  const l = {};
  return { addEventListener: (n, f) => ((l[n] ||= []).push(f)), removeEventListener: (n, f) => (l[n] = (l[n] || []).filter((x) => x !== f)), emit: (n, e = {}) => (l[n] || []).forEach((f) => f(e)), count: (n) => (l[n] || []).length };
}
const RECT = { x: 400, y: 300, width: 100, height: 70 }; // the cat, centre (450, 335)
let t;
function make() {
  const win = target();
  const doc = { ...target(), hidden: false, documentElement: target() };
  t = 0;
  const w = watchWorld({ getRect: () => RECT, win, doc, clock: () => t });
  const move = (x, y, dt = 16) => {
    t += dt;
    win.emit('pointermove', { clientX: x, clientY: y, pointerType: 'mouse' });
  };
  // a quick sweep across the cat's neighbourhood: from far left to far right in ~120 ms
  const sweep = () => {
    for (let i = 0; i <= 8; i++) move(150 + i * 80, 335, 16);
  };
  return { w, win, doc, move, sweep };
}

test('one incidental sweep past the cat is nothing; three in fifteen seconds are somebody moving about near it', () => {
  const { w, sweep } = make();
  sweep();
  assert.deepEqual(w.read(), []);
  t += 2000;
  sweep();
  assert.deepEqual(w.read(), []);
  t += 2000;
  sweep();
  const ev = w.read();
  assert.equal(ev.length, 1);
  assert.equal(ev[0].kind, 'pointer-fast');
  // and it starts counting again
  t += 2000;
  sweep();
  assert.deepEqual(w.read(), []);
});

test('sweeps spread over a minute, or far from the cat, never add up', () => {
  const { w, sweep, move } = make();
  for (let i = 0; i < 6; i++) {
    sweep();
    t += 20000;
  }
  assert.deepEqual(w.read(), []);
  // far away: well beyond four and a half cat-widths
  for (let i = 0; i < 6; i++) {
    for (let k = 0; k <= 8; k++) move(150 + k * 80, 900, 16);
    t += 1500;
  }
  assert.deepEqual(w.read(), []);
});

test('a mouse resting close by for a moment is reported once; moving off and back again can be reported again', () => {
  const { w, move } = make();
  move(520, 335);
  for (let i = 0; i < 12; i++) move(520, 336, 200); // 2.4 s resting
  assert.deepEqual(w.read().map((e) => e.kind), ['pointer-dwell']);
  for (let i = 0; i < 12; i++) move(521, 336, 200);
  assert.deepEqual(w.read(), [], 'again while it never left');
  move(900, 335, 50);
  t += 100;
  move(900, 340, 50);
  t += 100;
  move(520, 335);
  for (let i = 0; i < 30; i++) move(520, 336, 200); // it has to settle first, then rest
  assert.deepEqual(w.read().map((e) => e.kind), ['pointer-dwell']);
});

test('touch is ignored; the mouse leaving the page clears the pointer; the tab coming back is an event; stop() detaches', () => {
  const { w, win, doc, move } = make();
  for (let i = 0; i < 20; i++) {
    t += 16;
    win.emit('pointermove', { clientX: 450 + (i % 2) * 300, clientY: 335, pointerType: 'touch' });
  }
  assert.deepEqual(w.read(), []);
  assert.equal(w.pointerPos(), null);
  move(520, 335);
  assert.deepEqual(w.pointerPos(), { x: 520, y: 335 });
  doc.documentElement.emit('mouseleave');
  assert.equal(w.pointerPos(), null);
  doc.hidden = true;
  t += 100;
  doc.emit('visibilitychange');
  t += 20000;
  doc.hidden = false;
  doc.emit('visibilitychange');
  assert.deepEqual(w.read().map((e) => e.kind), ['return']);
  doc.hidden = true;
  doc.emit('visibilitychange');
  t += 2000;
  doc.hidden = false;
  doc.emit('visibilitychange');
  assert.deepEqual(w.read(), [], 'a short blink away is not a return');
  w.stop();
  assert.equal(win.count('pointermove'), 0);
  assert.equal(doc.count('visibilitychange'), 0);
});
