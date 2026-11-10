import { BEACON, HELIPAD, HELIPAD_SIZE, PARAPET_KEY, PARAPET_TILES, PLANT, PLANT_SIZE, SIGN, SIGN_PIXEL } from './art.js';
import { clamp01, fbm, hash3, smoothstep } from './noise.js';
import { CITY_PALETTE, paletteIndex } from './palette.js';
import { CAMERA_HEIGHT, FOCAL, GRID, SEED, createCity, makeCamera, project, rayDir } from './scene.js';

/*
 * The static city frame, rendered into a w x h buffer of city pixels.
 *
 * Each pixel casts one ray from the camera through the block grid (a DDA over
 * blocks, exact ray / box tests inside each) and shades what it meets: facades
 * with their window grids, wet roofs, wet streets with lamps and the odd car.
 * Roofs and streets are mirrors to a degree, so they trace a second ray for
 * their reflection. Height fog thickens toward the streets, two thin mist
 * layers drift between the towers, lights bloom, and the result is quantised
 * to the city palette with an ordered dither. The viewer's parapet is pasted
 * along the bottom last.
 *
 * Work is split by rows (renderRows) so the caller can spread it over several
 * frames; finish() does the whole-frame passes and returns RGBA bytes.
 *
 * With `capture`, the frame also keeps what the ambient animation needs
 * (animate.js): for every pixel, its value before quantisation and how that
 * value responds to the mist, the wet reflections, the far haze, its window
 * switching on or off and each beacon's light. Every one of those enters the
 * pixel linearly, so the animation can add exact changes to the baked frame
 * without tracing a single ray again. The frame itself is the same either way.
 */

/* ------------------------------------------------------------------ */
/* Light and colour                                                    */
/* ------------------------------------------------------------------ */

const C = {
  zenith: [0.03, 0.03, 0.055],
  cloud: [0.2, 0.135, 0.16], // the overcast, lit from below by the city
  horizon: [0.17, 0.11, 0.13],
  fogHigh: [0.06, 0.072, 0.095],
  fogLow: [0.16, 0.112, 0.092],
  hazeFar: [0.12, 0.085, 0.11],
  mist: [0.13, 0.155, 0.17],
  sodium: [1.0, 0.6, 0.24],
  warm: [1.0, 0.68, 0.34],
  soft: [1.0, 0.84, 0.56],
  cool: [0.62, 0.86, 0.95],
  white: [0.9, 0.93, 0.97],
  tv: [0.36, 0.5, 1.0],
  roof: [0.05, 0.052, 0.06],
  rim: [0.085, 0.09, 0.1],
  road: [0.028, 0.03, 0.036],
  walk: [0.06, 0.06, 0.066],
  yard: [0.032, 0.036, 0.034],
  marking: [0.16, 0.16, 0.15],
  metal: [0.1, 0.105, 0.115],
  red: [1.0, 0.16, 0.1],
  neon: [0.93, 0.3, 0.55],
};

const CROWN = { cool: [0.5, 0.8, 0.9], amber: [0.95, 0.62, 0.3] };

// Height fog: sigma(y) = A exp(-y / H) + B per metre
const FOG = { A: 1 / 300, H: 110, B: 1 / 11000 };
// Mist layers: altitude band, noise scale, threshold, strength
const MIST = [
  { y0: 15, y1: 110, scale: 170, lo: 0.42, hi: 0.72, k: 0.02, seed: 401 },
  { y0: 150, y1: 240, scale: 260, lo: 0.55, hi: 0.8, k: 0.007, seed: 402 },
];
const MAX_T = 7500;
/*
 * Lit windows thin out with distance: past the nearest facades only part of
 * them stay lit (a window that is dark close up stays dark; some lit ones
 * beyond go out), so the towers' upper floors read as a calm field with the
 * odd light rather than a speckle. The deep canyon is left alone: below
 * `low` every light stays, since that glow through the mist is what makes the
 * streets read as far below.
 */
const WINDOW_THIN = { from: 170, to: 320, keep: 0.74, low: [60, 160] };
// 0 near or low down, 1 far and high up
const calmAt = (dist, y) => smoothstep(WINDOW_THIN.from, WINDOW_THIN.to, dist) * smoothstep(WINDOW_THIN.low[0], WINDOW_THIN.low[1], y);
const EPS = 1e-3;

/* ------------------------------------------------------------------ */
/* Tracing                                                             */
/* ------------------------------------------------------------------ */

const hit = { t: 0, axis: 0, sign: 0, box: null };

function rayBox(b, ox, oy, oz, ix, iy, iz) {
  let t1 = (b.x0 - ox) * ix;
  let t2 = (b.x1 - ox) * ix;
  let tmin = t1 < t2 ? t1 : t2;
  let tmax = t1 < t2 ? t2 : t1;
  let axis = 0;
  t1 = (b.y0 - oy) * iy;
  t2 = (b.y1 - oy) * iy;
  let lo = t1 < t2 ? t1 : t2;
  let hi = t1 < t2 ? t2 : t1;
  if (lo > tmin) {
    tmin = lo;
    axis = 1;
  }
  if (hi < tmax) tmax = hi;
  t1 = (b.z0 - oz) * iz;
  t2 = (b.z1 - oz) * iz;
  lo = t1 < t2 ? t1 : t2;
  hi = t1 < t2 ? t2 : t1;
  if (lo > tmin) {
    tmin = lo;
    axis = 2;
  }
  if (hi < tmax) tmax = hi;
  if (tmax < tmin || tmax < EPS) return -1;
  hit.axis = axis;
  return tmin;
}

