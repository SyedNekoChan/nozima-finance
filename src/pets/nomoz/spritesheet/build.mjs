/*
 * Sprite-sheet asset pipeline for NOMOZ.EXE (Node, no dependencies).
 *
 *   node src/pets/nomoz/spritesheet/build.mjs check    validate every frame PNG in art/
 *   node src/pets/nomoz/spritesheet/build.mjs sheets   assemble complete art folders into sheets/
 *
 * SOURCE OF TRUTH: art/<id>/<n>.png, one 96x64 PNG per frame (n from 0). The
 * first versions are converted from the user's reference by
 * art/source/convert_reference.py; after that they are hand-finished in
 * SpriteForge (its editor's PNG download, or `get_sprite` pixels) and
 * committed over the same file names. See SPEC.md for the whole workflow.
 *
 * A sheet (sheets/nomoz_<id>.png) is one row of frames and is only written
 * when every frame of the folder is present and valid. Sheets are not
 * registered here: that stays a deliberate edit of ./manifest.js.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from './png.mjs';
import { ART, FRAME, sheetId, sheetSize } from './spec.js';

const here = dirname(fileURLToPath(import.meta.url));
const ARTDIR = join(here, 'art');
const SHEETS = join(here, 'sheets');
const MAX_COLOURS = 32;

function frameFiles(id) {
  const dir = join(ARTDIR, id);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d+\.png$/.test(f))
    .sort((a, b) => parseInt(a) - parseInt(b))
    .map((f) => join(dir, f));
}

// Reads and checks one frame; throws with the reason.
function readFrame(path) {
  const img = decodePng(readFileSync(path));
  if (img.width !== FRAME.width || img.height !== FRAME.height) {
    throw new Error(`${img.width}x${img.height}, expected ${FRAME.width}x${FRAME.height}`);
  }
  const colours = new Set();
  let opaque = 0;
  for (let i = 0; i < img.rgba.length; i += 4) {
    const a = img.rgba[i + 3];
    if (a !== 0 && a !== 255) throw new Error('semi-transparent pixels (alpha must be 0 or 255)');
    if (a) {
      opaque++;
      colours.add((img.rgba[i] << 16) | (img.rgba[i + 1] << 8) | img.rgba[i + 2]);
    }
  }
  if (!opaque) throw new Error('empty frame');
  if (colours.size > MAX_COLOURS) throw new Error(`${colours.size} colours (at most ${MAX_COLOURS})`);
  return img;
}

function check() {
  let bad = 0;
  let done = 0;
  for (const dir of existsSync(ARTDIR) ? readdirSync(ARTDIR, { withFileTypes: true }) : []) {
    if (dir.isDirectory() && dir.name !== 'source' && !ART[dir.name]) {
      console.log(`problem: art/${dir.name} is not in spec.js`);
      bad++;
    }
  }
  for (const [id, a] of Object.entries(ART)) {
    const files = frameFiles(id);
    if (!files.length) continue;
    const problems = [];
    files.forEach((f, i) => {
      try {
        readFrame(f);
      } catch (err) {
        problems.push(`frame ${i}: ${err.message}`);
      }
    });
    if (files.length !== a.frames) problems.push(`has ${files.length} frames, needs ${a.frames}`);
    if (problems.length) {
      bad++;
      console.log(`problem: ${id}: ${problems.join('; ')}`);
    } else done++;
  }
  const todo = Object.keys(ART).filter((id) => !frameFiles(id).length);
  console.log(`${done}/${Object.keys(ART).length} art folders drawn and valid; still to draw: ${todo.join(', ') || 'none'}`);
  return bad;
}

function sheets() {
  mkdirSync(SHEETS, { recursive: true });
  for (const id of Object.keys(ART)) {
    const files = frameFiles(id);
    if (files.length !== ART[id].frames) continue;
    const size = sheetSize(id);
    const rgba = new Uint8Array(size.width * size.height * 4);
    files.forEach((f, col) => {
      const img = readFrame(f);
      for (let y = 0; y < FRAME.height; y++) {
        rgba.set(img.rgba.subarray(y * FRAME.width * 4, (y + 1) * FRAME.width * 4), (y * size.width + col * FRAME.width) * 4);
      }
    });
    writeFileSync(join(SHEETS, `${sheetId(id)}.png`), encodePng(size.width, size.height, rgba));
    console.log(`wrote sheets/${sheetId(id)}.png (${size.width}x${size.height})`);
  }
}

const cmd = process.argv[2];
if (cmd === 'check') process.exit(check() ? 1 : 0);
else if (cmd === 'sheets') {
  if (check()) process.exit(1);
  sheets();
} else console.log('usage: build.mjs check | sheets');
