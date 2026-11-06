/*
 * Builds art/sit_paws/<n>.png: the sitting cat (the approved idle_front frame 0) with one or both forepaws raised.
 *
 *   node art/source/make_sit_paws.mjs [outDir]
 *
 * Every frame is the approved idle_front/0.png with its pixels kept as they are, except where a raised foreleg takes the place
 * of the planted one: the planted leg is replaced by the shadowed recess under the shoulder (and its foot leaves the floor), and
 * the raised arm is drawn in the cat's own ten fur tones. An arm is a hand-drawn paw (toes, seams, a lit top edge) joined to the
 * shoulder by a forearm whose fur is shaded across its width in the same tones as the body (lit edge 9/8 .. shadow 1/0, never a
 * new colour). The right arm is the left arm mirrored about the cat's axis; frames are baked (the engine's rim light, floor pool
 * and aura are computed from each frame's silhouette, so a baked arm is lit like the rest of the cat).
 *
 * LEVELS (the render state's paw levels; null and 'low' leave the leg down):
 *   low    the paw lifted three rows off the floor in front (taps, bats, holding down; and the first beat of every other lift)
 *   mid    forearm folded up in front of the chest: held at chest height (inspecting a paw, a gesture)
 *   front  paw cupped low in front of the chest, toward the centre (holding, offering)
 *   out    arm out to the side, paw level with the chest (reaching, swatting, typing at a side keyboard)
 *   up     arm raised beside the head, paw by the ear (casting, pointing up)
 *   reach  arm stretched high above the head (reaching for something above)
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from '../../png.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const LEVELS = ['low', 'front', 'out', 'mid', 'up', 'reach']; // in order of height: the rank of a level is its index + 1
// frame number of a pair of levels (left, right); 0 = leg down: 'n' is the leg down
export const SIDES = ['n', ...LEVELS];
export const pairs = () => {
  const out = [];
  for (const l of SIDES) for (const r of SIDES) if (!(l === 'n' && r === 'n')) out.push([l, r]);
  return out;
};

// the ten fur tones of the approved frame, darkest to lightest
const TONE = [
  [3, 3, 5], [9, 8, 11], [14, 13, 16], [16, 15, 19], [18, 18, 22], [21, 21, 25], [24, 23, 27], [24, 24, 28], [27, 27, 30], [37, 36, 39],
];
const AXIS = 74; // x -> AXIS - x mirrors the left foreleg (31-36) onto the right one (38-43)

/* ---- hand-drawn parts ---------------------------------------------------------------------------------------------------- */
// The paw, toes up (digits are fur tones, '.' leaves the pixel): two toe bumps with a notch between, a lit top edge, a cuff of shadow.
const PAW = ['.89098.', '8965698', '8965598', '8655441', '.65541.', '..6541.'];
// quarter turns: [turns clockwise] -> rows
function turn(rows, k) {
  let g = rows.map((r) => [...r]);
  for (let n = 0; n < k; n++) g = g[0].map((_, c) => g.map((row) => row[c]).reverse());
  return g.map((r) => r.join(''));
}

// Each arm is a path of [x, y, width] points (the width is interpolated: wrist narrower than the shoulder, the paw a little fuller)
// then the paw, its top-left at [x, y]. Left arm; the right is mirrored.
const ARMS = {
  mid: { path: [[29, 46, 6], [25, 44, 6], [24, 41, 6]], paw: [PAW, 20, 34] },
  front: { path: [[27, 41, 6], [28, 46, 6], [33, 48, 6]], paw: [turn(PAW, 1), 33, 44] },
  out: { path: [[30, 42, 7], [25, 44, 7], [21, 46, 6]], paw: [turn(PAW, 3), 15, 43] },
  up: { path: [[29, 44, 6], [24, 40, 6], [23, 34, 5]], paw: [PAW, 19, 27] },
  reach: { path: [[29, 43, 6], [22, 37, 6], [20, 30, 6], [19, 24, 5]], paw: [PAW, 16, 18] },
};

// Arms drawn for the right side in their own (absolute) coordinates where mirroring the left one would not fit: the right
// `out` arm lies in the opening of the tail's curl (columns 54-59, rows 37-47) instead of across the tail, and is lit from the upper right.
const ARMS_R = {
  out: { path: [[44, 41, 7], [47, 41, 7], [51, 41, 6]], paw: [turn(PAW, 1), 51, 38] },
};

const hash = (x, y) => (Math.imul(x * 73856093 ^ y * 19349663, 2654435761) >>> 16) & 255;

