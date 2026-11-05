/*
 * Emotion in the real app (real scheduler, real React layers, real attention loop), in real Chromium, at desktop and
 * mobile sizes.
 *
 *   npm run test:browser
 *
 * Test-server probes only (support.mjs, in memory, no source is edited): the real emotion model is handed to the page
 * (window.__nomozEmotion), every patch the attention layer applies is recorded (window.__nomozFace), the real scheduler is
 * exposed, and the idle moments come every second or so instead of every few seconds (the rules, weights and expressions
 * are the shipped ones). Emotion is NOT the financial mood: the canvas's data-mood must not move with it.
 * With CI=true or REQUIRE_BROWSER=1 a missing browser is an error.
 */
import { before, after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED, loadPlaywright, openAt, startVite } from './support.mjs';

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
  dev = await startVite({ probe: true, emotionProbe: true, fast: true });
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

const SIZES = [['desktop', { width: 1280, height: 800 }, false], ['mobile', { width: 390, height: 780 }, true]];
const IDLE = ['sit', 'observe', 'stillness', 'longPause', 'still'];

const emotionOf = (page) => page.evaluate(() => (window.__nomozEmotion ? window.__nomozEmotion.get().kind : null));
const face = (page, from = 0) => page.evaluate((f) => (window.__nomozFace || []).filter((p) => p.t >= f), from);
const now = (page) => page.evaluate(() => Math.round(performance.now()));
const dataMood = (page) => page.evaluate(() => document.querySelector('canvas.nomoz-canvas[data-mood]')?.dataset.mood);
// holds an emotion for `ms` by re-stirring it (each event is small; it fades by itself)
const hold = async (page, event, ms, every = 3000) => {
  for (let spent = 0; spent < ms; spent += every) {
    await page.evaluate((e) => window.__nomozEmotion && (window.__nomozEmotion.note(e), window.__nomozEmotion.note(e)), event);
    await page.waitForTimeout(every);
  }
};

describe('emotion in the app', () => {
  for (const [name, viewport, mobile] of SIZES) {
    guard(`${name}: a content cat is as before; a disturbed one shows irritation in its idle face, and the financial mood never moves`, async () => {
      const { ctx, page, log } = await openAt(browser, dev.url, { viewport, mobile });
      await page.waitForFunction(() => !!window.__nomozScheduler && !!window.__nomozEmotion, null, { timeout: 45000 });
      // leave only the idle face: no behavior runs, the rig is at rest
      await page.evaluate(() => {
        const s = window.__nomozScheduler;
        s.stop();
        s.apply({ pose: 'sit', view: 'front', legs: 0, eyes: 'open', gaze: 'c', ears: null, tail: null, lean: 0, pupils: null, pawL: null, pawR: null, mouth: 'idle', cue: null, item: null, book: null, droop: 0, focus: null });
      });
      const mood = await dataMood(page);
      assert.equal(await emotionOf(page), 'content');
      const t0 = await now(page);
      await page.waitForTimeout(14000);
      const calm = await face(page, t0);
      assert.ok(calm.length >= 2, `the idle face did nothing (${calm.length} patches)`);
      assert.ok(!calm.some((p) => p.ears === 'back' || (p.tail === 'swish' && p.pupils === 3)), 'a content cat showed an emotional tell');

      const t1 = await now(page);
      // keep it irritated until it shows the tell (about one idle moment in six; a moment takes a few seconds even in the
      // accelerated test, so this is usually under a minute): the test waits for the tell instead of betting on a window
      let cross = [];
      for (let spent = 0; spent < 120000 && !cross.some((p) => p.ears === 'back'); spent += 3000) {
        await hold(page, 'disturb', 3000);
        cross = await face(page, t1);
      }
      assert.equal(await emotionOf(page), 'irritated');
      assert.ok(cross.some((p) => p.ears === 'back'), 'an irritated cat never put its ears back in two minutes');
      assert.ok(!cross.some((p) => p.tail === 'lash'), 'lash is the stressed look');
      assert.equal(await dataMood(page), mood, 'the financial mood moved with the emotion');
      assert.deepEqual(log.errors, []);
      await ctx.close();
    });
  }

  guard('desktop: a genuine start (and only that) is followed by one slow composing blink; typing in the page counts as activity', async () => {
    const { ctx, page, log } = await openAt(browser, dev.url, { viewport: SIZES[0][1] });
    await page.waitForFunction(() => !!window.__nomozScheduler && !!window.__nomozEmotion && !!window.__nomozWorld, null, { timeout: 45000 });
    await page.evaluate(() => {
      const s = window.__nomozScheduler;
      s.stop();
      s.apply({ pose: 'sit', view: 'front', legs: 0, eyes: 'open', gaze: 'c', ears: null, tail: null, lean: 0, pupils: null, pawL: null, pawR: null, mouth: 'idle', cue: null, item: null, book: null, droop: 0, focus: null });
    });
    const slow = (patches) => patches.filter((p) => p.eyes === 'blink' && p.pupils === 1);
    // ordinary attention and curiosity: no composing blink
    const t0 = await now(page);
    await page.evaluate(() => window.__nomozEmotion.note('noticed', 1));
    await page.waitForTimeout(9000);
    assert.equal(await page.evaluate(() => window.__nomozEmotion.get().startled), false);
    assert.equal(slow(await face(page, t0)).length, 0, 'a composing blink without a start');
    // a genuine start
    const t1 = await now(page);
    await page.evaluate(() => window.__nomozEmotion.note('startle'));
    assert.equal(await page.evaluate(() => window.__nomozEmotion.get().startled), true);
    await page.waitForTimeout(9000);
    assert.equal(slow(await face(page, t1)).length, 1, 'exactly one composing blink after a start');
    // typing is activity (timing only)
    const before = await page.evaluate(() => window.__nomozWorld.lastActivity());
    await page.keyboard.press('a');
    const after = await page.evaluate(() => window.__nomozWorld.lastActivity());
    assert.ok(after > before, 'a key press was not seen as activity');
    assert.deepEqual(log.errors, []);
    await ctx.close();
  });

  guard('reduced motion: the emotion layer does not touch the face (as the rest of the ambient life)', async () => {
    const { ctx, page, log } = await openAt(browser, dev.url, { viewport: SIZES[0][1], reducedMotion: 'reduce' });
    await page.waitForTimeout(8000);
    const patches = await face(page);
    assert.deepEqual(patches, []);
    assert.deepEqual(log.errors, []);
    await ctx.close();
  });
});
