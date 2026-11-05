/*
 * Grooming, curled-up sleeping and stretching, played through complete cycles in real Chromium at desktop and mobile sizes:
 * the real behaviors' scripts, the shipped sheets, the real renderer and its overlays (crown, chest coin), real pixels.
 *
 *   npm run test:browser
 *
 * Time is a fake clock (the renderer reads performance.now, and the tail's phase is seeded), so a run is the same every time.
 * With CI=true or REQUIRE_BROWSER=1 a missing browser is an error.
 */
import { before, after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED, loadPlaywright } from './support.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHEETS = resolve(HERE, '..');
const ROOT = resolve(HERE, '../../../../..');
const require = createRequire(join(ROOT, 'package.json'));

const SIZES = [['desktop', { viewport: { width: 1280, height: 800 } }, 4], ['mobile', { viewport: { width: 390, height: 780 }, isMobile: true, deviceScaleFactor: 3, hasTouch: true }, 3]];

let skipReason = null;
let browser = null;
let bundle = '';
const sheetData = {};
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
  const esbuild = require('esbuild');
  const entry = `
    import { createSheetRenderer } from '${SHEETS}/renderer.js';
    import { SHEET_MANIFEST } from '${SHEETS}/manifest.js';
    import nomoz from '${SHEETS}/../index.js';
    import { BEHAVIORS } from '${SHEETS}/../behaviors/index.js';
    import { ANIMATIONS } from '${SHEETS}/../animations.js';
    import { createAnimationRegistry } from '${SHEETS}/../../core/animations.js';
    import { buildBehaviorSet } from '${SHEETS}/../../core/behaviors.js';
    import { makeScript } from '${SHEETS}/../../core/toolkit.js';
    import { createWorld } from '${SHEETS}/../../core/space.js';
    import { createRng } from '${SHEETS}/../../core/rng.js';
    window.T = { createSheetRenderer, SHEET_MANIFEST, vanity: nomoz.vanity, BEHAVIORS, ANIMATIONS, createAnimationRegistry, buildBehaviorSet, makeScript, createWorld, createRng };`;
  const res = await esbuild.build({ stdin: { contents: entry, resolveDir: SHEETS }, bundle: true, format: 'iife', write: false, logLevel: 'error', define: { 'import.meta.url': '"file:///x/manifest.js"' } });
  bundle = res.outputFiles[0].text;
  for (const f of readdirSync(join(SHEETS, 'sheets'))) sheetData[f.replace('.png', '')] = readFileSync(join(SHEETS, 'sheets', f)).toString('base64');
});

after(async () => {
  await browser?.close();
});

const guard = (name, fn) =>
  test(name, async (t) => {
    if (skipReason) return t.skip(skipReason);
    await fn(t);
  });

/*
 * Runs `jobs` ([{ id, seed }] or [{ id, beats, end, base }] for a hand-made script) in a page: each script is planned from the real behavior, then played through the real renderer
 * (one sample per 50 ms, plus a 0.8 s tail) on a real canvas. Per sample: the clip on screen, the pose, the changed-pixel count
 * against the previous sample, gold (crown + coin) pixels with their bounding box, and the top row of the cat.
 */
