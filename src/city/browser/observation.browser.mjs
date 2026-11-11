/*
 * Observation mode in the real app, Chromium: desktop, phone portrait and
 * phone landscape.
 *
 *   npm run test:browser
 *
 * The header's observe control hides the whole finance interface (header,
 * tabs, dashboard, footer, readouts): not painted, inert, hidden from
 * assistive technology, but still laid out, so neither environment is
 * resized, re-rendered or recreated. Pet mode keeps the very same Nomoz,
 * where it was, still living; City mode keeps the very same animation,
 * still running, and the scene fills the screen. It stays on across Pet /
 * City; Escape or the discreet Exit leaves, and focus goes back. With
 * CI=true a missing browser is an error.
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
  // the probes hand the page the pet's scheduler and the city's animation, to check they are never recreated
  dev = await startVite({ probe: true, cityProbe: true });
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
    const painted = (el) => !!el && getComputedStyle(el).visibility !== 'hidden' && el.getClientRects().length > 0;
    const parts = [...document.querySelectorAll('[data-observe-part]')].map((p) => ({
      name: p.dataset.observePart,
      inert: p.hasAttribute('inert'),
      ariaHidden: p.getAttribute('aria-hidden') === 'true',
      // every element inside it that would be painted
      painted: [...p.querySelectorAll('*')].filter((el) => painted(el)).length,
    }));
    // the cat itself: environment props (coins and the like) share its class, marked data-prop
    const actor = document.querySelector('.nomoz-actor:not([data-prop])');
    const city = document.querySelector('[data-city]');
    const canvas = city && city.querySelector('canvas.city-canvas');
    const controls = document.querySelector('[data-observe-controls]');
    const main = document.querySelector('main').getBoundingClientRect();
    return {
      observing: !!controls,
      parts,
      header: document.querySelector('header').getBoundingClientRect().height,
      main: [main.x, main.y, main.width, main.height],
      controls: controls ? controls.getBoundingClientRect().toJSON() : null,
      focus: document.activeElement ? document.activeElement.dataset.observeExit !== undefined ? 'exit' : document.activeElement.dataset.observeToggle !== undefined ? 'toggle' : document.activeElement.tagName : null,
      petMounted: !!actor,
      petPainted: painted(document.querySelector('canvas.nomoz-canvas[data-mood]')),
      petTransform: actor ? actor.style.transform : null,
      sameActor: !!actor && actor === window.__petActor,
      sameScheduler: !!window.__nomozScheduler && window.__nomozScheduler === window.__petScheduler,
      city: !!city,
      cityLayer: city ? city.getBoundingClientRect().toJSON() : null,
      cityAnim: canvas ? canvas.dataset.cityAnim : null,
      cityFrames: canvas ? Number(canvas.dataset.cityFrames || 0) : 0,
      cityView: canvas && canvas.dataset.cityView ? canvas.dataset.cityView : null,
      cityCanvas: canvas ? [canvas.width, canvas.height] : null,
      sameCity: !!window.__cityAnim && window.__cityAnim === window.__cityMark,
      vw: innerWidth,
      vh: innerHeight,
      docW: document.documentElement.scrollWidth,
      docH: document.documentElement.scrollHeight,
    };
  });

// the pet's sprite pixels, to see it is still alive (it breathes, blinks, moves)
const petPixels = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('canvas.nomoz-canvas[data-mood]');
    if (!c) return null;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let h = 0;
    for (let i = 0; i < d.length; i += 7) h = (h * 31 + d[i]) | 0;
    return h;
  });

const enter = (page) => page.click('[data-observe-toggle]:visible');

// Nomoz's sprite is painted: its canvas is briefly absent while one pose fades out before the next
// (AnimatePresence mode="wait"), so give it a moment rather than sampling one instant
const petShown = (page) =>
  page
    .waitForFunction(
      () => {
        const c = document.querySelector('canvas.nomoz-canvas[data-mood]');
        return !!c && getComputedStyle(c).visibility !== 'hidden' && c.getClientRects().length > 0;
      },
      null,
      { timeout: 5000 }
    )
    .then(
      () => true,
      () => false
    );

function assertObserving(s) {
  assert.ok(s.observing, 'no observation controls');
  for (const p of s.parts) {
    assert.ok(p.inert && p.ariaHidden, `${p.name} still reachable`);
    assert.equal(p.painted, 0, `${p.name} still painted`);
  }
  assert.ok(['header', 'content', 'footer'].every((n) => s.parts.some((p) => p.name === n)), JSON.stringify(s.parts.map((p) => p.name)));
  // the controls: on screen, small, in the top corner
  const c = s.controls;
  assert.ok(c.left >= 0 && c.right <= s.vw + 0.5 && c.top >= 0 && c.bottom <= s.vh, JSON.stringify(c));
  assert.ok(c.width < s.vw * 0.6 && c.height < 60, 'controls too big');
  assert.ok(s.docW <= s.vw, 'horizontal scroll');
}

function assertInterface(s) {
  assert.ok(!s.observing);
  for (const p of s.parts) assert.ok(!p.inert && !p.ariaHidden, `${p.name} still hidden`);
  assert.ok(s.parts.find((p) => p.name === 'header').painted > 0, 'header not back');
}

for (const [name, viewport, mobile] of [
  ['desktop', { width: 1440, height: 900 }, false],
  ['phone portrait', { width: 390, height: 844 }, true],
  ['phone landscape', { width: 844, height: 390 }, true],
]) {
  guard(`${name}: observing hides the interface, keeps both environments as they are, and survives switching Pet / City`, async () => {
    const { ctx, page, log } = await openAt(browser, dev.url, { viewport, mobile });
    try {
      await page.waitForFunction(() => window.__nomozScheduler && document.querySelector('.nomoz-actor:not([data-prop])'), null, { timeout: 20000 });
      await page.waitForTimeout(1500);
      await page.evaluate(() => {
        window.__petActor = document.querySelector('.nomoz-actor:not([data-prop])');
        window.__petScheduler = window.__nomozScheduler;
      });
      let s = await state(page);
      assertInterface(s);
      const main = s.main;
      const header = s.header;

      // Pet mode: in
      const before = s.petTransform;
      await enter(page);
      await page.waitForSelector('[data-observe-controls]');
      s = await state(page);
      assertObserving(s);
      assert.equal(s.focus, 'exit', 'focus did not move to the way out');
      assert.deepEqual(s.main, main, 'the pet world was resized');
      assert.ok(s.sameActor && s.sameScheduler, 'the pet was recreated');
      assert.ok(await petShown(page), 'the pet is not shown');
      // still where it was a moment ago (it may have taken a step since, but nothing put it back to the start)
      if (before && s.petTransform) assert.ok(s.petTransform === before || !/translate3d\(0px, 0px, 0px\)/.test(s.petTransform));
      // and still alive
      const p0 = await petPixels(page);
      let alive = false;
      for (let i = 0; i < 24 && !alive; i++) {
        await page.waitForTimeout(500);
        alive = (await petPixels(page)) !== p0 || (await state(page)).petTransform !== s.petTransform;
      }
      assert.ok(alive, 'the pet stood still for 12 s while observed');

      // switch to City while observing: observation stays, the scene fills the screen
      await page.click('[data-observe-controls] [data-mode-toggle]');
      await page.waitForSelector('[data-city][data-city-ready]', { timeout: 20000 });
      await page.waitForFunction(() => window.__cityAnim && document.querySelector('canvas.city-canvas').dataset.cityAnim === 'running', null, { timeout: 20000 });
      await page.evaluate(() => {
        window.__cityMark = window.__cityAnim;
      });
      s = await state(page);
      assertObserving(s);
      assert.deepEqual([s.cityLayer.x, s.cityLayer.y, s.cityLayer.width, s.cityLayer.height], [0, 0, s.vw, s.vh]);
      assert.ok(s.petMounted && s.sameActor && !s.petPainted, 'the pet was unmounted or still painted');
      const view = s.cityView;
      const frames = s.cityFrames;
      await page.waitForTimeout(2500);
      s = await state(page);
      assert.ok(s.cityFrames > frames, 'the city stopped');
      assert.ok(s.sameCity && s.cityView === view, 'the city was re-rendered');

      // out (Escape on desktop, the Exit control on a phone) and in again, in City mode: nothing re-rendered
      if (mobile) await page.tap('[data-observe-exit]');
      else await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('[data-observe-controls]'));
      await page.waitForTimeout(200);
      s = await state(page);
      assertInterface(s);
      assert.equal(s.header, header);
      assert.ok(s.sameCity && s.cityView === view && s.cityAnim === 'running', 'leaving observation touched the city');
      await enter(page);
      await page.waitForSelector('[data-observe-controls]');
      s = await state(page);
      assertObserving(s);
      assert.ok(s.sameCity && s.cityView === view && s.cityAnim === 'running', 'entering observation touched the city');

      // back to Pet while observing: the very same Nomoz, painted again
      await page.click('[data-observe-controls] [data-mode-toggle]');
      await page.waitForFunction(() => !document.querySelector('[data-city]'));
      s = await state(page);
      assertObserving(s);
      assert.ok(s.sameActor && s.sameScheduler, 'the pet was recreated');
      assert.ok(await petShown(page), 'the pet is not shown');
      assert.deepEqual(s.main, main);

      // and out: focus returns to the interface
      if (mobile) await page.tap('[data-observe-exit]');
      else await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('[data-observe-controls]'));
      await page.waitForTimeout(100);
      s = await state(page);
      assertInterface(s);
      assert.equal(s.focus, 'toggle', 'focus did not come back');
      assert.deepEqual(log.errors, []);
    } finally {
      await ctx.close();
    }
  });
}

guard('phone: turning the phone while observing keeps observation, fills the new screen, and the city follows', async () => {
  const { ctx, page, log } = await openAt(browser, dev.url, { viewport: { width: 390, height: 844 }, mobile: true });
  try {
    await page.click('[data-mode-toggle]:visible');
    await page.waitForSelector('[data-city][data-city-ready]', { timeout: 20000 });
    await enter(page);
    await page.waitForSelector('[data-observe-controls]');
    for (const size of [
      { width: 844, height: 390 },
      { width: 390, height: 844 },
      { width: 390, height: 700 }, // the address bar coming back
    ]) {
      await page.setViewportSize(size);
      await page.waitForFunction(
        ([w, h]) => {
          const c = document.querySelector('[data-city] canvas.city-canvas');
          return c && c.width === w * devicePixelRatio && c.height === h * devicePixelRatio && c.dataset.cityAnim === 'running';
        },
        [size.width, size.height],
        { timeout: 20000 }
      );
      const s = await state(page);
      assertObserving(s);
      assert.deepEqual([s.cityLayer.width, s.cityLayer.height], [size.width, size.height]);
      assert.ok(s.docH <= size.height + 1, 'the page scrolls');
    }
    // the controls keep clear of the screen's safe areas when the page extends into them
    const style = await page.getAttribute('[data-observe-controls]', 'style');
    assert.ok(/safe-area-inset-top/.test(style) && /safe-area-inset-right/.test(style), style);
    assert.deepEqual(log.errors, []);
  } finally {
    await ctx.close();
  }
});

guard('reduced motion: observing works, and the city stays completely still', async () => {
  const { ctx, page, log } = await openAt(browser, dev.url, { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  try {
    await page.click('[data-mode-toggle]:visible');
    await page.waitForSelector('[data-city][data-city-ready]', { timeout: 20000 });
    await enter(page);
    await page.waitForSelector('[data-observe-controls]');
    const s = await state(page);
    assertObserving(s);
    assert.equal(s.cityAnim, 'static');
    await page.waitForTimeout(3000);
    assert.equal((await state(page)).cityFrames, 0);
    assert.deepEqual(log.errors, []);
  } finally {
    await ctx.close();
  }
});
