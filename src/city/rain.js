import { hash3 } from './noise.js';
import { project, rayDir } from './scene.js';

/*
 * City mode's rain layer: falling rain, splashes, and the sky's rare marks
 * (a shooting star, a lightning bolt). Pixel art like the city: one buffer
 * pixel per city pixel, drawn with whole pixels and shown at the city's
 * whole-number scale, unsmoothed, screen-blended over it (it only adds light
 * and never touches a pixel of the art).
 *
 * Rain falls straight down in the world, so in the picture the streaks run
 * toward the downward vanishing point, like the towers' edges: near drops
 * long and fast, far ones short and slow. How much of it there is follows the
 * weather (env.js); in clear weather the layer is empty and costs nothing.
 * Splashes catch the light on wet roofs and streets while it rains. A
 * shooting star or a bolt only ever shows where the sky is in view.
 */

export const RAIN = {
  density: 1 / 230, // drops per city pixel at the heaviest
  max: 650,
  min: 60,
  // per depth band: share of the drops, speed (city px / s), streak length (px), brightness
  bands: [
    { share: 0.5, speed: [28, 46], len: 2, light: 0.13 },
    { share: 0.33, speed: [80, 120], len: 4, light: 0.19 },
    { share: 0.17, speed: [190, 260], len: 7, light: 0.27 },
  ],
  color: [0.58, 0.66, 0.78],
  splashes: 0.5, // per second, per 1000 wet pixels, at the heaviest
  star: [1, 0.96, 0.86],
  bolt: [0.82, 0.88, 1],
};

const MAX_T = 7499; // a ray that met nothing (render.js MAX_T)