const nz = (v) => (Math.abs(v) < 1e-9 ? (v < 0 ? -1e-9 : 1e-9) : v);

/*
 * First box along the ray within tEnd. Returns its distance (and fills `hit`),
 * or -1. Rays climbing above the tallest roof give up early.
 */
function trace(city, ox, oy, oz, dx, dy, dz, tEnd) {
  dx = nz(dx);
  dz = nz(dz);
  const ix = 1 / dx;
  const iy = 1 / nz(dy);
  const iz = 1 / dz;
  const { px, pz } = GRID;
  let i = Math.floor(ox / px);
  let j = Math.floor(oz / pz);
  const si = dx > 0 ? 1 : -1;
  const sj = dz > 0 ? 1 : -1;
  let tx = ((i + (dx > 0 ? 1 : 0)) * px - ox) * ix;
  let tz = ((j + (dz > 0 ? 1 : 0)) * pz - oz) * iz;
  const ddx = px * Math.abs(ix);
  const ddz = pz * Math.abs(iz);
  let t0 = 0;
  for (let guard = 0; guard < 400; guard++) {
    const t1 = Math.min(tx, tz, tEnd);
    const blk = city.block(i, j);
    if (blk.boxes.length) {
      const yLow = oy + dy * (dy < 0 ? t1 : t0);
      if (yLow <= blk.top) {
        let best = Infinity;
        let bestBox = null;
        let bestAxis = 0;
        for (const b of blk.boxes) {
          const t = rayBox(b, ox, oy, oz, ix, iy, iz);
          if (t >= 0 && t < best) {
            best = t;
            bestBox = b;
            bestAxis = hit.axis;
          }
        }
        if (bestBox && best <= tEnd) {
          hit.t = best;
          hit.box = bestBox;
          hit.axis = bestAxis;
          hit.sign = bestAxis === 0 ? -Math.sign(dx) : bestAxis === 1 ? -Math.sign(dy) : -Math.sign(dz);
          return best;
        }
      }
    }
    if (t1 >= tEnd) return -1;
    if (dy > 0 && oy + dy * t1 > CAMERA_HEIGHT) return -1; // above everything
    t0 = t1;
    if (tx < tz) {
      tx += ddx;
      i += si;
    } else {
      tz += ddz;
      j += sj;
    }
  }
  return -1;
}

/* ------------------------------------------------------------------ */
/* Atmosphere                                                          */
/* ------------------------------------------------------------------ */

function opticalDepth(oy, dy, t) {
  const base = FOG.A * Math.exp(-oy / FOG.H);
  const k = (t * dy) / FOG.H;
  const fogT = Math.abs(k) < 1e-4 ? base * t : (base * FOG.H * (1 - Math.exp(-k))) / dy;
  return fogT + FOG.B * t;
}

// per mist layer, the last mistCover call's optical depth and its depth at full density
const mistTau = [0, 0];
const mistCap = [0, 0];

/* Fraction of what lies at distance t that the mist layers hide. */
function mistCover(ox, oy, oz, dx, dy, dz, t) {
  let keep = 1;
  mistTau[0] = mistTau[1] = mistCap[0] = mistCap[1] = 0;
  for (let l = 0; l < MIST.length; l++) {
    const m = MIST[l];
    let a = 0;
    let b = t;
    if (Math.abs(dy) < 1e-6) {
      if (oy < m.y0 || oy > m.y1) continue;
    } else {
      const ta = (m.y0 - oy) / dy;
      const tb = (m.y1 - oy) / dy;
      a = Math.max(0, Math.min(ta, tb));
      b = Math.min(t, Math.max(ta, tb));
    }
    const seg = b - a;
    if (seg <= 0) continue;
    let dens = 0;
    for (let s = 0; s < 3; s++) {
      const u = a + seg * (s + 0.5) / 3;
      const n = fbm((ox + dx * u) / m.scale, (oz + dz * u) / m.scale, SEED + m.seed);
      dens += smoothstep(m.lo, m.hi, n);
    }
    const cap = seg * m.k;
    const tau = (dens / 3) * cap;
    mistTau[l] = tau;
    mistCap[l] = cap;
    keep *= Math.exp(-tau);
  }
  return 1 - keep;
}

