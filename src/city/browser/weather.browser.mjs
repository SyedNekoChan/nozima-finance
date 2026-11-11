/*
 * City mode's weather and rare events in the real app, Chromium.
 *
 *   npm run test:browser
 *
 * A test probe hands the page the weather and the animation, so the test can
 * force a state or start an event instead of waiting for the dice (and can
 * run the weather's clock faster). Rain is pixel art at the city's scale over
 * it, there only while it rains; lightning lifts the air; the three rare
 * events show on the city; none of it runs while the page is hidden or under
 * reduced motion. With CI=true a missing browser is an error.
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
  dev = await startVite({ cityProbe: true });
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

async function city(page) {
  await page.click('[data-mode-toggle]:visible');
  await page.waitForSelector('[data-city][data-city-ready]', { timeout: 20000 });
  await page.waitForFunction(() => window.__cityAnim && window.__cityRain && document.querySelector('canvas.city-canvas').dataset.cityAnim === 'running', null, {
    timeout: 20000,
  });
}

// the rain layer: shown or not, lit pixels, and whether it sits exactly over the city pixels
const rainState = (page) =>
  page.evaluate(() => {
    const r = document.querySelector('canvas[data-city-rain]');
    const c = document.querySelector('canvas.city-canvas');
    const d = r.getContext('2d').getImageData(0, 0, r.width, r.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2]) lit++;
    const dpr = devicePixelRatio;
    const s = Number(c.dataset.cityPx);
    return {
      shown: getComputedStyle(r).visibility === 'visible',
      lit,
      size: [r.width, r.height],
      city: [Number(c.dataset.cityW), Number(c.dataset.cityH)],
      // CSS size of one rain pixel, in device pixels: must be the city's whole-number scale
      pixel: (parseFloat(r.style.width) * dpr) / r.width,
      scale: s,
      blend: getComputedStyle(r).mixBlendMode,
      rendering: getComputedStyle(r).imageRendering,
    };
  });

const airSum = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('canvas[data-city-air]');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
    return s;
  });

// set the weather and let it ease there quickly (the weather's clock runs 60 times faster meanwhile)
async function weather(page, steps) {
  for (const st of steps) {
    await page.evaluate((x) => {
      window.__cityEnvSpeed = 60;
      window.__cityWeather.force(x);
    }, st);
    await page.waitForFunction((x) => Math.abs(window.__cityWeather.env.rain - { clear: 0, drizzle: 0.25, rain: 0.6, heavy: 1 }[x]) < 1e-6, st, { timeout: 15000 });
    await page.evaluate((x) => window.__cityWeather.force(x), st); // stay a while longer
  }
  await page.evaluate(() => {
    window.__cityEnvSpeed = 1;
  });
}

for (const [name, viewport, mobile] of [
  ['desktop', { width: 1280, height: 800 }, false],
  ['phone', { width: 390, height: 844 }, true],
]) {
  guard(`${name}: rain comes and goes with the weather, crisp over the city; lightning lifts the air; surfaces dry slowly`, async () => {
    const { ctx, page, log } = await openAt(browser, dev.url, { viewport, mobile });
    try {
      await city(page);
      // the opening weather is rolled on load: bring it to clear first; then nothing is in the rain layer,
      // and it is not even shown
      await weather(page, ['clear']);
      await page.waitForTimeout(800);
      let r = await rainState(page);
      assert.ok(!r.shown && r.lit === 0, JSON.stringify(r));
      assert.deepEqual(r.size, r.city);
      assert.equal(r.pixel, r.scale, 'rain pixels are not the city pixels');
      assert.equal(r.blend, 'screen');
      assert.equal(r.rendering, 'pixelated');

      await weather(page, ['drizzle']);
      await page.waitForTimeout(500);
      const drizzle = await rainState(page);
      assert.ok(drizzle.shown && drizzle.lit > 0, 'no drizzle');
      await weather(page, ['rain', 'heavy']);
      await page.waitForTimeout(500);
      const heavy = await rainState(page);
      assert.ok(heavy.lit > drizzle.lit * 1.5, `heavy ${heavy.lit} vs drizzle ${drizzle.lit}`);
      assert.ok(heavy.lit < heavy.size[0] * heavy.size[1] * 0.06, 'rain covers too much of the picture');

      // a storm's lightning lifts the air for a moment
      const before = await airSum(page);
      const flash = await page.evaluate(
        () =>
          new Promise((res) => {
            window.__cityWeather.trigger('lightning');
            const c = document.querySelector('canvas[data-city-air]');
            const g = c.getContext('2d');
            let best = 0;
            const t0 = performance.now();
            const iv = setInterval(() => {
              const d = g.getImageData(0, 0, c.width, c.height).data;
              let s = 0;
              for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
              best = Math.max(best, s);
              if (performance.now() - t0 > 400) {
                clearInterval(iv);
                res(best);
              }
            }, 20);
          })
      );
      assert.ok(flash > before * 1.08, `flash ${flash} vs ${before}`);
      await page.waitForTimeout(1500);
      assert.equal(await page.evaluate(() => window.__cityWeather.env.flash), 0, 'the flash lingered');

      // it clears, the rain layer empties and hides; the streets stay wet a while, then dry
      await weather(page, ['rain', 'drizzle', 'clear']);
      await page.waitForTimeout(800);
      r = await rainState(page);
      assert.ok(!r.shown, 'the rain layer is still shown in clear weather');
      const wet = await page.evaluate(() => window.__cityWeather.env.wet);
      assert.ok(wet > 0.5, `dried at once: ${wet}`);
      await page.evaluate(() => {
        window.__cityEnvSpeed = 60;
      });
      await page.waitForFunction(() => window.__cityWeather.env.wet === 0 || window.__cityWeather.env.weather !== 'clear', null, { timeout: 30000 });
      assert.deepEqual(log.errors, []);
    } finally {
      await ctx.close();
    }
  });
}

guard('the rare events show on the city, one at a time', async () => {
  const { ctx, page, log } = await openAt(browser, dev.url, { viewport: { width: 1280, height: 800 } });
  try {
    await city(page);
    for (const kind of ['outage', 'activation', 'emergency']) {
      const started = await page.evaluate((k) => {
        const c = document.querySelector('canvas.city-canvas');
        window.__evBefore = c.getContext('2d').getImageData(0, 0, c.width, c.height).data.slice();
        return window.__cityAnim.trigger(k);
      }, kind);
      if (kind === 'emergency' && !started) {
        // every lane busy just now: it waits for a free one
        await page.waitForFunction(() => window.__cityAnim.trigger('emergency'), null, { timeout: 120000, polling: 500 });
      } else assert.ok(started, `${kind} did not start`);
      assert.equal(await page.evaluate(() => window.__cityAnim.trigger('outage')), false, 'two events at once');
      await page.waitForTimeout(kind === 'activation' ? 12000 : 4000);
      const st = await page.evaluate(() => window.__cityAnim.stats());
      assert.equal(st.event, kind);
      if (kind === 'emergency') assert.ok(st.emergency, 'no emergency vehicle');
      else assert.ok(st.held > 0);
      // the city's pixels changed where the event is
      const changed = await page.evaluate(() => {
        const c = document.querySelector('canvas.city-canvas');
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        const b = window.__evBefore;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] !== b[i] || d[i + 1] !== b[i + 1] || d[i + 2] !== b[i + 2]) n++;
        return n;
      });
      assert.ok(changed > 0, `${kind}: nothing changed`);
      // end it quickly for the next one: run the animation's events to their end in the page
      await page.evaluate(() => {
        const a = window.__cityAnim;
        let t = 1e9;
        while (a.stats().event && t < 1e9 + 900000) a.update((t += 84));
      });
    }
    assert.deepEqual(log.errors, []);
  } finally {
    await ctx.close();
  }
});

guard('the weather belongs to the page: switching Pet / City and observing never resets it', async () => {
  const { ctx, page, log } = await openAt(browser, dev.url, { viewport: { width: 390, height: 844 }, mobile: true });
  try {
    await city(page);
    const opening = await page.evaluate(() => window.__cityWeather.initial);
    assert.ok(['clear', 'drizzle', 'rain', 'heavy'].includes(opening), opening);
    // move the weather on, so a reset would show
    await weather(page, opening === 'drizzle' ? ['rain'] : ['drizzle']);
    await page.waitForTimeout(1500);
    const before = await page.evaluate(() => ({ state: window.__cityWeather.env.weather, rain: window.__cityWeather.env.rain, clock: window.__cityShared.clock }));
    await page.evaluate(() => {
      window.__weatherMark = window.__cityWeather;
    });
    // to Pet mode and back
    await page.click('[data-mode-toggle]:visible');
    await page.waitForFunction(() => !document.querySelector('[data-city]'));
    await city(page);
    let now = await page.evaluate(() => ({ same: window.__cityWeather === window.__weatherMark, state: window.__cityWeather.env.weather, rain: window.__cityWeather.env.rain, clock: window.__cityShared.clock }));
    assert.ok(now.same, 'a new weather after coming back to City mode');
    assert.equal(now.state, before.state);
    assert.ok(now.clock >= before.clock, 'the weather clock went back');
    assert.ok(Math.abs(now.rain - before.rain) < 0.1, `rain ${before.rain} -> ${now.rain}`);
    // in and out of observation
    await page.click('[data-observe-toggle]:visible');
    await page.waitForSelector('[data-observe-controls]');
    await page.waitForTimeout(800);
    await page.tap('[data-observe-exit]');
    now = await page.evaluate(() => ({ same: window.__cityWeather === window.__weatherMark, state: window.__cityWeather.env.weather }));
    assert.ok(now.same && now.state === before.state, 'observation reset the weather');
    assert.deepEqual(log.errors, []);
  } finally {
    await ctx.close();
  }
});

guard('nothing of the weather runs while the page is hidden or under reduced motion', async () => {
  const { ctx, page } = await openAt(browser, dev.url, { viewport: { width: 1024, height: 700 } });
  try {
    await city(page);
    await weather(page, ['drizzle', 'rain']);
    const setHidden = (hidden) =>
      page.evaluate((h) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
    await setHidden(true);
    const env0 = await page.evaluate(() => JSON.stringify(window.__cityWeather.env));
    await page.waitForTimeout(3000);
    assert.equal(await page.evaluate(() => JSON.stringify(window.__cityWeather.env)), env0, 'the weather moved while hidden');
    await setHidden(false);
    // reduced motion: the still city and still air, and no rain shown
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelector('canvas.city-canvas').dataset.cityAnim === 'static');
    assert.ok(!(await rainState(page)).shown, 'rain shown under reduced motion');
    const a = await airSum(page);
    await page.waitForTimeout(2000);
    assert.equal(await airSum(page), a, 'the air moved under reduced motion');
  } finally {
    await ctx.close();
  }
});
