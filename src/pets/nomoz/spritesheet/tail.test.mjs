import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANCHORS } from './anchors.js';
import { ART } from './spec.js';
import { SHEET_MANIFEST } from './manifest.js';
import { bendTail, decodeTail, lickAt, mouthLick, newTailState, stepTail, sway, tailTarget } from './tail.js';

// a 12 x 12 frame: a body block on the left and a tail rising on the right
const W = 12;
const H = 12;
const frame = () => {
  const px = new Uint8ClampedArray(W * H * 4);
  const put = (x, y, v) => px.set([v, v, v, 255], (y * W + x) * 4);
  for (let y = 6; y < 12; y++) for (let x = 0; x < 5; x++) put(x, y, 40); // body
  for (let y = 0; y < 12; y++) for (let x = 6; x < 9; x++) put(x, y, 90); // tail
  return px;
};
const TAIL = decodeTail({ x: 6, y: 0, rows: Array(12).fill('###'), base: [7, 11], tip: [7, 0] });
const alpha = (px, x, y) => px[(y * W + x) * 4 + 3];

test('decodeTail reads the # rows into a mask with the tail axis', () => {
  assert.equal(TAIL.w, 3);
  assert.equal(TAIL.h, 12);
  assert.equal(TAIL.mask.reduce((a, b) => a + b, 0), 36);
  assert.ok(Math.abs(TAIL.uy + 1) < 1e-9, 'the tail points up');
  assert.equal(decodeTail(null), null);
  assert.equal(decodeTail({ rows: [] }), null);
});

test('bendTail: no bend, no change; the root stays, the tip swings, the body is untouched', () => {
  const src = frame();
  assert.equal(bendTail(src, W, H, TAIL, 0, 1), null);
  assert.equal(bendTail(src, W, H, null, 2, 1), null);
  const out = bendTail(src, W, H, TAIL, 2.4, 1.5 + Math.PI / 2);
  assert.ok(out, 'bent');
  assert.deepEqual(Array.from(out.subarray(0, 5 * 4)), Array.from(src.subarray(0, 5 * 4)), 'the body row is unchanged');
  for (let y = 0; y < H; y++) for (let x = 0; x < 5; x++) assert.equal(alpha(out, x, y), alpha(src, x, y), 'body pixel kept');
  // the root rows (y 10, 11) hold still, the tip rows have moved sideways
  for (const y of [10, 11]) for (const x of [6, 7, 8]) assert.equal(alpha(out, x, y), 255);
  const cols = (y) => [...Array(W).keys()].filter((x) => x >= 5 && alpha(out, x, y) > 0);
  assert.notDeepEqual(cols(0), [6, 7, 8], 'the tip moved');
  assert.ok(cols(0).length >= 2 && cols(0).length <= 3, `and kept about its width (${cols(0).length})`);
});

test('bendTail never paints over a body pixel and keeps the amount of tail', () => {
  const src = frame();
  // the tail leans into the body: body pixels at x 5 must stay body
  for (const phase of [0.4, 1.9, 3.5, 5.2]) {
    const out = bendTail(src, W, H, TAIL, 3, phase);
    if (!out) continue;
    for (let y = 6; y < 12; y++) assert.equal(out[(y * W + 4) * 4], 40, 'body colour kept');
    let n = 0;
    for (let i = 3; i < out.length; i += 4) if (out[i]) n++;
    assert.ok(n >= 30 + 30 && n <= 30 + 42 + 6, `tail pixel count stays close (${n})`);
  }
});

test('the sway wave is zero at the root and grows toward the tip', () => {
  assert.equal(sway(0, 3, 1.2), 0);
  const tipMax = Math.max(...[...Array(32).keys()].map((i) => Math.abs(sway(1, 3, (i / 32) * 6.28))));
  const midMax = Math.max(...[...Array(32).keys()].map((i) => Math.abs(sway(0.5, 3, (i / 32) * 6.28))));
  assert.ok(tipMax > midMax && midMax > 0.3);
});

test('stepTail eases amplitude and rate: the phase never jumps, a state change never snaps', () => {
  const st = newTailState();
  st.phase = 0;
  const idle = tailTarget({ tail: null });
  const lash = tailTarget({ tail: 'lash' });
  let prev = st.phase;
  let maxJump = 0;
  for (let t = 0; t < 4000; t += 100) {
    stepTail(st, 100, t < 2000 ? idle : lash);
    let d = st.phase - prev;
    if (d < -Math.PI) d += Math.PI * 2;
    maxJump = Math.max(maxJump, d);
    prev = st.phase;
  }
  assert.ok(maxJump < 1.3, `phase advances smoothly (${maxJump.toFixed(2)} rad per 100 ms)`);
  const a = newTailState();
  stepTail(a, 100, lash);
  assert.ok(a.amp < lash.amp * 0.4, 'a new mode does not jump to full swing');
  stepTail(a, 9999, lash);
  assert.ok(a.amp <= lash.amp + 1e-9 && a.amp > lash.amp * 0.5, 'a long gap is capped');
});