const sky = (dx, dy, dz, out) => {
  const up = smoothstep(-0.05, 0.5, dy);
  for (let c = 0; c < 3; c++) out[c] = C.horizon[c] + (C.zenith[c] - C.horizon[c]) * up;
  if (dy > 0.02) {
    // broken cloud deck, lit from below by the city
    const n = fbm((dx / dy) * 1.6 + 7, (dz / dy) * 1.6 + 3, SEED + 77);
    const cov = 0.55 + 0.45 * smoothstep(0.3, 0.7, n);
    for (let c = 0; c < 3; c++) out[c] += (C.cloud[c] - out[c]) * cov * (0.5 + 0.5 * up);
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

// shading result: reflected / diffuse colour and light emitted
const BASE = [0, 0, 0];
const EMIT = [0, 0, 0];
const base = BASE;
const emit = EMIT;
// the same for whatever a reflection shows (kept apart: the surface is still being shaded)
const rBase = [0, 0, 0];
const rEmit = [0, 0, 0];
const tmp = [0, 0, 0];
// what the pixel being shaded reflects (R x reflected light), and its window, for capture
const reflR = [0, 0, 0];
const win = { key: 0, lit: 0, dBase: [0, 0, 0], on: [0, 0, 0] };

const set3 = (o, a) => {
  o[0] = a[0];
  o[1] = a[1];
  o[2] = a[2];
};
const add3 = (o, a, k) => {
  o[0] += a[0] * k;
  o[1] += a[1] * k;
  o[2] += a[2] * k;
};

function windowOn(b, face, floor, col, keep) {
  const id = b.id * 4 + face;
  const floorMood = 0.35 + 1.3 * hash3(id, floor, SEED + 5); // whole floors left on or off
  return hash3(id, floor * 977 + col, SEED + 6) < b.lit * floorMood * keep;
}

function windowLight(b, face, floor, col, keep, out) {
  if (!windowOn(b, face, floor, col, keep)) return 0;
  windowTone(b, face, floor, col, out);
  return 1;
}

/* The light a window gives when it is on (whether or not it is). */
function windowTone(b, face, floor, col, out) {
  const id = b.id * 4 + face;
  const r = hash3(id, floor * 131 + col, SEED + 7);
  const tone = r < b.warm * 0.55 ? C.warm : r < Math.max(b.warm, 0.55) ? C.soft : r < 0.97 ? C.cool : C.tv;
  const k = 0.42 + 0.4 * hash3(id, floor * 53 + col, SEED + 8);
  out[0] = tone[0] * k;
  out[1] = tone[1] * k;
  out[2] = tone[2] * k;
}

const windowKey = (b, face, floor, col) => (b.id * 4 + face) * 1048576 + floor * 1024 + (col & 1023);

function signPixel(b, box, axis, sign, u, v, base, emit) {
  const s = FOCAL.sign;
  if (b.key !== s.key || box.part !== 'shaft') return false;
  const face = (sign > 0 ? '+' : '-') + (axis === 0 ? 'x' : 'z');
  if (face !== s.face) return false;
  const rows = SIGN.length;
  const cols = SIGN[0].length;
  const len = axis === 0 ? box.z1 - box.z0 : box.x1 - box.x0;
  const u0 = len * 0.22;
  const top = box.y0 + (box.y1 - box.y0) * s.height + (rows * SIGN_PIXEL) / 2;
  const cx = Math.floor((u - u0) / SIGN_PIXEL);
  const cy = Math.floor((top - v) / SIGN_PIXEL);
  if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return false;
  const ch = SIGN[cy][cx];
  if (ch === '.') {
    // the sign's dark backing board
    base[0] = 0.03;
    base[1] = 0.02;
    base[2] = 0.035;
    return true;
  }
  base[0] = 0.05;
  base[1] = 0.02;
  base[2] = 0.04;
  add3(emit, C.neon, ch === 'F' ? 0.38 : 0.85);
  return true;
}

function shadeFacade(b, box, axis, sign, x, y, z, pf, dist, base = BASE, emit = EMIT) {
  emit[0] = emit[1] = emit[2] = 0;
  const style = b.style;
  // horizontal position along this face, and the face's length
  const u = axis === 0 ? (sign > 0 ? box.z1 - z : z - box.z0) : sign > 0 ? x - box.x0 : box.x1 - x;
  const len = axis === 0 ? box.z1 - box.z0 : box.x1 - box.x0;
  const face = axis === 0 ? (sign > 0 ? 0 : 1) : sign > 0 ? 2 : 3;
  // faces turned toward the glow on the left read lighter, so towers keep their volume
  const lit = axis === 0 ? (sign > 0 ? 0.62 : 1.18) : sign < 0 ? 0.95 : 0.7;

  if (signPixel(b, box, axis, sign, u, y, base, emit)) return;

  if (box.part === 'spire') {
    for (let c = 0; c < 3; c++) base[c] = C.metal[c] * lit;
    return;
  }
  if (box.part === 'mech') {
    // louvred plant room
    const louvre = (y * 1.2) % 1 < 0.5 ? 0.8 : 1.15;
    for (let c = 0; c < 3; c++) base[c] = style.wall[c] * lit * louvre * 0.9;
    return;
  }

  for (let c = 0; c < 3; c++) base[c] = style.wall[c] * lit;
  // corners and the roof line pick up a hard 1-pixel edge
  const edgeW = Math.max(0.5, pf * 0.95);
  const atCorner = u < edgeW || len - u < edgeW;
  const atTop = box.y1 - y < edgeW && box.part !== 'podium';
  if (atCorner || atTop) {
    for (let c = 0; c < 3; c++) base[c] = base[c] * 1.3 + 0.012;
    return;
  }

  // street-level shops on the podium
  if (y < 5.5 && b.shops) {
    const bay = Math.floor(u / 6);
    if (hash3(b.id, bay, SEED + 9) < 0.6) {
      const tone = hash3(b.id, bay, SEED + 10) < 0.7 ? C.warm : C.white;
      add3(emit, tone, 0.75);
      return;
    }
  }

  const floorH = b.floor;
  const calm = calmAt(dist, y);
  const keep = 1 - (1 - WINDOW_THIN.keep) * calm;
  const fi = Math.floor(y / floorH);
  const fv = y / floorH - fi;
  const ci = Math.floor(u / style.col);
  const fu = u / style.col - ci;

  // architectural crown lighting: lit spandrels on the top two floors. A spandrel thinner than
  // a pixel would break up into dots, so it is kept one pixel thick and dimmed by the share of
  // that pixel it covers: the crown stays a fine unbroken line at any distance
  if (b.crown && box.y1 >= b.h - 0.01 && box.part === 'shaft' && b.h - y < floorH * 2) {
    // (a little over a pixel, so a floor line running across the pixel grid on a slant never gaps)
    const band = style.winV[0] * floorH;
    const thick = Math.max(band, pf * 1.4);
    if (fv < thick / floorH) {
      add3(emit, CROWN[b.crown], 0.55 * Math.sqrt(band / thick)); // a line reads brighter than its area
      return;
    }
  }

  const isWindow = (lo, hi, f) => f >= lo && f < hi;
  if (pf < style.col * 0.34) {
    // close: real window openings with frames
    if (!(isWindow(style.winU[0], style.winU[1], fu) && isWindow(style.winV[0], style.winV[1], fv))) {
      // floor slabs on glass towers read as faint lines
      if (style.name === 'glass' && fv < style.winV[0]) for (let c = 0; c < 3; c++) base[c] *= 1.25;
      return;
    }
    // dark glass holding a little of the sky's glow, more toward the top of each pane
    const g = 0.6 + 0.6 * fv;
    if (base === BASE) {
      // capture: lit, a window's pane is its light and nothing else; dark, it is glass
      win.key = windowKey(b, face, fi, ci);
      windowTone(b, face, fi, ci, win.on);
      for (let c = 0; c < 3; c++) win.dBase[c] = -(style.glass[c] * lit + C.cloud[c] * 0.18 * g);
    }
    if (windowLight(b, face, fi, ci, keep, tmp)) {
      set3(emit, tmp);
      for (let c = 0; c < 3; c++) base[c] = 0;
      if (base === BASE) win.lit = 1;
    } else {
      for (let c = 0; c < 3; c++) base[c] = style.glass[c] * lit + C.cloud[c] * 0.18 * g;
      if (base === BASE) win.lit = 0;
    }
    return;
  }
  // far: each pixel stands for a window bay, lit or not
  const cover = (style.winU[1] - style.winU[0]) * (style.winV[1] - style.winV[0]);
  if (base === BASE) {
    win.key = windowKey(b, face, fi, ci);
    windowTone(b, face, fi, ci, win.on);
    for (let c = 0; c < 3; c++) {
      win.on[c] *= cover * 0.4;
      win.dBase[c] = 0;
    }
    win.lit = 0;
  }
  if (windowLight(b, face, fi, ci, keep, tmp)) {
    add3(emit, tmp, cover * 0.4);
    if (base === BASE) win.lit = 1;
  }
  for (let c = 0; c < 3; c++) base[c] = base[c] * (1 - cover) + style.glass[c] * cover;
}

/* Decal character at (u, v) in 0..1 across an authored grid, or '.' */
function decal(grid, u, v) {
  const h = grid.length;
  const w = grid[0].length;
  const cx = Math.floor(u * w);
  const cy = Math.floor(v * h);
  if (cx < 0 || cy < 0 || cx >= w || cy >= h) return '.';
  return grid[cy][cx];
}

const fresnel = (r0, cosI) => r0 + (1 - r0) * Math.pow(1 - cosI, 5);

/* Light reflected by a wet horizontal surface at (x, y, z). */
function reflection(city, x, y, z, dx, dy, dz, out) {
  const rdy = -dy;
  const t = trace(city, x, y + 0.05, z, dx, rdy, dz, 2500);
  if (t < 0) return sky(dx, rdy, dz, out);
  const h = hit;
  const px = x + dx * t;
  const py = y + rdy * t;
  const pz = z + dz * t;
  if (h.axis === 1) {
    out[0] = C.roof[0];
    out[1] = C.roof[1];
    out[2] = C.roof[2];
  } else {
    shadeFacade(h.box.b, h.box, h.axis, h.sign, px, py, pz, t / 200, t, rBase, rEmit);
    out[0] = rBase[0] + rEmit[0];
    out[1] = rBase[1] + rEmit[1];
    out[2] = rBase[2] + rEmit[2];
  }
  const tr = Math.exp(-opticalDepth(y, rdy, t));
  for (let c = 0; c < 3; c++) out[c] = out[c] * tr + C.fogHigh[c] * (1 - tr);
  return out;
}

const refl = [0, 0, 0];

function shadeRoof(city, b, box, x, y, z, dx, dy, dz, pf) {
  emit[0] = emit[1] = emit[2] = 0;
  const rx = x - box.x0;
  const rz = z - box.z0;
  const W = box.x1 - box.x0;
  const D = box.z1 - box.z0;
  const edge = Math.min(rx, W - rx, rz, D - rz);
  const rimW = Math.max(0.6, pf * 1.05);
  let r0 = 0.12;
  if (edge < rimW) {
    set3(base, C.rim);
    r0 = 0.04;
  } else {
    set3(base, C.roof);
    // membrane patches
    const p = 0.85 + 0.3 * hash3(Math.floor(x / 3), Math.floor(z / 3), b.id);
    for (let c = 0; c < 3; c++) base[c] *= p;

    if (box.part === 'mech' && pf < 1.2) {
      const ch = decal(PLANT, (rx % PLANT_SIZE) / PLANT_SIZE, (rz % PLANT_SIZE) / PLANT_SIZE);
      if (ch === 'a') for (let c = 0; c < 3; c++) base[c] = C.rim[c] * 0.85;
      else if (ch === 'b') for (let c = 0; c < 3; c++) base[c] = C.roof[c] * 0.7;
      else if (ch === 'c') for (let c = 0; c < 3; c++) base[c] = C.metal[c] * 0.8;
    } else if (b.key === FOCAL.helipad && box.y1 >= b.h - 0.01) {
      const u = (x - (box.x0 + box.x1) / 2) / HELIPAD_SIZE + 0.5;
      const v = (z - (box.z0 + box.z1) / 2) / HELIPAD_SIZE + 0.5;
      const ch = decal(HELIPAD, u, v);
      if (ch === 'r' || ch === 'H') {
        base[0] = 0.2;
        base[1] = 0.2;
        base[2] = 0.19;
        r0 = 0.03;
      } else if (ch === 'L') {
        add3(emit, C.soft, 0.9);
      } else if (u >= 0 && u < 1 && v >= 0 && v < 1) {
        // the pad's darker painted square
        for (let c = 0; c < 3; c++) base[c] *= 0.7;
      }
    }
    // standing water
    const pool = fbm(x / 7, z / 7, SEED + b.id);
    if (pool > 0.56) r0 = 0.7;
    else if (pool > 0.52) r0 = 0.32;
  }
  const R = fresnel(r0, -dy);
  if (R > 0.05) {
    reflection(city, x, y, z, dx, dy, dz, refl);
    for (let c = 0; c < 3; c++) {
      base[c] = base[c] * (1 - R) + refl[c] * R;
      reflR[c] = refl[c] * R;
    }
  }
}

function shadeGround(city, x, z, dx, dy, dz, pf) {
  emit[0] = emit[1] = emit[2] = 0;
  const g = GRID;
  const i = Math.floor(x / g.px);
  const j = Math.floor(z / g.pz);
  const lx = x - i * g.px;
  const lz = z - j * g.pz;
  const inAve = lx < g.avenue;
  const inStr = lz < g.street;
  let r0 = 0.22;

  if (!inAve && !inStr) {
    set3(base, C.yard);
  } else {
    const aveRoad = inAve && lx >= g.sidewalk && lx < g.avenue - g.sidewalk;
    const strRoad = inStr && lz >= g.sidewalk && lz < g.street - g.sidewalk;
    if (aveRoad || strRoad) {
      set3(base, C.road);
      r0 = 0.5;
      // crossings at the corners
      const zebra =
        (aveRoad && !inStr && (lz < g.street + 3.5 || lz > g.pz - 3.5) && Math.floor(lx / 1.4) % 2 === 0) ||
        (strRoad && !inAve && (lx < g.avenue + 3.5 || lx > g.px - 3.5) && Math.floor(lz / 1.4) % 2 === 0);
      if (zebra) {
        set3(base, C.marking);
        r0 = 0.25;
      } else if (aveRoad && !inStr) {
        // centre line, faint at this height
        const d = Math.abs(lx - g.avenue / 2);
        if (d < Math.max(0.2, pf * 0.35)) for (let c = 0; c < 3; c++) base[c] = C.marking[c] * 0.6;
      }
      shadeCars(i, j, lx, lz, x, z, inAve, inStr, aveRoad, strRoad, pf);
    } else {
      set3(base, C.walk);
      r0 = 0.3;
    }
    // sodium lamps along the kerbs: every lamp pools light on the wet street, but only two lamp
    // heads in three (staggered across the road) show as a bright point, so the avenue reads as
    // a lit line rather than a string of pinpricks
    let near = Infinity;
    let head = false;
    if (inAve && !inStr) {
      const side = lx < g.avenue / 2 ? 0 : 1;
      const kx = side ? g.avenue - g.sidewalk + 0.6 : g.sidewalk - 0.6;
      const lzm = ((z % 26) + 26) % 26;
      near = Math.hypot(lx - kx, lzm - 13);
      head = (((Math.floor(z / 26) + side) % 3) + 3) % 3 !== 0;
    } else if (inStr && !inAve) {
      const side = lz < g.street / 2 ? 0 : 1;
      const kz = side ? g.street - g.sidewalk + 0.6 : g.sidewalk - 0.6;
      const lxm = ((x % 30) + 30) % 30;
      near = Math.hypot(lz - kz, lxm - 15);
      head = (((Math.floor(x / 30) + side) % 3) + 3) % 3 !== 0;
    }
    if (near < 14) {
      const pool = Math.exp(-(near * near) / 48);
      add3(base, C.sodium, pool * 0.3);
      if (head && near < Math.max(0.7, pf * 0.6)) add3(emit, C.sodium, 0.9);
    }
    // from far off the streets themselves are threads of sodium light
    if (pf > 6) add3(emit, C.sodium, 0.12 * smoothstep(6, 14, pf));
  }
  // standing water everywhere after the rain
  const wet = fbm(x / 11, z / 11, SEED + 3);
  if (wet > 0.52) r0 = Math.max(r0, 0.72);
  const R = fresnel(r0, -dy);
  reflection(city, x, 0, z, dx, dy, dz, refl);
  for (let c = 0; c < 3; c++) {
    base[c] = base[c] * (1 - R) + refl[c] * R;
    reflR[c] = refl[c] * R;
  }
}

function shadeCars(i, j, lx, lz, x, z, inAve, inStr, aveRoad, strRoad, pf) {
  const g = GRID;
  if (inAve && inStr) return; // intersections stay clear
  let lane;
  let along;
  let across;
  let dir;
  if (aveRoad) {
    const w = (g.avenue - 2 * g.sidewalk) / 4;
    lane = Math.floor((lx - g.sidewalk) / w);
    across = (lx - g.sidewalk) - (lane + 0.5) * w;
    along = z;
    dir = lane < 2 ? -1 : 1;
  } else if (strRoad) {
    const w = (g.street - 2 * g.sidewalk) / 2;
    lane = Math.floor((lz - g.sidewalk) / w);
    across = (lz - g.sidewalk) - (lane + 0.5) * w;
    along = x;
    dir = lane < 1 ? 1 : -1;
  } else return;
  const slot = Math.floor(along / 9);
  const key = aveRoad ? i * 7 + lane : j * 7 + lane + 1000;
  if (hash3(key, slot, SEED + 21) > 0.09) return;
  const at = along - (slot * 9 + 4.5);
  if (Math.abs(at) > 2.3 || Math.abs(across) > 0.95) {
    // wet road ahead of the car catches its headlights
    const ahead = at * dir;
    if (ahead > 2.3 && ahead < 12 && Math.abs(across) < 1.3) add3(emit, C.soft, 0.1 * (1 - (ahead - 2.3) / 9.7));
    return;
  }
  const front = at * dir;
  const tone = hash3(key, slot, SEED + 22);
  const body = tone < 0.4 ? [0.05, 0.05, 0.06] : tone < 0.7 ? [0.11, 0.11, 0.12] : tone < 0.85 ? [0.12, 0.05, 0.04] : [0.13, 0.11, 0.06];
  set3(base, body);
  const lampW = Math.max(0.45, pf * 0.5);
  if (front > 2.3 - lampW) add3(emit, C.white, 0.85);
  else if (front < -2.3 + lampW) add3(emit, C.red, 0.7);
}

/* ------------------------------------------------------------------ */
/* Frame                                                               */
/* ------------------------------------------------------------------ */

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
const DITHER = 0.018;

/* A gentle vignette keeps the edges, and so the UI over them, darkest. */
function vignette(px, py, w, h) {
  const vy = (py / h - 0.45) * 1.6;
  const vx = (px / w - 0.5) * 1.5;
  return 1 - 0.3 * smoothstep(0.15, 1.5, vx * vx + vy * vy);
}

/*
 * Palette index for a pixel's value before quantisation (r, g, b in 0..1) at
 * (px, py), with the frame's ordered dither: the one quantiser both the baked
 * frame and the animation use, so an unchanged value never changes colour.
 */
export function quantize(px, py, r, g, b) {
  const d = BAYER[(py & 3) * 4 + (px & 3)] * DITHER;
  const qr = Math.max(0, Math.min(63, Math.floor(clamp01(r + d) * 63.999)));
  const qg = Math.max(0, Math.min(63, Math.floor(clamp01(g + d) * 63.999)));
  const qb = Math.max(0, Math.min(63, Math.floor(clamp01(b + d) * 63.999)));
  return paletteIndex((qr << 12) | (qg << 6) | qb);
}

/* How much of a light at world height wy and distance `dist` reaches the eye (as lights are faded). */
export function lightThrough(cam, dist, wy) {
  const tr = Math.exp(-opticalDepth(cam.pos[1], (wy - cam.pos[1]) / dist, dist));
  return Math.sqrt(tr);
}

export function createCityFrame(w, h, { capture = false } = {}) {
  const city = createCity();
  const cam = makeCamera(w, h);
  const color = new Float32Array(w * h * 3);
  const light = new Float32Array(w * h * 3); // emitted light, after the air
  const depth = new Float32Array(w * h);
  const dir = [0, 0, 0];
  const [ox, oy, oz] = cam.pos;
  const parapetRows = PARAPET_TILES[0].length;
  const n3 = w * h * 3;
  const cap = capture
    ? {
        // mist: each layer's optical depth, and its depth were the layer at full density
        tau0: new Float32Array(w * h),
        cap0: new Float32Array(w * h),
        tau1: new Float32Array(w * h),
        cap1: new Float32Array(w * h),
        fade: new Float32Array(w * h), // how much the mist counts at this distance
        G: new Float32Array(n3), // change of the pixel's value per unit of mist cover
        S: new Float32Array(n3), // the wet reflection's share of the value
        H: new Float32Array(n3), // the far haze's share
        winKey: new Float64Array(w * h), // 0: not a window
        winLit: new Uint8Array(w * h),
        winD: new Float32Array(n3), // value of the window on minus off
        F: null, // value before quantisation (finish)
        beacons: null,
      }
    : null;

  function shadePixel(px, py) {
    rayDir(cam, px + 0.5, py + 0.5, dir);
    const [dx, dy, dz] = dir;
    reflR[0] = reflR[1] = reflR[2] = 0;
    win.key = 0;
    const tGround = dy < 0 ? -oy / dy : Infinity;
    const tEnd = Math.min(tGround, MAX_T);
    const t = trace(city, ox, oy, oz, dx, dy, dz, tEnd);
    let dist;
    if (t >= 0) {
      dist = t;
      const x = ox + dx * t;
      const y = oy + dy * t;
      const z = oz + dz * t;
      const pf = t / cam.f;
      const { box } = hit;
      if (hit.axis === 1) shadeRoof(city, box.b, box, x, y, z, dx, dy, dz, pf);
      else shadeFacade(box.b, box, hit.axis, hit.sign, x, y, z, pf, t);
    } else if (tGround <= MAX_T) {
      dist = tGround;
      shadeGround(city, ox + dx * tGround, oz + dz * tGround, dx, dy, dz, tGround / cam.f);
    } else {
      dist = MAX_T;
      sky(dx, dy, dz, base);
      emit[0] = emit[1] = emit[2] = 0;
    }

    // air between the eye and the surface
    const yEnd = oy + dy * dist;
    const tr = dist >= MAX_T && t < 0 && dy >= 0 ? 1 : Math.exp(-opticalDepth(oy, dy, dist));
    const low = Math.exp(-Math.max(0, yEnd) / 90);
    const far = smoothstep(1200, 6500, dist);
    const fade = 1 - smoothstep(1400, 4200, dist);
    const mist = mistCover(ox, oy, oz, dx, dy, dz, dist) * fade;
    // lights carry through the haze better than the surfaces around them
    const trL = Math.sqrt(tr);
    const n = py * w + px;
    const k = n * 3;
    const vig = cap ? vignette(px, py, w, h) : 0;
    for (let c = 0; c < 3; c++) {
      let fogC = C.fogHigh[c] + (C.fogLow[c] - C.fogHigh[c]) * low;
      fogC += (C.hazeFar[c] - fogC) * far;
      let v = base[c] * tr + fogC * (1 - tr);
      if (cap) {
        cap.G[k + c] = 0.85 * (C.mist[c] - v) * vig - 0.6 * emit[c] * trL;
        cap.S[k + c] = reflR[c] * tr * (1 - 0.85 * mist) * vig;
        cap.H[k + c] = fogC * (1 - tr) * far * (1 - 0.85 * mist) * vig;
        if (win.key) cap.winD[k + c] = win.dBase[c] * tr * (1 - 0.85 * mist) * vig + win.on[c] * trL * (1 - 0.6 * mist);
      }
      v += (C.mist[c] - v) * mist * 0.85;
      color[k + c] = v;
      light[k + c] = emit[c] * trL * (1 - mist * 0.6);
    }
    depth[n] = dist;
    if (cap) {
      cap.tau0[n] = mistTau[0];
      cap.cap0[n] = mistCap[0];
      cap.tau1[n] = mistTau[1];
      cap.cap1[n] = mistCap[1];
      cap.fade[n] = fade;
      if (win.key) {
        cap.winKey[n] = win.key;
        cap.winLit[n] = win.lit;
      }
    }
  }

  let rowsDone = 0;
  let beaconCount = 0;

  return {
    w,
    h,
    camera: cam,
    city,
    /* aircraft warning lights placed by finish() */
    get beacons() {
      return beaconCount;
    },
    /* with `capture`, after finish(): what the animation needs (see the top of this file) */
    get dynamic() {
      return cap && cap.F ? { ...cap, depth, parapetRows } : null;
    },
    get progress() {
      return rowsDone / h;
    },
    /* Shade rows [y0, y1). The parapet's rows are not traced. */
    renderRows(y0, y1) {
      const last = Math.min(y1, h);
      for (let py = y0; py < last; py++) {
        if (py >= h - parapetRows) continue;
        for (let px = 0; px < w; px++) shadePixel(px, py);
      }
      rowsDone = Math.max(rowsDone, last);
    },
    /* Whole-frame passes; returns RGBA bytes (w * h * 4). */
    finish() {
      const placed = addBeacons(city, cam, w, h, light, depth);
      beaconCount = placed.length;
      const glow = bloom(light, w, h);
      if (cap) {
        cap.F = new Float32Array(n3);
        cap.beacons = placed.map((bc) => beaconPatch(bc, w, h));
      }
      const rgba = new Uint8ClampedArray(w * h * 4);
      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          const n = py * w + px;
          const k = n * 3;
          const vig = vignette(px, py, w, h);
          const r = color[k] * vig + light[k] + glow[k];
          const g = color[k + 1] * vig + light[k + 1] + glow[k + 1];
          const b = color[k + 2] * vig + light[k + 2] + glow[k + 2];
          if (cap) {
            cap.F[k] = r;
            cap.F[k + 1] = g;
            cap.F[k + 2] = b;
          }
          const p = CITY_PALETTE[quantize(px, py, r, g, b)];
          const o = n * 4;
          rgba[o] = p[0];
          rgba[o + 1] = p[1];
          rgba[o + 2] = p[2];
          rgba[o + 3] = 255;
        }
      }
      drawParapet(rgba, w, h);
      return rgba;
    },
  };
}

