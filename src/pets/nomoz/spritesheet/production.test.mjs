import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPRITE_RENDERER } from '../config.js';
import { ART } from './spec.js';
import { artGaps } from './gaps.mjs';
import { decodePng } from './png.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/*
 * The sprite-sheet cat may become the production pet only when every frame it
 * can show is real, approved art. Frames assembled by code from approved parts
 * (`from: 'built'`) are stand-ins and block that switch; 'generated' art
 * (rendered by code, labelled as such) and 'reference' art pass. This test is the gate:
 * flipping SPRITE_RENDERER.mode to 'sheet' fails here until `gaps.mjs` is clean.
 */
test('production gate: the sheet renderer is only enabled when no stand-in art is used', () => {
  const { missing } = artGaps();
  if (SPRITE_RENDERER.mode === 'sheet') {
    assert.deepEqual(missing.map((m) => m.id), [], 'sheet mode is on but these art folders are code-built stand-ins');
  } else {
    assert.equal(SPRITE_RENDERER.mode, 'procedural');
  }
});

test('gap report: every art folder is classified, and the lists add up', () => {
  const { approved, generated, missing } = artGaps();
  assert.equal(approved.length + generated.length + missing.length, Object.keys(ART).length);
  for (const art of Object.values(ART)) assert.ok(['reference', 'generated', 'built'].includes(art.from), 'each folder says honestly how it was made');
  for (const m of missing) {
    assert.ok(m.clips.length > 0, `${m.id} is not used by any clip; it could be dropped`);
    assert.equal(m.files.length, m.frames);
  }
  // the approved frames are the 13 hash-guarded ones
  assert.equal(approved.reduce((n, a) => n + a.frames, 0), 13);
});

test('gaps.mjs --strict exits non-zero while stand-ins remain, and --json is parseable', () => {
  const { missing } = artGaps();
  const strict = spawnSync(process.execPath, [join(HERE, 'gaps.mjs'), '--strict'], { encoding: 'utf8' });
  assert.equal(strict.status, missing.length ? 1 : 0);
  const json = spawnSync(process.execPath, [join(HERE, 'gaps.mjs'), '--json'], { encoding: 'utf8' });
  assert.equal(json.status, 0);
  assert.equal(JSON.parse(json.stdout).missing.length, missing.length);
});

/* ---- the generated production frames (54 frames, 14 folders) ---- */
const FUR = new Set(['3,3,5', '9,8,11', '14,13,16', '16,15,19', '18,18,22', '21,21,25', '24,23,27', '24,24,28', '27,27,30', '37,36,39']);
const loadFrames = (id) =>
  readdirSync(join(HERE, 'art', id))
    .filter((f) => /^\d+\.png$/.test(f))
    .sort((a, b) => parseInt(a) - parseInt(b))
    .map((f) => decodePng(readFileSync(join(HERE, 'art', id, f))));
const generatedIds = Object.entries(ART).filter(([, a]) => a.from === 'generated').map(([id]) => id);
const lowestRow = (img) => {
  for (let y = img.height - 1; y >= 0; y--) for (let x = 0; x < img.width; x++) if (img.rgba[(y * img.width + x) * 4 + 3]) return y;
  return -1;
};

test('generated frames: 14 folders, 54 frames, and the counts match spec.js', () => {
  assert.equal(generatedIds.length, 14);
  assert.equal(generatedIds.reduce((n, id) => n + loadFrames(id).length, 0), 54);
  for (const id of generatedIds) assert.equal(loadFrames(id).length, ART[id].frames, id);
});

test('generated frames: 96 x 64, hard alpha, only the approved fur tones and eye yellows', () => {
  const yellow = (r, g, b) => r > 100 && r - b > 40; // the four approved eye yellows
  for (const id of generatedIds) {
    for (const [i, img] of loadFrames(id).entries()) {
      assert.deepEqual([img.width, img.height], [96, 64], `${id}/${i}`);
      for (let p = 0; p < img.width * img.height; p++) {
        const [r, g, b, a] = img.rgba.subarray(p * 4, p * 4 + 4);
        assert.ok(a === 0 || a === 255, `${id}/${i}: alpha ${a}`);
        if (a) assert.ok(FUR.has(`${r},${g},${b}`) || yellow(r, g, b), `${id}/${i}: colour ${r},${g},${b} is not in the approved palette`);
      }
    }
  }
});

test('generated frames: planted paws end on row 61 (a leap is raised 7 px, to row 54)', () => {
  for (const id of generatedIds) {
    for (const [i, img] of loadFrames(id).entries()) assert.equal(lowestRow(img), id.startsWith('leap') ? 54 : 61, `${id}/${i}`);
  }
});

test('generated frames: every frame is different art: no duplicates and no mirror images, within or across folders', () => {
  const seen = new Map();
  const key = (img, flip) => {
    const out = [];
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      const xx = flip ? img.width - 1 - x : x;
      out.push(img.rgba.subarray((y * img.width + xx) * 4, (y * img.width + xx) * 4 + 4).join(','));
    }
    return out.join('|');
  };
  for (const id of generatedIds) {
    for (const [i, img] of loadFrames(id).entries()) {
      const k = key(img, false);
      assert.ok(!seen.has(k), `${id}/${i} duplicates ${seen.get(k)}`);
      seen.set(k, `${id}/${i}`);
    }
  }
  for (const id of generatedIds) {
    for (const [i, img] of loadFrames(id).entries()) {
      const m = key(img, true);
      assert.ok(!seen.has(m), `${id}/${i} is a mirror of ${seen.get(m)}`);
    }
  }
});

test('generated frames: each step cycle has five different leg poses (two contacts, standing, two passing)', () => {
  const lower = (img) => {
    let h = 0;
    for (let y = 44; y < 62; y++) for (let x = 0; x < img.width; x++) h = (h * 31 + img.rgba[(y * img.width + x) * 4 + 3] * (x + 1)) | 0;
    return h;
  };
  for (const id of generatedIds.filter((x) => /^(walk|creep)_/.test(x) && x !== 'walk_side_even')) {
    const hs = loadFrames(id).map(lower);
    assert.equal(new Set(hs).size, 5, `${id}: the five poses (two contacts, standing, two passing) should all differ`);
  }
});
