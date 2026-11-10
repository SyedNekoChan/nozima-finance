import { hash3 } from './noise.js';

/*
 * The city model: a street grid of blocks, each holding a few procedurally
 * generated towers made of stacked boxes (podium, shaft, setback tier,
 * mechanical penthouse, spire), and the camera that looks down into it.
 *
 * Units are metres. x runs right, y up, z away from the viewer. The viewer
 * stands at the edge of a supertall tower (not modelled: it is behind and
 * below the camera, out of view) looking down across the downtown towers into
 * the streets far below.
 */

export const SEED = 7331;

// Grid: one cell per block plus the avenue / street along its low edge.
export const GRID = {
  px: 130, // block period across (x)
  pz: 112, // block period in depth (z)
  avenue: 36, // avenue width (runs along z)
  street: 26, // street width (runs along x)
  sidewalk: 4,
  alley: 5, // gap between lots inside a block
};

export const CAMERA_HEIGHT = 640;
// nothing is built taller than this, so every roof is seen from above
export const MAX_BUILDING = CAMERA_HEIGHT - 70;

const FLOOR = { office: 3.9, residential: 3.2 };

/*
 * Building styles: the facade palette, window grid and how many windows are
 * lit at this hour. `warm` is the share of lit windows with warm (tungsten)
 * light; the rest are cool (fluorescent / LED).
 */
export const STYLES = [
  { name: 'glass', wall: [0.045, 0.06, 0.085], glass: [0.02, 0.03, 0.05], floor: 'office', col: 3.0, winU: [0.06, 0.94], winV: [0.2, 0.94], lit: [0.03, 0.09], warm: 0.3 },
  { name: 'concrete', wall: [0.085, 0.08, 0.078], glass: [0.02, 0.022, 0.03], floor: 'residential', col: 3.6, winU: [0.22, 0.78], winV: [0.28, 0.86], lit: [0.06, 0.15], warm: 0.85 },
  { name: 'stone', wall: [0.075, 0.066, 0.07], glass: [0.018, 0.02, 0.03], floor: 'office', col: 2.6, winU: [0.3, 0.86], winV: [0.16, 0.92], lit: [0.04, 0.11], warm: 0.5 },
  { name: 'brick', wall: [0.085, 0.058, 0.05], glass: [0.02, 0.02, 0.026], floor: 'residential', col: 3.2, winU: [0.2, 0.7], winV: [0.3, 0.82], lit: [0.07, 0.16], warm: 0.9 },
];

/* ------------------------------------------------------------------ */
/* Height field: a downtown core around the viewer, low-rise beyond    */
/* ------------------------------------------------------------------ */

const CORE = { x: 150, z: 520, radius: 760 };
// a second, smaller cluster far off: city lights that are not just a flat carpet
const FAR_CLUSTER = { x: -1900, z: 3800, radius: 900 };

function envelope(x, z) {
  const d0 = Math.hypot(x - CORE.x, z - CORE.z) / CORE.radius;
  const d1 = Math.hypot(x - FAR_CLUSTER.x, z - FAR_CLUSTER.z) / FAR_CLUSTER.radius;
  return 34 + 470 * Math.exp(-d0 * d0) + 230 * Math.exp(-d1 * d1);
}

/*
 * Hand-placed heights for the lots nearest the viewer, so the frame always
 * opens on the same composition: towers dropping away on both sides, their
 * roofs well below, and the canyon of the avenue running out between them.
 * Keyed by "i,j,lot".
 */
const HERO = {
  // left wall of the avenue (block 0, its east lot) and behind it
  '0,0,1': 455,
  '0,0,0': 290,
  '0,1,1': 360,
  '0,1,0': 515,
  '0,2,1': 420,
  '0,2,0': 250,
  '0,3,1': 330,
  // right wall (block 1, its west lot) and behind it
  '1,0,0': 490,
  '1,0,1': 340,
  '1,1,0': 285,
  '1,1,1': 530,
  '1,2,0': 445,
  '1,2,1': 300,
  '1,3,0': 380,
  // the next blocks out
  '-1,0,1': 240,
  '-1,1,1': 410,
  '2,0,0': 310,
  '2,1,0': 450,
};
// blocks whose lots are fixed (split east / west) so the heroes land where intended
const HERO_BLOCK = (i, j) => j >= 0 && j <= 3 && i >= -1 && i <= 2;

