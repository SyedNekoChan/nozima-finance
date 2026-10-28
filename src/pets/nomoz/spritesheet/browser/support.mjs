import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
export const BASE = '/nozima-finance/';

// CI runners must run the browser tests; a missing browser is a failure there.
export const REQUIRED = !!(process.env.CI && process.env.CI !== 'false') || process.env.REQUIRE_BROWSER === '1';

export function loadPlaywright() {
  const roots = [ROOT];
  try {
    roots.push(execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
  } catch {}
  for (const r of roots) {
    try {
      return createRequire(join(r, 'x.js'))('playwright');
    } catch {}
  }
  return null;
}

export async function startVite(flipToSheet) {
  const vite = await importFromProject('node_modules/vite/dist/node/index.js');
  const react = (await importFromProject('node_modules/@vitejs/plugin-react/dist/index.js')).default;
  const flip = sheetModePlugin();
  const server = await vite.createServer({
    root: ROOT,
    configFile: false,
    base: BASE,
    plugins: [react(), ...(flipToSheet ? [flip] : [])],
    server: { host: '127.0.0.1', port: 0, strictPort: false },
    logLevel: 'error',
    clearScreen: false,
  });
  await server.listen();
  const url = `http://127.0.0.1:${server.httpServer.address().port}${BASE}`;
  return { server, url, flipped: () => flip.flipped };
}

/*
 * Flips SPRITE_RENDERER.mode to 'sheet' in memory (dev server and production
 * build alike). The source file config.js is never edited.
 */
export function sheetModePlugin() {
  const plugin = {
    name: 'nomoz-sheet-mode-for-test',
    enforce: 'pre',
    flipped: 0,
    transform(code, id) {
      if (!id.split('?')[0].endsWith('/src/pets/nomoz/config.js')) return null;
      const out = code.replace("SPRITE_RENDERER = { mode: 'procedural' }", "SPRITE_RENDERER = { mode: 'sheet' }");
      if (out !== code) plugin.flipped++;
      return out;
    },
  };
  return plugin;
}

export async function importFromProject(rel) {
  return import(pathToFileURL(join(ROOT, rel)));
}

/* Opens `url` in a fresh context, logging errors, warnings and image responses. */
export async function openAt(browser, url, { viewport, mobile = false, reducedMotion = 'no-preference' } = {}) {
  const ctx = await browser.newContext({ viewport, reducedMotion, ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  const log = { errors: [], warnings: [], images: [], failed: [] };
  page.on('pageerror', (e) => log.errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'warning') log.warnings.push(m.text());
    if (m.type() === 'error') log.errors.push(m.text());
  });
  page.on('response', (r) => r.request().resourceType() === 'image' && log.images.push({ url: r.url(), status: r.status(), type: r.headers()['content-type'] }));
  page.on('requestfailed', (r) => log.failed.push(r.url()));
  await page.goto(url);
  await page.waitForSelector('canvas.nomoz-canvas', { state: 'attached', timeout: 20000 });
  return { ctx, page, log };
}

/* Pixel summary of the pet canvas. */
export const sampleCanvas = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('canvas.nomoz-canvas');
    if (!c) return null;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let h = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3]) n++;
      h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7 + d[i + 3]) | 0;
    }
    return { h, n, w: c.width, ht: c.height };
  });
