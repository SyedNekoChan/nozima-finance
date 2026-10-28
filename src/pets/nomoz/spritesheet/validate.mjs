/*
 * Asset check for the NOMOZ.EXE sprite sheets. Run from the repo root:
 *
 *   node src/pets/nomoz/spritesheet/validate.mjs [--strict]
 *
 * Reports manifest entries that are invalid, registered sheets whose PNG is
 * missing or the wrong size, and which planned art (spec.js) has no
 * registered sheet yet. --strict exits 1 unless every planned art is
 * registered.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SHEET_MANIFEST } from './manifest.js';
import { normalizeManifest } from './clips.js';
import { ART, FRAME, sheetId, sheetSize } from './spec.js';

const strict = process.argv.includes('--strict');
const man = normalizeManifest(SHEET_MANIFEST);
const problems = [];

const pngSize = (src) => {
  const path = src.startsWith('file:') ? fileURLToPath(src) : src;
  const b = readFileSync(path);
  if (b.length < 24 || b.toString('latin1', 1, 4) !== 'PNG') throw new Error('not a PNG');
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
};

for (const id of Object.keys(ART)) {
  const sheet = man.sheets[sheetId(id)];
  if (!sheet) continue;
  const want = sheetSize(id);
  if (sheet.frameWidth !== FRAME.width || sheet.frameHeight !== FRAME.height || sheet.columns !== want.columns || sheet.rows !== 1) {
    problems.push(`${sheet.id}: layout must be ${want.columns}x1 frames of ${FRAME.width}x${FRAME.height}`);
  }
  try {
    const got = pngSize(sheet.src);
    if (got.width !== want.width || got.height !== want.height) {
      problems.push(`${sheet.id}: PNG is ${got.width}x${got.height}, expected ${want.width}x${want.height}`);
    }
  } catch (err) {
    problems.push(`${sheet.id}: ${err.message}`);
  }
}
for (const sheet of Object.values(man.sheets)) {
  if (!Object.keys(ART).some((id) => sheetId(id) === sheet.id)) problems.push(`${sheet.id}: not in spec.js ART`);
}

const unregistered = Object.keys(ART).filter((id) => !man.sheets[sheetId(id)]);
console.log(`registered ${Object.keys(ART).length - unregistered.length}/${Object.keys(ART).length} sheets, ${Object.keys(man.clips).length} clips, ${man.select.length} select rules`);
if (unregistered.length) console.log(`not registered: ${unregistered.join(', ')}`);
for (const p of problems) console.log(`problem: ${p}`);
process.exit(problems.length || (strict && unregistered.length) ? 1 : 0);
