/*
 * Emotion never takes the face from a running behavior: the real app, the real scheduler running, in real Chromium, at
 * desktop and mobile sizes. (Kept apart from emotion.browser.mjs so each file stays well inside the test timeout.)
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

describe('emotion and running behaviors', () => {
  for (const [name, viewport, mobile] of SIZES) {
    guard(`${name}: a running behavior keeps the face: the attention layer only ever acts in idle windows, whatever the emotion`, async () => {
      const { ctx, page, log } = await openAt(browser, dev.url, { viewport, mobile });
      await page.waitForFunction(() => !!window.__nomozScheduler && !!window.__nomozEmotion, null, { timeout: 45000 });
      // the real scheduler runs; patches are tagged with the behavior running when they were applied
      await page.evaluate(() => {
        const orig = window.__nomozFace;
        window.__nomozTagged = [];
        const sch = window.__nomozScheduler;
        const push = Array.prototype.push;
        window.__nomozFace = new Proxy(orig || [], {
          get(target, key) {
            if (key === 'push') return (p) => (push.call(window.__nomozTagged, { ...p, cur: sch.current }), push.call(target, p));
            const v = target[key];
            return typeof v === 'function' ? v.bind(target) : v;
          },
        });
      });
      const running = new Set();
      for (let i = 0; i < 16; i++) {
        await page.evaluate((k) => window.__nomozEmotion.note(['disturb', 'noticed', 'play'][k % 3], 1), i);
        for (let k = 0; k < 3; k++) {
          await page.waitForTimeout(1000);
          const cur = await page.evaluate(() => window.__nomozScheduler.current);
          if (cur) running.add(cur);
        }
      }
      // the scheduler really had the face for much of the time (this would be vacuous otherwise)
      assert.ok(running.size >= 3, `only ${[...running].join()} ran in 48 s`);
      // While a behavior runs the attention layer may only HAND BACK what it was holding when the behavior began (values at
      // rest: no ears, centred gaze, no lean, automatic pupils, no tail); it never sets anything of its own.
      const rest = (p) => Object.entries(p).every(([k, v]) => k === 't' || k === 'cur' || v === null || v === 'c' || v === 0 || v === 'open');
      const tagged = await page.evaluate(() => window.__nomozTagged);
      const over = tagged.filter((p) => p.cur && !IDLE.includes(p.cur) && !rest(p));
      assert.deepEqual(over, [], `attention set ${JSON.stringify(over[0])} while ${over[0]?.cur} had the face`);
      assert.deepEqual(log.errors, []);
      await ctx.close();
    });
  }
});
