import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { encodePng, decodePng } from './png.mjs';
import { normalizeManifest, selectClip, frameAt, frameRect, fitsImage } from './clips.js';
import { SHEET_MANIFEST } from './manifest.js';
import { SPRITE_RENDERER, SHEET_SPRITE_SIZE } from '../config.js';
import { renderSprite } from '../sprites.js';
import { createSheetRenderer } from './renderer.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// Run a tool script as a child process (they exit the process themselves).
const run = (script, ...args) =>
  spawnSync(process.execPath, [join(HERE, script), ...args], { encoding: 'utf8' });

// Silences the manifest validator's warnings and returns them.
function quietly(fn) {
  const warnings = [];
  const orig = console.warn;
  console.warn = (m) => warnings.push(String(m));
  try {
    return { result: fn(), warnings };
  } finally {
    console.warn = orig;
  }
}

const SHEET = { src: 'a.png', frameWidth: 4, frameHeight: 3, columns: 3, rows: 2 };

/* ------------------------------------------------------------------ */
/* png.mjs                                                             */
/* ------------------------------------------------------------------ */

test('png: encode / decode round trip keeps every pixel', () => {
  const w = 5;
  const h = 4;
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 37) & 0xff;
  const img = decodePng(encodePng(w, h, rgba));
  assert.equal(img.width, w);
  assert.equal(img.height, h);
  assert.deepEqual(Array.from(img.rgba), Array.from(rgba));
});

test('png: rejects data that is not a PNG', () => {
  assert.throws(() => decodePng(Buffer.from('not a png at all')), /not a PNG/);
});

/* ------------------------------------------------------------------ */
/* clips.js                                                            */
/* ------------------------------------------------------------------ */

test('manifest: invalid sheets, clips and rules are skipped with warnings', () => {
  const { result, warnings } = quietly(() =>
    normalizeManifest({
      sheets: { ok: SHEET, noSrc: { ...SHEET, src: '' }, badSize: { ...SHEET, columns: 0 } },
      clips: {
        good: { sheet: 'ok', frames: [0, 1] },
        outside: { sheet: 'ok', frames: [6] },
        unknownSheet: { sheet: 'nope', frames: [0] },
        badMs: { sheet: 'ok', frames: [0, 1], ms: [100] },
        badStill: { sheet: 'ok', frames: [0], still: 1 },
      },
      select: [{ when: { pose: 'sit' }, clip: 'good' }, { when: { pose: 'sit' }, clip: 'missing' }, null],
    })
  );
  assert.deepEqual(Object.keys(result.sheets), ['ok']);
  assert.deepEqual(Object.keys(result.clips), ['good']);
  assert.equal(result.select.length, 1);
  assert.equal(warnings.length, 2 + 4 + 2);
  assert.deepEqual(quietly(() => normalizeManifest(null)).result, { sheets: {}, clips: {}, select: [] });
});

test('manifest: row shorthand expands to row-major frame indexes', () => {
  const m = quietly(() => normalizeManifest({ sheets: { s: SHEET }, clips: { r: { sheet: 's', row: 1, start: 1, count: 2 } } })).result;
  assert.deepEqual(m.clips.r.frames, [4, 5]);
});

test('selectClip: first matching rule wins; arrays, true / false and moving', () => {
  const m = quietly(() =>
    normalizeManifest({
      sheets: { s: SHEET },
      clips: { a: { sheet: 's', frames: [0] }, b: { sheet: 's', frames: [1] }, c: { sheet: 's', frames: [2] }, d: { sheet: 's', frames: [3] } },
      select: [
        { when: { pose: 'stand', moving: true, view: ['side', 'front'] }, clip: 'a' },
        { when: { pose: 'stand', moving: false, pawL: false }, clip: 'b' },
        { when: { pose: 'sit', droop: true }, clip: 'c' },
        { when: { pose: 'sit' }, clip: 'd' },
      ],
    })
  ).result;
  const pick = (p) => selectClip(m, p)?.id ?? null;
  assert.equal(pick({ pose: 'stand', legs: 1, view: 'side' }), 'a');
  assert.equal(pick({ pose: 'stand', legs: 3, view: 'front' }), 'a');
  assert.equal(pick({ pose: 'stand', legs: 1, view: 'rear' }), null);
  assert.equal(pick({ pose: 'stand', legs: 0, view: 'rear', pawL: null }), 'b');
  assert.equal(pick({ pose: 'stand', legs: 0, view: 'rear', pawL: 'up' }), null);
  assert.equal(pick({ pose: 'sit', droop: 1 }), 'c');
  assert.equal(pick({ pose: 'sit', droop: 0 }), 'd');
  assert.equal(pick({ pose: 'curl' }), null);
});