async function run(contextOptions, jobs) {
  const ctx = await browser.newContext(contextOptions);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setContent('<body style="margin:0"></body>');
  await page.addScriptTag({ content: 'window.__t=0;window.__seed=7;Math.random=()=>{window.__seed=(window.__seed*1664525+1013904223)>>>0;return window.__seed/4294967296};performance.now=()=>window.__t;' });
  await page.addScriptTag({ content: bundle });
  const out = await page.evaluate(async ({ sheets, jobs }) => {
    const T = window.T;
    const manifest = JSON.parse(JSON.stringify(T.SHEET_MANIFEST));
    for (const [id, s] of Object.entries(manifest.sheets)) s.src = 'data:image/png;base64,' + sheets[id];
    const anims = T.createAnimationRegistry(T.ANIMATIONS);
    const set = T.buildBehaviorSet(T.BEHAVIORS, {}, () => true);
    const geo = T.createWorld({}).makeGeo({ width: 1280, height: 800, spriteW: 384, spriteH: 256 }, false);
    const BASE = { sx: 100, sy: 100, z: 0, facing: 1, view: 'front', pose: 'sit', gaze: 'c', eyes: 'open', mouth: 'idle', legs: 0, lean: 0, cue: null, item: null, book: null, crown: 0, crownLift: 0, coin: null, droop: 0, glitch: 0, pawL: null, pawR: null, ears: null, tail: null, focus: null, pupils: null, bookPaw: null, bookShift: 0, fx: {}, props: {}, mood: 'content' };
    const scriptOf = (id, seed) => {
      const b = set.find((x) => x.id === id);
      const view = { ...BASE, facing: seed % 2 ? 1 : -1 };
      const c = { rng: T.createRng(seed * 7919), cur: view, reduced: false, compact: false, mood: 'content', has: () => true, memory: {}, geo, pet: { sprite: { width: 96, height: 64 } }, pickSpot: () => ({ sx: 100, sy: 100, z: 0 }), apply: () => {} };
      const S = T.makeScript(c, anims);
      if (b.enter) b.enter(c);
      const end = b.plan(c, S);
      return { end, view, beats: S.beats.sort((a, z) => a.t - z.t).map(({ t, patch }) => { const { propOps, fxOps, ...rest } = patch; return { t, patch: rest }; }) };
    };
    // the breath is the art above row 50 drawn a row lower: count those blits (on whichever context the renderer paints)
    window.__dip = 0;
    const blit = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...a) {
      if (a.length === 9 && a[4] === 50 && a[8] === 50) window.__dip++;
      return blit.apply(this, a);
    };
    const render = T.createSheetRenderer({ manifest });
    // warm: every sheet decoded before the first sample
    const warm = document.createElement('canvas');
    warm.width = 96;
    warm.height = 64;
    for (const pose of ['sit', 'curl', 'stretch', 'loaf', 'crouch', 'stand']) render(warm.getContext('2d'), { ...BASE, pose, frame: 0, light: 1 }, T.vanity);
    await new Promise((r) => setTimeout(r, 800));
    const results = [];
    for (const job of jobs) {
      const sc = job.beats ? { end: job.end, view: { ...BASE, ...job.base }, beats: job.beats } : scriptOf(job.id, job.seed);
      const cv = document.createElement('canvas');
      cv.width = 96;
      cv.height = 64;
      document.body.append(cv);
      const g = cv.getContext('2d', { willReadFrequently: true });
      const v = { ...sc.view };
      let bi = 0;
      let prev = null;
      const rows = [];
      for (let t = 0; t <= sc.end + 800; t += 50) {
        while (bi < sc.beats.length && sc.beats[bi].t <= t) Object.assign(v, sc.beats[bi++].patch);
        window.__t = 100000 + t;
        window.__dip = 0;
        render(g, { ...v, frame: Math.floor(t / 700), light: 1 }, T.vanity);
        const d = g.getImageData(0, 0, 96, 64).data;
        let diff = 0;
        let gold = 0;
        let top = -1;
        let x0 = 99;
        let x1 = -1;
        let y0 = 99;
        let y1 = -1;
        for (let y = 0; y < 64; y++) {
          for (let x = 0; x < 96; x++) {
            const i = (y * 96 + x) * 4;
            if (d[i + 3] && top < 0) top = y;
            if (prev && (d[i] !== prev[i] || d[i + 1] !== prev[i + 1] || d[i + 2] !== prev[i + 2] || d[i + 3] !== prev[i + 3])) diff++;
            if (d[i + 3] && d[i] > 200 && d[i + 1] > 140 && d[i + 2] < 90) {
              gold++;
              x0 = Math.min(x0, x);
              x1 = Math.max(x1, x);
              y0 = Math.min(y0, y);
              y1 = Math.max(y1, y);
            }
          }
        }
        prev = Uint8ClampedArray.from(d);
        rows.push({ t, clip: render.clipOf(g), pose: v.pose, diff: rows.length ? diff : 0, gold, box: gold ? [x0, y0, x1, y1] : null, top, facing: v.facing, dip: window.__dip > 0, eyes: v.eyes, droop: v.droop });
      }
      cv.remove();
      results.push({ ...job, rows });
    }
    return results;
  }, { sheets: sheetData, jobs });
  await ctx.close();
  return { out, errors };
}

const near = (rows, i, pose) => [rows[i - 2], rows[i - 1], rows[i], rows[i + 1], rows[i + 2]].some((r) => r && r.pose === pose);

