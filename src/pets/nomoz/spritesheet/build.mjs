/*
 * Sprite-sheet asset pipeline for NOMOZ.EXE (Node, no dependencies).
 *
 *   node src/pets/nomoz/spritesheet/build.mjs draft    art/draft/<clip>.txt -> art/<clip>/<n>.png
 *   node src/pets/nomoz/spritesheet/build.mjs check    validate every frame PNG in art/
 *   node src/pets/nomoz/spritesheet/build.mjs sheets   assemble complete groups into sheets/
 *
 * SOURCE OF TRUTH: art/<clip>/<n>.png, one 56x60 PNG per frame (n from 0),
 * edited in SpriteForge and exported by hand (the editor's PNG download, or
 * the png_url of an edit session). art/draft/<clip>.txt is an optional
 * text form of the same frames (one character per pixel, characters from
 * the sprite palette in ../sprites.js, '.' transparent, frames separated by
 * a blank line) used to seed a clip before it is hand-finished.
 *
 * A group sheet (nomoz_<group>.png) is only written when every clip of the
 * group is present and valid, so a half-finished group never reaches the
 * manifest. Sheets are not registered here: that stays a deliberate edit
 * of ./manifest.js.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from './png.mjs';
import { paletteColor } from '../sprites.js';
import { FRAME, GROUPS, clipId, sheetId, sheetSize, VIEWS } from './spec.js';

const here = dirname(fileURLToPath(import.meta.url));
const ART = join(here, 'art');
const SHEETS = join(here, 'sheets');

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function draft() {
  const dir = join(ART, 'draft');
  let n = 0;
  for (const file of existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.txt')) : []) {
    const clip = file.replace(/\.txt$/, '');
    const frames = readFileSync(join(dir, file), 'utf8').trim().split(/\n\s*\n/);
    mkdirSync(join(ART, clip), { recursive: true });
    frames.forEach((text, i) => {
      const rows = text.split('\n');
      if (rows.length !== FRAME.height || rows.some((r) => r.length !== FRAME.width)) {
        throw new Error(`${file} frame ${i}: must be ${FRAME.width}x${FRAME.height} characters`);
      }
      const rgba = new Uint8Array(FRAME.width * FRAME.height * 4);
      rows.forEach((row, y) => {
        [...row].forEach((ch, x) => {
          if (ch === '.') return;
          const hex = paletteColor(ch);
          if (!hex) throw new Error(`${file} frame ${i}: unknown palette character "${ch}"`);
          rgba.set([...hexToRgb(hex), 255], (y * FRAME.width + x) * 4);
        });
      });
      writeFileSync(join(ART, clip, `${i}.png`), encodePng(FRAME.width, FRAME.height, rgba));
      n++;
    });
  }
  console.log(`drafted ${n} frame(s)`);
}

function frameFiles(clip) {
  const dir = join(ART, clip);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d+\.png$/.test(f))
    .sort((a, b) => parseInt(a) - parseInt(b))
    .map((f) => join(dir, f));
}

// Reads and checks one frame; returns { rgba } or throws with the reason.
function readFrame(path) {
  const img = decodePng(readFileSync(path));
  if (img.width !== FRAME.width || img.height !== FRAME.height) {
    throw new Error(`${img.width}x${img.height}, expected ${FRAME.width}x${FRAME.height}`);
  }
  const colours = new Set();
  for (let i = 0; i < img.rgba.length; i += 4) {
    const a = img.rgba[i + 3];
    if (a !== 0 && a !== 255) throw new Error('semi-transparent pixels (alpha must be 0 or 255)');
    if (a) colours.add((img.rgba[i] << 16) | (img.rgba[i + 1] << 8) | img.rgba[i + 2]);
  }
  if (colours.size > 64) throw new Error(`${colours.size} colours (keep to the sprite palette, 64 at most)`);
  return img;
}

function clips() {
  const out = [];
  for (const [group, g] of Object.entries(GROUPS)) {
    for (const view of g.views) out.push({ group, view, id: clipId(group, view), frames: g.frames });
  }
  return out;
}

function check() {
  let bad = 0;
  let done = 0;
  for (const c of clips()) {
    const files = frameFiles(c.id);
    if (!files.length) continue;
    const problems = [];
    files.forEach((f, i) => {
      try {
        readFrame(f);
      } catch (err) {
        problems.push(`frame ${i}: ${err.message}`);
      }
    });
    if (files.length !== c.frames) problems.push(`has ${files.length} frames, needs ${c.frames}`);
    if (problems.length) {
      bad++;
      console.log(`problem: ${c.id}: ${problems.join('; ')}`);
    } else done++;
  }
  console.log(`${done}/${clips().length} clips drawn and valid`);
  return bad;
}

function sheets() {
  for (const [group, g] of Object.entries(GROUPS)) {
    const size = sheetSize(group);
    const rgba = new Uint8Array(size.width * size.height * 4);
    const missing = [];
    g.views.forEach((view) => {
      const id = clipId(group, view);
      const row = g.views.length > 1 ? VIEWS.indexOf(view) : 0;
      const files = frameFiles(id);
      if (files.length !== g.frames) return missing.push(id);
      files.forEach((f, col) => {
        const img = readFrame(f);
        for (let y = 0; y < FRAME.height; y++) {
          const src = img.rgba.subarray(y * FRAME.width * 4, (y + 1) * FRAME.width * 4);
          rgba.set(src, ((row * FRAME.height + y) * size.width + col * FRAME.width) * 4);
        }
      });
    });
    if (missing.length) {
      if (missing.length < g.views.length) console.log(`${group}: incomplete, still to draw: ${missing.join(', ')}`);
      continue;
    }
    mkdirSync(SHEETS, { recursive: true });
    writeFileSync(join(SHEETS, `${sheetId(group)}.png`), encodePng(size.width, size.height, rgba));
    console.log(`${group}: wrote sheets/${sheetId(group)}.png (${size.width}x${size.height})`);
  }
}

const cmd = process.argv[2];
if (cmd === 'draft') draft();
else if (cmd === 'check') process.exit(check() ? 1 : 0);
else if (cmd === 'sheets') {
  if (check()) process.exit(1);
  sheets();
} else console.log('usage: build.mjs draft | check | sheets');