test('the tail never hangs frozen: idle, grooming, dozing and walking all swing', () => {
  const states = {
    idle: { tail: null },
    groom: { pawL: 'high', eyes: 'closed' },
    doze: { eyes: 'closed', droop: 1 },
    walk: { legs: 1 },
    hop: { legs: 3 },
    up: { tail: 'up' },
    still: { tail: 'still' },
  };
  for (const [name, p] of Object.entries(states)) {
    const t = tailTarget(p);
    assert.ok(t.amp >= (name === 'still' ? 0.3 : 0.8), `${name} swings (${t.amp})`);
    assert.ok(t.period >= 400 && t.period <= 6000, `${name} has a sensible period`);
  }
  assert.ok(tailTarget({ tail: 'swish' }).amp > tailTarget({}).amp, 'swish is bigger');
  assert.ok(tailTarget({ mood: 'stressed' }).amp > tailTarget({ tail: 'swish' }).amp - 1, 'stressed lashes');
  assert.equal(tailTarget({}, 0).amp, 0, 'a clip can switch the sway off');
});

test('the groom lick works in bursts: quick strokes with the paw rising and the head dipping, then a rest', () => {
  const seen = { 0: 0, 1: 0, 2: 0 };
  let dips = 0;
  let restMs = 0;
  let pawUpNoTongue = 0;
  for (let t = 0; t < 1300 * 4; t += 10) {
    const l = lickAt(t);
    seen[l.tongue]++;
    dips += l.dip;
    if (!l.tongue && !l.dip && !l.paw && !l.wet) restMs += 10;
    if (l.paw && !l.tongue) pawUpNoTongue++;
    if (l.tongue === 2) assert.equal(l.dip, 1, 'the head is down while the tongue is out');
    if (l.tongue === 2) assert.equal(l.paw, 1, 'and the paw is up to meet it');
  }
  assert.ok(seen[2] > 60 && seen[1] > 40 && seen[0] > 200, 'tongue shows hidden, tip and out');
  assert.ok(dips > 60, 'the head dips');
  assert.ok(restMs >= 4 * 450, `every burst ends in a rest (${restMs} ms in four cycles)`);
  assert.ok(pawUpNoTongue > 30, 'the paw stays up between the strokes of a burst');
  // every fourth burst is a single stroke
  const outIn = (n) => { let c = 0, prev = 0; for (let t = n * 1300; t < (n + 1) * 1300; t += 5) { const o = lickAt(t).tongue === 2 ? 1 : 0; if (o && !prev) c++; prev = o; } return c; };
  assert.deepEqual([0, 1, 2, 3].map(outIn), [2, 2, 2, 1]);
  assert.deepEqual(mouthLick(10, 0), { tongue: 1, dip: 0, paw: 0, wet: 0 });
  assert.equal(mouthLick(200, 0).tongue, 2);
  assert.equal(mouthLick(600, 0).tongue, 0);
});

test('the shipped art lists tail pixels for every frame with a visible tail, and the groom clip licks', () => {
  const noTail = new Set(['curl']);
  for (const id of Object.keys(ART)) {
    if (noTail.has(id)) continue;
    ANCHORS[id].forEach((an, i) => {
      assert.ok(an.tail && an.tail.rows.length > 3, `${id}/${i} has tail pixels`);
      assert.ok(an.tail.rows.every((r) => /^[#.]+$/.test(r)));
    });
  }
  assert.ok(SHEET_MANIFEST.clips.sit_groom.lick, 'grooming draws a tongue');
  assert.equal(SHEET_MANIFEST.clips.curl.sway ?? 1, 1);
});

import { breathAt } from './tail.js';

test('breath helper', () => {
  assert.equal(breathAt(0, 4000), 1);
  assert.equal(breathAt(1700, 4000), 1);
  assert.equal(breathAt(1900, 4000), 0);
  assert.equal(breathAt(4000, 4000), 1, 'periodic');
});

test('no swing bends the tail by more than about half a pixel per row (no one-pixel jog on every row)', () => {
  const TAIL_ROWS = 21;
  for (const p of [{}, { tail: 'swish' }, { tail: 'lash' }, { mood: 'stressed' }, { legs: 1 }, { tail: 'up' }]) {
    const { amp } = tailTarget(p);
    let worst = 0;
    for (let k = 0; k < 64; k++) {
      const phase = (k / 64) * Math.PI * 2;
      for (let r = 0; r < TAIL_ROWS; r++) worst = Math.max(worst, Math.abs(sway((r + 1) / TAIL_ROWS, amp, phase) - sway(r / TAIL_ROWS, amp, phase)));
    }
    assert.ok(worst <= 0.62, `${JSON.stringify(p)}: ${worst.toFixed(2)} px per row`);
  }
});

test('walking: the tail swings once per stride (the clip cycle)', () => {
  assert.equal(tailTarget({ legs: 1 }, 1, 960).period, 960);
  assert.equal(tailTarget({ legs: 1 }, 1, 1200).period, 1200);
  assert.equal(tailTarget({ legs: 1 }, 1, 0).period, 1500, 'no gait: the default');
  assert.equal(tailTarget({ legs: 0 }, 1, 960).period, 3300, 'standing still ignores it');
});
