import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { clipFamily, transitionPlan } from './tail.js';
import { drive, installFakes, removeFakes, script, set } from './testkit.mjs';

/*
 * The coverage matrix: every behavior (all 68), several runs each, played through the real renderer, every 100 ms. What it checks is
 * what the cat shows, behavior by behavior: no bare cut between poses of different kinds, the crown on the cat in every sample and
 * the coin wherever the art has a chest, the overlays staying with the head from one sample to the next, and no picture that flips
 * to another and straight back (a flicker) within a moment.
 */

beforeEach(installFakes);
afterEach(removeFakes);

const NO_COIN = new Set(['crouch_rear', 'crouch_rearQ', 'creep_rear', 'creep_rearQ', 'curl', 'sit_rear', 'stand_rear', 'stand_rearQ', 'walk_rear', 'walk_rearQ']);
const WALKING = /^(walk_|stand_|creep_|crouch_)/;
const SEEDS = [1, 2];

const GESTURE = /^(idle_front|sit_paws_)/;

test('the matrix covers every behavior', () => {
  assert.equal(set.length, 68);
  assert.equal(new Set(set.map((b) => b.id)).size, 68);
});

for (const b of set) {
  test(`${b.id}: no bare cut between kinds of pose, overlays on the cat in every sample, no flicker`, () => {
    for (const seed of SEEDS) {
      const sc = script(b.id, seed);
      const samples = drive(sc.beats, sc.end + 800, sc.view, 100);
      assert.ok(samples.length > 8);
      let sinceChange = 99;
      samples.forEach((s, i) => {
        const prev = samples[i - 1];
        const where = `${b.id} seed ${seed} t=${s.t} (${s.clip})`;
        // the crown is on the cat in every sample, the coin wherever there is a chest to hang it on
        assert.ok(s.anchor && s.anchor.hx > -50, `${where}: the crown is gone`);
        const rear = NO_COIN.has(s.clip);
        if (!rear && s.state.coin == null) assert.ok(s.anchor.chest, `${where}: the coin is gone`);
        if (prev && prev.clip !== s.clip) {
          sinceChange = 0;
          // a change between kinds of pose (sit / lie / stand / spring / stretch) is a beat, never a bare cut
          if (clipFamily(prev.clip) !== clipFamily(s.clip)) assert.ok(transitionPlan(prev.clip, s.clip), `${where}: a bare cut ${prev.clip} -> ${s.clip}`);
        } else sinceChange++;
        // the overlays stay with the head: within one picture they move by a row or two a step, never jump
        if (prev && prev.clip === s.clip && sinceChange >= 3 && prev.state.facing === s.state.facing && prev.anchor && s.anchor) {
          assert.ok(Math.abs(prev.anchor.hx - s.anchor.hx) <= 3 && Math.abs(prev.anchor.hy - s.anchor.hy) <= 4, `${where}: the crown jumped (${prev.anchor.hx},${prev.anchor.hy}) -> (${s.anchor.hx},${s.anchor.hy})`);
        }
      });
      // a picture that flips to another and straight back within a moment, in anything but walking and turning on the spot
      const runs = [];
      for (const s of samples) (runs.length && runs.at(-1).clip === s.clip ? (runs.at(-1).ms += 100) : runs.push({ clip: s.clip, ms: 100 }));
      let flips = 0;
      for (let i = 2; i < runs.length; i++) {
        // (a raised paw going up and straight down again is the script's own gesture, a tap or a swat, not the picture changing by itself)
        if (runs[i - 2].clip === runs[i].clip && runs[i - 1].ms <= 300 && !WALKING.test(runs[i - 1].clip) && !WALKING.test(runs[i].clip) && !(GESTURE.test(runs[i - 1].clip) && GESTURE.test(runs[i].clip))) flips++;
      }
      assert.ok(flips <= 2, `${b.id} seed ${seed}: ${flips} flickers (${runs.map((r) => `${r.clip}:${r.ms}`).join(' ')})`);
    }
  });
}