describe('grooming, sleeping curled up and stretching, in complete cycles', () => {
  for (const [name, options] of SIZES) {
    guard(`${name}: stretching keeps the crown and the chest coin on the cat for the whole stretch (entering, holding, leaving), over several cycles`, async () => {
      const { out, errors } = await run(options, [1, 2, 3, 4].map((seed) => ({ id: 'stretch', seed })).concat([{ id: 'sleep', seed: 2 }]));
      let samples = 0;
      for (const job of out) {
        job.rows.forEach((r, i) => {
          if (!near(job.rows, i, 'stretch')) return;
          samples++;
          assert.ok(r.gold >= 30, `${job.id} seed ${job.seed} t=${r.t} (${r.clip}): only ${r.gold} crown / coin pixels`);
          // on the stretching cat's head and chest, not floating off it: the raised head and the bib at the left of the art
          // (the sitting art either side, and the squashed sitting art for the first beat of the stretch, have their own anchors)
          if (r.clip !== 'stretch' || job.rows[i - 1]?.clip !== 'stretch' || job.rows[i - 2]?.clip !== 'stretch') return;
          const [x0, y0, x1, y1] = r.box;
          const [lo, hi] = r.facing > 0 ? [96 - 71, 96 - 8] : [8, 71]; // the art faces left; facing > 0 mirrors it
          assert.ok(x0 >= lo && x1 <= hi && y0 >= 26 && y1 <= 62, `${job.id} seed ${job.seed} t=${r.t} (${r.clip}): the crown / coin are at ${r.box}`);
        });
        // the stretch itself is the stretch art, and it is held (not flickering with other art)
        const stretchRuns = job.rows.filter((r) => r.clip === 'stretch');
        assert.ok(stretchRuns.length >= 20, `${job.id} seed ${job.seed}: ${stretchRuns.length} samples of stretch art`);
      }
      assert.ok(samples > 200, `${samples} samples near a stretch`);
      assert.deepEqual(errors, []);
    });

    guard(`${name}: grooming changes the picture at the moves, not at every toggle of paw, eyes or droop`, async () => {
      const { out, errors } = await run(options, [1, 2, 3, 4, 5, 6].map((seed) => ({ id: 'groom', seed })));
      for (const job of out) {
        // a jump is a whole-body change between two samples 50 ms apart (a pose swap); before the fix a routine had 20-34
        const jumps = job.rows.filter((r) => r.diff > 1000).length;
        assert.ok(jumps <= 12, `groom seed ${job.seed}: ${jumps} jumps in ${job.rows.length * 50} ms`);
        // the art stays one clip through the moves: between its first and last sample no dozing art appears
        const names = job.rows.map((r) => r.clip);
        const first = names.indexOf('sit_groom');
        const last = names.lastIndexOf('sit_groom');
        assert.ok(first >= 0, `groom seed ${job.seed}: no grooming art at all`);
        assert.ok(!names.slice(first, last + 1).includes('sit_doze'), `groom seed ${job.seed}: dozing art in the middle of grooming`);
        assert.equal(names.at(-1), 'idle_front', `groom seed ${job.seed}: it did not come back to sitting`);
      }
      assert.deepEqual(errors, []);
    });

    guard(`${name}: a sleeping cat curled up breathes steadily, and its poses change by settling, not twitching`, async () => {
      const seeds = [3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25];
      const { out, errors } = await run(options, seeds.map((seed) => ({ id: 'sleep', seed })));
      let curled = 0;
      let breathingRuns = 0;
      for (const job of out) {
        const inCurl = job.rows.filter((r) => r.clip === 'curl');
        if (inCurl.length < 120) continue;
        curled++;
        // it breathes: the upper body drops a row and comes back, about every 4.2 s, steadily, and each change is a visible shift
        const dips = inCurl.map((r) => r.dip);
        const edges = inCurl.map((r, i) => (i && r.dip !== dips[i - 1] ? r : null)).filter(Boolean);
        const seconds = (inCurl.length * 50) / 1000;
        assert.ok(dips.some(Boolean) && !dips.every(Boolean), `sleep seed ${job.seed}: it does not breathe`);
        assert.ok(edges.length >= Math.floor(seconds / 4.2) * 2 - 2 && edges.length <= (seconds / 4.2) * 2 + 6, `sleep seed ${job.seed}: ${edges.length} breath changes in ${seconds} s`);
        assert.ok(edges.every((r) => r.diff >= 20), `sleep seed ${job.seed}: a breath that moves nothing (${edges.map((r) => r.diff)})`);
        breathingRuns++;
        // the sleeping poses are never on screen for a fraction of a second between others
        const runs = [];
        for (const r of job.rows) (runs.length && runs.at(-1)[0] === r.clip ? (runs.at(-1)[1] += 50) : runs.push([r.clip, 50]));
        runs.forEach(([c, ms], i) => {
          if (/^(curl|loaf_front)$/.test(c) && i > 0 && i < runs.length - 1) assert.ok(ms >= 600, `sleep seed ${job.seed}: ${c} for ${ms} ms`);
        });
      }
      assert.ok(curled >= 3, `only ${curled} of ${seeds.length} sleeps curled up`);
      assert.ok(breathingRuns >= 3);
      assert.deepEqual(errors, []);
    });

    guard(`${name}: blinks, closed and happy eyes change only the eyes: the head, ears and whiskers of the sitting cat do not jump`, async () => {
      const beats = [];
      for (let t = 400; t < 6000; t += 700) beats.push({ t, patch: { eyes: 'blink' } }, { t: t + 140, patch: { eyes: 'open' } });
      beats.push({ t: 6200, patch: { eyes: 'happy' } }, { t: 7000, patch: { eyes: 'closed' } }, { t: 7800, patch: { eyes: 'open' } });
      const { out, errors } = await run(options, [{ id: 'blinks', beats, end: 8400, base: { facing: -1 } }]);
      const rows = out[0].rows;
      assert.deepEqual([...new Set(rows.map((r) => r.clip))], ['idle_front'], 'a blink swapped the picture');
      // the pixels that change when the eyes change: a few eye pixels, never the ~1000 of a swap to the closed-eye frame
      const eyeSteps = rows.filter((r, i) => i && r.eyes !== rows[i - 1].eyes);
      assert.ok(eyeSteps.length >= 14, `${eyeSteps.length} eye changes`);
      // (idle_front itself changes frame every second; those two samples are excluded)
      for (const r of eyeSteps) if (r.t % 1000 > 100 && r.t % 1000 < 900) assert.ok(r.diff < 120, `t=${r.t}: ${r.diff} pixels changed when the eyes changed`);
      assert.deepEqual(errors, []);
    });

    guard(`${name}: the crown and the coin go down and up with the head on every breath, a nod and a bite`, async () => {
      const nod = [];
      for (let i = 0; i < 5; i++) nod.push({ t: 600 + i * 800, patch: { droop: 1 } }, { t: 900 + i * 800, patch: { droop: 0 } });
      const { out, errors } = await run(options, [
        { id: 'breath-threeq', beats: [], end: 9000, base: { view: 'frontQ', facing: -1 } },
        { id: 'breath-curl', beats: [], end: 9000, base: { pose: 'curl', eyes: 'closed', facing: -1 } },
        { id: 'nod', beats: nod, end: 5000, base: { facing: -1 } },
      ]);
      const [threeq, curl, nodRun] = out;
      const gold = (rows) => rows.map((r) => r.box && r.box[1]);
      // the crown's top row takes exactly two values one row apart, in step with the art's dip (diff at each change is the whole upper body)
      for (const [label, rows] of [['sit_threeq', threeq.rows.filter((r) => r.clip === 'sit_threeq')], ['curl', curl.rows.filter((r) => r.clip === 'curl')]]) {
        const ys = gold(rows).filter((y) => y !== null);
        const lo = Math.min(...ys);
        assert.deepEqual([...new Set(ys)].sort(), [lo, lo + 1], `${label}: the crown does not follow the breath (${[...new Set(ys)]})`);
        const edges = rows.filter((r, i) => i && r.box && rows[i - 1].box && r.box[1] !== rows[i - 1].box[1]);
        assert.ok(edges.length >= 3, `${label}: ${edges.length} breath changes`);
        assert.ok(edges.every((r) => r.diff >= 20), `${label}: the crown moved without the head`);
      }
      // the sitting cat's coin goes with its chest when the head and chest breathe
      const coinTops = threeq.rows.filter((r) => r.clip === 'sit_threeq' && r.box).map((r) => r.box[3]);
      assert.equal(new Set(coinTops).size, 2, 'the coin does not follow the chest');
      // a nod: the crown is a row lower exactly while the script's droop is on
      const nodRows = nodRun.rows.filter((r) => r.box);
      const down = [...new Set(nodRows.filter((r) => r.droop).map((r) => r.box[1]))];
      const up = [...new Set(nodRows.filter((r) => !r.droop).map((r) => r.box[1]))];
      assert.ok(nodRows.filter((r) => r.droop).length > 10 && nodRows.filter((r) => !r.droop).length > 10);
      assert.deepEqual([up.length, down.length, down[0] - up[0]], [1, 1, 1], `the crown is not exactly a row lower during a nod (up ${up}, down ${down})`);
      assert.deepEqual(errors, []);
    });

    guard(`${name}: the grooming cat and the sleeping cat keep their crown (and the groomer its coin) on the head and chest through whole cycles`, async () => {
      const { out, errors } = await run(options, [1, 2, 3].map((seed) => ({ id: 'groom', seed })).concat([3, 5, 7, 9, 11, 13].map((seed) => ({ id: 'sleep', seed }))));
      for (const job of out) {
        for (const r of job.rows) {
          if (r.clip === 'sit_groom') assert.ok(r.gold >= 40, `${job.id} ${job.seed} t=${r.t}: grooming with only ${r.gold} crown / coin pixels`);
          if (r.clip === 'curl') assert.ok(r.gold >= 14, `${job.id} ${job.seed} t=${r.t}: curled up with only ${r.gold} crown pixels`);
        }
      }
      assert.ok(out.some((j) => j.rows.some((r) => r.clip === 'curl')) && out.some((j) => j.rows.some((r) => r.clip === 'sit_groom')));
      assert.deepEqual(errors, []);
    });
  }
});
