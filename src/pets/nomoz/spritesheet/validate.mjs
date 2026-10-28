/*
 * Asset check for the NOMOZ.EXE sprite sheets. Run from the repo root:
 *
 *   node src/pets/nomoz/spritesheet/validate.mjs [--strict]
 *
 * Reports manifest entries that are invalid, registered sheets whose PNG
 * is missing or the wrong size, and which required clips (see ./spec.js)
 * are still unregistered. --strict exits 1 unless everything is present.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SHEET_MANIFEST } from './manifest.js';
import { normalizeManifest } from './clips.js';
import { FRAME, GROUPS, requiredClips, sheetId, sheetSize } from './spec.js';

const strict = process.argv.includes('--strict');
const man = normalizeManifest(SHEET_MANIFEST);
const problems = [];

const pngSize = (src) => {
  const path = src.startsWith('file:') ? fileURLToPath(src) : src;
  const b = readFileSync(path);
  if (b.length < 24 || b.toString('latin1', 1, 4) !== 'PNG') throw new Error('not a PNG');
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
};

for (const [group, g] of Object.entries(GROUPS)) {
  const sheet = man.sheets[sheetId(group)];
  if (!sheet) continue;
  const want = sheetSize(group);
  if (sheet.frameWidth !== FRAME.width || sheet.frameHeight !== FRAME.height || sheet.columns !== want.columns || sheet.rows !== want.rows) {
    problems.push(`${sheet.id}: layout must be ${want.columns}x${want.rows} frames of ${FRAME.width}x${FRAME.height}`);
  }
  try {
    const got = pngSize(sheet.src);
    if (got.width !== want.width || got.height !== want.height) {
      problems.push(`${sheet.id}: PNG is ${got.width}x${got.height}, expected ${want.width}x${want.height}`);
    }
  } catch (err) {
    problems.push(`${sheet.id}: ${err.message}`);
  }
  void g;
}

const required = requiredClips();
const missing = Object.keys(required).filter((id) => !man.clips[id]);
for (const [id, want] of Object.entries(required)) {
  const clip = man.clips[id];
  if (clip && clip.frames.length !== want.frames) problems.push(`${id}: needs ${want.frames} frames, has ${clip.frames.length}`);
}

const total = Object.keys(required).length;
console.log(`registered ${total - missing.length}/${total} required clips, ${man.select.length} select rules`);
if (missing.length) console.log(`missing: ${missing.join(', ')}`);
for (const p of problems) console.log(`problem: ${p}`);
process.exit(problems.length || (strict && missing.length) ? 1 : 0);
