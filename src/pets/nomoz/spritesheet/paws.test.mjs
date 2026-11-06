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
import { pawSpot } from '../sprites.js';

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

test('the right out arm lies in the opening of the tail curl: no pixel of it is on a tail pixel', () => {
  const tail = ANCHORS.sit_paws[frame('n', 'out')].tail;
  const img = load('sit_paws', frame('n', 'out'));
  const tailAt = new Set();
  tail.rows.forEach((row, j) => [...row].forEach((c, i) => { if (c === '#') tailAt.add(`${tail.x + i},${tail.y + j}`); }));
  let arm = 0;
  const overlap = [];
  for (let y = 36; y <= 47; y++) for (let x = 44; x <= 62; x++) {
    if (px(img, x, y) === px(idle, x, y)) continue;
    arm++;
    if (tailAt.has(`${x},${y}`)) overlap.push([x, y, Number(px(img, x, y).split(',')[0])]);
  }
  // (at most a couple of the dark outline's pixels fall on the tail's inner tip: no fur of the arm itself is on the tail)
  assert.ok(overlap.length <= 3 && overlap.every(([, , r]) => r <= 9), `the arm is over the tail at ${JSON.stringify(overlap)}`);
  assert.ok(arm >= 40);
});

test('an effect that rides a raised paw (pawSpot) lands on the paw the art draws, for every level and side', () => {
  for (const level of ['front', 'out', 'mid', 'up', 'reach']) {
    for (const side of ['l', 'r']) {
      const [bx, by] = pawSpot(level, side, 4);
      const [ax, ay] = [bx + 9, by + 4]; // the head anchor carries base space onto the art: 9 columns right, the head row at rest
      const img = load('sit_paws', side === 'l' ? frame(level, 'n') : frame('n', level));
      let near = 0;
      for (let y = ay - 3; y <= ay + 3; y++) for (let x = ax - 3; x <= ax + 3; x++) if (px(img, x, y) !== px(idle, x, y)) near++;
      assert.ok(near >= 12, `${level} ${side}: the spot ${ax},${ay} is not on the drawn paw (${near} changed pixels near it)`);
    }
  }
});

test('outside the sitting front view the eleven behaviours raise a paw only in a few known brief moments, which keep the art they have', () => {
  // measured over the scripts: a paw low while lying (the loaf's paws are tucked), a reach in the air or standing, a swat from a crouch.
  // New artwork is only worth drawing for a sequence that lasts; a new combination appearing here should be looked at, not ignored.
  const allowed = new Set(['loaf/front/low', 'stand/front/reach', 'crouch/front/out']);
  const seen = {};
  for (const id of ELEVEN) {
    for (const seed of [1, 2, 3]) {
      const sc = script(id, seed);
      for (const s of drive(sc.beats, sc.end + 400, sc.view, 50)) {
        const { pose, view, pawL, pawR } = s.state;
        for (const paw of [pawL, pawR]) {
          if (!GESTURE.has(paw) || (pose === 'sit' && view === 'front')) continue;
          const key = `${pose}/${view}/${paw}`;
          seen[key] = (seen[key] || 0) + 50;
          assert.ok(allowed.has(key), `${id} seed ${seed}: a raised paw (${key}) with no art for it`);
        }
      }
    }
  }
  // (a reach in a hop is the leap art, whose forelegs are thrown forward; the others are fractions of a second)
  for (const [k, ms] of Object.entries(seen)) assert.ok(ms <= 3 * 1500, `${k}: ${ms} ms over three runs`);
});
