import { hash3 } from './noise.js';
import { MAX_T as VIEW_T } from './render.js';
import { project, rayDir } from './scene.js';

/*
 * City mode's rain layer: falling rain, splashes, and the sky's rare marks
 * (a shooting star, a lightning bolt). Pixel art like the city: one buffer
 * pixel per city pixel, drawn with whole pixels and shown at the city's
 * whole-number scale, unsmoothed, screen-blended over it (it only adds light
 * and never touches a pixel of the art).
 *
 * The viewer watches from under cover at the top of a tower: the rain is
 * out there, over the city, never on this side of the parapet. It falls in
 * three depth layers, each with its own density, streak length, speed and
 * contrast:
 *
 *   distant   fine, short, faint streaks kilometres off, part of the haze
 *             over the far city and the skyline
 *   middle    the main rainfall, a few hundred metres to a couple of
 *             kilometres out, over the whole city, its towers and the avenue
 *   exterior  the nearest, just beyond the building's edge: a little longer
 *             and brighter, over the rooftops below
 *
 * Every drop has a depth: it is only drawn where nothing nearer stands in
 * front of it (the city's own depth per pixel), so rain falls between and
 * in front of the towers but never through them, and nowhere on or below the
 * viewer's parapet. Drops are spread evenly over the picture (they appear
 * anywhere and live under a second, fading in and out), so there is no
 * column or stream of rain anywhere. Rain falls straight down in the world,
 * so each streak points toward the point straight below the viewer, like the
 * towers' edges, tilted a little by a wind that slowly swings and gusts; every
 * drop has its own speed, length, brightness and a small tilt of its own.
 * How much of each layer there is follows the weather (env.js); in clear
 * weather the layer is empty and costs nothing. Splashes catch the light on
 * wet roofs and streets while it rains. A shooting star or a bolt only ever
 * shows where the sky is in view.
 */

export const RAIN = {
  // per layer: distance from the viewer (m), drops per visible city pixel at the heaviest, streak length
  // and speed (city px, px / s), brightness, how soon it comes in as the rain strengthens (0: from the
  // first drizzle) and its colour
  layers: [
    { name: 'distant', depth: [1800, 9000], density: 1 / 520, len: [1, 2], speed: [22, 40], light: [0.11, 0.16], from: 0, color: [0.56, 0.6, 0.7] },
    { name: 'middle', depth: [150, 1800], density: 1 / 220, len: [3, 5], speed: [55, 105], light: [0.22, 0.33], from: 0, color: [0.58, 0.64, 0.76] },
    { name: 'exterior', depth: [40, 150], density: 1 / 600, len: [5, 9], speed: [150, 240], light: [0.3, 0.42], from: 0.2, color: [0.62, 0.68, 0.8] },
  ],
  max: 900, // drops in all, whatever the screen
  lifeMs: [450, 1100], // a drop is seen for this long, fading in and out
  wind: { base: 0.12, swing: 0.1, swingMs: 23000, gust: 0.06, gustMs: 4100, jitter: 0.06 }, // sideways drift per unit of fall
  splashes: 0.5, // per second, per 1000 wet pixels, at the heaviest
  star: [1, 0.96, 0.86],
  bolt: [0.82, 0.88, 1],
};

const MAX_T = VIEW_T - 1; // a ray that met nothing

