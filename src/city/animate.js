import { hash3 } from './noise.js';
import { CITY_PALETTE } from './palette.js';
import { lightThrough, quantize } from './render.js';
import { GRID, project } from './scene.js';

/*
 * City mode's ambient animation (Phase 2). Quiet on purpose: the city should
 * feel alive without any one movement catching the eye.
 *
 * It works on the baked frame (createCityFrame with `capture`): every pixel's
 * value before quantisation is known, and so is how that value responds to
 * each moving thing. An effect is an exact change added to the baked value;
 * when it changes, only the pixels it touches are re-quantised (same palette,
 * same ordered dither), and only those that actually change colour are
 * rewritten. Nothing is traced again, nothing moves by a fraction of a pixel,
 * and nothing is allocated per tick.
 *
 *   mist       two layers (low in the streets, higher between the towers)
 *              thicken and thin as their noise drifts across by whole pixels,
 *              the nearer layer faster (parallax)
 *   haze       the lit haze over the far city swells and fades, slower still
 *   shimmer    wet roofs and streets: the reflected light ripples very slightly
 *   beacons    the warning lights blink slowly, each on its own clock
 *   windows    now and then one window somewhere is switched on or off
 *   cars       occasionally a car's lights turn into the avenue far below,
 *              travel a few blocks and turn off it again
 *
 * Effects fade in over the first few seconds, so the switch from the still
 * frame is never visible. Timing: everything happens on discrete steps, and
 * nextDue() says when the next one is, so the caller can sleep until then
 * (never more often than `minFrameMs`, i.e. 12 fps).
 */

export const ANIM = {
  minFrameMs: Math.ceil(1000 / 12),
  onsetMs: 4000, // effects ease in over this long, in 4 steps
  // [low street mist, mist between the towers]: noise cell (px), strength, ms per 1 px of drift
  mist: [
    { cell: 28, amp: 0.9, stepMs: 2600, dir: 1, seed: 11 },
    { cell: 40, amp: 0.7, stepMs: 1700, dir: 1, seed: 12 },
  ],
  // the lit haze over the far city: at most a quarter brighter or dimmer than its baked glow
  haze: { cell: 72, amp: 0.5, stepMs: 6200, seed: 13, min: 0.004 },
  // ripples on the wet surfaces, only where they hold a bright reflection (min: per channel):
  // broad, low cells drifting down the screen, so each step changes a glint only a little
  shimmer: { cellX: 12, cellY: 5, amp: 0.22, stepMs: 1100, seed: 14, min: 0.06 },
  beacon: { periodMs: [3300, 4600], onShare: 0.5, fadeMs: 250, low: 0.1 },
  windows: { everyMs: [5000, 15000], max: 900, minVisible: 0.03 },
  // brightness of a car turning in or off comes up / goes down in `levels` steps over fadeM metres
  cars: { everyMs: [7000, 18000], max: 2, speed: [9, 14], blocks: [2, 5], fadeM: 30, levels: 8, stepM: 2, zMax: 2600 },
};

const MIST0 = 1;
const MIST1 = 2;
const HAZE = 4;
const SHIMMER = 8;

/* Small seeded generator (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fadeCurve = (t) => t * t * (3 - 2 * t);

/*
 * Tileable value noise in 0..1, two octaves, at least tw x th pixels. Lookups
 * wrap, so a drifting offset never runs off the end.
 */
function tileNoise(minW, minH, cellX, cellY, seed) {
  const gx = Math.max(2, Math.ceil(minW / cellX));
  const gy = Math.max(2, Math.ceil(minH / cellY));
  const tw = gx * cellX;
  const th = gy * cellY;
  const tex = new Float32Array(tw * th);
  const octave = (x, y, cx, cy, nx, ny, s) => {
    const fx = x / cx;
    const fy = y / cy;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = fadeCurve(fx - i);
    const v = fadeCurve(fy - j);
    const i0 = ((i % nx) + nx) % nx;
    const j0 = ((j % ny) + ny) % ny;
    const i1 = (i0 + 1) % nx;
    const j1 = (j0 + 1) % ny;
    const a = hash3(i0, j0, s);
    const b = hash3(i1, j0, s);
    const c = hash3(i0, j1, s);
    const d = hash3(i1, j1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const n1 = octave(x, y, cellX, cellY, gx, gy, seed);
      const n2 = octave(x, y, cellX / 2, cellY / 2, gx * 2, gy * 2, seed + 1);
      tex[y * tw + x] = (n1 * 2 + n2) / 3;
    }
  }
  return { tex, tw, th };
}