test('frameAt: loops, one-shots and still frames', () => {
  const m = quietly(() =>
    normalizeManifest({
      sheets: { s: SHEET },
      clips: {
        loop: { sheet: 's', frames: [0, 1, 2], ms: [100, 200, 300] },
        once: { sheet: 's', frames: [0, 1], ms: 100, loop: false },
        one: { sheet: 's', frames: [0] },
      },
    })
  ).result;
  assert.deepEqual(frameAt(m.clips.loop, 0), { index: 0, done: false, wait: 100 });
  assert.deepEqual(frameAt(m.clips.loop, 150), { index: 1, done: false, wait: 150 });
  assert.equal(frameAt(m.clips.loop, 600 + 50).index, 0);
  assert.equal(frameAt(m.clips.loop, -5).index, 0);
  assert.deepEqual(frameAt(m.clips.once, 99), { index: 0, done: false, wait: 1 });
  assert.deepEqual(frameAt(m.clips.once, 200), { index: 1, done: true, wait: Infinity });
  assert.equal(frameAt(m.clips.one, 12345).wait, Infinity);
});

test('frameRect and fitsImage honour margin and spacing', () => {
  const sheet = quietly(() => normalizeManifest({ sheets: { s: { ...SHEET, margin: 1, spacing: 2 } } })).result.sheets.s;
  assert.deepEqual(frameRect(sheet, 0), { x: 1, y: 1, w: 4, h: 3 });
  assert.deepEqual(frameRect(sheet, 4), { x: 7, y: 6, w: 4, h: 3 });
  assert.equal(fitsImage(sheet, 1 + 3 * 4 + 2 * 2, 1 + 2 * 3 + 2), true);
  assert.equal(fitsImage(sheet, 16, 8), false);
});

/* ------------------------------------------------------------------ */
/* The shipped manifest and art                                        */
/* ------------------------------------------------------------------ */

test('shipped manifest normalizes without skipping anything', () => {
  const { result, warnings } = quietly(() => normalizeManifest(SHEET_MANIFEST));
  assert.deepEqual(warnings, []);
  assert.equal(Object.keys(result.sheets).length, Object.keys(SHEET_MANIFEST.sheets).length);
  assert.equal(Object.keys(result.clips).length, Object.keys(SHEET_MANIFEST.clips).length);
  assert.equal(result.select.length, SHEET_MANIFEST.select.length);
  assert.ok(result.select.length > 0);
});

test('procedural renderer stays the default; sheet box is 96 x 64', () => {
  assert.equal(SPRITE_RENDERER.mode, 'procedural');
  assert.deepEqual({ ...SHEET_SPRITE_SIZE }, { width: 96, height: 64 });
});

test('a sheet renderer without usable data falls back to the procedural renderer', () => {
  assert.equal(typeof renderSprite, 'function');
  assert.equal(typeof createSheetRenderer({ manifest: {} }), 'function');
});

// The approved (reference-converted) frames must never change by accident.
const APPROVED = {
  'idle_front/0': '13f5cbb72de2eb73',
  'idle_front/1': 'f4dbba01f0d0e1e9',
  'idle_front/2': '274518259aaa7ddc',
  'idle_front/3': '948b826577b0ea07',
  'walk_side/0': '939895f310b90fad',
  'walk_side/1': '962644ab81ddd46d',
  'walk_side/2': '58cf90216d216043',
  'sit_threeq/0': '65b1c4518dd8d1bc',
  'sit_doze/0': '0ae036f11cc4a715',
  'sit_groom/0': '63b60f5556cf565d',
  'sit_rear/0': '9d3d60309d493b09',
  'curl/0': '6003921de4025b8c',
  'stretch/0': 'babd06358db04904',
};

for (const [frame, hash] of Object.entries(APPROVED)) {
  test(`approved art unchanged: ${frame}`, () => {
    const got = createHash('sha256').update(readFileSync(join(HERE, 'art', `${frame}.png`))).digest('hex').slice(0, 16);
    assert.equal(got, hash);
  });
}

/* ------------------------------------------------------------------ */
/* Tooling                                                             */
/* ------------------------------------------------------------------ */

for (const [script, args] of [
  ['build.mjs', ['check']],
  ['validate.mjs', ['--strict']],
  ['audit.mjs', ['--strict']],
]) {
  test(`${script} ${args.join(' ')} passes`, () => {
    const r = run(script, ...args);
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });
}
