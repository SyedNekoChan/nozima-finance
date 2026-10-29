/*
 * No procedural cat while the sheet cat is active, in the real app (real scheduler, real React layers, real renderer),
 * in real Chromium.
 *
 *   npm run test:browser
 *
 * The bug this guards against: a pose whose sheet had not loaded yet (the sheets used to be fetched only when a clip
 * first needed them), a failed sheet or a failed paint made the sheet renderer hand the frame to the OLD procedural
 * cat, which showed for one or more frames in the middle of an animation, then snapped back to the sheet cat.
 *
 * Two test-server probes (support.mjs, in memory, the source is not edited):
 *   - proceduralProbePlugin records every draw that ends up as the procedural cat (window.__nomozProcedural)
 *   - schedulerProbePlugin exposes the real scheduler, which the test stops and then drives through real state changes
 * and page.route delays or blocks the sheet requests so transitions happen while sheets are missing.
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
  dev = await startVite(undefined, { probe: true, proceduralProbe: true });
});

after(async () => {
  await browser?.close();
  await dev?.server.close();
});

const VIEWS = ['front', 'frontQ', 'side', 'rearQ', 'rear'];

// real state changes: every direction of every pose, then the single-frame clips and the gestures
const sequence = () => {
  const out = [];
  for (const pose of ['sit', 'stand', 'crouch'])
    for (const view of VIEWS)
      for (const legs of pose === 'sit' ? [0] : [1, 0]) out.push({ pose, view, legs, pawL: null, eyes: 'open', droop: 0, mouth: 'idle' });
  out.push({ pose: 'stand', view: 'front', legs: 3 }, { pose: 'stand', view: 'side', legs: 3 });
  for (const pose of ['curl', 'stretch', 'loaf', 'low']) out.push({ pose, view: 'front', legs: 0 });
  out.push(
    { pose: 'sit', view: 'front', legs: 0, pawL: 'high', eyes: 'closed' }, // grooming (a single-frame clip)
    { pose: 'sit', view: 'front', legs: 0, pawL: null, eyes: 'closed', droop: 1 }, // dozing (single frame)
    { pose: 'sit', view: 'frontQ', legs: 0, eyes: 'open', droop: 0 }, // sit_threeq (single frame)
    { pose: 'sit', view: 'rear', legs: 0 }, // sit_rear (single frame)
    { pose: 'sit', view: 'front', legs: 0, mouth: 'lick' },
    { pose: 'sit', view: 'front', legs: 0, mouth: 'idle' }
  );
  // and back and forth between two directions, quickly
  for (let i = 0; i < 6; i++) out.push({ pose: 'stand', view: i % 2 ? 'side' : 'rear', legs: 1 });
  return out;
};

// the delay of a sheet request: 150 to 900 ms by file name, so some sheets arrive after the cat has already moved on
const delayOf = (url) => {
  let h = 0;
  for (const ch of url.split('/').pop()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 150 + (h % 750);
};

async function run({ viewport, mobile, delay = false, block = [], stepMs = 220 }) {
  const ctx = await browser.newContext({ viewport, ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  const errors = [];
  const warnings = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
    if (m.type() === 'warning') warnings.push(m.text());
  });
  await ctx.route('**/spritesheet/sheets/*.png', async (route) => {
    const url = route.request().url();
    if (block.some((b) => url.includes(b))) return route.abort();
    if (delay) await new Promise((r) => setTimeout(r, delayOf(url)));
    return route.continue();
  });
  await page.goto(dev.url);
  await page.waitForSelector('canvas.nomoz-canvas[data-mood]', { state: 'attached', timeout: 45000 });
  await page.waitForFunction(() => !!window.__nomozScheduler, null, { timeout: 45000 });
  const r = await page.evaluate(
    async ({ seq, stepMs }) => {
      const sch = window.__nomozScheduler;
      sch.stop(); // the test drives the pet's state itself
      const out = { frames: 0, blankAfterFirst: 0, firstSeenAt: null, states: 0, ms: 0, procedural: 0 };
      let first = false;
      let running = true;
      const t0 = performance.now();
      const sample = () => {
        const cv = [...document.querySelectorAll('canvas.nomoz-canvas[data-mood]')].pop();
        if (cv) {
          const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
          let n = 0;
          for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
          out.frames++;
          if (n > 300) {
            if (!first) {
              first = true;
              out.firstSeenAt = Math.round(performance.now() - t0);
            }
          } else if (first) out.blankAfterFirst++;
        }
        if (running) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
      for (const patch of seq) {
        sch.apply({ ...patch, transitionMs: 0 });
        out.states++;
        await new Promise((res) => setTimeout(res, stepMs));
      }
      await new Promise((res) => setTimeout(res, 600));
      running = false;
      out.ms = Math.round(performance.now() - t0);
      out.procedural = (window.__nomozProcedural || []).length;
      out.proceduralSample = (window.__nomozProcedural || []).slice(0, 5);
      return out;
    },
    { seq: sequence(), stepMs }
  );
  await ctx.close();
  return { ...r, errors, warnings };
}

const SIZES = [['desktop', { width: 1280, height: 800 }, false], ['mobile', { width: 390, height: 780 }, true]];

for (const [name, viewport, mobile] of SIZES) {
  test(`real app, ${name}, sheets arriving late: no procedural cat, no blank frame, through every direction and pose`, async (t) => {
    if (skipReason) return t.skip(skipReason);
    const r = await run({ viewport, mobile, delay: true });
    assert.ok(r.states > 40 && r.frames > 100, `the sequence ran (${r.states} states, ${r.frames} frames)`);
    assert.deepEqual(r.proceduralSample, [], `${r.procedural} procedural draws, first: ${JSON.stringify(r.proceduralSample)}`);
    assert.equal(r.blankAfterFirst, 0, `${r.blankAfterFirst} blank frames after the cat first appeared`);
    assert.deepEqual(r.errors, []);
  });

  test(`real app, ${name}, sheets ready: no procedural cat, no blank frame, through every direction and pose`, async (t) => {
    if (skipReason) return t.skip(skipReason);
    const r = await run({ viewport, mobile, stepMs: 120 });
    assert.deepEqual(r.proceduralSample, [], `${r.procedural} procedural draws`);
    assert.equal(r.blankAfterFirst, 0);
    assert.deepEqual(r.errors, []);
  });
}

test('real app: sheets that cannot be fetched are never replaced by the procedural cat (the frame on screen is held)', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const r = await run({ viewport: { width: 1280, height: 800 }, mobile: false, block: ['nomoz_walk_side', 'nomoz_walk_frontQ', 'nomoz_creep_rear', 'nomoz_leap_front'] });
  assert.deepEqual(r.proceduralSample, [], `${r.procedural} procedural draws`);
  assert.equal(r.blankAfterFirst, 0);
  assert.ok(r.warnings.some((w) => /nomoz sheets/.test(w)), 'the missing sheets are reported');
  assert.deepEqual(r.errors, []);
});
