import { CITY_PALETTE } from './palette.js';
import { lightThrough, quantize } from './render.js';
import { GRID, project } from './scene.js';

/*
 * City mode's animation of the pixel-art layer: the lights. The air (mist,
 * haze, light shafts, glow) is the atmosphere layer over it (atmos.js); this
 * module only ever changes pixels that are light sources, so the buildings
 * themselves never shift, flicker or re-dither.
 *
 *   windows   now and then a room somewhere switches its light on or off
 *   beacons   the warning lights blink slowly, each on its own clock
 *   traffic   cars drive the length of the avenue far below: oncoming ones show
 *             their headlights (white), receding ones their tail lights (red),
 *             each with a dim light at its other end and its light streaked
 *             on the wet road toward the viewer; one speed per lane, spaced
 *             like traffic, appearing out of the far haze or from under the
 *             viewer's ledge and leaving the same way
 *
 * It works on the baked frame (createCityFrame with `capture`): every pixel's
 * value before quantisation is known, and so is exactly what a window or a
 * beacon adds to it. A change is added to the baked value and only the
 * pixels it touches are re-quantised (same palette, same ordered dither),
 * whole pixels only. Nothing is allocated per update.
 *
 * lights() lists where the moving lights are, for the atmosphere's halos.
 */

export const ANIM = {
  minFrameMs: Math.ceil(1000 / 12),
  onsetMs: 4000, // beacons ease into blinking over this long
  beacon: { periodMs: [3300, 4600], onShare: 0.5, fadeMs: 250, low: 0.1 },
  windows: { everyMs: [2200, 6500], max: 1200, minVisible: 0.03 },
  traffic: {
    everyMs: [2600, 6200], // between cars joining
    max: 14, // on the avenue at once (a trip takes 2-3 minutes)
    speed: [12, 17], // m/s, one per lane
    gap: 70, // m, at least, between cars in a lane
    zFar: 2200, // m: oncoming cars come out of the haze here, receding ones go into it
    fadeM: 90, // their lights come up / go down over this distance at the far end
    stepM: 2,
    length: 4.4, // m
    streak: [
      [6, 0.32],
      [11, 0.18],
      [17, 0.09],
    ], // light on the wet road: metres from the bright end toward the viewer, strength
    head: [1.0, 0.88, 0.66],
    tail: [1.0, 0.14, 0.08],
    bright: 0.95,
    dim: 0.3,
  },
};

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
  const cfg = ANIM;

  const out = new Uint8ClampedArray(rgba); // what is on screen
  const F = dyn.F; // the baked values
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
    const i = quantize(x, y, F[k] + X[k], F[k + 1] + X[k + 1], F[k + 2] + X[k + 2]);
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

  const lum3 = (arr, k) => Math.abs(arr[k]) + Math.abs(arr[k + 1]) + Math.abs(arr[k + 2]);

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
    const amp = Math.min(1, Math.floor(t / (cfg.onsetMs / 4)) / 4);
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

  /* ---------------------------------------------------------------- */
  /* Windows (rooms)                                                  */
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
  // the rooms that could change: visible enough to matter, a fixed random share of them
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
  let litDelta = 0; // rooms lit now minus lit in the baked frame
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
    // drift back toward the baked frame's share of lit rooms
    const wantOn = random() < Math.min(0.8, Math.max(0.2, 0.5 - litDelta * 0.08));
    for (let tries = 0; tries < 24; tries++) {
      const win = windows[Math.floor(random() * windows.length)];
      if (!!win.on === wantOn) continue;
      toggleWindow(win);
      return;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Traffic on the avenue far below                                  */
  /* ---------------------------------------------------------------- */

  const tc = cfg.traffic;
  const g = GRID;
  const aveI = Math.floor(cam.pos[0] / g.px);
  const laneW = (g.avenue - 2 * g.sidewalk) / 4;
  const steps = Math.floor(tc.zFar / tc.stepM) + 1;
  // per lane, per 2 m of road: the pixel there (-1: out of view or behind a tower) and how much light gets through
  const lanes = [0, 1, 2, 3].map((l) => {
    const x = aveI * g.px + g.sidewalk + laneW * (l + 0.5);
    const pix = new Int32Array(steps).fill(-1);
    const through = new Float32Array(steps);
    for (let s = 0; s < steps; s++) {
      const z = s * tc.stepM;
      const pr = project(cam, x, 0.7, z);
      if (!pr) continue;
      const sx = Math.floor(pr.x);
      const sy = Math.floor(pr.y);
      if (sx < 0 || sy < 0 || sx >= w || sy >= rows) continue;
      const p = sy * w + sx;
      if (dyn.depth[p] < pr.depth - 8) continue; // behind a tower
      pix[s] = p;
      through[s] = lightThrough(cam, pr.depth, 0.7);
    }
    // oncoming lanes nearest the left kerb (as the baked lanes ran), receding ones on the right
    return { dir: l < 2 ? -1 : 1, pix, through, speed: between(tc.speed), lastSpawnZ: null };
  });

  const SPRITE = 2 + tc.streak.length; // pixels a car can light: its two ends and its streak
  const cars = Array.from({ length: tc.max }, () => ({
    active: false,
    lane: null,
    z: 0,
    n: 0, // pixels lit now
    p: new Int32Array(SPRITE),
    v: new Float32Array(SPRITE * 3),
    // for the atmosphere: where its bright end is, and its light
    light: { on: false, kind: 'car', x: 0, y: 0, level: 0, r: 0, g: 0, b: 0 },
  }));
  let nextCarAt = between(tc.everyMs) * 0.4;
  let carsSeen = 0;
  // the new sprite is built here before it replaces the old one
  const np = new Int32Array(SPRITE);
  const nv = new Float32Array(SPRITE * 3);

  const at = (lane, z) => {
    const s = Math.round(z / tc.stepM);
    return s < 0 || s >= steps ? -1 : s;
  };

  function spawn() {
    let car = null;
    for (const c of cars) if (!c.active) car = c;
    if (!car) return;
    for (let tries = 0; tries < 6; tries++) {
      const lane = lanes[Math.floor(random() * 4)];
      const z0 = lane.dir < 0 ? tc.zFar : 0;
      // keep its distance from the last car to join this lane (one speed per lane: it never catches up)
      let clear = true;
      for (const c of cars) if (c.active && c.lane === lane && Math.abs(c.z - z0) < tc.gap) clear = false;
      if (!clear) continue;
      car.active = true;
      car.lane = lane;
      car.z = z0;
      car.n = 0;
      car.light.on = false;
      carsSeen++;
      return;
    }
  }

  function setPixel(n, p, k, col) {
    // the same pixel twice (the sprite folds into fewer pixels far away): add up
    for (let i = 0; i < n; i++) {
      if (np[i] === p) {
        nv[i * 3] += col[0] * k;
        nv[i * 3 + 1] += col[1] * k;
        nv[i * 3 + 2] += col[2] * k;
        return n;
      }
    }
    np[n] = p;
    nv[n * 3] = col[0] * k;
    nv[n * 3 + 1] = col[1] * k;
    nv[n * 3 + 2] = col[2] * k;
    return n + 1;
  }

  function moveCar(car, dt) {
    const lane = car.lane;
    car.z += lane.dir * lane.speed * (dt / 1000);
    const gone = lane.dir < 0 ? car.z < -20 : car.z > tc.zFar;
    // its lights come up out of the far haze and go down into it
    const farness = lane.dir < 0 ? tc.zFar - car.z : tc.zFar - car.z;
    const fade = gone ? 0 : Math.min(1, Math.max(0, farness / tc.fadeM));
    // the end facing the viewer (toward -z) is the bright one: the front of an oncoming car, the back of a receding one
    const near = car.z - tc.length / 2;
    const far = car.z + tc.length / 2;
    const bright = lane.dir < 0 ? tc.head : tc.tail;
    const dim = lane.dir < 0 ? tc.tail : tc.head;
    let n = 0;
    const sb = at(lane, near);
    if (!gone && sb >= 0 && lane.pix[sb] >= 0) {
      const th = lane.through[sb] * fade;
      n = setPixel(n, lane.pix[sb], tc.bright * th, bright);
      for (let i = 0; i < tc.streak.length; i++) {
        const s = at(lane, near - tc.streak[i][0]);
        if (s >= 0 && lane.pix[s] >= 0) n = setPixel(n, lane.pix[s], tc.streak[i][1] * th, bright);
      }
      car.light.on = true;
      car.light.x = (lane.pix[sb] % w) + 0.5;
      car.light.y = ((lane.pix[sb] / w) | 0) + 0.5;
      car.light.level = th;
      car.light.r = bright[0];
      car.light.g = bright[1];
      car.light.b = bright[2];
    } else car.light.on = false;
    const sf = at(lane, far);
    if (!gone && sf >= 0 && lane.pix[sf] >= 0) n = setPixel(n, lane.pix[sf], tc.dim * lane.through[sf] * fade, dim);

    // unchanged: nothing to draw
    let same = n === car.n;
    for (let i = 0; same && i < n; i++) {
      if (np[i] !== car.p[i] || Math.abs(nv[i * 3] - car.v[i * 3]) + Math.abs(nv[i * 3 + 1] - car.v[i * 3 + 1]) > 0.004) same = false;
    }
    if (!same) {
      for (let i = 0; i < car.n; i++) {
        const k = car.p[i] * 3;
        X[k] -= car.v[i * 3];
        X[k + 1] -= car.v[i * 3 + 1];
        X[k + 2] -= car.v[i * 3 + 2];
        requant(car.p[i]);
      }
      for (let i = 0; i < n; i++) {
        car.p[i] = np[i];
        car.v[i * 3] = nv[i * 3];
        car.v[i * 3 + 1] = nv[i * 3 + 1];
        car.v[i * 3 + 2] = nv[i * 3 + 2];
        const k = np[i] * 3;
        X[k] += nv[i * 3];
        X[k + 1] += nv[i * 3 + 1];
        X[k + 2] += nv[i * 3 + 2];
        requant(np[i]);
      }
      car.n = n;
    }
    if (gone) {
      car.active = false;
      car.light.on = false;
    }
  }

  function updateTraffic(t, dt) {
    if (t >= nextCarAt) {
      nextCarAt = t + between(tc.everyMs);
      spawn();
    }
    for (let i = 0; i < cars.length; i++) if (cars[i].active) moveCar(cars[i], dt);
  }

  // the lights the atmosphere puts halos round: beacons, then cars (entries reused)
  const lightList = [
    ...beacons.map((b) => ({ on: true, kind: 'beacon', x: b.sx + 0.5, y: b.sy + 0.5, level: 1, r: 1, g: 0.16, b: 0.1, src: b })),
    ...cars.map((c) => c.light),
  ];

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
      updateBeacons(t);
      updateWindows(t);
      updateTraffic(t, dt);
      return box.changed ? box : null;
    },
    /* The moving lights, for the atmosphere's halos (the same objects every time). */
    lights() {
      for (let i = 0; i < lightList.length; i++) if (lightList[i].src) lightList[i].level = lightList[i].src.k;
      return lightList;
    },
    /* counts for tests and tools; carPixels: where each car's bright end is now (-1 hidden, -2 none) */
    stats: () => ({
      windows: windows.length,
      windowEvents,
      carsSeen,
      litDelta,
      carsActive: cars.filter((c) => c.active).length,
      carPixels: cars.map((c) => (!c.active ? -2 : c.light.on ? Math.floor(c.light.y) * w + Math.floor(c.light.x) : -1)),
      carDirs: cars.map((c) => (c.active ? c.lane.dir : 0)), // -1 oncoming, 1 receding
      beaconLevels: beacons.map((b) => b.k),
    }),
  };
}
