/*
 * Visual modes in the real app, Chromium.
 *
 *   npm run test:browser
 *
 * The header toggle switches between Pet mode (NOMOZ.EXE and the snow) and
 * City mode (the static night city). The choice persists through Dexie; the
 * pet is never remounted, only hidden, so it keeps its place and behavior;
 * the header does not move; the city is painted at a whole-number pixel
 * scale. With CI=true a missing browser is an error.
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

const state = (page) =>
  page.evaluate(() => {
    const visible = (el) => !!el && getComputedStyle(el).visibility !== 'hidden';
    const toggles = [...document.querySelectorAll('[data-mode-toggle]')];
    const shown = toggles.find((b) => b.offsetParent !== null);
    const header = document.querySelector('header').getBoundingClientRect();
    const actor = document.querySelector('.nomoz-actor:not([data-prop])');
    const city = document.querySelector('[data-city]');
    const canvas = city && city.querySelector('canvas');
    return {
      label: shown ? shown.textContent.trim() : null,
      mode: shown ? shown.dataset.modeToggle : null,
      headerH: header.height,
      petMounted: !!actor,
      petVisible: visible(actor),
      petCanvasVisible: visible(document.querySelector('canvas.nomoz-canvas[data-mood]')),
      sameActor: !!actor && actor === window.__petActor,
      snow: !!document.querySelector('canvas.fixed.inset-0'),
      city: !!city,
      cityReady: !!city && city.hasAttribute('data-city-ready'),
      cityPx: canvas ? Number(canvas.dataset.cityPx) : null,
      cityCanvas: canvas ? { w: canvas.width, h: canvas.height } : null,
      cityView: canvas && canvas.dataset.cityView ? canvas.dataset.cityView.split(' ').map(Number) : null,
      vw: innerWidth,
      vh: innerHeight,
      dpr: window.devicePixelRatio,
      layer: city ? city.getBoundingClientRect().toJSON() : null,
      main: document.querySelector('main').getBoundingClientRect().toJSON(),
    };
  });

// sample the city canvas: distinct colours, mean brightness, and whether city pixels are whole squares
const sampleCity = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('[data-city] canvas');
    const s = Number(c.dataset.cityPx);
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const colours = new Set();
    let lum = 0;
    for (let i = 0; i < d.length; i += 4) {
      colours.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
      lum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    }
    // inside one city pixel every device pixel has the same colour: compare each pixel with
    // the first pixel of its cell, along a row in the middle (cells align with the bottom edge)
    const offY = Number(c.dataset.cityView.split(' ')[2]);
    const offX = -Math.floor((Number(c.dataset.cityW) * s - c.width) / 2);
    const y = offY + Math.floor(c.height / 2 / s) * s;
    let broken = 0;
    for (let x = 0; x < c.width; x++) {
      const cell = offX + Math.floor((x - offX) / s) * s;
      if (cell < 0) continue;
      const a = (y * c.width + x) * 4;
      const b = (y * c.width + cell) * 4;
      if (d[a] !== d[b] || d[a + 1] !== d[b + 1] || d[a + 2] !== d[b + 2]) broken++;
    }
    return { colours: colours.size, meanLum: lum / (d.length / 4) / 255, broken };
  });

for (const [name, viewport, mobile] of [
  ['desktop', { width: 1440, height: 900 }, false],
  ['phone', { width: 375, height: 812 }, true],
]) {
  guard(`${name}: the toggle switches modes, persists, keeps the pet and leaves the header alone`, async () => {
    const { ctx, page, log } = await openAt(browser, dev.url, { viewport, mobile });
    try {
      await page.waitForFunction(() => document.querySelector('canvas.fixed.inset-0'), null, { timeout: 15000 });
      let s = await state(page);
      assert.equal(s.label, '[ MODE: PET ]');
      assert.ok(s.petMounted && s.petVisible && s.snow && !s.city, JSON.stringify(s));
      const headerH = s.headerH;

      // remember the pet's DOM node: it must be the very same one after a round trip
      await page.evaluate(() => {
        window.__petActor = document.querySelector('.nomoz-actor:not([data-prop])');
      });

      await page.click('[data-mode-toggle]:visible');
      await page.waitForSelector('[data-city][data-city-ready]', { timeout: 20000 });
      s = await state(page);
      assert.equal(s.label, '[ MODE: CITY ]');
      assert.equal(s.headerH, headerH, 'header height changed');
      assert.ok(s.petMounted && s.sameActor, 'pet was remounted');
      assert.ok(!s.petVisible && !s.petCanvasVisible, 'pet still painted in city mode');
      assert.ok(!s.snow, 'snow still shown in city mode');
      // the city layer covers the screen (the bars hide what is outside the main area), at a whole-number
      // device-pixel scale, and the scene proper is composed for the main area exactly
      assert.ok(Number.isInteger(s.cityPx) && s.cityPx === Math.round(3 * s.dpr), JSON.stringify(s));
      assert.deepEqual([s.layer.x, s.layer.y, s.layer.width, s.layer.height], [0, 0, s.vw, s.vh]);
      {
        const [y0, vh, offY] = s.cityView;
        const top = offY + y0 * s.cityPx;
        const bottom = top + vh * s.cityPx;
        assert.ok(Math.abs(bottom - s.main.bottom * s.dpr) < 1, `view bottom ${bottom} vs main ${s.main.bottom * s.dpr}`);
        assert.ok(top <= s.main.top * s.dpr && top > s.main.top * s.dpr - s.cityPx, `view top ${top} vs main ${s.main.top * s.dpr}`);
      }
      assert.ok(Math.abs(s.cityCanvas.w - s.layer.width * s.dpr) <= 1 && Math.abs(s.cityCanvas.h - s.layer.height * s.dpr) <= 1);
      const px = await sampleCity(page);
      assert.ok(px.colours > 12, `only ${px.colours} colours`);
      assert.ok(px.meanLum < 0.11, `mean luminance ${px.meanLum}`);
      assert.equal(px.broken, 0, 'city pixels are not whole squares');

      // persisted: a reload comes back in city mode
      await page.reload();
      await page.waitForSelector('[data-city][data-city-ready]', { timeout: 20000 });
      s = await state(page);
      assert.equal(s.label, '[ MODE: CITY ]');
      assert.ok(!s.snow && s.petMounted && !s.petVisible);

      // and back to pet mode, with the pet where it is now
      await page.evaluate(() => {
        window.__petActor = document.querySelector('.nomoz-actor:not([data-prop])');
      });
      await page.click('[data-mode-toggle]:visible');
      await page.waitForFunction(() => document.querySelector('canvas.fixed.inset-0'), null, { timeout: 15000 });
      s = await state(page);
      assert.equal(s.label, '[ MODE: PET ]');
      assert.ok(s.petVisible && s.petCanvasVisible && s.sameActor && !s.city, JSON.stringify(s));
      assert.equal(s.headerH, headerH);

      assert.deepEqual(log.errors, []);
    } finally {
      await ctx.close();
    }
  });
}

guard('phone: the toggle sits in the free header cell and fits at 320px', async () => {
  const { ctx, page } = await openAt(browser, dev.url, { viewport: { width: 320, height: 568 }, mobile: true });
  try {
    const box = await page.evaluate(() => {
      const b = [...document.querySelectorAll('[data-mode-toggle]')].find((x) => x.offsetParent !== null);
      const r = b.getBoundingClientRect();
      const grid = b.parentElement.getBoundingClientRect();
      return { right: r.right, top: r.top, gridRight: grid.right, gridTop: grid.top, overflow: b.scrollWidth > b.clientWidth, docW: document.documentElement.scrollWidth };
    });
    assert.ok(!box.overflow, 'label overflows its cell');
    assert.ok(box.right <= box.gridRight + 0.5 && Math.abs(box.top - box.gridTop) < 0.5);
    assert.ok(box.docW <= 320, 'horizontal scroll');
  } finally {
    await ctx.close();
  }
});
