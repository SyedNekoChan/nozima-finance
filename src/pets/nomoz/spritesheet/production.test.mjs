import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPRITE_RENDERER } from '../config.js';
import { ART } from './spec.js';
import { artGaps } from './gaps.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/*
 * The sprite-sheet cat may become the production pet only when every frame it
 * can show is real, approved art. Frames assembled by code from approved parts
 * (`from: 'built'`) are stand-ins and block that switch. This test is the gate:
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
  const { approved, missing } = artGaps();
  assert.equal(approved.length + missing.length, Object.keys(ART).length);
  for (const art of Object.values(ART)) assert.ok(art.from === 'reference' || art.from === 'built', 'each folder is approved (reference) or a stand-in (built)');
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
