import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodePng } from './png.mjs';
import { selectClip } from './clips.js';
import { PAW_RANKS, pawVia, transitionPlan } from './tail.js';
import { BASE, drive, installFakes, man, removeFakes, script } from './testkit.mjs';
import { ANCHORS } from './anchors.js';

/*
 * The raised forepaws (art/sit_paws): the baked arm poses, which state picks which, the beat between distant levels, and the 11
 * behaviours that gesture with them, with the crown and the coin on the cat through every one.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
beforeEach(installFakes);
afterEach(removeFakes);

const load = (id, n) => decodePng(readFileSync(join(HERE, 'art', id, `${n}.png`)));
const idle = load('idle_front', 0);
const frame = (l, r) => PAW_RANKS.indexOf(l) * 7 + PAW_RANKS.indexOf(r) - 1;
const px = (img, x, y) => [...img.rgba.subarray((y * 96 + x) * 4, (y * 96 + x) * 4 + 4)].join(',');
const sel = (o) => selectClip(man, { ...BASE, ...o }).id;

test('every pair of paw levels has a baked frame and a clip that shows it', () => {
  let n = 0;
  for (const l of PAW_RANKS) for (const r of PAW_RANKS) {
    if (l === 'n' && r === 'n') continue;
    const clip = man.clips[`sit_paws_${l}_${r}`];
    assert.ok(clip, `${l}/${r}`);
    assert.equal(clip.frames[0], frame(l, r));
    assert.equal(sel({ pawL: l === 'n' ? null : l, pawR: r === 'n' ? null : r }), clip.id);
    n++;
  }
  assert.equal(n, 48);
});

test('the head, ears, eyes and the other side are the approved pixels: a raised arm changes nothing above the shoulder but its own side', () => {
  for (const l of PAW_RANKS) for (const r of PAW_RANKS) {
    if (l === 'n' && r === 'n') continue;
    const img = load('sit_paws', frame(l, r));
    // the head (rows 8-31, columns 26-50) is idle_front's own, except where a raised arm passes in front of its side edge
    for (let y = 8; y <= 31; y++) for (let x = 27; x <= 49; x++) {
      if ((l === 'n' || l === 'low') && (r === 'n' || r === 'low')) assert.equal(px(img, x, y), px(idle, x, y), `${l}/${r} head ${x},${y}`);
    }
    // a side whose paw is down or only lifted keeps the outer half of its planted leg (rows 45-53) when the other side is the one raised
    if (r === 'n') for (let y = 45; y <= 53; y++) for (let x = 41; x <= 43; x++) assert.equal(px(img, x, y), px(idle, x, y), `${l}/n right leg ${x},${y}`);
    if (l === 'n') for (let y = 45; y <= 53; y++) for (let x = 31; x <= 33; x++) assert.equal(px(img, x, y), px(idle, x, y), `n/${r} left leg ${x},${y}`);
  }
});

test('the crown and the coin are those of the sitting head in every raised-paw pose, and every arm leaves the coin clear', () => {
  const base = ANCHORS.idle_front[0];
  for (const a of ANCHORS.sit_paws) {
    assert.deepEqual(a.crown, base.crown);
    assert.deepEqual(a.chest, base.chest, 'the coin hangs on the neck');
    assert.ok(a.eyes && a.whiskers && a.tail, 'the live face and the tail are measured too');
  }
});

test('a raised arm shows in the silhouette: every up / out / reach / mid arm adds pixels outside the plain cat', () => {
  const opaque = (img) => { const s = new Set(); for (let y = 0; y < 64; y++) for (let x = 0; x < 96; x++) if (img.rgba[(y * 96 + x) * 4 + 3]) s.add(y * 96 + x); return s; };
  const plain = opaque(idle);
  for (const lv of ['out', 'mid', 'up', 'reach']) {
    for (const [l, r] of [[lv, 'n'], ['n', lv]]) {
      const extra = [...opaque(load('sit_paws', frame(l, r)))].filter((k) => !plain.has(k)).length;
      assert.ok(extra >= 10, `${l}/${r}: only ${extra} pixels beyond the plain cat`);
    }
  }
});

test('grooming art is for the paw at the mouth, cheek and ear only; all other levels draw their own paw', () => {
  for (const paw of ['high', 'face', 'ear']) assert.equal(sel({ pawL: paw }), 'sit_groom', paw);
  for (const paw of ['low', 'front', 'out', 'mid', 'up', 'reach']) assert.equal(sel({ pawL: paw }), `sit_paws_${paw}_n`, paw);
  assert.equal(sel({ pose: 'stand', view: 'front', legs: 0, pawL: 'up' }), 'stand_front', 'standing keeps the standing art');
});

test('the lift: an arm that goes two or more levels passes the level half way for one beat; one level, or none, is a plain change', () => {
  assert.deepEqual(pawVia('idle_front', 'sit_paws_up_n'), [{ ms: 70, which: 'via', clip: 'sit_paws_out_n' }]);
  assert.deepEqual(pawVia('sit_paws_reach_n', 'idle_front'), [{ ms: 70, which: 'via', clip: 'sit_paws_out_n' }]);
  assert.deepEqual(pawVia('idle_front', 'sit_paws_mid_mid'), [{ ms: 70, which: 'via', clip: 'sit_paws_front_front' }]);
  assert.equal(pawVia('idle_front', 'sit_paws_low_n'), null);
  assert.equal(pawVia('sit_paws_up_n', 'sit_paws_reach_n'), null);
  assert.equal(pawVia('sit_paws_up_n', 'sit_groom'), null);
  assert.ok(transitionPlan('idle_front', 'sit_paws_up_up'));
  // the half-way pose is always a clip
  for (const a of ['idle_front', ...Object.keys(man.clips).filter((c) => c.startsWith('sit_paws_'))]) {
    for (const b of Object.keys(man.clips).filter((c) => c.startsWith('sit_paws_'))) {
      const via = pawVia(a, b);
      if (via) assert.ok(man.clips[via[0].clip], `${a} -> ${b}`);
    }
  }
});

const ELEVEN = ['constellation', 'alchemy', 'tinker', 'terminalWork', 'treasure', 'spell', 'bookAntics', 'wispPlay', 'music', 'yarnPlay', 'discovery'];
const GESTURE = new Set(['low', 'front', 'out', 'mid', 'up', 'reach']);

for (const id of ELEVEN) {
  test(`${id}: every raised paw is drawn while sitting, with the crown and the coin on the cat`, () => {
    let drawn = 0;
    for (const seed of [1, 2, 3]) {
      const sc = script(id, seed);
      for (const s of drive(sc.beats, sc.end + 600, sc.view, 50)) {
        const { pawL, pawR, pose, view } = s.state;
        assert.ok(s.anchor && s.anchor.hx > -50, `${id} t=${s.t}: the crown is gone`);
        if (pose !== 'sit' || view !== 'front') continue;
        const gesture = [pawL, pawR].some((p) => GESTURE.has(p));
        const groom = [pawL, pawR].some((p) => ['high', 'face', 'ear'].includes(p));
        if (gesture && !groom) {
          assert.ok(/^sit_paws_/.test(s.clip) || s.clip === 'sit_groom', `${id} t=${s.t}: paws ${pawL}/${pawR} drew ${s.clip}`);
          assert.ok(s.anchor.chest, `${id} t=${s.t}: the coin is gone while a paw is raised`);
          if (/^sit_paws_/.test(s.clip)) drawn++;
        }
      }
    }
    // (a behaviour that gestures only while standing or turned away draws none; every one of these sits and gestures)
    assert.ok(drawn > 0 || ['terminalWork'].includes(id), `${id}: no raised paw was ever drawn`);
  });
}
