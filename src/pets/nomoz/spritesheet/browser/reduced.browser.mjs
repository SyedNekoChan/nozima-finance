/*
 * Reduced motion in the real app (default procedural renderer), Chromium.
 *
 *   npm run test:browser
 *
 * With prefers-reduced-motion: reduce the pet must not glide, fade slowly or
 * run any CSS / Web animation, and it keeps drawing and changing posture in
 * discrete steps. A normal-motion run of the same probe proves the probe can
 * see the difference. With CI=true a missing browser is an error.
 */
import { before, after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED, loadPlaywright, openAt, sampleCanvas, startVite } from './support.mjs';

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
  dev = await startVite(false);
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

// what the pet's DOM is doing right now
const probe = (page) =>
  page.evaluate(() => {
    const actor = document.querySelector('.nomoz-actor');
    if (!actor) return null;
    const cs = getComputedStyle(actor);
    const secs = (v) => v.split(',').map((x) => parseFloat(x) || 0);
    const layer = actor.parentElement;
    const running = document.getAnimations().filter((a) => {
      const t = a.effect && a.effect.target;
      return t && layer.contains(t) && a.playState === 'running' && a.effect.getComputedTiming().activeDuration > 0;
    });
    return {
      transform: cs.transform,
      durations: secs(cs.transitionDuration),
      running: running.map((a) => `${a.constructor.name}:${a.effect.target.className || a.effect.target.tagName}`),
      reducedMedia: matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
  });

describe('real browser: reduced motion in the app', () => {
  guard('reduced: no glides, no timed fades, no running animations, still drawing, no errors', async () => {
    const { ctx, page, log } = await openAt(browser, dev.url, { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    const transforms = new Set();
    const hashes = new Set();
    let maxDuration = 0;
    const running = new Set();
    let lastN = 0;
    for (let i = 0; i < 100; i++) {
      await page.waitForTimeout(300);
      const p = await probe(page);
      if (!p) continue;
      assert.equal(p.reducedMedia, true);
      transforms.add(p.transform);
      maxDuration = Math.max(maxDuration, ...p.durations);
      p.running.forEach((r) => running.add(r));
      const s = await sampleCanvas(page);
      if (s) {
        hashes.add(s.h);
        lastN = Math.max(lastN, s.n);
      }
    }
    assert.equal(maxDuration, 0, 'a transition duration is non-zero under reduced motion');
    assert.deepEqual([...running], [], 'an animation is running on the pet');
    assert.equal(transforms.size, 1, `the pet moved: ${[...transforms].join(' | ')}`);
    assert.ok(lastN > 100, `pet nearly blank (${lastN} px)`);
    assert.ok(hashes.size >= 2, 'the pet never changed posture in 30 s');
    assert.deepEqual(log.errors, []);
    await ctx.close();
  });

  guard('normal motion: the same probe sees non-zero transition durations', async () => {
    const { ctx, page, log } = await openAt(browser, dev.url, { viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });
    await page.waitForTimeout(1500);
    const p = await probe(page);
    assert.equal(p.reducedMedia, false);
    assert.ok(Math.max(...p.durations) > 0, `durations ${p.durations}`);
    assert.deepEqual(log.errors, []);
    await ctx.close();
  });

  guard('switching reduced motion on while the app is open takes effect (no more ambient blinks)', async () => {
    const { ctx, page, log } = await openAt(browser, dev.url, { viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });
    await page.waitForTimeout(1500);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(1500); // the pet restarts its scheduler on the mode change
    // record the eye-pixel count (amber irises) every frame for 45 s
    const caps = await page.evaluate(
      () =>
        new Promise((done) => {
          const out = [];
          const t0 = performance.now();
          const loop = () => {
            const c = document.querySelector('canvas.nomoz-canvas');
            if (c) {
              const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
              let n = 0;
              let amber = 0;
              for (let i = 0; i < d.length; i += 4) {
                if (!d[i + 3]) continue;
                n++;
                if (d[i] > 170 && d[i + 1] > 120 && d[i + 2] < 150 && d[i] - d[i + 2] > 50) amber++;
              }
              out.push([performance.now(), n, amber]);
            }
            if (performance.now() - t0 < 45000) requestAnimationFrame(loop);
            else done(out);
          };
          loop();
        })
    );
    // closures of the ambient blink's length (140 ms closed): the eyes drop to nothing and come back
    let open = 0;
    let closedAt = null;
    const blinks = [];
    for (const [t, n, amber] of caps) {
      if (n < 100) continue;
      open = Math.max(open * 0.999, amber);
      const closed = open >= 8 && amber <= open * 0.2;
      if (closed && closedAt === null) closedAt = t;
      if (!closed && closedAt !== null) {
        const ms = t - closedAt;
        if (ms >= 115 && ms <= 175) blinks.push(Math.round(ms));
        closedAt = null;
      }
    }
    // before the fix (framer's once-per-mount value) a waking cat blinked about every 5 s; allow stray behavior closures
    assert.ok(blinks.length <= 1, `ambient-length blinks after switching to reduced motion: ${blinks.join(', ')}`);
    assert.deepEqual(log.errors, []);
    await ctx.close();
  });
});