export function createRain(frame, { seed = 1 } = {}) {
  let dyn = frame.dynamic;
  const { w, h } = frame;
  const cam = frame.camera;
  const rows = dyn.ledgeTop;
  const cfg = RAIN;

  // where the sky is in view (rays that rise and meet nothing): stars and bolts only go there
  const dir = [0, 0, 0];
  let skyBottom = -1;
  const skyRow = new Int16Array(w).fill(-1); // per column: the lowest sky row
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < w; x++) {
      if (dyn.depth[y * w + x] < MAX_T) continue;
      rayDir(cam, x + 0.5, y + 0.5, dir);
      if (dir[1] <= 0.005) continue;
      skyRow[x] = y;
      if (y > skyBottom) skyBottom = y;
    }
  }
  let skyCols = 0;
  for (let x = 0; x < w; x++) if (skyRow[x] >= 2) skyCols++;
  const hasSky = skyCols > w * 0.5 && skyBottom >= 4;

  // wet surfaces that can splash: the bright reflections
  const wetList = [];
  for (let p = 0; p < w * rows; p++) {
    const k = p * 3;
    if (Math.max(dyn.S[k], dyn.S[k + 1], dyn.S[k + 2]) > 0.03) wetList.push(p);
  }
  const wet = Int32Array.from(wetList);

  // falling rain heads toward the point straight below
  const vp = project(cam, cam.pos[0], cam.pos[1] - 1e5, cam.pos[2] + 1e-3) || { x: w / 2, y: h * 4 };
  dyn = null;

  let a = seed >>> 0;
  const random = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const maxDrops = Math.round(Math.min(cfg.max, Math.max(cfg.min, w * h * cfg.density)));
  const dx = new Float32Array(maxDrops);
  const dy = new Float32Array(maxDrops);
  const dv = new Float32Array(maxDrops); // speed
  const band = new Uint8Array(maxDrops);
  for (let i = 0; i < maxDrops; i++) {
    const r = i / maxDrops;
    band[i] = r < cfg.bands[0].share ? 0 : r < cfg.bands[0].share + cfg.bands[1].share ? 1 : 2;
  }
  const place = (i, anywhere) => {
    dx[i] = random() * w;
    dy[i] = anywhere ? random() * h : -random() * 12;
    const s = cfg.bands[band[i]].speed;
    dv[i] = s[0] + (s[1] - s[0]) * random();
  };
  // spread the drops' order so the shares hold for any number in use
  const order = new Int32Array(maxDrops);
  for (let i = 0; i < maxDrops; i++) order[i] = i;
  for (let i = maxDrops - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  for (let i = 0; i < maxDrops; i++) place(i, true);

  const out = new Uint8ClampedArray(w * h * 4);
  const px32 = new Uint32Array(out.buffer);
  const BLACK = 0xff000000; // opaque black adds nothing under screen blending
  px32.fill(BLACK);
  let dirty = false; // something drawn last time (so it must be cleared)
  const level = new Float32Array(w * h); // light per pixel this update
  const touched = new Int32Array(w * h);
  let nTouched = 0;
  const splashes = new Int32Array(64);
  const splashLife = new Float32Array(64);
  let nSplash = 0;
  let splashCarry = 0;
  let boltSeed = -1;

  function light(x, y, v) {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (level[p] === 0) touched[nTouched++] = p;
    if (v > level[p]) level[p] = v;
  }

  function paint(color, p, v) {
    const o = p * 4;
    out[o] = Math.max(out[o], color[0] * v * 255);
    out[o + 1] = Math.max(out[o + 1], color[1] * v * 255);
    out[o + 2] = Math.max(out[o + 2], color[2] * v * 255);
  }

  return {
    w,
    h,
    rgba: out,
    hasSky,
    /* Advance to time t (ms) with the weather env; returns true when the picture changed. */
    update(t, dtMs, env) {
      const dt = Math.min(0.25, Math.max(0, dtMs / 1000));
      const rain = env.rain;
      const n = Math.round(maxDrops * Math.min(1, rain) ** 0.9);
      const flashing = hasSky && env.flash > 0.3;
      const star = hasSky ? env.star : null;
      if (!n && !nSplash && !flashing && !star && !dirty) return false;

      // clear what was drawn
      for (let i = 0; i < nTouched; i++) level[touched[i]] = 0;
      nTouched = 0;
      if (dirty) px32.fill(BLACK);
      dirty = false;

      // rain: streaks toward the point below, a little blown by the wind
      const wind = 6 + 14 * rain;
      for (let k = 0; k < n; k++) {
        const i = order[k];
        let ux = vp.x - dx[i];
        let uy = vp.y - dy[i];
        const d = Math.hypot(ux, uy) || 1;
        ux /= d;
        uy /= d;
        const b = cfg.bands[band[i]];
        dx[i] += (ux * dv[i] + wind * (band[i] + 1) * 0.4) * dt;
        dy[i] += uy * dv[i] * dt;
        if (dy[i] >= h || dx[i] < -8 || dx[i] >= w + 8 || d < 3) {
          place(i, false);
          continue;
        }
        const v = b.light * (0.55 + 0.45 * rain);
        for (let s = 0; s < b.len; s++) light(Math.round(dx[i] - ux * s), Math.round(dy[i] - uy * s), v * (1 - s / (b.len + 1)));
      }
      for (let i = 0; i < nTouched; i++) paint(cfg.color, touched[i], level[touched[i]]);

      // splashes on wet roofs and streets: a pixel catches the light for a moment
      if (wet.length) {
        splashCarry += rain * cfg.splashes * (wet.length / 1000) * dt;
        while (splashCarry >= 1 && nSplash < splashes.length) {
          splashCarry -= 1;
          splashes[nSplash] = wet[Math.floor(random() * wet.length)];
          splashLife[nSplash++] = 0.18;
        }
        splashCarry = Math.min(splashCarry, 4);
      }
      for (let i = 0; i < nSplash; ) {
        paint(cfg.color, splashes[i], 0.26);
        splashLife[i] -= dt;
        if (splashLife[i] <= 0) {
          splashes[i] = splashes[nSplash - 1];
          splashLife[i] = splashLife[--nSplash];
        } else i++;
      }

      // a shooting star across the sky
      if (star) {
        const u = Math.min(1, (t - star.t0) / star.life);
        const s = star.seed;
        const sx0 = hash3(s, 1, 7) * w * 0.7 + w * 0.15;
        const top = Math.max(1, Math.floor(skyBottom * 0.15));
        const sy0 = top + hash3(s, 2, 7) * Math.max(1, skyBottom * 0.5);
        const ang = (hash3(s, 3, 7) < 0.5 ? -1 : 1) * (0.25 + 0.35 * hash3(s, 4, 7));
        const len = w * (0.12 + 0.12 * hash3(s, 5, 7));
        const hx = sx0 + Math.cos(ang) * len * u * Math.sign(ang || 1);
        const hy = sy0 + Math.abs(Math.sin(ang)) * len * u;
        const fade = u < 0.15 ? u / 0.15 : u > 0.8 ? (1 - u) / 0.2 : 1;
        const tail = 7;
        for (let k = 0; k <= tail; k++) {
          const x = Math.round(hx - Math.cos(ang) * Math.sign(ang || 1) * k);
          const y = Math.round(hy - Math.abs(Math.sin(ang)) * k);
          if (x < 0 || x >= w || y < 0 || y >= h || skyRow[x] < y) continue; // only in the sky
          paint(cfg.star, y * w + x, 0.85 * fade * (1 - k / (tail + 1)));
        }
      }

      // a bolt down to the horizon, in the sky, while the flash is bright
      if (flashing) {
        if (boltSeed !== env.flashId) boltSeed = env.flashId;
        let x = Math.round(env.flashX * w);
        for (let y = 0; y <= skyBottom; y++) {
          if (x < 0 || x >= w || skyRow[x] < y) break;
          paint(cfg.bolt, y * w + x, Math.min(1, env.flash * 1.1));
          if (hash3(boltSeed, y, 11) < 0.45) x += hash3(boltSeed, y, 12) < 0.5 ? -1 : 1;
        }
      }

      dirty = n > 0 || nSplash > 0 || flashing || !!star;
      return true;
    },
  };
}