/*
 * Aircraft warning lights: only on the tallest towers in view, two or three
 * of them (two on narrow frames), spread apart and kept off the frame's
 * edges, so they mark the skyline's high points rather than dot the scene. A tower's light sits on its spire
 * when it has one, else on a roof corner.
 */
const BEACON_MIN_HEIGHT = 380;
const BEACON_MAX_DEPTH = 1600; // beyond this they are lost in the haze

function addBeacons(city, cam, w, h, light, depth) {
  const limit = w >= 200 ? 3 : 2;
  const spacing = Math.max(14, w * 0.2);
  const bottom = h - PARAPET_TILES[0].length - 2;
  // not jammed against the frame's edges, where a lone red point reads as a stray pixel
  const marginX = Math.max(3, Math.round(w * 0.08));
  const marginY = Math.max(3, Math.round(h * 0.06));
  const seen = new Set();
  const candidates = [];
  // the blocks any ray reached are the ones already generated
  for (const blk of city.blocks()) {
    for (const box of blk.boxes) {
      const b = box.b;
      if (b.h < BEACON_MIN_HEIGHT || seen.has(b.id)) continue;
      seen.add(b.id);
      const r = b.roof;
      const [x, y, z] = b.spireTop || [r.x0 + 0.5, b.h + 1.5, r.z0 + 0.5];
      const p = project(cam, x, y, z);
      if (!p || p.depth > BEACON_MAX_DEPTH) continue;
      const sx = Math.floor(p.x);
      const sy = Math.floor(p.y);
      if (sx < marginX || sy < marginY || sx >= w - marginX || sy >= bottom) continue;
      if (depth[sy * w + sx] < p.depth - 4) continue; // hidden behind something nearer
      candidates.push({ top: y, sx, sy, y, depth: p.depth, id: b.id });
    }
  }
  // tallest first; ties go to the nearer tower, then a fixed order
  candidates.sort((a, b) => b.top - a.top || a.depth - b.depth || a.id - b.id);
  const chosen = [];
  for (const c of candidates) {
    if (chosen.length >= limit) break;
    if (chosen.some((o) => Math.hypot(o.sx - c.sx, o.sy - c.sy) < spacing)) continue;
    chosen.push(c);
  }
  for (const bc of chosen) {
    bc.tr = Math.exp(-opticalDepth(cam.pos[1], (bc.y - cam.pos[1]) / bc.depth, bc.depth));
    stampBeacon(light, w, bc);
  }
  return chosen;
}