/* Lot rectangles (x0, x1, z0, z1) of block (i, j). */
function lots(i, j) {
  const g = GRID;
  const bx0 = i * g.px + g.avenue;
  const bx1 = (i + 1) * g.px;
  const bz0 = j * g.pz + g.street;
  const bz1 = (j + 1) * g.pz;
  const r = HERO_BLOCK(i, j) ? 0.5 : hash3(i, j, SEED + 1);
  const a = g.alley / 2;
  if (r < 0.28) return [[bx0, bx1, bz0, bz1]];
  if (r < 0.66) {
    const m = bx0 + (bx1 - bx0) * (0.4 + 0.2 * hash3(i, j, SEED + 2));
    return [
      [bx0, m - a, bz0, bz1],
      [m + a, bx1, bz0, bz1],
    ];
  }
  const mx = bx0 + (bx1 - bx0) * (0.42 + 0.16 * hash3(i, j, SEED + 3));
  const mz = bz0 + (bz1 - bz0) * (0.42 + 0.16 * hash3(i, j, SEED + 4));
  return [
    [bx0, mx - a, bz0, mz - a],
    [mx + a, bx1, bz0, mz - a],
    [bx0, mx - a, mz + a, bz1],
    [mx + a, bx1, mz + a, bz1],
  ];
}

let nextId = 1;

/* The boxes of one block, generated on first use. */
function buildBlock(i, j) {
  const boxes = [];
  // the viewer's own tower and everything behind it is out of view
  if (j < 0) return boxes;
  const ls = lots(i, j);
  ls.forEach(([x0, x1, z0, z1], k) => {
    const s = SEED + 97 * k;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const env = envelope(cx, cz);
    const r = hash3(i, j, s + 11);
    let h = env * (0.3 + 0.7 * Math.pow(r, 0.8));
    if (hash3(i, j, s + 12) < 0.07) h *= 1.5; // the odd supertall
    if (hash3(i, j, s + 13) < 0.12) h *= 0.35; // and the odd gap
    const hero = HERO[`${i},${j},${k}`];
    if (hero) h = hero;
    h = Math.max(14, Math.min(MAX_BUILDING, h));

    const style = STYLES[Math.floor(hash3(i, j, s + 14) * STYLES.length)];
    const floor = FLOOR[style.floor];
    const litLo = style.lit[0];
    const litHi = style.lit[1];
    const b = {
      id: nextId++,
      key: `${i},${j},${k}`,
      style,
      floor,
      lit: litLo + (litHi - litLo) * hash3(i, j, s + 15),
      warm: style.warm,
      h,
      // architectural crown lighting on some tall towers
      crown: h > 200 && hash3(i, j, s + 16) < 0.3 ? (hash3(i, j, s + 17) < 0.5 ? 'cool' : 'amber') : null,
      shops: hash3(i, j, s + 18) < 0.55,
      seed: Math.floor(hash3(i, j, s + 19) * 1e6),
    };

    const w = x1 - x0;
    const d = z1 - z0;
    const add = (ax0, ax1, ay0, ay1, az0, az1, part) => {
      if (ax1 - ax0 < 1 || az1 - az0 < 1 || ay1 - ay0 < 0.5) return;
      boxes.push({ x0: ax0, x1: ax1, y0: ay0, y1: ay1, z0: az0, z1: az1, b, part });
    };

    if (h < 70) {
      add(x0 + 1, x1 - 1, 0, h, z0 + 1, z1 - 1, 'shaft');
    } else {
      // a podium on the full lot, the shaft set back from it
      const podium = 10 + 12 * hash3(i, j, s + 20);
      add(x0 + 1, x1 - 1, 0, podium, z0 + 1, z1 - 1, 'podium');
      const inset = Math.min(w, d) * (0.08 + 0.12 * hash3(i, j, s + 21));
      let sx0 = x0 + inset;
      let sx1 = x1 - inset;
      let sz0 = z0 + inset;
      let sz1 = z1 - inset;
      const tier = h > 220 && hash3(i, j, s + 22) < 0.6;
      const tierAt = tier ? h * (0.62 + 0.18 * hash3(i, j, s + 23)) : h;
      add(sx0, sx1, podium, tierAt, sz0, sz1, 'shaft');
      if (tier) {
        const t2 = Math.min(sx1 - sx0, sz1 - sz0) * (0.1 + 0.1 * hash3(i, j, s + 24));
        sx0 += t2;
        sx1 -= t2;
        sz0 += t2;
        sz1 -= t2;
        add(sx0, sx1, tierAt, h, sz0, sz1, 'shaft');
      }
      // mechanical penthouse
      const mw = (sx1 - sx0) * (0.3 + 0.2 * hash3(i, j, s + 25));
      const md = (sz1 - sz0) * (0.3 + 0.2 * hash3(i, j, s + 26));
      const mx = sx0 + (sx1 - sx0 - mw) * hash3(i, j, s + 27);
      const mz = sz0 + (sz1 - sz0 - md) * hash3(i, j, s + 28);
      const mh = 5 + 6 * hash3(i, j, s + 29);
      add(mx, mx + mw, h, h + mh, mz, mz + md, 'mech');
      b.roof = { x0: sx0, x1: sx1, z0: sz0, z1: sz1 };
      if (h > 360 && h + mh < CAMERA_HEIGHT - 50 && hash3(i, j, s + 30) < 0.5) {
        const sc = [(sx0 + sx1) / 2, (sz0 + sz1) / 2];
        const sh = Math.min(25 + 35 * hash3(i, j, s + 31), CAMERA_HEIGHT - 25 - (h + mh));
        add(sc[0] - 1, sc[0] + 1, h + mh, h + mh + sh, sc[1] - 1, sc[1] + 1, 'spire');
        b.spireTop = [sc[0], h + mh + sh, sc[1]];
      }
    }
    if (!b.roof) b.roof = { x0: x0 + 1, x1: x1 - 1, z0: z0 + 1, z1: z1 - 1 };
  });
  return boxes;
}