export function createRain(frame, { seed = 1 } = {}) {
  let dyn = frame.dynamic;
  const { w, h } = frame;
  const cam = frame.camera;
  const rows = dyn.ledgeTop; // the viewer's parapet and everything below it: no rain, ever
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

  // how far off the city is at each pixel above the parapet: a drop shows only in front of it
  const depth = Float32Array.from(dyn.depth.subarray(0, w * rows));

  // falling rain heads toward the point straight below; in perspective a drop's speed (and its streak) on
  // screen grows with its distance from that point, so the rain thins out evenly instead of gathering there
  const vp = project(cam, cam.pos[0], cam.pos[1] - 1e5, cam.pos[2] + 1e-3) || { x: w / 2, y: h * 4 };
  const vpRef = Math.hypot(vp.x - w / 2, vp.y - rows / 2) || 1; // the speeds and lengths above are for the picture's middle
  dyn = null;

  let a = seed >>> 0;
  const random = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const between = ([lo, hi]) => lo + (hi - lo) * random();
  let windNow = cfg.wind.base; // the wind at the last update (a new drop starts upwind of where it is going)

  // per layer: the pixels it can fall in front of (the city there is farther off than the layer's nearest
  // drops), and how many drops it has at the heaviest
  const layers = cfg.layers.map((L) => {
    const spots = [];
    for (let p = 0; p < w * rows; p++) if (depth[p] > L.depth[0] + 20) spots.push(p);
    return { ...L, spots: Int32Array.from(spots), max: Math.round(spots.length * L.density) };
  });
  const total = layers.reduce((n, L) => n + L.max, 0);
  const scale = total > cfg.max ? cfg.max / total : 1;
  for (const L of layers) L.max = Math.round(L.max * scale);
  const maxDrops = layers.reduce((n, L) => n + L.max, 0);

  // the drops, layer after layer
  const dLayer = new Uint8Array(maxDrops);
  const dx = new Float32Array(maxDrops);
  const dy = new Float32Array(maxDrops);
  const dd = new Float32Array(maxDrops); // its distance from the viewer (m)
  const dv = new Float32Array(maxDrops); // speed (px / s)
  const dl = new Float32Array(maxDrops); // streak length (px)
  const db = new Float32Array(maxDrops); // brightness
  const dt0 = new Float32Array(maxDrops); // its own sideways tilt
  const dAge = new Float32Array(maxDrops); // seconds
  const dLife = new Float32Array(maxDrops);
  const firstOf = [];
  {
    let i = 0;
    layers.forEach((L, l) => {
      firstOf.push(i);
      for (let k = 0; k < L.max; k++) dLayer[i++] = l;
    });
  }
  // a drop appears at a random spot of its layer where its depth is in front of the city
  function place(i, anyAge) {
    const L = layers[dLayer[i]];
    dLife[i] = between(cfg.lifeMs) / 1000;
    dAge[i] = anyAge ? random() * dLife[i] : 0;
    dv[i] = between(L.speed);
    dl[i] = between(L.len);
    db[i] = between(L.light);
    dt0[i] = (random() * 2 - 1) * cfg.wind.jitter;
    for (let tries = 0; tries < 6; tries++) {
      const p = L.spots[Math.floor(random() * L.spots.length)];
      // its distance: anywhere through the layer in front of what is there (evenly, so most drops have open
      // air around them rather than sitting against the facade behind)
      const far = Math.min(L.depth[1], depth[p] - 15);
      if (far <= L.depth[0]) continue;
      dd[i] = L.depth[0] + random() * (far - L.depth[0]);
      // drops drift toward the point below as they fall: start it where it must be so that it is at the chosen
      // spot half-way through its life (spots are even over the picture, so the rain stays even, edges and all)
      // (and upwind of it, by the drift the wind gives it on the way)
      const back = Math.exp((dv[i] / vpRef) * (dLife[i] / 2 - dAge[i]));
      const sx0 = (p % w) + random();
      const sy0 = ((p / w) | 0) + random();
      const persp = Math.min(1.6, Math.max(0.35, Math.hypot(vp.x - sx0, vp.y - sy0) / vpRef));
      dx[i] = vp.x + (sx0 - vp.x) * back + (windNow + dt0[i]) * dv[i] * persp * (dLife[i] / 2 - dAge[i]);
      dy[i] = vp.y + (sy0 - vp.y) * back;
      return;
    }
    dAge[i] = dLife[i]; // nowhere to go this time: try again on the next update
  }
  for (let i = 0; i < maxDrops; i++) place(i, true);

  const out = new Uint8ClampedArray(w * h * 4);
  const px32 = new Uint32Array(out.buffer);
  const BLACK = 0xff000000; // opaque black adds nothing under screen blending
  px32.fill(BLACK);
  let dirty = false; // something drawn last time (so it must be cleared)
  const level = new Float32Array(w * h * 3); // light per pixel this update (r, g, b)
  const touched = new Int32Array(w * h);
  let nTouched = 0;
  const splashes = new Int32Array(64);
  const splashLife = new Float32Array(64);
  let nSplash = 0;
  let splashCarry = 0;
  let boltSeed = -1;

  /* A streak pixel of light v and colour c, for a drop at distance d: only in front of the city, above the parapet. */
  function light(x, y, v, c, d) {
    if (x < 0 || y < 0 || x >= w || y >= rows) return;
    const p = y * w + x;
    if (depth[p] <= d) return; // something nearer stands in front of it
    const k = p * 3;
    if (level[k] === 0 && level[k + 1] === 0 && level[k + 2] === 0) touched[nTouched++] = p;
    level[k] = Math.max(level[k], c[0] * v);
    level[k + 1] = Math.max(level[k + 1], c[1] * v);
    level[k + 2] = Math.max(level[k + 2], c[2] * v);
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
      const raining = maxDrops > 0 && rain > 0.001;
      const flashing = hasSky && env.flash > 0.3;
      const star = hasSky ? env.star : null;
      if (!raining && !nSplash && !flashing && !star && !dirty) return false;

      // clear what was drawn
      for (let i = 0; i < nTouched; i++) level[touched[i] * 3] = level[touched[i] * 3 + 1] = level[touched[i] * 3 + 2] = 0;
      nTouched = 0;
      if (dirty) px32.fill(BLACK);
      dirty = false;

      // rain: each layer as heavy as the weather makes it, every streak toward the point below, a little blown
      const wcfg = cfg.wind;
      const wind = (wcfg.base + wcfg.swing * Math.sin((t / wcfg.swingMs) * Math.PI * 2)) * (0.6 + 0.4 * rain) + wcfg.gust * Math.max(0, Math.sin((t / wcfg.gustMs) * Math.PI * 2)) ** 3 * rain;
      windNow = wind;
      let n = 0;
      layers.forEach((L, l) => {
        const k = rain <= L.from ? 0 : Math.min(1, (rain - L.from) / (1 - L.from)) ** 0.9;
        const count = Math.round(L.max * k);
        n += count;
        for (let j = 0; j < count; j++) {
          const i = firstOf[l] + j;
          dAge[i] += dt;
          if (dAge[i] >= dLife[i]) place(i, false);
          if (dAge[i] >= dLife[i]) continue;
          let ux = vp.x - dx[i];
          let uy = vp.y - dy[i];
          const dist = Math.hypot(ux, uy) || 1;
          ux /= dist;
          uy /= dist;
          const persp = Math.min(1.6, Math.max(0.35, dist / vpRef));
          // the wind pushes sideways (across the fall)
          const tilt = wind + dt0[i];
          const fx = ux - uy * tilt;
          const fy = uy + ux * tilt;
          const fn = Math.hypot(fx, fy) || 1;
          const sx = fx / fn;
          const sy = fy / fn;
          dx[i] += sx * dv[i] * persp * dt;
          dy[i] += sy * dv[i] * persp * dt;
          // (a drop may start or pass outside the picture on its way: it is just not drawn there)
          if (dy[i] >= rows || dx[i] < -w || dx[i] >= 2 * w) {
            dAge[i] = dLife[i];
            continue;
          }
          const life = dAge[i] / dLife[i];
          const fade = Math.min(1, life * 5, (1 - life) * 5);
          const v = db[i] * (0.65 + 0.35 * rain) * fade;
          // (near the point below, where rain falls almost straight away from the eye, streaks would shrink to
          // dots: they keep most of their length there)
          const len = Math.max(1, Math.round(dl[i] * Math.max(0.7, persp)));
          for (let s = 0; s < len; s++) light(Math.round(dx[i] - sx * s), Math.round(dy[i] - sy * s), v * (1 - s / (len + 1)), L.color, dd[i]);
        }
      });
      for (let i = 0; i < nTouched; i++) {
        const p = touched[i];
        const o = p * 4;
        const k = p * 3;
        out[o] = level[k] * 255;
        out[o + 1] = level[k + 1] * 255;
        out[o + 2] = level[k + 2] * 255;
      }

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
        paint(cfg.layers[1].color, splashes[i], 0.26);
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