/* One beacon's light, added into a w-wide buffer of light. */
function stampBeacon(buf, w, { sx, sy, depth: d, tr }) {
  const near = d < 900 ? 1 : 0.6;
  for (let oy = -2; oy <= 2; oy++) {
    for (let ox = -2; ox <= 2; ox++) {
      const k = BEACON[oy + 2][ox + 2] * near;
      if (!k) continue;
      if (near < 1 && (Math.abs(ox) > 1 || Math.abs(oy) > 1)) continue;
      const n = ((sy + oy) * w + sx + ox) * 3;
      for (let c = 0; c < 3; c++) buf[n + c] += C.red[c] * k * tr * 0.4;
    }
  }
}

/*
 * Everything one beacon adds to the frame's values (its light and that
 * light's bloom; bloom is linear, so this is exactly its share), cut down to
 * the rectangle it touches.
 */
function beaconPatch(bc, w, h) {
  const only = new Float32Array(w * h * 3);
  stampBeacon(only, w, bc);
  const glow = bloom(only, w, h);
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let n = 0; n < w * h; n++) {
    const k = n * 3;
    if (only[k] + glow[k] + only[k + 1] + glow[k + 1] + only[k + 2] + glow[k + 2] > 1e-5) {
      const x = n % w;
      const y = (n / w) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const pw = x1 - x0 + 1;
  const ph = y1 - y0 + 1;
  const L = new Float32Array(Math.max(0, pw * ph * 3));
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const k = ((y0 + y) * w + x0 + x) * 3;
      const q = (y * pw + x) * 3;
      for (let c = 0; c < 3; c++) L[q + c] = only[k + c] + glow[k + c];
    }
  }
  return { x0, y0, w: pw, h: ph, L, sx: bc.sx, sy: bc.sy };
}

