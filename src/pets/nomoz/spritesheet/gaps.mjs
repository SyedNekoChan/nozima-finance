/*
 * Production-art gap report for the sprite-sheet cat.
 *
 *   node src/pets/nomoz/spritesheet/gaps.mjs            report (exit 0)
 *   node src/pets/nomoz/spritesheet/gaps.mjs --strict   exit 1 while any art is not approved
 *   node src/pets/nomoz/spritesheet/gaps.mjs --json     machine-readable
 *
 * "Approved" art (`from: 'reference'` in spec.js) is converted from the
 * user's reference sheet. "Built" art was assembled by code from approved
 * parts (art/source/build_missing.py); it is a stand-in, not the new artwork,
 * so the sprite-sheet renderer must not become the production pet while any
 * is still used. Replacing a folder with real art means: draw the frames in
 * SpriteForge, export 96 x 64 PNGs over art/<id>/<n>.png, set `from:
 * 'reference'` in spec.js, then run the sheet tools.
 */
import { ART, FRAME, sheetId } from './spec.js';
import { SHEET_MANIFEST } from './manifest.js';

export function artGaps() {
  const clipsBySheet = {};
  for (const [cid, clip] of Object.entries(SHEET_MANIFEST.clips)) (clipsBySheet[clip.sheet] ??= []).push(cid);
  const rulesByClip = {};
  for (const rule of SHEET_MANIFEST.select) (rulesByClip[rule.clip] ??= []).push(rule.when);

  const approved = [];
  const missing = [];
  for (const [id, art] of Object.entries(ART)) {
    if (art.from === 'reference') {
      approved.push({ id, frames: art.frames });
      continue;
    }
    const clips = clipsBySheet[sheetId(id)] || [];
    missing.push({
      id,
      frames: art.frames,
      files: Array.from({ length: art.frames }, (_, i) => `art/${id}/${i}.png`),
      size: `${FRAME.width}x${FRAME.height}`,
      standIn: art.note,
      required: `hand-drawn ${art.frames}-frame "${id}" art in the approved cat's style: ${FRAME.width}x${FRAME.height}, facing left, feet on row 61, hard alpha, the shared fur and eye colours`,
      clips,
      statesServed: clips.flatMap((c) => rulesByClip[c] || []).length,
    });
  }
  return { approved, missing };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { approved, missing } = artGaps();
  const sum = (a) => a.reduce((n, x) => n + x.frames, 0);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ approved, missing }, null, 2));
  } else {
    console.log(`approved art: ${approved.length} folders, ${sum(approved)} frames (${approved.map((a) => a.id).join(', ')})`);
    console.log(`NOT approved (code-assembled stand-ins): ${missing.length} folders, ${sum(missing)} frames\n`);
    for (const m of missing) {
      console.log(`- ${m.id}: ${m.frames} frame${m.frames > 1 ? 's' : ''} at ${m.size}, ${m.files[0]}${m.frames > 1 ? ` .. ${m.files.at(-1)}` : ''}`);
      console.log(`    required: ${m.required}`);
      console.log(`    current stand-in: ${m.standIn}`);
      console.log(`    used by clips: ${m.clips.join(', ') || 'none'} (${m.statesServed} selection rule${m.statesServed === 1 ? '' : 's'})`);
    }
  }
  if (process.argv.includes('--strict') && missing.length) process.exit(1);
}
