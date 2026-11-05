import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodePng } from './png.mjs';
import { selectClip } from './clips.js';
import { transitionPlan } from './tail.js';
import { BASE, drive, installFakes, man, removeFakes, script } from './testkit.mjs';
import { ANCHORS } from './anchors.js';

/*
 * The crown and the chest coin, and the head they sit on, through every clip and through the movements that move the head:
 * where the anchors are on the real art, and what the renderer reports while the head breathes, nods and chews.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
beforeEach(installFakes);
afterEach(removeFakes);

/* ---- the anchors against the art ---------------------------------------------------------------------------------------- */

const sheets = {};
const sheetPixels = (id) => (sheets[id] ||= decodePng(readFileSync(join(HERE, 'sheets', `${id}.png`))));

// every frame of every clip: where the crown and the coin land on the cat's own pixels
function frames() {
  const out = [];
  for (const [id, clip] of Object.entries(man.clips)) {
    const png = sheetPixels(clip.sheet);
    clip.frames.forEach((frame, i) => {
      const an = clip.anchors && (clip.anchors[i] || clip.anchors[0]);
      const op = (x, y) => x >= 0 && x < 96 && y >= 0 && y < 64 && png.rgba[(y * png.width + frame * 96 + x) * 4 + 3] > 0;
      out.push({ id, i, an, op });
    });
  }
  return out;
}

test('every clip frame has a crown that rests on the head: it touches the cat along its whole width, and is not left hanging in the air', () => {
  for (const { id, i, an, op } of frames()) {
    assert.ok(an && an.crown, `${id} frame ${i}: no crown anchor (the crown vanishes in this pose)`);
    const [cx, cy] = an.crown;
    assert.ok(cx >= 0 && cx + 8 <= 96 && cy >= 0 && cy + 4 <= 64, `${id} ${i}: the crown is outside the frame`);
    let touching = 0;
    for (let x = cx; x < cx + 8; x++) {
      let any = false;
      for (let y = cy + 3; y <= cy + 6; y++) any = any || op(x, y); // the crown's lower edge, and the three rows under it
      touching += any;
    }
    assert.ok(touching >= 7, `${id} ${i}: the crown touches the cat in only ${touching} of 8 columns`);
    let covered = 0;
    for (let y = cy; y < cy + 4; y++) for (let x = cx; x < cx + 8; x++) covered += op(x, y);
    assert.ok(covered >= 6, `${id} ${i}: only ${covered} of 32 crown pixels are over the cat (it floats above the head)`);
  }
});

test('every chest coin hangs on the body: at least three quarters of it is over the cat, in every frame that shows one', () => {
  let coins = 0;
  for (const { id, i, an, op } of frames()) {
    if (!an.chest) continue;
    coins++;
    const [x0, y0] = an.chest;
    let over = 0;
    for (let y = y0; y < y0 + 8; y++) for (let x = x0; x < x0 + 8; x++) over += op(x, y);
    assert.ok(over >= 48, `${id} ${i}: only ${over} of 64 coin pixels are on the cat`);
    // and under the crown: the pendant hangs from the neck, below the head's top
    assert.ok(y0 >= an.crown[1] + 5, `${id} ${i}: the coin is not below the crown`);
  }
  assert.ok(coins >= 40);
});

test('the clips with no coin are exactly those where the cat faces away or has its neck tucked in', () => {
  const none = [...new Set(frames().filter((f) => !f.an.chest).map((f) => f.id))].sort();
  assert.deepEqual(
    none,
    ['crouch_rear', 'crouch_rearQ', 'creep_rear', 'creep_rearQ', 'curl', 'sit_rear', 'stand_rear', 'stand_rearQ', 'walk_rear', 'walk_rearQ'].sort(),
    'a clip gained or lost its coin'
  );
});

test('the crown and the coin of the sitting, grooming and sleeping art sit on the measured head and chest', () => {
  assert.deepEqual(ANCHORS.sit_groom[0].crown, [28, 5]);
  assert.deepEqual(ANCHORS.sit_groom[0].chest, [31, 37]);
  assert.deepEqual(ANCHORS.curl[0].crown, [22, 31]);
  assert.equal(ANCHORS.curl[0].chest, null);
});

/* ---- what the renderer reports while the head moves --------------------------------------------------------------------- */

test('the crown and the coin follow the head as it breathes: on every breath the head and the pendant above the cut move together', () => {
  for (const [clip, base, restHy, coinAbove] of [
    ['sit_threeq', { view: 'frontQ' }, null, true],
    ['sit_rear', { view: 'rear' }, null, false],
    ['curl', { pose: 'curl', eyes: 'closed' }, null, false],
  ]) {
    const samples = drive([], 9000, base).filter((s) => s.clip === clip);
    const hys = samples.map((s) => s.anchor.hy);
    const lo = Math.min(...hys);
    assert.deepEqual([...new Set(hys)].sort(), [lo, lo + 1], `${clip}: the crown does not rise and fall by one row with the breath`);
    const dippedSamples = samples.filter((s) => s.anchor.hy === lo + 1);
    assert.ok(dippedSamples.length > 20 && dippedSamples.length < samples.length - 20, `${clip}: it never rises, or never falls`);
    if (coinAbove) {
      const ys = samples.map((s) => s.anchor.chest.y);
      assert.deepEqual([...new Set(ys)].sort(), [Math.min(...ys), Math.min(...ys) + 1], `${clip}: the coin did not follow the chest`);
      // together: the coin is down exactly when the crown is down
      assert.ok(samples.every((s) => (s.anchor.chest.y === Math.min(...ys) + 1) === (s.anchor.hy === lo + 1)), `${clip}: the crown and the coin moved apart`);
    }
  }
});

