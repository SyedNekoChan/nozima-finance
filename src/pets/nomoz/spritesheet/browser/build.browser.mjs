/*
 * Production-build verification, in real Chromium.
 *
 *   npm run test:browser
 *
 * Builds the app twice with Vite's JS API into temporary folders:
 *   - the default configuration (SPRITE_RENDERER.mode is 'procedural'), and
 *   - the same sources with the existing SPRITE_RENDERER switch flipped to
 *     'sheet' in memory by a plugin (src/pets/nomoz/config.js is not edited).
 * Each build is served with `vite preview` and driven at desktop and mobile
 * sizes. The sheet build must emit the shipped sheet images byte for byte
 * (or inline them), fetch them over HTTP as image/png, and render them; the
 * default build must stay procedural and never fetch a sheet.
 *
 * With CI=true or REQUIRE_BROWSER=1 a missing browser is an error.
 */
import { before, after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASE, REQUIRED, ROOT, importFromProject, loadPlaywright, openAt, sampleCanvas, sheetModePlugin } from './support.mjs';

const SHEET_DIR = join(ROOT, 'src/pets/nomoz/spritesheet/sheets');
const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 780 };

let skipReason = null;
let browser = null;
const builds = {};
const tmp = mkdtempSync(join(tmpdir(), 'nomoz-build-'));

const unavailable = (why) => {
  if (REQUIRED) throw new Error(`browser tests are required but cannot run: ${why}`);
  skipReason = why;
};

async function buildAndServe(name, flipToSheet) {
  const vite = await importFromProject('node_modules/vite/dist/node/index.js');
  const react = (await importFromProject('node_modules/@vitejs/plugin-react/dist/index.js')).default;
  const flip = sheetModePlugin();
  const outDir = join(tmp, name);
  await vite.build({
    root: ROOT,
    configFile: false,
    base: BASE,
    plugins: [react(), ...(flipToSheet ? [flip] : [])],
    build: { outDir, emptyOutDir: true, reportCompressedSize: false },
    logLevel: 'error',
  });
  const server = await vite.preview({
    root: ROOT,
    configFile: false,
    base: BASE,
    build: { outDir },
    preview: { host: '127.0.0.1', port: 0, strictPort: false },
    logLevel: 'error',
  });
  const addr = server.httpServer.address();
  return { outDir, server, url: `http://127.0.0.1:${addr.port}${BASE}`, flipped: flip.flipped };
}

before(async () => {
  const pw = loadPlaywright();
  if (!pw) return void unavailable('playwright is not installed');
  try {
    browser = await pw.chromium.launch();
  } catch (err) {
    return void unavailable(`Chromium could not launch: ${String(err.message).split('\n')[0]}`);
  }
  builds.procedural = await buildAndServe('procedural', false);
  builds.sheet = await buildAndServe('sheet', true);
});

after(async () => {
  await browser?.close();
  for (const b of Object.values(builds)) await new Promise((r) => b.server.httpServer.close(r));
  rmSync(tmp, { recursive: true, force: true });
});

const guard = (name, fn) =>
  test(name, async (t) => {
    if (skipReason) return t.skip(skipReason);
    await fn(t);
  });

const distFiles = (b) => readdirSync(join(b.outDir, 'assets'));
const jsOf = (b) =>
  distFiles(b)
    .filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(join(b.outDir, 'assets', f), 'utf8'))
    .join('\n');

describe('production build', () => {
  guard('the sheet build really has sheet mode on; the default build does not', () => {
    assert.ok(builds.sheet.flipped >= 1, 'the SPRITE_RENDERER switch was not applied');
    assert.equal(builds.procedural.flipped, 0);
    assert.match(readFileSync(join(ROOT, 'src/pets/nomoz/config.js'), 'utf8'), /SPRITE_RENDERER = \{ mode: 'procedural' \}/);
  });

  guard('every shipped sheet is in the sheet build: emitted byte for byte, or inlined', () => {
    const files = distFiles(builds.sheet);
    const js = jsOf(builds.sheet);
    const sources = readdirSync(SHEET_DIR).filter((f) => f.endsWith('.png'));
    assert.ok(sources.length >= 21);
    let emitted = 0;
    for (const f of sources) {
      const bytes = readFileSync(join(SHEET_DIR, f));
      const stem = f.replace('.png', '');
      const out = files.find((x) => x.startsWith(stem + '-') && x.endsWith('.png'));
      if (out) {
        assert.ok(readFileSync(join(builds.sheet.outDir, 'assets', out)).equals(bytes), `${out} differs from the source sheet`);
        emitted++;
      } else {
        assert.ok(js.includes(bytes.toString('base64')), `${f} is neither emitted nor inlined`);
      }
    }
    assert.ok(emitted >= 1);
  });

  for (const [vpName, viewport, mobile] of [['desktop', DESKTOP, false], ['mobile', MOBILE, true]]) {
    guard(`default build, ${vpName}: procedural 56 x 60 cat draws; no sheet is fetched`, async () => {
      const { ctx, page, log } = await openAt(browser, builds.procedural.url, { viewport, mobile });
      let s = await sampleCanvas(page);
      for (let i = 0; i < 40 && s.n <= 100; i++) {
        await page.waitForTimeout(250); // the pet may be briefly off screen
        s = await sampleCanvas(page);
      }
      assert.deepEqual([s.w, s.ht], [56, 60]);
      assert.ok(s.n > 100, `pet nearly blank (${s.n} px)`);
      assert.deepEqual(log.images.filter((i) => /nomoz_/.test(i.url)), []);
      assert.deepEqual(log.errors, []);
      await ctx.close();
    });

    guard(`sheet build, ${vpName}: sheets load as image/png (200), a 96 x 64 canvas renders and animates`, async () => {
      const { ctx, page, log } = await openAt(browser, builds.sheet.url, { viewport, mobile });
      const seen = new Set();
      let n = 0;
      for (let i = 0; i < 50; i++) {
        await page.waitForTimeout(200);
        const s = await sampleCanvas(page);
        if (s) {
          seen.add(s.h);
          n = Math.max(n, s.n); // the pet may be briefly off screen
        }
      }
      const s = await sampleCanvas(page);
      assert.deepEqual([s.w, s.ht], [96, 64]);
      assert.ok(n > 300, `pet nearly blank (${n} px)`);
      assert.ok(seen.size >= 2, 'the canvas never changed');
      const sheets = log.images.filter((i) => /nomoz_[a-z_]+-[\w-]+\.png/.test(i.url));
      // small sheets are inlined as data: URIs and need no request; the rest must be fetched
      assert.ok(sheets.length >= 1, `no emitted sheet was requested: ${JSON.stringify(log.images.map((i) => i.url.slice(-40)))}`);
      for (const i of sheets) {
        assert.equal(i.status, 200, i.url);
        assert.match(i.type, /image\/png/, i.url);
      }
      assert.deepEqual(log.failed, []);
      assert.deepEqual(log.errors, []);
      assert.deepEqual(log.warnings.filter((w) => /nomoz sheets/.test(w)), []);
      await ctx.close();
    });
  }
});
