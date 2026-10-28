/*
 * Renders the pet in sheet mode for review: one tile per state, with crown and
 * coin, effects, cues, the book and the stress passes, through the real
 * renderer in headless Chromium. Needs `playwright` (global) and the repo's
 * node_modules (esbuild comes with vite).
 *
 *   node src/pets/nomoz/spritesheet/art/source/review_render.cjs [out.png]
 *
 * The fur is near-black, so tiles are brightened x3.2 (the app adds a rim
 * light instead).
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const esbuild = require(path.resolve(__dirname, '../../../../../../node_modules/esbuild'));

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = process.argv[2] || path.join(ROOT, 'art', 'review', 'render_states.png');
const ENTRY = `
import { createSheetRenderer } from '${ROOT}/renderer.js';
import { SHEET_MANIFEST } from '${ROOT}/manifest.js';
import nomoz from '${ROOT}/../index.js';
window.T = { createSheetRenderer, SHEET_MANIFEST, vanity: nomoz.vanity };`;

const V = ['front', 'frontQ', 'side', 'rearQ', 'rear'];
const SCENES = [
  ['sit front', {}], ['wide eyes', { eyes: 'wide' }], ['eyes closed', { eyes: 'closed' }], ['dozing', { eyes: 'closed', droop: 1 }],
  ['groom', { pawL: 'high', mouth: 'lick' }], ['sit 3/4', { view: 'frontQ' }], ['sit side', { view: 'side' }],
  ['sit rear 3/4', { view: 'rearQ' }], ['sit rear', { view: 'rear' }], ['curl', { pose: 'curl' }],
  ['stretch', { pose: 'stretch' }], ['loaf', { pose: 'loaf' }], ['low + book', { pose: 'low', eyes: 'down', book: 1 }],
  ['sit + book', { eyes: 'down', book: 0 }], ['paw up (art, paw down)', { pawL: 'up' }],
  ...V.map((v) => [`stand ${v}`, { pose: 'stand', view: v }]),
  ...V.map((v) => [`walk ${v}`, { pose: 'stand', view: v, legs: 1 }]),
  ...V.map((v) => [`creep ${v}`, { pose: 'crouch', view: v, legs: 1 }]),
  ...V.map((v) => [`crouch ${v}`, { pose: 'crouch', view: v }]),
  ['leap front', { pose: 'stand', legs: 3 }], ['leap side', { pose: 'stand', legs: 3, view: 'side' }],
  ['effects', { fx: { a: { kind: 'orb', x: 26, y: 10, c: 'V' }, b: { kind: 'rune', name: 'ka', x: 30, y: 3, c: 'C' } } }],
  ['cue z', { eyes: 'closed', cue: 'z' }], ['stressed', { mood: 'stressed', frame: 1 }], ['glitch', { glitch: 2 }],
  ['walk side, facing right', { pose: 'stand', view: 'side', legs: 1, facing: 1 }],
  ['sit front, facing right', { facing: 1, gaze: 'r' }],
  ['gaze left, pupils wide', { gaze: 'l', pupils: 3 }],
];

(async () => {
  await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: ROOT },
    bundle: true,
    format: 'iife',
    outfile: path.join(ROOT, 'art', 'review', '.bundle.js'),
    logLevel: 'error',
    define: { 'import.meta.url': '"file:///x/manifest.js"' },
  });
  const sheetsDir = path.join(ROOT, 'sheets');
  const sheets = {};
  for (const f of fs.readdirSync(sheetsDir)) sheets[f.replace('.png', '')] = fs.readFileSync(path.join(sheetsDir, f)).toString('base64');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<body></body>');
  await page.addScriptTag({ path: path.join(ROOT, 'art', 'review', '.bundle.js') });
  const url = await page.evaluate(async ([sheets, scenes]) => {
    const { createSheetRenderer, SHEET_MANIFEST, vanity } = window.T;
    const man = JSON.parse(JSON.stringify(SHEET_MANIFEST));
    for (const [id, s] of Object.entries(man.sheets)) s.src = 'data:image/png;base64,' + sheets[id];
    const render = createSheetRenderer({ manifest: man });
    const W = 96, H = 64, S = 2, COLS = 10, PAD = 4, LAB = 12;
    const rows = Math.ceil(scenes.length / COLS);
    const out = document.createElement('canvas');
    out.width = COLS * (W * S + PAD);
    out.height = rows * (H * S + PAD + LAB);
    const o = out.getContext('2d', { willReadFrequently: true });
    o.fillStyle = '#3c4046';
    o.fillRect(0, 0, out.width, out.height);
    o.imageSmoothingEnabled = false;
    for (let i = 0; i < scenes.length; i++) {
      const [name, p0] = scenes[i];
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      const p = { mood: 'content', frame: 0, light: 1, facing: -1, view: 'front', pose: 'sit', legs: 0, gaze: 'c', eyes: 'open', mouth: 'idle', lean: 0, fx: {}, ...p0 };
      render(g, p, vanity);
      await new Promise((r) => setTimeout(r, 90)); // let the sheet load
      render(g, p, vanity);
      const x = (i % COLS) * (W * S + PAD), y = Math.floor(i / COLS) * (H * S + PAD + LAB);
      o.drawImage(c, x, y + LAB, W * S, H * S);
      o.fillStyle = '#ffe9a8';
      o.font = '9px monospace';
      o.fillText(name, x + 2, y + 9);
    }
    const d = o.getImageData(0, 0, out.width, out.height);
    for (let k = 0; k < d.data.length; k += 4) {
      const m = Math.max(d.data[k], d.data[k + 1], d.data[k + 2]);
      const bg = d.data[k] === 60 && d.data[k + 1] === 64 && d.data[k + 2] === 70;
      if (m < 100 && !bg && m !== 0xff) {
        const v = Math.min(255, Math.round(m * 3.2));
        if (Math.abs(d.data[k] - d.data[k + 1]) < 12) { d.data[k] = v; d.data[k + 1] = v; d.data[k + 2] = Math.min(255, v + 8); }
      }
    }
    o.putImageData(d, 0, 0);
    return out.toDataURL();
  }, [sheets, SCENES]);
  fs.writeFileSync(OUT, Buffer.from(url.split(',')[1], 'base64'));
  fs.unlinkSync(path.join(ROOT, 'art', 'review', '.bundle.js'));
  await browser.close();
  console.log('wrote', path.relative(process.cwd(), OUT));
})();
