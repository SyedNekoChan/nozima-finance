/*
 * Audit of the sheet manifest against the pet's real state space. Run from the
 * repo root:
 *
 *   node src/pets/nomoz/spritesheet/audit.mjs [--strict]
 *
 * It walks every pose x view x legs x raised paw x book x eyes x droop that the
 * procedural renderer can be asked for, resolves the clip each one selects, and
 * reports (1) states with no clip (they would draw the procedural cat, a
 * different style), (2) clips no state selects, (3) clips whose frames or
 * anchors are incomplete. --strict exits 1 if any of these exist.
 */
import { SHEET_MANIFEST } from './manifest.js';
import { normalizeManifest, selectClip } from './clips.js';
import { ANCHORS } from './anchors.js';
import { ART } from './spec.js';

const strict = process.argv.includes('--strict');
const man = normalizeManifest(SHEET_MANIFEST);
const problems = [];

// clips: every frame must have anchors and, unless the art is closed-eyed or
// faceless, eyes and whiskers
for (const [id, clip] of Object.entries(man.clips)) {
  const art = Object.keys(ART).find((k) => man.sheets[clip.sheet] && clip.sheet === `nomoz_${k}`);
  if (!art) problems.push(`clip ${id}: sheet ${clip.sheet} is not an art folder`);
  clip.frames.forEach((f, i) => {
    const an = clip.anchors && clip.anchors[i];
    if (!an) return problems.push(`clip ${id}: frame ${f} has no anchors`);
    if (ART[art] && ART[art].face && !an.whiskers) problems.push(`clip ${id}: frame ${f} has no whiskers`);
    if (ART[art] && ART[art].face && !an.eyes && !(ART[art].eyesOff || []).includes(f)) problems.push(`clip ${id}: frame ${f} has no eyes`);
  });
}
for (const id of Object.keys(ART)) if (!ANCHORS[id]) problems.push(`art ${id}: no anchors.js entry (run build.mjs anchors)`);

// the state space
const poses = ['sit', 'stand', 'crouch', 'stretch', 'low', 'loaf', 'curl'];
const views = ['front', 'frontQ', 'side', 'rearQ', 'rear'];
const turning = new Set(['sit', 'stand', 'crouch']); // only these turn (sprites.js TURN_POSES)
const used = new Set();
const uncovered = {};
let total = 0;
for (const pose of poses)
  for (const view of turning.has(pose) ? views : ['front'])
    for (const legs of [0, 1, 2, 3])
      for (const paw of [null, 'low', 'front', 'mid', 'high', 'out', 'up', 'reach', 'ear', 'face'])
        for (const book of [null, 0, 1, 2])
          for (const eyes of ['open', 'closed', 'blink', 'happy', 'wide', 'down'])
            for (const droop of [0, 1]) {
              total++;
              const p = { pose, view, legs, pawL: paw, pawR: null, book, eyes, droop, mood: 'idle' };
              const clip = selectClip(man, p);
              if (clip) used.add(clip.id);
              else (uncovered[`${pose}/${view}/legs ${legs}`] ??= 0), uncovered[`${pose}/${view}/legs ${legs}`]++;
            }
const unused = Object.keys(man.clips).filter((id) => !used.has(id));
const covered = total - Object.values(uncovered).reduce((a, b) => a + b, 0);

console.log(`${covered}/${total} states select a clip (${man.select.length} rules, ${Object.keys(man.clips).length} clips)`);
for (const [k, n] of Object.entries(uncovered)) console.log(`uncovered (procedural cat): ${k}  (${n} states)`);
if (unused.length) console.log(`clips no state selects: ${unused.join(', ')}`);
for (const p of problems) console.log(`problem: ${p}`);
process.exit(problems.length || (strict && (Object.keys(uncovered).length || unused.length)) ? 1 : 0);