/*
 * Where the authored pieces go: the helipad on one neighbouring roof and the
 * neon sign on one facade (the face whose outward normal is `face`), both on
 * lots near the viewer so they read at every screen size.
 */
export const FOCAL = {
  helipad: '1,1,0',
  sign: { key: '1,0,0', face: '-x', height: 0.55 },
};

/* A city: block contents on demand, with each block's highest point. */
export function createCity() {
  nextId = 1;
  const cache = new Map();
  return {
    block(i, j) {
      const key = i * 65536 + j;
      let e = cache.get(key);
      if (!e) {
        const boxes = buildBlock(i, j);
        let top = 0;
        for (const bx of boxes) top = Math.max(top, bx.y1);
        e = { boxes, top };
        cache.set(key, e);
      }
      return e;
    },
    blocks: () => [...cache.values()],
    blocksBuilt: () => cache.size,
  };
}

/* ------------------------------------------------------------------ */
/* Camera                                                              */
/* ------------------------------------------------------------------ */

const DEG = Math.PI / 180;

/*
 * The camera for a w x h buffer. The lens is set from the diagonal, so a
 * portrait screen gets a tall view (more of the drop, a sliver of sky) and a
 * landscape one a wide view (more of the neighbouring towers); the tilt is
 * chosen so the bottom edge always looks steeply down at the streets below.
 */
export function makeCamera(w, h) {
  const diag = Math.hypot(w, h);
  // a little narrower on wide screens, so the towers at the sides do not smear
  const aspect = w / h;
  const diagFov = aspect > 1 ? 100 - 12 * Math.min(1, (aspect - 1) / 0.8) : 100;
  let f = diag / (2 * Math.tan((diagFov / 2) * DEG));
  let vHalf = Math.atan(h / 2 / f);
  // angle below the horizon of the bottom edge and the top edge
  const bottomTarget = 80 * DEG;
  let top = Math.max(-3 * DEG, Math.min(14 * DEG, bottomTarget - 2 * vHalf));
  // short, wide screens (a phone on its side) give up the distant lights to keep looking down
  const bottomMin = 62 * DEG;
  if (top + 2 * vHalf < bottomMin) top = bottomMin - 2 * vHalf;
  // never past straight down (behind the viewer nothing is built): very tall screens get a longer lens
  const bottomMax = 86 * DEG;
  if (top + 2 * vHalf > bottomMax) {
    vHalf = (bottomMax - top) / 2;
    f = h / 2 / Math.tan(vHalf);
  }
  const pitch = top + vHalf; // centre ray, below the horizon
  const yaw = 3 * DEG;
  return {
    // above the end of the avenue between blocks 0 and 1, at the edge of the viewer's tower
    pos: [GRID.px + GRID.avenue / 2 - 4, CAMERA_HEIGHT, -6],
    f,
    cx: w / 2,
    cy: h / 2,
    pitch,
    yaw,
    cp: Math.cos(pitch),
    sp: Math.sin(pitch),
    cyw: Math.cos(yaw),
    syw: Math.sin(yaw),
  };
}

/* World-space unit direction through pixel centre (px, py), written into out. */
export function rayDir(cam, px, py, out) {
  const x = (px - cam.cx) / cam.f;
  const y = -(py - cam.cy) / cam.f;
  // tilt down about x, then turn about y
  const y1 = y * cam.cp - cam.sp;
  const z1 = y * cam.sp + cam.cp;
  const x2 = x * cam.cyw + z1 * cam.syw;
  const z2 = -x * cam.syw + z1 * cam.cyw;
  const n = Math.hypot(x2, y1, z2);
  out[0] = x2 / n;
  out[1] = y1 / n;
  out[2] = z2 / n;
  return out;
}

/* Screen position of a world point, or null when it is behind the camera. */
export function project(cam, wx, wy, wz) {
  const dx = wx - cam.pos[0];
  const dy = wy - cam.pos[1];
  const dz = wz - cam.pos[2];
  // undo the turn, then the tilt
  const x = dx * cam.cyw - dz * cam.syw;
  const z1 = dx * cam.syw + dz * cam.cyw;
  const y = dy * cam.cp + z1 * cam.sp;
  const z = -dy * cam.sp + z1 * cam.cp;
  if (z <= 0.1) return null;
  return { x: cam.cx + (x / z) * cam.f, y: cam.cy - (y / z) * cam.f, depth: Math.hypot(dx, dy, dz) };
}
