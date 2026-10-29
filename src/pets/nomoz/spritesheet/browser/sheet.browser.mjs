/*
 * Real-browser tests for the sprite-sheet path (Chromium through Playwright).
 *
 *   npm run test:browser
 *
 * Needs `playwright` (a pinned devDependency) with its Chromium build
 * (`npx playwright install chromium`); it is looked up in the project, then in
 * the global npm root. Locally every test is skipped with a reason when it or
 * the browser is missing; with CI=true or REQUIRE_BROWSER=1 that is an error.
 *
 * What is real here: the shipped PNG sheets, real canvases, the real
 * renderer and procedural fallback, real timers and clocks, a real
 * prefers-reduced-motion media query, desktop and mobile viewports, and the
 * full app served by Vite with the sheet renderer switched on. The source
 * file config.js is never edited: a Vite plugin flips the mode in memory for
 * the second dev server only.
 */
import { before, after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED, loadPlaywright, shippedMode, startVite } from './support.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHEETS = resolve(HERE, '..');
const ROOT = resolve(HERE, '../../../../..');
const require = createRequire(join(ROOT, 'package.json'));

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 780 };

let skipReason = null;
// On CI (or REQUIRE_BROWSER=1) a missing browser is a failure, never a skip.
const unavailable = (why) => {
  if (REQUIRED) throw new Error(`browser tests are required but cannot run: ${why}`);
  skipReason = why;
};
let chromium = null;
let browser = null;
let bundle = '';
let sheetData = {};
const servers = {};

before(async () => {
  const pw = loadPlaywright();
  if (!pw) return void unavailable('playwright is not installed');
  try {
    browser = await pw.chromium.launch();
    chromium = pw.chromium;
  } catch (err) {
    return void unavailable(`Chromium could not launch: ${String(err.message).split('\n')[0]}`);
  }
  const esbuild = require('esbuild');
  const entry = `
    import { createSheetRenderer } from '${SHEETS}/renderer.js';
    import { SHEET_MANIFEST } from '${SHEETS}/manifest.js';
    import { renderSprite } from '${SHEETS}/../sprites.js';
    import nomoz from '${SHEETS}/../index.js';
    window.T = { createSheetRenderer, SHEET_MANIFEST, renderSprite, vanity: nomoz.vanity };`;
  const res = await esbuild.build({
    stdin: { contents: entry, resolveDir: SHEETS },
    bundle: true,
    format: 'iife',
    write: false,
    logLevel: 'error',
    define: { 'import.meta.url': '"file:///x/manifest.js"' },
  });
  bundle = res.outputFiles[0].text;
  for (const f of readdirSync(join(SHEETS, 'sheets'))) {
    sheetData[f.replace('.png', '')] = readFileSync(join(SHEETS, 'sheets', f)).toString('base64');
  }
  servers.procedural = await startVite('procedural');
  servers.sheet = await startVite('sheet');
  servers.shipped = await startVite();
});

after(async () => {
  await browser?.close();
  for (const s of Object.values(servers)) await s.server.close();
});

const guard = (name, fn, opts) =>
  test(name, opts, async (t) => {
    if (skipReason) return t.skip(skipReason);
    await fn(t);
  });

/* ------------------------------------------------------------------ */
/* Part 1: the real renderer on real canvases with the shipped sheets  */
/* ------------------------------------------------------------------ */