/* Blur a buffer of light in place into a new buffer (separable box blur). */
function boxBlur(src, w, h, r) {
  const tmpB = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const span = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < 3; c++) {
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += src[(y * w + Math.min(w - 1, Math.max(0, x))) * 3 + c];
      for (let x = 0; x < w; x++) {
        tmpB[(y * w + x) * 3 + c] = acc / span;
        const xa = Math.min(w - 1, x + r + 1);
        const xr = Math.max(0, x - r);
        acc += src[(y * w + xa) * 3 + c] - src[(y * w + xr) * 3 + c];
      }
    }
  }
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmpB[(Math.min(h - 1, Math.max(0, y)) * w + x) * 3 + c];
      for (let y = 0; y < h; y++) {
        out[(y * w + x) * 3 + c] = acc / span;
        const ya = Math.min(h - 1, y + r + 1);
        const yr = Math.max(0, y - r);
        acc += tmpB[(ya * w + x) * 3 + c] - tmpB[(yr * w + x) * 3 + c];
      }
    }
  }
  return out;
}

/* Lights bleed into the wet air: a tight halo and a wide, faint one. */
function bloom(light, w, h) {
  const a = boxBlur(light, w, h, 1);
  const b = boxBlur(boxBlur(light, w, h, 4), w, h, 4);
  const out = new Float32Array(light.length);
  for (let n = 0; n < out.length; n++) out[n] = a[n] * 0.45 + b[n] * 0.9;
  return out;
}