/*
 * frame: a finished createCityFrame(w, h, { capture: true }).
 * rgba:  the frame's bytes; the animation keeps its own copy and returns that.
 */
export function createCityAnimation(frame, rgba, { seed = 1 } = {}) {
  let dyn = frame.dynamic; // let go of at the end of setup: only what is copied out is kept
  if (!dyn) throw new Error('createCityAnimation needs a frame rendered with { capture: true }');
  const { w, h } = frame;
  const cam = frame.camera;
  const rows = h - dyn.parapetRows; // the viewer's ledge never changes
  const random = rng(seed);
  const between = ([lo, hi]) => lo + (hi - lo) * random();

  const out = new Uint8ClampedArray(rgba); // what is on screen
  const F = dyn.F; // the baked values (the only full capture array kept)
  const A = new Float32Array(w * h * 3); // current change from mist, haze and shimmer
  const X = new Float32Array(w * h * 3); // current change from beacons, windows and cars
  const cur = new Uint8Array(w * h); // palette index on screen
  for (let p = 0; p < w * rows; p++) {
    const k = p * 3;
    cur[p] = quantize(p % w, (p / w) | 0, F[k], F[k + 1], F[k + 2]);
  }

  // dirty rectangle of this update (reused)
  const box = { x0: 0, y0: 0, x1: -1, y1: -1, changed: 0 };
  const resetBox = () => {
    box.x0 = w;
    box.y0 = h;
    box.x1 = -1;
    box.y1 = -1;
    box.changed = 0;
  };

  function requant(p) {
    const k = p * 3;
    const x = p % w;
    const y = (p / w) | 0;
    const i = quantize(x, y, F[k] + A[k] + X[k], F[k + 1] + A[k + 1] + X[k + 1], F[k + 2] + A[k + 2] + X[k + 2]);
    if (i === cur[p]) return;
    cur[p] = i;
    const c = CITY_PALETTE[i];
    const o = p * 4;
    out[o] = c[0];
    out[o + 1] = c[1];
    out[o + 2] = c[2];
    if (x < box.x0) box.x0 = x;
    if (x > box.x1) box.x1 = x;
    if (y < box.y0) box.y0 = y;
    if (y > box.y1) box.y1 = y;
    box.changed++;
  }

  /* ---------------------------------------------------------------- */
  /* Mist, haze and shimmer: the pixels they can touch, packed          */
  /* ---------------------------------------------------------------- */

  const cfg = ANIM;
  const lum3 = (arr, k) => Math.abs(arr[k]) + Math.abs(arr[k + 1]) + Math.abs(arr[k + 2]);
  let count = 0;
  const maskOf = new Uint8Array(w * h);
  for (let p = 0; p < w * rows; p++) {
    const k = p * 3;
    let m = 0;
    if (dyn.cap0[p] * dyn.fade[p] > 0.01) m |= MIST0;
    if (dyn.cap1[p] * dyn.fade[p] > 0.01) m |= MIST1;
    if (lum3(dyn.H, k) > cfg.haze.min) m |= HAZE;
    if (Math.max(dyn.S[k], dyn.S[k + 1], dyn.S[k + 2]) > cfg.shimmer.min) m |= SHIMMER;
    maskOf[p] = m;
    if (m) count++;
  }
  const dIdx = new Int32Array(count);
  const dX = new Uint16Array(count);
  const dY = new Uint16Array(count);
  const dMask = new Uint8Array(count);
  const dTau0 = new Float32Array(count);
  const dCap0 = new Float32Array(count);
  const dTau1 = new Float32Array(count);
  const dCap1 = new Float32Array(count);
  const dFade = new Float32Array(count);
  const dM0 = new Float32Array(count);
  const dG = new Float32Array(count * 3);
  const dS = new Float32Array(count * 3);
  const dH = new Float32Array(count * 3);
  for (let p = 0, q = 0; p < w * rows; p++) {
    if (!maskOf[p]) continue;
    dIdx[q] = p;
    dX[q] = p % w;
    dY[q] = (p / w) | 0;
    dMask[q] = maskOf[p];
    dTau0[q] = dyn.tau0[p];
    dCap0[q] = dyn.cap0[p];
    dTau1[q] = dyn.tau1[p];
    dCap1[q] = dyn.cap1[p];
    dFade[q] = dyn.fade[p];
    dM0[q] = (1 - Math.exp(-(dyn.tau0[p] + dyn.tau1[p]))) * dyn.fade[p];
    for (let c = 0; c < 3; c++) {
      dG[q * 3 + c] = dyn.G[p * 3 + c];
      dS[q * 3 + c] = dyn.S[p * 3 + c];
      dH[q * 3 + c] = dyn.H[p * 3 + c];
    }
    q++;
  }

  const n0 = tileNoise(w + cfg.mist[0].cell, h, cfg.mist[0].cell, cfg.mist[0].cell, seed + cfg.mist[0].seed);
  const n1 = tileNoise(w + cfg.mist[1].cell, h, cfg.mist[1].cell, cfg.mist[1].cell, seed + cfg.mist[1].seed);
  const nh = tileNoise(w + cfg.haze.cell, h, cfg.haze.cell, cfg.haze.cell, seed + cfg.haze.seed);
  const ns = tileNoise(w + cfg.shimmer.cellX, h + cfg.shimmer.cellY, cfg.shimmer.cellX, cfg.shimmer.cellY, seed + cfg.shimmer.seed);
  // where each texture is sampled: x + ox, y + oy, wrapped (start anywhere)
  const off = { m0: Math.floor(random() * n0.tw), m1: Math.floor(random() * n1.tw), hz: Math.floor(random() * nh.tw), sy: 0 };
  const sample = (n, x, y) => n.tex[(y % n.th) * n.tw + (x % n.tw)];

  let amp = 0; // effects' strength, 0 .. 1 over the onset
  const atm = { m0: -1, m1: -1, hz: -1, sh: -1, stage: -1 };

  function updateAtmos(t) {
    const stage = Math.min(4, Math.floor(t / (cfg.onsetMs / 4)));
    const s0 = Math.floor(t / cfg.mist[0].stepMs);
    const s1 = Math.floor(t / cfg.mist[1].stepMs);
    const sh = Math.floor(t / cfg.haze.stepMs);
    const ss = Math.floor(t / cfg.shimmer.stepMs);
    let changed = 0;
    if (stage !== atm.stage) changed = MIST0 | MIST1 | HAZE | SHIMMER;
    if (s0 !== atm.m0) changed |= MIST0;
    if (s1 !== atm.m1) changed |= MIST1;
    if (sh !== atm.hz) changed |= HAZE;
    if (ss !== atm.sh) changed |= SHIMMER;
    if (!changed) return;
    atm.stage = stage;
    atm.m0 = s0;
    atm.m1 = s1;
    atm.hz = sh;
    atm.sh = ss;
    amp = stage / 4;
    // drift: texture x for a pixel is x + off - steps (the field moves right), wrapped positive
    const x0 = off.m0 + n0.tw * 64 - s0 * cfg.mist[0].dir;
    const x1 = off.m1 + n1.tw * 64 - s1 * cfg.mist[1].dir;
    const xh = off.hz + nh.tw * 64 - sh;
    const ys = ns.th * 64 - ss; // ripples run down the screen, toward the viewer
    const a0 = amp * cfg.mist[0].amp;
    const a1 = amp * cfg.mist[1].amp;
    const ah = amp * cfg.haze.amp;
    const as = amp * cfg.shimmer.amp;
    for (let q = 0; q < count; q++) {
      const m = dMask[q];
      if (!(m & changed)) continue;
      const x = dX[q];
      const y = dY[q];
      let t0 = dTau0[q];
      let t1 = dTau1[q];
      if (m & MIST0) t0 = Math.max(0, t0 + a0 * dCap0[q] * (sample(n0, x + x0, y) - 0.5));
      if (m & MIST1) t1 = Math.max(0, t1 + a1 * dCap1[q] * (sample(n1, x + x1, y) - 0.5));
      const dm = (1 - Math.exp(-(t0 + t1))) * dFade[q] - dM0[q];
      const hz = m & HAZE ? ah * (sample(nh, x + xh, y) - 0.5) : 0;
      const sm = m & SHIMMER ? as * (sample(ns, x, y + ys) - 0.5) : 0;
      const p = dIdx[q];
      const k = p * 3;
      const kq = q * 3;
      A[k] = dG[kq] * dm + dS[kq] * sm + dH[kq] * hz;
      A[k + 1] = dG[kq + 1] * dm + dS[kq + 1] * sm + dH[kq + 1] * hz;
      A[k + 2] = dG[kq + 2] * dm + dS[kq + 2] * sm + dH[kq + 2] * hz;
      requant(p);
    }
  }

  function atmosDue(t) {
    const next = (stepMs) => (Math.floor(t / stepMs) + 1) * stepMs;
    let due = Math.min(next(cfg.mist[0].stepMs), next(cfg.mist[1].stepMs), next(cfg.haze.stepMs), next(cfg.shimmer.stepMs));
    if (t < cfg.onsetMs) due = Math.min(due, next(cfg.onsetMs / 4));
    return due;
  }

  /* ---------------------------------------------------------------- */
  /* Beacons                                                          */
  /* ---------------------------------------------------------------- */

  const bcfg = cfg.beacon;
  const beacons = dyn.beacons.map((b, i) => ({
    ...b,
    period: between(bcfg.periodMs) + i * 137, // never two on one clock
    phase: random() * 4000,
    k: 1, // the baked frame has every beacon on
  }));

  function beaconLevel(b, t) {
    const P = b.period;
    const on = P * bcfg.onShare;
    const f = bcfg.fadeMs;
    const u = (t + b.phase) % P;
    let lit;
    if (u < on) lit = 1;
    else if (u < on + f) lit = 1 - (u - on) / f;
    else if (u < P - f) lit = 0;
    else lit = (u - (P - f)) / f;
    const level = bcfg.low + (1 - bcfg.low) * lit;
    return 1 + (level - 1) * amp;
  }

  function updateBeacons(t) {
    for (const b of beacons) {
      const k = beaconLevel(b, t);
      const dk = k - b.k;
      if (Math.abs(dk) < 0.004) continue;
      b.k = k;
      for (let y = 0; y < b.h; y++) {
        const py = b.y0 + y;
        if (py >= rows) break;
        for (let x = 0; x < b.w; x++) {
          const p = py * w + b.x0 + x;
          const q = (y * b.w + x) * 3;
          X[p * 3] += dk * b.L[q];
          X[p * 3 + 1] += dk * b.L[q + 1];
          X[p * 3 + 2] += dk * b.L[q + 2];
          requant(p);
        }
      }
    }
  }

  function beaconsDue(t) {
    let due = Infinity;
    for (const b of beacons) {
      const P = b.period;
      const on = P * bcfg.onShare;
      const f = bcfg.fadeMs;
      const u = (t + b.phase) % P;
      // fading: every frame; otherwise when the next fade starts
      if ((u >= on && u < on + f) || u >= P - f) return t;
      const until = u < on ? on - u : P - f - u;
      due = Math.min(due, t + until);
    }
    return due;
  }

  /* ---------------------------------------------------------------- */
  /* Windows                                                          */
  /* ---------------------------------------------------------------- */

  const wcfg = cfg.windows;
  const groups = new Map();
  for (let p = 0; p < w * rows; p++) {
    const key = dyn.winKey[p];
    if (!key) continue;
    let g = groups.get(key);
    if (!g) {
      g = { pixels: [], lit: dyn.winLit[p], weight: 0 };
      groups.set(key, g);
    }
    g.pixels.push(p);
    g.weight += lum3(dyn.winD, p * 3);
  }
  // the windows that could change: visible enough to matter, a fixed random share of them
  let pool = [...groups.values()].filter((g) => g.weight > wcfg.minVisible);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  pool = pool.slice(0, wcfg.max);
  groups.clear();
  const windows = pool.map((g) => {
    const pixels = Int32Array.from(g.pixels);
    const D = new Float32Array(pixels.length * 3); // its pixels' value on minus off
    pixels.forEach((p, i) => D.set(dyn.winD.subarray(p * 3, p * 3 + 3), i * 3));
    return { pixels, D, on: g.lit };
  });
  let litDelta = 0; // windows lit now minus lit in the baked frame
  let nextWindowAt = between(wcfg.everyMs);
  let windowEvents = 0;

  function toggleWindow(win) {
    const sign = win.on ? -1 : 1;
    win.on = win.on ? 0 : 1;
    litDelta += sign;
    for (let i = 0; i < win.pixels.length; i++) {
      const p = win.pixels[i];
      const k = p * 3;
      X[k] += sign * win.D[i * 3];
      X[k + 1] += sign * win.D[i * 3 + 1];
      X[k + 2] += sign * win.D[i * 3 + 2];
      requant(p);
    }
    windowEvents++;
  }

  function updateWindows(t) {
    if (t < nextWindowAt || !windows.length) return;
    nextWindowAt = t + between(wcfg.everyMs);
    // drift back toward the baked frame's share of lit windows
    const wantOn = random() < Math.min(0.8, Math.max(0.2, 0.5 - litDelta * 0.08));
    for (let tries = 0; tries < 24; tries++) {
      const win = windows[Math.floor(random() * windows.length)];
      if (!!win.on === wantOn) continue;
      toggleWindow(win);
      return;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Cars on the avenue far below                                     */
  /* ---------------------------------------------------------------- */

  const ccfg = cfg.cars;
  const g = GRID;
  const aveI = Math.floor(cam.pos[0] / g.px);
  const laneW = (g.avenue - 2 * g.sidewalk) / 4;
  const steps = Math.floor(ccfg.zMax / ccfg.stepM);
  // per lane, per 2 m of road: the pixel the car's lights are on (-1: not visible) and how bright they come through
  const lanes = [0, 1, 2, 3].map((l) => {
    const x = aveI * g.px + g.sidewalk + laneW * (l + 0.5);
    const pix = new Int32Array(steps).fill(-1);
    const through = new Float32Array(steps);
    for (let s = 0; s < steps; s++) {
      const z = s * ccfg.stepM;
      const pr = project(cam, x, 0.7, z);
      if (!pr) continue;
      const sx = Math.floor(pr.x);
      const sy = Math.floor(pr.y);
      if (sx < 1 || sy < 1 || sx >= w - 1 || sy >= rows - 1) continue;
      const p = sy * w + sx;
      if (dyn.depth[p] < pr.depth - 8) continue; // behind a tower
      const mist = (1 - Math.exp(-(dyn.tau0[p] + dyn.tau1[p]))) * dyn.fade[p];
      pix[s] = p;
      through[s] = lightThrough(cam, pr.depth, 0.7) * (1 - 0.6 * mist);
    }
    return { dir: l < 2 ? -1 : 1, pix, through };
  });
  // corners where a car can turn in or off: the middle of each cross street
  const corners = [];
  for (let j = 1; j * g.pz < ccfg.zMax - g.pz; j++) corners.push(j * g.pz + g.street / 2);
  const HEAD = [1.0, 0.86, 0.6];
  const TAIL = [1.0, 0.16, 0.1];
  const cars = Array.from({ length: ccfg.max }, () => ({
    active: false,
    z: 0,
    zFrom: 0,
    zTo: 0,
    speed: 0,
    lane: null,
    color: HEAD,
    gain: 0,
    p: -1, // pixel lit now
    v: new Float32Array(3), // value added there now
    nextAt: 0,
  }));
  let nextCarAt = between(ccfg.everyMs) * 0.5;
  let carsSeen = 0;

  const HALO = 0.1;
  const AROUND = [0, -1, 1, -w, w]; // the light and its faint halo
  function applyCar(car, sign) {
    if (car.p < 0) return;
    for (let i = 0; i < 5; i++) {
      const q = car.p + AROUND[i];
      const f = (i ? HALO : 1) * sign;
      X[q * 3] += car.v[0] * f;
      X[q * 3 + 1] += car.v[1] * f;
      X[q * 3 + 2] += car.v[2] * f;
      requant(q);
    }
  }

  function spawnCar(t) {
    let car = null;
    for (const c of cars) if (!c.active) car = c;
    if (!car) return;
    for (let tries = 0; tries < 12; tries++) {
      const lane = lanes[Math.floor(random() * 4)];
      const c0 = Math.floor(random() * corners.length);
      const blocks = Math.round(between(ccfg.blocks));
      const c1 = c0 + lane.dir * blocks;
      if (c1 < 0 || c1 >= corners.length) continue;
      const from = corners[c0];
      const to = corners[c1];
      // it has to be seen somewhere along the way
      let seen = 0;
      for (let z = Math.min(from, to); z < Math.max(from, to); z += 8) if (lane.pix[Math.floor(z / ccfg.stepM)] >= 0) seen++;
      if (seen < 6) continue;
      car.active = true;
      car.lane = lane;
      car.z = from;
      car.zFrom = from;
      car.zTo = to;
      car.speed = between(ccfg.speed);
      car.color = lane.dir < 0 ? HEAD : TAIL;
      car.p = -1;
      car.gain = 0;
      car.nextAt = t;
      carsSeen++;
      return;
    }
  }

  // where a car's light is and how bright, at road position z (gain stepped, so it changes rarely)
  function carAt(car, z) {
    const s = Math.floor(z / ccfg.stepM);
    if (s < 0 || s >= steps) return -1;
    return car.lane.pix[s];
  }
  function carRamp(car, z) {
    const along = Math.min(Math.abs(z - car.zFrom), Math.abs(car.zTo - z));
    return Math.min(ccfg.levels, Math.floor((along / ccfg.fadeM) * ccfg.levels)) / ccfg.levels;
  }

  /* When this car next needs drawing: its light moves to another pixel, its brightness steps, or it is gone. */
  function carNext(car, t) {
    const dir = car.lane.dir;
    const p = car.p;
    const r = carRamp(car, car.z);
    let dz = Math.abs(car.zTo - car.z);
    for (let d = ccfg.stepM; d < dz; d += ccfg.stepM) {
      const z = car.z + dir * d;
      if (carAt(car, z) !== p || carRamp(car, z) !== r) {
        dz = d;
        break;
      }
    }
    return t + (dz / car.speed) * 1000;
  }

  function updateCars(t, dt) {
    if (t >= nextCarAt) {
      nextCarAt = t + between(ccfg.everyMs);
      spawnCar(t);
    }
    for (const car of cars) {
      if (!car.active) continue;
      car.z += car.lane.dir * car.speed * (dt / 1000);
      if (t < car.nextAt && car.p >= 0) continue;
      const done = car.lane.dir > 0 ? car.z >= car.zTo : car.z <= car.zTo;
      const p = done ? -1 : carAt(car, car.z);
      const s = Math.floor(car.z / ccfg.stepM);
      const gain = p < 0 ? 0 : carRamp(car, car.z) * car.lane.through[s];
      const strength = car.color === HEAD ? 0.95 : 0.8;
      if (p !== car.p || Math.abs(gain - car.gain) > 1e-4) {
        applyCar(car, -1);
        car.p = p;
        car.gain = gain;
        for (let c = 0; c < 3; c++) car.v[c] = car.color[c] * strength * gain;
        applyCar(car, 1);
      }
      if (done) {
        applyCar(car, -1);
        car.active = false;
        car.p = -1;
        continue;
      }
      car.nextAt = carNext(car, t);
    }
  }

  const carsDue = () => {
    let due = Infinity;
    for (const c of cars) if (c.active && c.nextAt < due) due = c.nextAt;
    return due;
  };

  /* ---------------------------------------------------------------- */

  dyn = null;
  let last = 0;
  return {
    w,
    h,
    rgba: out,
    /* Bring everything to animation time t (ms since it started); returns the changed rectangle, or null. */
    update(t) {
      const dt = Math.max(0, Math.min(1000, t - last));
      last = t;
      resetBox();
      updateAtmos(t);
      updateBeacons(t);
      updateWindows(t);
      updateCars(t, dt);
      return box.changed ? box : null;
    },
    /* The next time (animation ms) anything will change; never sooner than minFrameMs after t. */
    nextDue(t) {
      const due = Math.min(atmosDue(t), beaconsDue(t), nextWindowAt, nextCarAt, carsDue());
      return Math.max(due, t + cfg.minFrameMs);
    },
    /* counts for tests and tools; carPixels: where each car's light is now */
    stats: () => ({
      dynamicPixels: count,
      windows: windows.length,
      windowEvents,
      carsSeen,
      litDelta,
      carPixels: cars.map((c) => (c.active ? c.p : -2)), // per car: -1 hidden behind something, -2 none
      beaconLevels: beacons.map((b) => b.k),
    }),
  };
}