function stroke(put, has, path, paw, { light = [-0.6, -0.8], ring = false, lift = 0 } = {}) {
  const L = light;
  const cells = new Map();
  const xs = path.map((p) => p[0]);
  const ys = path.map((p) => p[1]);
  for (let y = Math.min(...ys) - 5; y <= Math.max(...ys) + 5; y++) {
    for (let x = Math.min(...xs) - 5; x <= Math.max(...xs) + 5; x++) {
      let best = null;
      for (let i = 0; i + 1 < path.length; i++) {
        const [ax, ay, aw] = path[i];
        const [bx, by, bw] = path[i + 1];
        const dx = bx - ax;
        const dy = by - ay;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
        const cx = ax + t * dx;
        const cy = ay + t * dy;
        const d = Math.hypot(x - cx, y - cy);
        const r = (aw + t * (bw - aw)) / 2;
        if (!best || d / r < best.d / best.r) {
          const len = Math.hypot(dx, dy);
          let nx = -dy / len;
          let ny = dx / len;
          if (nx * L[0] + ny * L[1] < 0) { nx = -nx; ny = -ny; }
          best = { d, r, s: ((x - cx) * nx + (y - cy) * ny) / r };
        }
      }
      if (best.d <= best.r) cells.set(`${x},${y}`, ['b', best.s]);
      else if (best.d <= best.r + 1.1 && has(x, y) && best.s < 0.1) cells.set(`${x},${y}`, ['o', 0]); // the shadow side of the arm only
      else if (best.d <= best.r + 1.1 && hash(x, y) % 3 === 0 && best.s > -0.2) cells.set(`${x},${y}`, ['f', best.s]); // a fur tuft on the lit side
    }
  }
  for (const [k, [kind, s]] of cells) {
    const [x, y] = k.split(',').map(Number);
    if (kind === 'o') { put(x, y, hash(x, y) % 4 ? 1 : 0); continue; }
    if (kind === 'f') { put(x, y, 4); continue; }
    const streak = hash(x * 3, y) % 6 === 0 ? 1 : 0;
    const v = s > 0.72 ? 9 : s > 0.34 ? 8 : s > -0.15 ? ((x + y) & 1 ? 6 : 5) : s > -0.55 ? 4 : 2;
    put(x, y, Math.max(0, Math.min(9, v - streak)));
  }
  const [rows, ox, oy] = paw;
  const on = new Set();
  rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') on.add(`${ox + i},${oy + j}`); }));
  // a dark ring where the paw lies over fur, so a black paw still reads against a black chest
  for (const k of on) {
    const [x, y] = k.split(',').map(Number);
    // (an arm held in front of the chest is ringed on every side; elsewhere the lit side is left to the engine's rim light)
    for (let dy = ring ? -1 : 0; dy <= 1; dy++) for (let dx = ring ? -1 : 0; dx <= 1; dx++) if (!on.has(`${x + dx},${y + dy}`) && has(x + dx, y + dy)) put(x + dx, y + dy, 1);
  }
  // (a paw held against the chest is a step lighter than the fur behind it, seams kept dark, so it reads against black fur)
  rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') put(ox + i, oy + j, Number(ch) >= 2 ? Math.min(9, Number(ch) + lift) : Number(ch)); }));
}

export function build(base, left, right) {
  const out = Uint8Array.from(base);
  const px = (x, y) => (y * 96 + x) * 4;
  const put = (x, y, t) => {
    if (x < 0 || x >= 96 || y < 0 || y >= 64) return;
    const i = px(x, y);
    if (t === 'x') { out[i + 3] = 0; return; }
    const c = TONE[t];
    out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = 255;
  };
  for (const [level, mirror] of [[left, false], [right, true]]) {
    if (level === 'n') continue;
    const XM = (x) => (mirror ? AXIS - x : x);
    let X = XM;
    if (level === 'low') {
      // the foot comes up three rows: the leg is three rows shorter and its paw is off the floor
      const col = (x) => { const o = []; for (let y = 54; y <= 61; y++) { const i = px(X(x), y); o.push(out.slice(i, i + 4)); } return o; };
      for (let x = 31; x <= 36; x++) {
        const c = col(x);
        for (let y = 54; y <= 58; y++) { const i = px(X(x), y); out.set(c[y - 54 + 3], i); }
        for (let y = 59; y <= 61; y++) out[px(X(x), y) + 3] = 0;
      }
      continue;
    }
    const own = mirror && ARMS_R[level];
    const A = own || ARMS[level];
    if (!A) continue;
    X = own ? (x) => x : XM;
    // the planted leg gives way to the recess under the shoulder
    for (let y = 45; y <= 61; y++) for (let x = 31; x <= 36; x++) {
      if (y >= 59) put(XM(x), y, 'x');
      else if (y >= 57) put(XM(x), y, (x + y) % 3 ? 0 : 1);
      else {
        // the shadow under the shoulder: the chest fur above it fades into the dark, with a few lighter hairs running down
        const base = y < 48 ? 4 : y < 51 ? 3 : y < 54 ? 2 : y < 57 ? 1 : 0;
        const v = base + (hash(x, y) % 7 === 0 ? 1 : 0) - (hash(y, x) % 6 === 0 ? 1 : 0) + (x === 31 || x === 36 ? -1 : 0);
        put(XM(x), y, Math.max(0, Math.min(9, v)));
      }
    }
    const has = (x, y) => out[px(X(x), y) + 3] > 0;
    const putL = (x, y, t) => put(X(x), y, t);
    stroke(putL, has, A.path, A.paw, { light: own ? [0.6, -0.8] : [-0.6, -0.8], ring: level === 'front', lift: level === 'front' || level === 'mid' || own ? 2 : 0 });
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outDir = process.argv[2] || join(HERE, '..', 'sit_paws');
  mkdirSync(outDir, { recursive: true });
  const src = decodePng(readFileSync(join(HERE, '..', 'idle_front', '0.png')));
  pairs().forEach(([l, r], n) => writeFileSync(join(outDir, `${n}.png`), encodePng(96, 64, build(src.rgba, l, r))));
  console.log(`wrote ${pairs().length} frames to ${outDir}`);
}