async function harness(context) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setContent('<body style="margin:0"></body>');
  await page.addScriptTag({ content: bundle });
  await page.evaluate((sheets) => {
    const T = window.T;
    // a region's hash (the tail swings between frames, so the frame timing is read off the body only)
    const hash = (c, w = c.width) => {
      const d = c.getContext('2d').getImageData(0, 0, w, c.height).data;
      let h = 0;
      for (let i = 0; i < d.length; i++) h = (h * 31 + d[i]) | 0;
      return h;
    };
    const manifestWith = (src) => {
      const m = JSON.parse(JSON.stringify(T.SHEET_MANIFEST));
      for (const [id, s] of Object.entries(m.sheets)) s.src = src(id);
      return m;
    };
    const base = { mood: 'content', frame: 0, light: 1, facing: -1, view: 'front', pose: 'sit', legs: 0, gaze: 'c', eyes: 'closed', mouth: 'idle', lean: 0, fx: {} };
    const make = (render) => {
      const c = document.createElement('canvas');
      c.width = 96;
      c.height = 64;
      document.body.append(c);
      return { c, g: c.getContext('2d', { willReadFrequently: true }), render };
    };
    const opaque = (c) => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      let bottom = -1;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 0) { n++; bottom = y; }
      return { n, bottom, corner: d[3] };
    };
    window.H = {
      hash,
      base,
      make,
      opaque,
      real: () => T.createSheetRenderer({ manifest: manifestWith((id) => 'data:image/png;base64,' + sheets[id]) }),
      broken: () => T.createSheetRenderer({ manifest: manifestWith((id) => `data:image/png;base64,AAAA${id}`) }),
      plain: T.renderSprite,
      vanity: T.vanity,
      wait: (ms) => new Promise((r) => setTimeout(r, ms)),
      T,
    };
  }, sheetData);
  return { page, errors };
}

const SCENES = [
  ['sit front', {}],
  ['sit blink', { eyes: 'blink' }],
  ['dozing', { eyes: 'closed', droop: 1 }],
  ['groom', { pawL: 'high', mouth: 'lick' }],
  ['sit 3/4', { view: 'frontQ' }],
  ['sit rear', { view: 'rear' }],
  ['curl', { pose: 'curl' }],
  ['stretch', { pose: 'stretch' }],
  ['loaf', { pose: 'loaf' }],
  ['low', { pose: 'low' }],
  ['walk front', { pose: 'stand', view: 'front', legs: 1 }],
  ['walk side', { pose: 'stand', view: 'side', legs: 1 }],
  ['walk rear', { pose: 'stand', view: 'rear', legs: 1 }],
  ['creep side', { pose: 'crouch', view: 'side', legs: 1 }],
  ['leap front', { pose: 'stand', legs: 3 }],
];

