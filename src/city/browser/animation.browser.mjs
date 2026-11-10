/*
 * City mode's ambient animation in the real app, Chromium.
 *
 *   npm run test:browser
 *
 * The city moves a little, at whole-pixel scale and no faster than 12 frames
 * a second; it stops while the page is hidden; under prefers-reduced-motion
 * it never moves at all, and turning that setting on while it runs puts the
 * exact still frame back. With CI=true a missing browser is an error.
 */
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED, loadPlaywright, openAt, startVite } from '../../pets/nomoz/spritesheet/browser/support.mjs';

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
  dev = await startVite();
});

after(async () => {
  await browser?.close();
  await dev?.server.close();
});

const guard = (name, fn) =>
  test(name, async (t) => {
    if (skipReason) return t.skip(skipReason);
    await fn(t);
  });

async function cityMode(page) {
  await page.click('[data-mode-toggle]:visible');
  await page.waitForSelector('[data-city][data-city-ready]', { timeout: 20000 });
}

const state = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('[data-city] canvas');
    return { anim: c.dataset.cityAnim || null, frames: Number(c.dataset.cityFrames || 0) };
  });

// keep a copy of the canvas in the page under `name`
const snap = (page, name) =>
  page.evaluate((n) => {
    const c = document.querySelector('[data-city] canvas');
    (window.__snaps ||= {})[n] = c.getContext('2d').getImageData(0, 0, c.width, c.height).data.slice();
  }, name);

// share of device pixels that differ between two snapshots
const differ = (page, a, b) =>
  page.evaluate(
    ([x, y]) => {
      const A = window.__snaps[x];
      const B = window.__snaps[y];
      let n = 0;
      for (let i = 0; i < A.length; i += 4) if (A[i] !== B[i] || A[i + 1] !== B[i + 1] || A[i + 2] !== B[i + 2]) n++;
      return n / (A.length / 4);
    },
    [a, b]
  );

// inside one city pixel every device pixel has the same colour (rows across the middle and near the top)
const brokenSquares = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('[data-city] canvas');
    const s = Number(c.dataset.cityPx);
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const offY = c.height - Number(c.dataset.cityH) * s;
    const offX = -Math.floor((Number(c.dataset.cityW) * s - c.width) / 2);
    let broken = 0;
    for (const frac of [0.2, 0.5, 0.8]) {
      const cellY = offY + Math.floor((c.height * frac - offY) / s) * s;
      for (let dy = 0; dy < s; dy++) {
        const y = cellY + dy;
        if (y < 0 || y >= c.height) continue;
        for (let x = 0; x < c.width; x++) {
          const cx = offX + Math.floor((x - offX) / s) * s;
          if (cx < 0) continue;
          const a = (y * c.width + x) * 4;
          const b = (cellY * c.width + cx) * 4;
          if (d[a] !== d[b] || d[a + 1] !== d[b + 1] || d[a + 2] !== d[b + 2]) broken++;
        }
      }
    }
    return broken;
  });

for (const [name, viewport, mobile] of [
  ['desktop', { width: 1280, height: 800 }, false],
  ['phone', { width: 390, height: 844 }, true],
]) {
  guard(`${name}: the city moves quietly, in whole pixels, at most 12 frames a second`, async () => {
    const { ctx, page, log } = await openAt(browser, dev.url, { viewport, mobile });
    try {
      await cityMode(page);
      await page.waitForFunction(() => document.querySelector('[data-city] canvas').dataset.cityAnim === 'running');
      // measure the steady state: the first seconds also hold the one-off ease-in from the still frame,
      // which on a small canvas can by itself come close to the limit below
      await page.waitForTimeout(5000);
      await snap(page, 'a');
      const s0 = await state(page);
      const t0 = Date.now();
      await page.waitForTimeout(12000);
      await snap(page, 'b');
      const s1 = await state(page);
      const secs = (Date.now() - t0) / 1000;
      const changed = await differ(page, 'a', 'b');
      assert.ok(changed > 0, 'nothing moved in 12 s');
      assert.ok(changed < 0.1, `${(changed * 100).toFixed(1)}% of the canvas changed in 12 s`);
      const fps = (s1.frames - s0.frames) / secs;
      assert.ok(s1.frames > s0.frames && fps <= 12.5, `${fps.toFixed(1)} redraws a second`);
      assert.equal(await brokenSquares(page), 0, 'city pixels are not whole squares');
      assert.deepEqual(log.errors, []);
    } finally {
      await ctx.close();
    }
  });
}

guard('it stops while the page is hidden and carries on when it is back', async () => {
  const { ctx, page } = await openAt(browser, dev.url, { viewport: { width: 1024, height: 700 } });
  try {
    await cityMode(page);
    await page.waitForFunction(() => document.querySelector('[data-city] canvas').dataset.cityAnim === 'running');
    await page.waitForTimeout(5000); // past the ease-in, so it is drawing
    const setHidden = (hidden) =>
      page.evaluate((h) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
    await setHidden(true);
    const paused = await state(page);
    assert.equal(paused.anim, 'paused');
    await snap(page, 'hidden');
    await page.waitForTimeout(4000);
    assert.equal((await state(page)).frames, paused.frames, 'drew while hidden');
    await snap(page, 'hidden2');
    assert.equal(await differ(page, 'hidden', 'hidden2'), 0);
    await setHidden(false);
    assert.equal((await state(page)).anim, 'running');
    await page.waitForFunction((n) => Number(document.querySelector('[data-city] canvas').dataset.cityFrames || 0) > n, paused.frames, { timeout: 8000 });
  } finally {
    await ctx.close();
  }
});

guard('reduced motion: the city is completely still', async () => {
  const { ctx, page, log } = await openAt(browser, dev.url, { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  try {
    await cityMode(page);
    assert.equal((await state(page)).anim, 'static');
    await snap(page, 'a');
    await page.waitForTimeout(8000);
    await snap(page, 'b');
    assert.equal(await differ(page, 'a', 'b'), 0, 'the city moved under reduced motion');
    assert.equal((await state(page)).frames, 0);
    assert.deepEqual(log.errors, []);
  } finally {
    await ctx.close();
  }
});

guard('turning reduced motion on while it runs puts the still frame back exactly', async () => {
  const { ctx, page } = await openAt(browser, dev.url, { viewport: { width: 1280, height: 800 } });
  try {
    await cityMode(page);
    // the effects ease in over the first seconds: right after it appears, the canvas is the still frame
    await snap(page, 'still');
    await page.waitForTimeout(10000);
    await snap(page, 'moving');
    assert.ok((await differ(page, 'still', 'moving')) > 0, 'nothing had moved');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelector('[data-city] canvas').dataset.cityAnim === 'static');
    await snap(page, 'back');
    assert.equal(await differ(page, 'still', 'back'), 0, 'not the still frame');
    // and it comes back to life when the setting is turned off again
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => document.querySelector('[data-city] canvas').dataset.cityAnim === 'running', null, { timeout: 15000 });
  } finally {
    await ctx.close();
  }
});
