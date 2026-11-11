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
 *   traffic   a few cars drive the length of the avenue far below: oncoming
 *             ones show their headlights (white), receding ones their tail
 *             lights (red), each with a dim light at its other end and its
 *             light streaked on the wet road toward the viewer; one speed per
 *             lane, spaced like traffic, appearing out of the far haze or
 *             from under the viewer's ledge and leaving the same way; a quiet
 *             night: gaps between them and now and then a lull
 *
 * It works on the baked frame (createCityFrame with `capture`): every pixel's
 * value before quantisation is known, and so is exactly what a window or a
 * beacon adds to it. A change is added to the baked value and only the
 * pixels it touches are re-quantised (same palette, same ordered dither),
 * whole pixels only. Nothing is allocated per update.
 *
 * And, rarely, something happens (one thing at a time, minutes apart, never
 * the same kind twice running):
 *
 *   outage      a few floors of one building lose power: their lit rooms go
 *               dark together, and half a minute or so later come back one
 *               by one
 *   emergency   an emergency vehicle drives the length of the avenue, faster
 *               than the traffic, in a lane of its own, its light turning red
 *               and blue and catching on the wet road
 *   activation  a few floors of a dark building light up, room by room, over
 *               half a minute; a few minutes later they go dark again
 *
 * lights() lists where the moving lights are, for the atmosphere's halos.
 */

