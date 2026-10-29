/*
 * The treasure coins in the real app, in real Chromium: the real scheduler runs the real "treasure" behavior,
 * the real React layers stack the coin props behind or in front of the cat (z-index), and the real sheet renderer draws
 * the cat. A coin must never change sides of the cat while it overlaps the cat's body.
 *
 *   npm run test:browser
 *
 * Only the way the behavior is started is test-specific: the test server exposes the scheduler
 * (support.mjs schedulerProbePlugin) and asks it to run "treasure" now instead of waiting for it to be chosen.
 */
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED, loadPlaywright, startVite } from './support.mjs';

let skipReason = null;
let browser = null;
let dev = null;
const unavailable = (why) => {
  if (REQUIRED) throw new Error(`browser tests are required but cannot run: ${why}`);
  skipReason = why;
};

before(async () => {
  const pw = loadPlaywright();
  if (!pw) return void unavailable('playwright is not installed');
  try {
    browser = await pw.chromium.launch();
  } catch (err) {
    return void unavailable(`Chromium could not launch: ${String(err.message).split('\n')[0]}`);
  }
  dev = await startVite(undefined, { probe: true });
});

after(async () => {
  await browser?.close();
  await dev?.server.close();
});

/*
 * In the page: every ~40 ms, for each coin (a prop actor: no sprite inside) its place in the layer relative to
 * the cat's actor (z-index below / above it = behind / in front), and whether its box overlaps the cat's
 * body (the coin's centre within the middle 50% x 90% of the cat's box, the footprint the layering uses; a coin leaving over the edge of that box is clear of the body).
 */
const WATCH = async ({ ms, step }) => {
  const sch = window.__nomozScheduler;
  sch.cancel();
  // the cat sits mid-depth and mid-screen, so coins have room in front of it and behind it
  const { geo } = sch.getCtx();
  const z = (geo.zRange[0] + geo.zRange[1]) / 2;
  const b = geo.bounds(z);
  sch.apply({ sx: (b.minX + b.maxX) / 2, sy: (b.minY + b.maxY) / 2, z, transitionMs: 0, facing: 1, view: 'front', pose: 'sit' });
  await new Promise((r) => setTimeout(r, 300));
  sch.next('treasure');
  const started = sch.current;
  const last = new Map();
  const out = { samples: 0, coinSamples: 0, overlapping: 0, switches: 0, switchesClear: 0, bad: [], maxCoins: 0, behavior: null };
  const t0 = performance.now();
  while (performance.now() - t0 < ms && sch.current === started) {
    const catCanvas = document.querySelector('canvas.nomoz-canvas[data-mood]');
    const catActor = catCanvas && catCanvas.closest('.nomoz-actor');
    if (catActor) {
      const layer = catActor.parentElement;
      const kids = [...layer.children];
      const catZ = Number(getComputedStyle(catActor).zIndex);
      const r = catCanvas.getBoundingClientRect();
      const fp = { x0: r.left + r.width * 0.25, x1: r.right - r.width * 0.25, y0: r.top + r.height * 0.05, y1: r.bottom - r.height * 0.05 };
      const coins = kids.filter((k) => k !== catActor && k.classList.contains('nomoz-actor') && !k.querySelector('.nomoz-sprite'));
      out.samples++;
      out.maxCoins = Math.max(out.maxCoins, coins.length);
      for (const el of coins) {
        const id = el.dataset.prop; // the prop's key
        const b = el.getBoundingClientRect();
        // inside the cat's body: the coin's centre is within the footprint (a coin leaving over its edge is clear of it)
        const cx = (b.left + b.right) / 2;
        const cy = (b.top + b.bottom) / 2;
        const overlaps = cx > fp.x0 && cx < fp.x1 && cy > fp.y0 && cy < fp.y1;
        const front = Number(getComputedStyle(el).zIndex) > catZ;
        const prev = last.get(id);
        out.coinSamples++;
        if (overlaps) out.overlapping++;
        if (prev && prev.front !== front) {
          out.switches++;
          if (!(prev.overlaps && overlaps)) out.switchesClear++;
          else out.bad.push({ id, t: Math.round(performance.now() - t0), from: prev.front ? 'front' : 'behind', overlapsBefore: prev.overlaps, overlapsNow: overlaps });
        }
        last.set(id, { front, overlaps });
      }
    }
    await new Promise((r) => setTimeout(r, step));
  }
  out.behavior = started;
  out.ran = Math.round(performance.now() - t0);
  return out;
};

for (const [name, viewport, mobile] of [['desktop', { width: 1280, height: 800 }, false], ['mobile', { width: 390, height: 780 }, true]]) {
  test(`real app, ${name}: treasure coins never change sides of the cat while inside its body`, async (t) => {
    if (skipReason) return t.skip(skipReason);
    const ctx = await browser.newContext({ viewport, ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(dev.url);
    await page.waitForSelector('canvas.nomoz-canvas[data-mood]', { state: 'attached', timeout: 45000 });
    await page.waitForFunction(() => !!window.__nomozScheduler, null, { timeout: 45000 });
    const r = await page.evaluate(WATCH, { ms: 26000, step: 40 });
    assert.equal(r.behavior, 'treasure', 'the real scheduler is running the treasure behavior');
    assert.ok(r.ran > 8000, `it ran the behavior for ${r.ran} ms`);
    assert.ok(r.maxCoins >= 3, `the coins are in the layer (${r.maxCoins})`);
    assert.ok(r.overlapping >= 20, `coins do pass the cat's body (${r.overlapping} overlapping samples), so the test means something`);
    assert.deepEqual(r.bad, [], `coins switched sides while inside the cat's body: ${JSON.stringify(r.bad.slice(0, 5))}`);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}