describe('real browser: renderer with the shipped sheets', () => {
  for (const [vpName, viewport, extra] of [['desktop', DESKTOP, {}], ['mobile', MOBILE, { isMobile: true, deviceScaleFactor: 3, hasTouch: true }]]) {
    guard(`${vpName}: every scene draws sheet art, anchored to the feet, with transparent surroundings`, async () => {
      const ctx = await browser.newContext({ viewport, ...extra });
      const { page, errors } = await harness(ctx);
      const res = await page.evaluate(async (scenes) => {
        const H = window.H;
        const render = H.real();
        const out = [];
        for (const [name, o] of scenes) {
          const p = { ...H.base, ...o };
          const a = H.make(render);
          const b = H.make(H.plain);
          render(a.g, p, H.vanity);
          await H.wait(120); // images decode asynchronously
          render(a.g, p, H.vanity);
          H.plain(b.g, p, H.vanity);
          const o1 = H.opaque(a.c);
          out.push({ name, sheet: H.hash(a.c) !== H.hash(b.c), n: o1.n, bottom: o1.bottom, corner: o1.corner, w: a.c.width, h: a.c.height });
        }
        return out;
      }, SCENES);
      for (const r of res) {
        assert.equal(r.sheet, true, `${r.name}: drawn procedurally, not from the sheet`);
        assert.ok(r.n > 300, `${r.name}: nearly blank (${r.n} px)`);
        assert.equal(r.corner, 0, `${r.name}: top-left corner is not transparent`);
        assert.ok(r.bottom >= 58 && r.bottom <= 63, `${r.name}: feet at row ${r.bottom}`);
        assert.deepEqual([r.w, r.h], [96, 64], 'canvas is never rescaled by the renderer');
      }
      assert.deepEqual(errors, []);
      await ctx.close();
    });
  }

  guard('the same state renders identical pixels on desktop and mobile (no DPR or viewport dependence)', async () => {
    const hashes = [];
    for (const [viewport, extra] of [[DESKTOP, {}], [MOBILE, { isMobile: true, deviceScaleFactor: 3 }]]) {
      const ctx = await browser.newContext({ viewport, ...extra });
      const { page } = await harness(ctx);
      hashes.push(
        await page.evaluate(async () => {
          const H = window.H;
          const render = H.real();
          const a = H.make(render);
          const p = { ...H.base, pose: 'curl' };
          render(a.g, p, H.vanity);
          await H.wait(120);
          render(a.g, p, H.vanity);
          return H.hash(a.c);
        })
      );
      await ctx.close();
    }
    assert.equal(hashes[0], hashes[1]);
  });

  guard('animation timing: a walk cycle changes frames on its 320 ms steps (real clock)', async () => {
    const ctx = await browser.newContext({ viewport: DESKTOP });
    const { page, errors } = await harness(ctx);
    const changes = await page.evaluate(async () => {
      const H = window.H;
      const render = H.real();
      const a = H.make(render);
      const p = { ...H.base, pose: 'stand', view: 'side', legs: 1 };
      render(a.g, p, H.vanity);
      await H.wait(150);
      const times = [];
      let last = H.hash(a.c, 62);
      const t0 = performance.now();
      await new Promise((done) => {
        const tick = () => {
          const h = H.hash(a.c, 62);
          if (h !== last) {
            times.push(Math.round(performance.now() - t0));
            last = h;
          }
          performance.now() - t0 < 2600 ? requestAnimationFrame(tick) : done();
        };
        tick();
      });
      return times;
    });
    assert.ok(changes.length >= 6, `expected a frame change every ~320 ms, saw ${JSON.stringify(changes)}`);
    for (let i = 1; i < changes.length; i++) {
      const gap = changes[i] - changes[i - 1];
      assert.ok(gap > 220 && gap < 460, `gap ${gap} ms between frame changes ${JSON.stringify(changes)}`);
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  // pixels of a state's canvas over time: the tail region's hash, and the tongue's pink
  const motionProbe = (page, state, ms, step, warm = 300) =>
    page.evaluate(
      async ({ state, ms, step, warm }) => {
        const H = window.H;
        const render = H.real();
        const a = H.make(render);
        const p = { ...H.base, ...state };
        render(a.g, p, H.vanity);
        await H.wait(warm);
        const tails = new Set();
        const bodies = new Set();
        let pinkFrames = 0;
        let frames = 0;
        const t0 = performance.now();
        while (performance.now() - t0 < ms) {
          const d = a.g.getImageData(0, 0, 96, 64).data;
          let th = 0;
          let bh = 0;
          let pink = 0;
          for (let y = 0; y < 64; y++) {
            for (let x = 0; x < 96; x++) {
              const o = (y * 96 + x) * 4;
              const v = d[o + 3] ? d[o] * 3 + d[o + 1] * 5 + d[o + 2] * 7 + 1 : 0;
              if (x >= 62) th = (th * 31 + v + x) | 0;
              else if (y < 45) bh = (bh * 31 + v + x) | 0;
              // the tongue's tip and body pinks (renderer.js TONGUE)
              if (d[o + 3] && ((d[o] === 255 && d[o + 1] === 157 && d[o + 2] === 184) || (d[o] === 224 && d[o + 1] === 112 && d[o + 2] === 140))) pink++;
            }
          }
          tails.add(th);
          bodies.add(bh);
          frames++;
          if (pink) pinkFrames++;
          await H.wait(step);
        }
        return { tails: tails.size, bodies: bodies.size, pinkFrames, frames };
      },
      { state, ms, step, warm }
    );

  guard('the tail never hangs frozen: idle, grooming and dozing all change the tail pixels over time', async () => {
    const ctx = await browser.newContext({ viewport: DESKTOP });
    const { page, errors } = await harness(ctx);
    for (const [name, state] of [['idle', {}], ['grooming', { pawL: 'high', eyes: 'closed' }], ['dozing', { eyes: 'closed', droop: 1 }], ['stretching', { pose: 'stretch' }], ['loafing', { pose: 'loaf' }]]) {
      const r = await motionProbe(page, state, 3200, 80);
      if (name !== 'loafing') assert.ok(r.tails >= 3, `${name}: the tail drew ${r.tails} different shapes in 3 s`);
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  guard('grooming licks: the tongue shows and hides while the paw is at the mouth, and not on a plain sit', async () => {
    const ctx = await browser.newContext({ viewport: DESKTOP });
    const { page, errors } = await harness(ctx);
    const groom = await motionProbe(page, { pawL: 'high', eyes: 'closed' }, 3600, 40);
    assert.ok(groom.pinkFrames > groom.frames * 0.2 && groom.pinkFrames < groom.frames * 0.8, `tongue out in ${groom.pinkFrames} of ${groom.frames} samples`);
    assert.ok(groom.bodies >= 2, 'the head dips into the paw');
    // from the very first draw: a scripted lick lasts 420 ms from the moment the state arrives
    const lipLick = await motionProbe(page, { mouth: 'lick' }, 1200, 30, 0);
    assert.ok(lipLick.pinkFrames >= 1, 'a scripted lick shows the tongue');
    const plain = await motionProbe(page, {}, 1500, 60);
    assert.equal(plain.pinkFrames, 0);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  guard('reduced motion: no tail swing and no tongue', async () => {
    const ctx = await browser.newContext({ viewport: MOBILE, reducedMotion: 'reduce' });
    const { page, errors } = await harness(ctx);
    for (const state of [{}, { pawL: 'high', eyes: 'closed' }]) {
      const r = await motionProbe(page, state, 1800, 100);
      assert.equal(r.tails, 1);
      assert.equal(r.pinkFrames, 0);
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  guard('reduced motion: the real media query freezes every clip on its still frame', async () => {
    const ctx = await browser.newContext({ viewport: MOBILE, reducedMotion: 'reduce' });
    const { page, errors } = await harness(ctx);
    const r = await page.evaluate(async () => {
      const H = window.H;
      const render = H.real();
      const a = H.make(render);
      const p = { ...H.base, pose: 'stand', view: 'side', legs: 1 };
      render(a.g, p, H.vanity);
      await H.wait(150);
      const first = H.hash(a.c);
      const seen = new Set([first]);
      for (let i = 0; i < 12; i++) {
        await H.wait(200);
        seen.add(H.hash(a.c));
      }
      return { media: matchMedia('(prefers-reduced-motion: reduce)').matches, distinct: seen.size, n: H.opaque(a.c).n };
    });
    assert.equal(r.media, true);
    assert.equal(r.distinct, 1);
    assert.ok(r.n > 300);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  guard('fallback: unloadable sheets leave the procedural cat, pixel-identical, with no exception', async () => {
    const ctx = await browser.newContext({ viewport: DESKTOP });
    const { page, errors } = await harness(ctx);
    const r = await page.evaluate(async () => {
      const H = window.H;
      const render = H.broken();
      const a = H.make(render);
      const b = H.make(H.plain);
      const p = { ...H.base };
      render(a.g, p, H.vanity);
      await H.wait(300);
      render(a.g, p, H.vanity);
      H.plain(b.g, p, H.vanity);
      return { same: H.hash(a.c) === H.hash(b.c), n: H.opaque(a.c).n };
    });
    assert.equal(r.same, true);
    assert.ok(r.n > 300);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  guard('a tab hidden and shown again keeps the clip running and the canvas intact', async () => {
    const ctx = await browser.newContext({ viewport: DESKTOP });
    const { page, errors } = await harness(ctx);
    await page.evaluate(async () => {
      const H = window.H;
      const render = H.real();
      H.a = H.make(render);
      H.p = { ...H.base, pose: 'stand', view: 'side', legs: 1 };
      render(H.a.g, H.p, H.vanity);
      await H.wait(150);
    });
    const other = await ctx.newPage();
    await other.goto('about:blank');
    await other.bringToFront();
    await other.waitForTimeout(900);
    await page.bringToFront();
    const r = await page.evaluate(async () => {
      const H = window.H;
      const seen = new Set();
      for (let i = 0; i < 12; i++) {
        await H.wait(150);
        seen.add(H.hash(H.a.c));
      }
      return { distinct: seen.size, n: H.opaque(H.a.c).n };
    });
    assert.ok(r.distinct >= 3, `walk should still cycle, saw ${r.distinct} distinct frames`);
    assert.ok(r.n > 300);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
});

/* ------------------------------------------------------------------ */
/* Part 2: the whole app                                               */
/* ------------------------------------------------------------------ */

async function openApp(which, { viewport = DESKTOP, reducedMotion = 'no-preference', block = false, mobile = false } = {}) {
  const ctx = await browser.newContext({ viewport, reducedMotion, ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  const log = { errors: [], warnings: [], sheets: [] };
  page.on('pageerror', (e) => log.errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'warning') log.warnings.push(m.text());
    // an aborted request logs a resource error by design in the fallback test
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) log.errors.push(m.text());
  });
  // in dev, a `?import` request is the JS module that exports the URL, not the image
  page.on('response', (r) => r.request().resourceType() === 'image' && /nomoz_[a-z_]+\.png/.test(r.url()) && log.sheets.push({ url: r.url(), status: r.status() }));
  if (block) await page.route(/nomoz_[a-z_]+\.png/, (r) => (r.request().resourceType() === 'image' ? r.abort() : r.continue()));
  await page.goto(servers[which].url);
  await page.waitForSelector('canvas.nomoz-canvas[data-mood]', { state: 'attached', timeout: 45000 });
  return { ctx, page, log };
}

const sample = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('canvas.nomoz-canvas[data-mood]');
    if (!c) return null;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let h = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3]) n++;
      h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7 + d[i + 3]) | 0;
    }
    return { h, n, w: c.width, ht: c.height };
  });

// Samples until the pet is on screen (it can be briefly off screen or faded by a behavior).
async function drawn(page, min) {
  let s = await sample(page);
  for (let i = 0; i < 40 && !(s && s.n > min); i++) {
    await page.waitForTimeout(250);
    s = await sample(page);
  }
  return s;
}

async function watch(page, ms, step = 150) {
  const seen = new Set();
  let lastN = 0;
  for (let t = 0; t < ms; t += step) {
    await page.waitForTimeout(step);
    const s = await sample(page);
    if (s) {
      seen.add(s.h);
      lastN = Math.max(lastN, s.n); // the pet may be briefly off screen
    }
  }
  return { distinct: seen.size, n: lastN };
}

describe('real browser: the app', () => {
  guard('the test servers run the renderer modes they claim; the shipped configuration is the sheet cat', async () => {
    await (await openApp('sheet')).ctx.close();
    await (await openApp('procedural')).ctx.close();
    assert.ok(servers.sheet.flipped() > 0, 'sheet pin did not apply');
    assert.ok(servers.procedural.flipped() > 0, 'procedural pin did not apply');
    assert.equal(shippedMode(), 'sheet', 'config.js should ship the sheet renderer');
    const { ctx, page } = await openApp('shipped');
    const s = await sample(page);
    assert.deepEqual([s.w, s.ht], [96, 64], 'the unpinned app draws the 96 x 64 sheet cat');
    await ctx.close();
  });

  guard('procedural fallback mode: 56 x 60 canvas, draws, and requests no sheet images', async () => {
    const { ctx, page, log } = await openApp('procedural');
    await page.waitForTimeout(1500);
    const s = await drawn(page, 100);
    assert.deepEqual([s.w, s.ht], [56, 60]);
    assert.ok(s.n > 100);
    assert.deepEqual(log.sheets, []);
    assert.deepEqual(log.errors, []);
    await ctx.close();
  });

  for (const [vpName, viewport, mobile] of [['desktop', DESKTOP, false], ['mobile', MOBILE, true]]) {
    guard(`sheet-mode app, ${vpName}: sheets load (200), a 96 x 64 canvas draws and animates`, async () => {
      const { ctx, page, log } = await openApp('sheet', { viewport, mobile });
      const r = await watch(page, 9000);
      const s = await sample(page);
      assert.deepEqual([s.w, s.ht], [96, 64]);
      assert.ok(r.n > 300, `pet nearly blank: ${r.n} px`);
      assert.ok(r.distinct >= 2, 'the canvas never changed');
      assert.ok(log.sheets.length > 0, 'no sheet request was made');
      assert.ok(log.sheets.every((x) => x.status === 200), JSON.stringify(log.sheets.filter((x) => x.status !== 200)));
      assert.deepEqual(log.errors, []);
      assert.ok(!log.warnings.some((w) => /nomoz sheets/.test(w)), log.warnings.join('\n'));
      await ctx.close();
    });
  }

  guard('tab changes and resizing: the pet persists, keeps drawing, nothing throws', async () => {
    const { ctx, page, log } = await openApp('sheet');
    await page.waitForTimeout(1200);
    const labels = await page.evaluate(() => [...document.querySelectorAll('footer button')].map((b) => b.getAttribute('aria-label') || b.textContent.trim()).filter(Boolean));
    assert.ok(labels.length >= 2, 'footer tabs not found');
    await page.evaluate(() => (window.__canvas = document.querySelector('canvas.nomoz-canvas[data-mood]')));
    for (const viewport of [MOBILE, DESKTOP, { width: 768, height: 1024 }, DESKTOP]) {
      await page.setViewportSize(viewport);
      for (const label of [...new Set(labels)].slice(0, 4)) {
        await page.locator('footer button:visible', { hasText: label }).first().click({ timeout: 3000 }).catch(async () => {
          await page.locator(`footer button[aria-label="${label}"]:visible`).first().click({ timeout: 3000 });
        });
        await page.waitForTimeout(250);
      }
      const s = await drawn(page, 300);
      assert.ok(s && s.n > 300, `pet blank after switching tabs at ${viewport.width}x${viewport.height}`);
    }
    const same = await page.evaluate(() => window.__canvas === document.querySelector('canvas.nomoz-canvas[data-mood]') || document.contains(window.__canvas));
    // the pet fades and returns on some transitions; either way a canvas is present and drawing
    assert.ok(same || (await drawn(page, 300)).n > 300);
    assert.deepEqual(log.errors, []);
    await ctx.close();
  });

  guard('reduced motion (app): the sheet pet is drawn and nothing throws', async () => {
    // Pixels may still change here: the scheduler keeps switching poses under
    // reduced motion (the procedural app does the same, which was measured).
    // That clips stop cycling is asserted on the real renderer above.
    const { ctx, page, log } = await openApp('sheet', { reducedMotion: 'reduce' });
    await page.waitForTimeout(1500);
    const r = await watch(page, 3000, 200);
    assert.ok(r.n > 300, `pet blank under reduced motion (${r.n} px)`);
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    assert.deepEqual(log.errors, []);
    await ctx.close();
  });

  guard('fallback (app): with every sheet request failing the procedural cat is drawn, no exceptions', async () => {
    const { ctx, page, log } = await openApp('sheet', { block: true });
    const r = await watch(page, 3500);
    assert.ok(r.n > 100, `pet blank after sheet failure (${r.n} px)`);
    assert.deepEqual(log.errors, []);
    assert.ok(log.warnings.some((w) => /nomoz sheets/.test(w)), 'expected a "could not load" warning');
    await ctx.close();
  });
});
