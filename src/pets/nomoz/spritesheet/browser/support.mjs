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

/*
 * Test-server only: hands the page the real PetScheduler (window.__nomozScheduler) so a test can ask the
 * app for a behavior ("treasure") instead of waiting for the dice. The source is never edited; this
 * rewrites usePet.js in memory. Everything else (the scheduler, the behaviors, the React layers, the
 * sprite renderer) is the shipped code.
 */
export function schedulerProbePlugin() {
  return {
    name: 'nomoz-scheduler-probe-for-test',
    enforce: 'pre',
    transform(code, id) {
      if (!id.split('?')[0].endsWith('/src/pets/usePet.js')) return null;
      const needle = 'schedRef.current = sch;';
      if (!code.includes(needle)) throw new Error('scheduler probe: usePet.js no longer assigns schedRef.current');
      return code.replace(needle, `${needle} if (typeof window !== 'undefined') window.__nomozScheduler = sch;`);
    },
  };
}

/*
 * Test-server only: hands the page the real emotion model (window.__nomozEmotion) and records every patch the attention
 * layer applies (window.__nomozFace), so a test can read how the pet feels and what its face did. With `fast`, the idle
 * moments come every second or so (a test would otherwise wait minutes); the rules, weights and expressions are the
 * shipped ones. Sources are not edited; this rewrites usePet.js / config.js in memory.
 */
export function emotionProbePlugin({ fast = false } = {}) {
  return {
    name: 'nomoz-emotion-probe-for-test',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0];
      if (file.endsWith('/src/pets/usePet.js')) {
        const needle = 'const emotion = emotionRef.current;';
        if (!code.includes(needle)) throw new Error('emotion probe: usePet.js no longer reads emotionRef.current');
        const apply = 'apply: commit,\n      timing: AMBIENT.attention,';
        if (!code.includes(apply)) throw new Error('emotion probe: usePet.js attention call changed');
        const wn = '      world,\n      // any behavior but the quiet sitting ones';
        if (!code.includes(wn)) throw new Error('emotion probe: usePet.js attention call changed (world)');
        return code
          .replace(wn, "      world: typeof window !== 'undefined' ? (window.__nomozWorld = world) : world,\n      // any behavior but the quiet sitting ones")
          .replace(needle, `${needle} if (typeof window !== 'undefined') window.__nomozEmotion = emotion;`)
          .replace(apply, `apply: (p) => { if (typeof window !== 'undefined') (window.__nomozFace ||= []).push({ t: Math.round(performance.now()), ...p }); commit(p); },\n      timing: AMBIENT.attention,`);
      }
      if (fast && file.endsWith('/src/pets/config.js')) {
        const re = /firstMs: \[3500, 9000\],\n\s*everyMs: \[3800, 10500\],/;
        if (!re.test(code)) throw new Error('emotion probe: AMBIENT.attention timing changed');
        return code.replace(re, 'firstMs: [600, 900],\n    everyMs: [900, 1300],');
      }
      return null;
    },
  };
}

/*
 * Test-server only: hands the page City mode's weather (window.__cityWeather), its animation
 * (window.__cityAnim) and rain layer (window.__cityRain), so a test can force the weather or start a
 * rare event instead of waiting minutes for the dice; window.__cityEnvSpeed (default 1) runs the
 * weather's clock faster. Sources are not edited; this rewrites CityBackdrop.jsx in memory.
 */
export function cityProbePlugin() {
  return {
    name: 'city-probe-for-test',
    enforce: 'pre',
    transform(code, id) {
      if (!id.split('?')[0].endsWith('/src/city/CityBackdrop.jsx')) return null;
      const needles = [
        // (the React plugin may already have reprinted the source: match loosely)
        [/const weather = createEnvironment\([^;]*\);/, ' window.__cityWeather = weather;'],
        [/image = new ImageData\(anim\.rgba, layout\.w, layout\.h\);/, ' window.__cityAnim = anim;'],
        [/placeRain\(layout\);/, ' window.__cityRain = rain;'],
      ];
      for (const [re, add] of needles) {
        if (!re.test(code)) throw new Error(`city probe: CityBackdrop.jsx changed (${re})`);
        code = code.replace(re, (m) => m + add);
      }
      const clock = 'envClock += step;';
      if (!code.includes(clock)) throw new Error('city probe: CityBackdrop.jsx weather clock changed');
      return code.replace(clock, 'envClock += step * (window.__cityEnvSpeed || 1);');
    },
  };
}

/* A dev server running the shipped configuration (the sprite-sheet cat). */
export async function startVite({ probe = false, emotionProbe = false, fast = false, cityProbe = false } = {}) {
  const vite = await importFromProject('node_modules/vite/dist/node/index.js');
  const react = (await importFromProject('node_modules/@vitejs/plugin-react/dist/index.js')).default;
  const server = await vite.createServer({
    root: ROOT,
    configFile: false,
    base: BASE,
    plugins: [react(), ...(probe ? [schedulerProbePlugin()] : []), ...(emotionProbe ? [emotionProbePlugin({ fast })] : []), ...(cityProbe ? [cityProbePlugin()] : [])],
    server: { host: '127.0.0.1', port: 0, strictPort: false },
    logLevel: 'error',
    clearScreen: false,
  });
  await server.listen();
  const url = `http://127.0.0.1:${server.httpServer.address().port}${BASE}`;
  return { server, url };
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
  await page.waitForSelector('canvas.nomoz-canvas[data-mood]', { state: 'attached', timeout: 45000 });
  return { ctx, page, log };
}

/* Pixel summary of the pet canvas. */
export const sampleCanvas = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('canvas.nomoz-canvas[data-mood]');
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