export const ANIM = {
  minFrameMs: Math.ceil(1000 / 12),
  onsetMs: 4000, // beacons ease into blinking over this long
  beacon: { periodMs: [3300, 4600], onShare: 0.5, fadeMs: 250, low: 0.1 },
  windows: { everyMs: [2200, 6500], max: 1200, minVisible: 0.03 },
  // a quiet night avenue: a few cars at a time, now and then a lull
  traffic: {
    max: 7, // on the avenue at once (so never more than 7 in view); a trip takes 2-3 minutes
    gapMs: [12000, 28000], // between one car joining and the next, usually...
    quietMs: [45000, 90000], // ...but about one time in three a longer lull
    quietShare: 0.35,
    start: [2, 3], // already on the avenue when City mode opens (their lights ease in with the rest)
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

// the rare events: one at a time, first after a few minutes, then minutes apart
export const EVENTS = {
  kinds: ['outage', 'emergency', 'activation'],
  firstMs: [120000, 300000],
  gapMs: [300000, 660000], // from the end of one to the start of the next
  retryMs: 20000, // the one picked cannot happen now (no lane free, say): try again this much later
  outage: { floors: [2, 4], minRooms: 5, maxRooms: 28, offMs: 500, darkMs: [25000, 50000], backMs: [3000, 9000] },
  activation: { floors: [2, 5], minRooms: 5, maxRooms: 30, darkShare: 0.75, share: 0.75, riseMs: [20000, 40000], holdMs: [90000, 180000], fallMs: [15000, 30000] },
  emergency: {
    speed: [21, 25], // m/s: faster than the traffic, in a lane kept clear for it
    sirenMs: 420, // red, then blue
    siren: [
      [1.0, 0.16, 0.12],
      [0.3, 0.5, 1.0],
    ],
    level: 0.8,
    streak: [
      [5, 0.2],
      [10, 0.1],
    ], // its colour on the wet road
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
  const rows = dyn.ledgeTop; // the viewer's ledge (and everything below it) never changes
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
  // every room visible enough to matter (the rare events can reach any of them)...
  const rooms = [];
  for (const [key, g] of groups) {
    if (g.weight <= wcfg.minVisible) continue;
    const pixels = Int32Array.from(g.pixels);
    const D = new Float32Array(pixels.length * 3); // its pixels' value on minus off
    pixels.forEach((p, i) => D.set(dyn.winD.subarray(p * 3, p * 3 + 3), i * 3));
    // key: ((building * 4 + face) * 1024 + floor) * 1024 + room (render.js windowKey)
    rooms.push({ pixels, D, on: g.lit, held: false, weight: g.weight, building: Math.floor(key / 4194304), floor: Math.floor(key / 1024) % 1024 });
  }
  groups.clear();
  // ...and the ones that switch now and then: a fixed random share of them
  let pool = rooms.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const windows = pool.slice(0, wcfg.max);
  pool = null;
  let litDelta = 0; // rooms lit now minus lit in the baked frame
  let nextWindowAt = between(wcfg.everyMs);
  let windowEvents = 0;

  function toggleWindow(win, counted = true) {
    const sign = win.on ? -1 : 1;
    win.on = win.on ? 0 : 1;
    if (counted) litDelta += sign;
    for (let i = 0; i < win.pixels.length; i++) {
      const p = win.pixels[i];
      const k = p * 3;
      X[k] += sign * win.D[i * 3];
      X[k + 1] += sign * win.D[i * 3 + 1];
      X[k + 2] += sign * win.D[i * 3 + 2];
      requant(p);
    }
    if (counted) windowEvents++;
  }

  function updateWindows(t) {
    if (t < nextWindowAt || !windows.length) return;
    nextWindowAt = t + between(wcfg.everyMs);
    // drift back toward the baked frame's share of lit rooms
    const wantOn = random() < Math.min(0.8, Math.max(0.2, 0.5 - litDelta * 0.08));
    for (let tries = 0; tries < 24; tries++) {
      const win = windows[Math.floor(random() * windows.length)];
      if (!!win.on === wantOn || win.held) continue; // a room in an event is left alone
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

  const ecfg = EVENTS.emergency;
  // pixels a car can light: its two ends and its streak (and an emergency vehicle's light and its streak)
  const SPRITE = 2 + tc.streak.length + 1 + ecfg.streak.length;
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
  const nextGap = () => (random() < tc.quietShare ? between(tc.quietMs) : between(tc.gapMs));
  let nextCarAt = nextGap();
  let carsSeen = 0;
  // the new sprite is built here before it replaces the old one
  const np = new Int32Array(SPRITE);
  const nv = new Float32Array(SPRITE * 3);

  const at = (lane, z) => {
    const s = Math.round(z / tc.stepM);
    return s < 0 || s >= steps ? -1 : s;
  };

  /* A car joins: at the start of its lane (out of the far haze, or from under the ledge), or, with `midway`, somewhere along it. */
  function spawn(midway = false) {
    let car = null;
    for (const c of cars) if (!c.active) car = c;
    if (!car) return;
    for (let tries = 0; tries < 6; tries++) {
      const lane = lanes[Math.floor(random() * 4)];
      if (lane.reserved) continue; // kept clear for an emergency vehicle
      const z0 = midway ? 150 + random() * (tc.zFar - 400) : lane.dir < 0 ? tc.zFar : 0;
      // keep its distance from the cars in this lane (one speed per lane: it never catches up)
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

  function moveCar(car, dt, ease, t) {
    const lane = car.lane;
    car.z += lane.dir * (car.speed || lane.speed) * (dt / 1000);
    const gone = lane.dir < 0 ? car.z < -20 : car.z > tc.zFar;
    // its lights come up out of the far haze and go down into it
    const farness = lane.dir < 0 ? tc.zFar - car.z : tc.zFar - car.z;
    const fade = gone ? 0 : Math.min(1, Math.max(0, farness / tc.fadeM)) * ease;
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
    // an emergency vehicle's light, red then blue, and its colour on the wet road
    if (car.siren) {
      const sc = at(lane, car.z);
      const col = ecfg.siren[Math.floor(t / ecfg.sirenMs) % 2];
      if (!gone && sc >= 0 && lane.pix[sc] >= 0) {
        const th = lane.through[sc] * fade;
        n = setPixel(n, lane.pix[sc], ecfg.level * th, col);
        for (let i = 0; i < ecfg.streak.length; i++) {
          const s = at(lane, car.z - ecfg.streak[i][0]);
          if (s >= 0 && lane.pix[s] >= 0) n = setPixel(n, lane.pix[s], ecfg.streak[i][1] * th, col);
        }
        car.siren.on = true;
        car.siren.x = (lane.pix[sc] % w) + 0.5;
        car.siren.y = ((lane.pix[sc] / w) | 0) + 0.5;
        car.siren.level = th * ecfg.level;
        car.siren.r = col[0];
        car.siren.g = col[1];
        car.siren.b = col[2];
      } else car.siren.on = false;
    }

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
      if (car.siren) car.siren.on = false;
    }
  }

  function updateTraffic(t, dt) {
    if (t >= nextCarAt) {
      nextCarAt = t + nextGap();
      spawn();
    }
    // lights ease in over the onset, in the same steps as the beacons (nothing changes in the first second)
    const ease = Math.min(1, Math.floor(t / (cfg.onsetMs / 4)) / 4);
    for (let i = 0; i < cars.length; i++) if (cars[i].active) moveCar(cars[i], dt, ease, t);
    if (emergency.active) moveCar(emergency, dt, ease, t);
  }

  /* ---------------------------------------------------------------- */
  /* The rare events                                                  */
  /* ---------------------------------------------------------------- */

  const E = EVENTS;
  const evRandom = rng(seed * 7919 + 13); // their own dice: the rest of the night is the same with or without them
  const evBetween = ([lo, hi]) => lo + (hi - lo) * evRandom();
  const emergency = {
    active: false,
    lane: null,
    z: 0,
    speed: 0,
    n: 0,
    p: new Int32Array(SPRITE),
    v: new Float32Array(SPRITE * 3),
    light: { on: false, kind: 'car', x: 0, y: 0, level: 0, r: 0, g: 0, b: 0 },
    siren: { on: false, kind: 'siren', x: 0, y: 0, level: 0, r: 0, g: 0, b: 0 },
  };

  // the rooms by building and floor
  const buildings = new Map();
  for (const r of rooms) {
    let b = buildings.get(r.building);
    if (!b) buildings.set(r.building, (b = { rooms: [], floors: new Map() }));
    b.rooms.push(r);
    let f = b.floors.get(r.floor);
    if (!f) b.floors.set(r.floor, (f = []));
    f.push(r);
  }
  // the rooms on `n` floors from floor f0 up
  const band = (b, f0, n) => {
    const list = [];
    for (let f = f0; f < f0 + n; f++) if (b.floors.has(f)) list.push(...b.floors.get(f));
    return list;
  };
  const pickOne = (list) => list[Math.floor(evRandom() * list.length)];
  // one of the more visible options (by how much light its rooms make), so it can be seen when it happens
  const pickVisible = (options) => {
    options.sort((a, b) => b.weight - a.weight);
    return pickOne(options.slice(0, Math.max(1, Math.ceil(options.length * 0.4))));
  };
  const weigh = (list) => list.reduce((s, r) => s + r.weight, 0);

  let event = null; // { kind, t0, steps: [{ at, room, on }], next }
  let nextEventAt = evBetween(E.firstMs);
  let lastKind = null;
  const eventLog = [];

  // a room event: rooms held, then switched at their times (step.on), released at the end
  function roomEvent(kind, t, steps) {
    steps.sort((a, b) => a.at - b.at);
    for (const s of steps) s.room.held = true;
    event = { kind, t0: t, steps, next: 0 };
    return true;
  }

  function startOutage(t) {
    const o = E.outage;
    const options = [];
    for (const b of buildings.values()) {
      for (const f0 of b.floors.keys()) {
        const n = Math.round(evBetween(o.floors));
        const lit = band(b, f0, n).filter((r) => r.on && !r.held);
        if (lit.length >= o.minRooms && lit.length <= o.maxRooms) options.push({ lit, weight: weigh(lit) });
      }
    }
    if (!options.length) return false;
    const { lit } = pickVisible(options);
    const dark = evBetween(o.darkMs);
    const steps = [];
    for (const room of lit) {
      steps.push({ at: t + evRandom() * o.offMs, room, on: 0 }); // out together
      steps.push({ at: t + dark + evRandom() * evBetween(o.backMs), room, on: 1 }); // back one by one
    }
    return roomEvent('outage', t, steps);
  }

  function startActivation(t) {
    const a = E.activation;
    const options = [];
    for (const b of buildings.values()) {
      const dark = b.rooms.filter((r) => !r.on).length;
      if (b.rooms.length < 10 || dark / b.rooms.length < a.darkShare) continue; // a building that was dark
      for (const f0 of b.floors.keys()) {
        const n = Math.round(evBetween(a.floors));
        const off = band(b, f0, n).filter((r) => !r.on && !r.held);
        if (off.length >= a.minRooms / a.share) options.push({ off, f0, n, weight: weigh(off) });
      }
    }
    if (!options.length) return false;
    const { off, f0, n } = pickVisible(options);
    const chosen = off.filter(() => evRandom() < a.share).slice(0, a.maxRooms);
    if (chosen.length < a.minRooms) return false;
    const rise = evBetween(a.riseMs);
    const fallAt = t + rise + evBetween(a.holdMs);
    const fall = evBetween(a.fallMs);
    const steps = [];
    for (const room of chosen) {
      // floor by floor, from the lowest up, a room at a time
      const u = (room.floor - f0 + evRandom()) / n;
      steps.push({ at: t + rise * u, room, on: 1 });
      steps.push({ at: fallAt + fall * evRandom(), room, on: 0 });
    }
    return roomEvent('activation', t, steps);
  }

  function startEmergency(t) {
    if (emergency.active) return false;
    const free = lanes.filter((l) => !cars.some((c) => c.active && c.lane === l));
    if (!free.length) return false;
    const lane = pickOne(free);
    lane.reserved = true;
    emergency.active = true;
    emergency.lane = lane;
    emergency.z = lane.dir < 0 ? tc.zFar : 0;
    emergency.speed = evBetween(ecfg.speed);
    emergency.n = 0;
    event = { kind: 'emergency', t0: t };
    return true;
  }

  function start(kind, t) {
    const ok = kind === 'outage' ? startOutage(t) : kind === 'activation' ? startActivation(t) : kind === 'emergency' ? startEmergency(t) : false;
    if (ok) eventLog.push({ t, kind, phase: 'start' });
    return ok;
  }

  function end(t) {
    eventLog.push({ t, kind: event.kind, phase: 'end' });
    lastKind = event.kind;
    event = null;
    nextEventAt = t + evBetween(E.gapMs);
  }

  function updateEvents(t, quiet) {
    if (event) {
      if (event.kind === 'emergency') {
        if (!emergency.active) {
          emergency.lane.reserved = false;
          end(t);
        }
        return;
      }
      const { steps } = event;
      while (event.next < steps.length && steps[event.next].at <= t) {
        const s = steps[event.next++];
        if (!!s.room.on !== !!s.on) toggleWindow(s.room, false);
      }
      if (event.next >= steps.length) {
        for (const s of steps) s.room.held = false;
        end(t);
      }
      return;
    }
    if (t < nextEventAt) return;
    // not over the sky's own rare moment
    if (quiet) {
      nextEventAt = t + E.retryMs;
      return;
    }
    const kinds = E.kinds.filter((k) => k !== lastKind);
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = Math.floor(evRandom() * (i + 1));
      [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
    }
    for (const k of kinds) if (start(k, t)) return;
    nextEventAt = t + E.retryMs;
  }

  // the avenue is not empty when City mode opens
  for (let i = Math.round(between(tc.start)); i > 0; i--) spawn(true);

  // the lights the atmosphere puts halos round: beacons, then cars (entries reused)
  const lightList = [
    ...beacons.map((b) => ({ on: true, kind: 'beacon', x: b.sx + 0.5, y: b.sy + 0.5, level: 1, r: 1, g: 0.16, b: 0.1, src: b })),
    ...cars.map((c) => c.light),
    emergency.light,
    emergency.siren,
  ];

  /* ---------------------------------------------------------------- */

  dyn = null;
  let last = 0;
  return {
    w,
    h,
    rgba: out,
    /*
     * Bring everything to animation time t (ms since it started); returns the changed rectangle, or null.
     * quiet: the sky has a moment of its own (env.js), so no event starts now.
     */
    update(t, quiet = false) {
      const dt = Math.max(0, Math.min(1000, t - last));
      last = t;
      resetBox();
      updateBeacons(t);
      updateWindows(t);
      updateEvents(t, quiet);
      updateTraffic(t, dt);
      return box.changed ? box : null;
    },
    /* Is a rare event under way? */
    busy: () => !!event,
    /* Tests and tools: start an event now (false when one is already under way or it cannot happen here). */
    trigger(kind, t = last) {
      if (event) return false;
      if (!E.kinds.includes(kind)) throw new Error(`no city event ${kind}`);
      return start(kind, t);
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
      carLevels: cars.map((c) => (c.active && c.light.on ? c.light.level : 0)), // how bright its light reaches the eye
      carLanes: cars.map((c) => (c.active ? lanes.indexOf(c.lane) : -1)),
      carZ: cars.map((c) => (c.active ? c.z : null)), // metres along the avenue
      beaconLevels: beacons.map((b) => b.k),
      rooms: rooms.length,
      event: event ? event.kind : null,
      events: eventLog.slice(),
      held: rooms.filter((r) => r.held).length,
      litRooms: rooms.filter((r) => r.on).length,
      emergency: emergency.active
        ? { lane: lanes.indexOf(emergency.lane), z: emergency.z, dir: emergency.lane.dir, siren: emergency.siren.on ? [emergency.siren.r, emergency.siren.g, emergency.siren.b] : null }
        : null,
    }),
  };
}
