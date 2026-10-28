/*
 * Sprite-sheet asset pipeline for NOMOZ.EXE (Node, no dependencies).
 *
 *   node src/pets/nomoz/spritesheet/build.mjs check    validate every frame PNG in art/
 *   node src/pets/nomoz/spritesheet/build.mjs sheets   assemble complete art folders into sheets/ and write anchors.js
 *   node src/pets/nomoz/spritesheet/build.mjs anchors  only rewrite anchors.js (crown / chest-coin spots measured from the frames)
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
import { ART, CHEST_DY, FACE, FRAME, HEAD_COLUMNS, sheetId, sheetSize } from './spec.js';

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
    if (dir.isDirectory() && !['source', 'review'].includes(dir.name) && !ART[dir.name]) {
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

// Crown and chest-coin spots per frame, measured from the art: the crown's
// top-left is (mean x of the ear-tip rows - 4, ear top + 3), the coin's is
// (same x, ear top + CHEST_DY). Art with `head: null` lists its own spots.
function anchors() {
  const out = {};
  for (const [id, a] of Object.entries(ART)) {
    const files = frameFiles(id);
    if (files.length !== a.frames) continue;
    out[id] = files.map((f, i) => {
      if (!a.head) return a.anchors;
      const img = decodePng(readFileSync(f));
      const [c0, c1] = HEAD_COLUMNS[a.head];
      const opaque = (x, y) => img.rgba[(y * img.width + x) * 4 + 3] > 0;
      let top = -1;
      for (let y = 0; y < img.height && top < 0; y++) for (let x = c0; x < c1; x++) if (opaque(x, y)) top = y;
      let sum = 0;
      let n = 0;
      for (let y = top; y <= top + 4; y++) for (let x = c0; x < c1; x++) if (opaque(x, y)) (sum += x), n++;
      const cx = Math.round(sum / n) - 4;
      const dy = CHEST_DY[a.head];
      const face = a.face ? FACE[a.face] : null;
      const off = (a.eyesOff || []).includes(i);
      return {
        crown: [cx, top + 3],
        chest: dy === null || a.chest === false ? null : [cx, top + dy],
        ...(face && !off ? { eyes: face.eyes.map(([dx, dyy, w]) => [cx + 4 + dx, top + dyy, w]) } : {}),
        ...(face ? { whiskers: face.whiskers.map(([dx, dyy, dir, len]) => [cx + 4 + dx, top + dyy, dir, len]) } : {}),
      };
    });
  }
  const lines = Object.entries(out).map(([id, frames]) => `  ${id}: ${JSON.stringify(frames)},`);
  const text =
    '// Generated by build.mjs (anchors): where the crown and chest coin sit on each frame.\n' +
    '// Do not edit; change the art or spec.js and rerun `node build.mjs anchors`.\n' +
    `export const ANCHORS = {\n${lines.join('\n')}\n};\n`;
  writeFileSync(join(here, 'anchors.js'), text);
  console.log(`wrote anchors.js (${Object.keys(out).length} art folders)`);
}

const cmd = process.argv[2];
if (cmd === 'check') process.exit(check() ? 1 : 0);
else if (cmd === 'anchors') anchors();
else if (cmd === 'sheets') {
  if (check()) process.exit(1);
  sheets();
  anchors();
} else console.log('usage: build.mjs check | sheets | anchors');