/* The viewer's own parapet along the bottom edge, tiles chosen by position. */
function drawParapet(rgba, w, h) {
  const rows = PARAPET_TILES[0].length;
  const tw = PARAPET_TILES[0][0].length;
  const y0 = h - rows;
  const colors = {};
  for (const [ch, hex] of Object.entries(PARAPET_KEY)) {
    if (!hex) continue;
    const v = hex.slice(1);
    colors[ch] = [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
  }
  for (let x0 = 0, n = 0; x0 < w; x0 += tw, n++) {
    const r = hash3(n, 0, SEED + 88);
    const pick = r < 0.5 ? 0 : r < 0.7 ? 1 : r < 0.82 ? 2 : r < 0.92 ? 4 : 3;
    const tileRows = PARAPET_TILES[pick];
    for (let y = 0; y < rows; y++) {
      const py = y0 + y;
      if (py < 0) continue;
      for (let x = 0; x < tw && x0 + x < w; x++) {
        const col = colors[tileRows[y][x]];
        if (!col) continue;
        const o = (py * w + x0 + x) * 4;
        rgba[o] = col[0];
        rgba[o + 1] = col[1];
        rgba[o + 2] = col[2];
        rgba[o + 3] = 255;
      }
    }
  }
}

/* Render a whole frame at once (tests, tools). */
export function renderCity(w, h) {
  const frame = createCityFrame(w, h);
  frame.renderRows(0, h);
  return frame.finish();
}