test('a standing or crouching cat held still breathes too, and its crown and coin go with the body', () => {
  for (const [clip, base] of [['stand_front', { pose: 'stand', view: 'front' }], ['stand_side', { pose: 'stand', view: 'side' }], ['stand_rear', { pose: 'stand', view: 'rear' }], ['crouch_frontQ', { pose: 'crouch', view: 'frontQ' }]]) {
    const samples = drive([], 9000, base).filter((s) => s.clip === clip);
    const hys = samples.map((s) => s.anchor.hy);
    const lo = Math.min(...hys);
    assert.deepEqual([...new Set(hys)].sort(), [lo, lo + 1], `${clip}: a held pose does not breathe`);
    assert.ok(hys.filter((y) => y === lo + 1).length > 20 && hys.filter((y) => y === lo).length > 20, `${clip}: it never rises, or never falls`);
  }
});

test('a nod (the script\'s droop) bobs the head a row, and the crown and the coin bob with it', () => {
  const beats = [];
  for (let i = 0; i < 6; i++) beats.push({ t: 400 + i * 500, patch: { droop: 1 } }, { t: 650 + i * 500, patch: { droop: 0 } });
  const s = drive(beats, 3600);
  const hys = s.map((x) => x.anchor.hy);
  const lo = Math.min(...hys);
  assert.deepEqual([...new Set(s.map((x) => x.clip))], ['idle_front'], 'the nod is not a change of picture');
  for (const x of s) assert.equal(x.anchor.hy, x.state.droop ? lo + 1 : lo, `t=${x.t}`);
  // the coin hangs below the nodding part: it stays on the chest
  assert.equal(new Set(s.map((x) => x.anchor.chest.y)).size, 1);
});

test('eating bobs the head with each bite, and lowering to the bowl is not a bare cut', () => {
  for (const seed of [1, 2, 3]) {
    const sc = script('eat', seed);
    const samples = drive(sc.beats, sc.end + 600, sc.view);
    const low = samples.filter((s) => s.clip === 'low_front');
    assert.ok(low.length > 100, `seed ${seed}: ${low.length} samples at the bowl`);
    // the head is a row lower on a bite (droop) than between bites, on the same frame of the art
    const mean = (xs) => xs.reduce((t, x) => t + x, 0) / xs.length;
    const bite = low.filter((s) => s.state.droop).map((s) => s.anchor.hy);
    const rest = low.filter((s) => !s.state.droop).map((s) => s.anchor.hy);
    assert.ok(bite.length > 20, `seed ${seed}: ${bite.length} bite samples`);
    const d = mean(bite) - mean(rest);
    assert.ok(d > 0.6 && d < 1.4, `seed ${seed}: the head is ${d.toFixed(2)} rows lower on a bite (it should be one)`);
    const names = [];
    for (const s of samples) if (names.at(-1) !== s.clip) names.push(s.clip);
    for (let i = 1; i < names.length; i++) {
      if (/^(low_front|loaf_front|curl)$/.test(names[i]) || /^(low_front|loaf_front|curl)$/.test(names[i - 1])) assert.ok(transitionPlan(names[i - 1], names[i]), `seed ${seed}: a bare cut ${names[i - 1]} -> ${names[i]}`);
    }
  }
});

test('blinks, closed and happy eyes never change the picture of the sitting cat: the head, ears and whiskers stay where they are', () => {
  const sel = (o) => selectClip(man, { ...BASE, ...o }).id;
  for (const eyes of ['open', 'blink', 'closed', 'happy', 'down', 'wide']) assert.equal(sel({ eyes }), 'idle_front', eyes);
  assert.equal(man.clips.idle_front_closed, undefined, 'the closed-eye swap frame is not a clip any more');
  // a whole run of behaviors that blink a lot stays on one picture
  for (const id of ['sit', 'longPause', 'stillness', 'look']) {
    const sc = script(id, 3);
    const beats = [...sc.beats];
    for (let t = 300; t < sc.end; t += 700) beats.push({ t, patch: { eyes: 'blink' } }, { t: t + 150, patch: { eyes: 'open' } });
    beats.sort((a, z) => a.t - z.t);
    const clips = new Set(drive(beats, sc.end, sc.view).map((s) => s.clip));
    assert.deepEqual([...clips], ['idle_front'], `${id}: ${[...clips]}`);
  }
});
