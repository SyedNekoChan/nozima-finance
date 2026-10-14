/*
 * NOMOZ.EXE's canonical artwork: the supplied "Cat King" directional
 * sprite sheet (./assets/cat-king-sheet.webp, 857 x 1024), used directly
 * as the runtime sprite source. The file is never modified: frames are
 * sliced from it at runtime into offscreen canvases, and only the sheet's
 * flat grey backdrop is made transparent (see keyFrame). Every cat pixel
 * is kept exactly as supplied: no redraw, no recolour, no smoothing, no
 * rescaling.
 *
 * Layout (measured from the sheet): four rows, one per direction, each
 * with four columns: Idle, Walk 1, Walk 2, Idle.
 *
 *   down   WALK DOWN   (toward the viewer)
 *   left   WALK LEFT
 *   right  WALK RIGHT
 *   up     WALK UP     (away from the viewer)
 *
 * All cats of a row stand on one baseline, so a frame is the strip of
 * rows `top` .. `top + FRAME_H - 1` (between the row heading above and the
 * frame labels below) and the columns of that cat (`x0` .. `x1`) plus a
 * small margin. Frames are drawn bottom-aligned on that shared baseline
 * and centred on the cat, so idle and walking frames share one pivot.
 *
 * The artwork wears the crown and the coin necklace. Those are the
 * prosperous state's vanity items, so the normal (idle) state uses a bare
 * copy of each frame (see bareFrame): the crown and coin are lifted off,
 * every other pixel stays as supplied. The prosperous and stressed states
 * use the frames exactly as supplied.
 */

const SHEET_URL = new URL('./assets/cat-king-sheet.webp', import.meta.url).href;

export const FRAME_H = 173;
const PAD = 2;

// [x0, x1] of each cat on the sheet, per row (columns: idle, walk 1, walk 2, idle).
const ROWS = {
  down: { top: 110, cats: [[59, 190], [263, 393], [471, 601], [678, 810]] },
  left: { top: 346, cats: [[46, 172], [233, 420], [444, 628], [691, 816]] },
  right: { top: 583, cats: [[46, 172], [236, 420], [447, 631], [691, 816]] },
  up: { top: 818, cats: [[64, 191], [258, 390], [474, 606], [684, 811]] },
};

// The sheet's backdrop colour and how far a backdrop pixel may stray from
// it (the file is lossy, so the flat grey carries a little noise).
const BACKDROP = [52, 55, 61];
const BACKDROP_TOLERANCE = 30;
// Enclosed backdrop pockets (seen through a curled tail) at least this big
// are backdrop too; smaller near-grey clusters are the cat's own highlights.
const POCKET_MIN = 64;

let state = 'idle'; // idle | loading | ready | failed
let frames = null; // { down: [canvas x4], ... }
let bare = null; // the same frames without the crown and coin
const waiting = new Set();

/*
 * Makes the backdrop of one sliced frame transparent: every backdrop-
 * coloured pixel connected to the frame's border, plus enclosed backdrop
 * pockets. Nothing else is touched.
 */
function keyFrame(data, w, h) {
  const n = w * h;
  const near = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const d =
      Math.abs(data[i * 4] - BACKDROP[0]) +
      Math.abs(data[i * 4 + 1] - BACKDROP[1]) +
      Math.abs(data[i * 4 + 2] - BACKDROP[2]);
    near[i] = d <= BACKDROP_TOLERANCE ? 1 : 0;
  }
  const label = new Int32Array(n).fill(-1);
  const clear = (i) => {
    data[i * 4 + 3] = 0;
  };
  // flood each backdrop region; border-touching or large ones are cleared
  for (let start = 0; start < n; start++) {
    if (!near[start] || label[start] !== -1) continue;
    const stack = [start];
    const region = [];
    let border = false;
    label[start] = start;
    while (stack.length) {
      const i = stack.pop();
      region.push(i);
      const x = i % w;
      const y = (i - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
      for (const j of [i - 1, i + 1, i - w, i + w]) {
        if (j < 0 || j >= n || label[j] !== -1 || !near[j]) continue;
        if ((j === i - 1 && x === 0) || (j === i + 1 && x === w - 1)) continue;
        label[j] = start;
        stack.push(j);
      }
    }
    if (border || region.length >= POCKET_MIN) region.forEach(clear);
  }
}

/*
 * The bare copy of a keyed frame: the crown and coin lifted off. They are
 * the frame's large gold shapes (the amber eyes are far smaller): the
 * topmost is the crown, the rest the coin. Each is lifted with every
 * warm-toned pixel around it (its rim, shading and loop); the cat's fur and
 * outlines are cool-toned, so they stay. Where the crown sat, the head
 * keeps a dark top line, as in the rest of the art. Where the coin lay on
 * the body, the fur is filled in from the surrounding fur, following the
 * body's contour where the coin hung past it. Whatever lay over the
 * backdrop becomes transparent.
 */
const VANITY_MIN = 60;
const RIM = 3; // how far around a gold shape its warm rim may reach

function bareFrame(src) {
  const w = src.width;
  const h = src.height;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0);
  const im = ctx.getImageData(0, 0, w, h);
  const d = im.data;
  const at = (x, y) => (y * w + x) * 4;
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const opaque = (x, y) => inside(x, y) && d[at(x, y) + 3] > 0;
  const lum = (x, y) => d[at(x, y)] + d[at(x, y) + 1] + d[at(x, y) + 2];
  const isGold = (x, y) => {
    const i = at(x, y);
    return d[i + 3] > 0 && d[i] > 90 && d[i + 1] > 60 && d[i] - d[i + 2] > 45;
  };
  const isWarm = (x, y) => {
    const i = at(x, y);
    return d[i + 3] > 0 && d[i] - d[i + 2] > 4;
  };

  // the large gold shapes (8-connected)
  const seen = new Uint8Array(w * h);
  const shapes = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (seen[y * w + x] || !isGold(x, y)) continue;
      const pts = [];
      const stack = [[x, y]];
      seen[y * w + x] = 1;
      while (stack.length) {
        const [px, py] = stack.pop();
        pts.push([px, py]);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = px + dx;
            const ny = py + dy;
            if (!inside(nx, ny) || seen[ny * w + nx] || !isGold(nx, ny)) continue;
            seen[ny * w + nx] = 1;
            stack.push([nx, ny]);
          }
        }
      }
      if (pts.length >= VANITY_MIN) shapes.push(pts);
    }
  }
  if (!shapes.length) return cv;

  const boxOf = (pts) => ({
    x0: Math.min(...pts.map((q) => q[0])) - RIM,
    x1: Math.max(...pts.map((q) => q[0])) + RIM,
    y0: Math.min(...pts.map((q) => q[1])) - RIM,
    y1: Math.max(...pts.map((q) => q[1])) + RIM,
  });
  shapes.sort((a, b) => boxOf(a).y0 - boxOf(b).y0);

  // the mask: each shape with the warm pixels around it
  const mask = new Uint8Array(w * h);
  const lift = (box) => {
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = box.x0; x <= box.x1; x++) {
        if (inside(x, y) && isWarm(x, y)) mask[y * w + x] = 1;
      }
    }
  };
  const clear = (x, y) => {
    d[at(x, y) + 3] = 0;
  };
  const paint = (x, y, c) => {
    const i = at(x, y);
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
    d[i + 3] = 255;
  };

  const [crown, ...coins] = shapes;
  const cb = boxOf(crown);
  lift(cb);

  // the art's outline colour: the dark pixels around the crown
  const dark = [[], [], []];
  for (let y = cb.y0 - 6; y <= cb.y1 + 6; y++) {
    for (let x = cb.x0 - 6; x <= cb.x1 + 6; x++) {
      if (!opaque(x, y) || mask[y * w + x] || lum(x, y) >= 45) continue;
      for (let k = 0; k < 3; k++) dark[k].push(d[at(x, y) + k]);
    }
  }
  const outline = dark.map((v, k) => (v.length ? v.sort((a, b) => a - b)[v.length >> 1] : [4, 7, 10][k]));

  // the crown: lifted off; the head below it keeps a dark top line
  for (let x = cb.x0; x <= cb.x1; x++) {
    let low = -1;
    for (let y = cb.y0; y <= cb.y1; y++) {
      if (inside(x, y) && mask[y * w + x]) {
        clear(x, y);
        low = y;
      }
    }
    if (low < 0) continue;
    const below = low + 1;
    if (opaque(x, below) && !mask[below * w + x] && lum(x, below) >= 45) paint(x, low, outline);
  }
  // specks of its outline left standing alone beside the ears
  for (let pass = 0; pass < 2; pass++) {
    for (let y = cb.y0; y <= cb.y1; y++) {
      for (let x = cb.x0 - 1; x <= cb.x1 + 1; x++) {
        if (opaque(x, y) && !opaque(x - 1, y) && !opaque(x + 1, y) && !opaque(x, y - 1)) clear(x, y);
      }
    }
  }

  // the coin: lifted off; the body behind it filled in
  const fill = new Uint8Array(w * h);
  for (const coin of coins) {
    const b = boxOf(coin);
    const before = mask.slice();
    lift(b);
    const own = (x, y) => inside(x, y) && mask[y * w + x] && !before[y * w + x];
    let ya = h;
    let yb = -1;
    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        if (own(x, y)) {
          ya = Math.min(ya, y);
          yb = Math.max(yb, y);
        }
      }
    }
    if (yb < 0) continue;
    // the body's contour on one side, just above and below the coin
    const edge = (y, dir) => {
      const x0 = dir > 0 ? b.x0 : b.x1;
      if (!opaque(x0, y)) return null;
      let x = x0;
      while (opaque(x + dir, y)) x += dir;
      return x;
    };
    const contour = (y, dir) => {
      const e0 = edge(ya - 1, dir);
      const e1 = edge(yb + 1, dir);
      if (e0 === null && e1 === null) return null;
      if (e0 === null) return e1;
      if (e1 === null) return e0;
      return Math.round(e0 + ((e1 - e0) * (y - ya + 1)) / (yb - ya + 2));
    };
    const solid = (x, y, dir) => {
      for (x += dir; inside(x, y); x += dir) if (!own(x, y)) return opaque(x, y);
      return false;
    };
    for (let y = ya; y <= yb; y++) {
      let mx0 = w;
      let mx1 = -1;
      for (let x = b.x0; x <= b.x1; x++) {
        if (own(x, y)) {
          mx0 = Math.min(mx0, x);
          mx1 = Math.max(mx1, x);
        }
      }
      if (mx1 < 0) continue;
      const left = solid(mx0, y, -1);
      const right = solid(mx1, y, 1);
      let lo = -Infinity;
      let hi = Infinity;
      if (!left && !right) hi = lo;
      else if (!right) hi = contour(y, 1) ?? lo;
      else if (!left) lo = contour(y, -1) ?? hi;
      for (let x = mx0; x <= mx1; x++) {
        if (!own(x, y)) continue;
        clear(x, y);
        if (x >= lo && x <= hi) fill[y * w + x] = 1;
      }
    }
  }

  // fill the body in: each pixel blends the nearest clean fur in the four
  // directions, nearer fur weighing more (the coin's warm glow on the fur
  // around it is skipped)
  const cool = (x, y) => {
    const i = at(x, y);
    return d[i + 2] >= d[i] && d[i + 2] >= d[i + 1] - 1;
  };
  const fur = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!fill[y * w + x]) continue;
      const sum = [0, 0, 0];
      let wsum = 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        for (let k = 1, nx = x + dx, ny = y + dy; k <= 12 && inside(nx, ny); k++, nx += dx, ny += dy) {
          if (fill[ny * w + nx]) continue;
          if (!opaque(nx, ny)) break;
          if (!cool(nx, ny)) continue;
          for (let c = 0; c < 3; c++) sum[c] += d[at(nx, ny) + c] / k;
          wsum += 1 / k;
          break;
        }
      }
      fur.push([x, y, wsum ? sum.map((v) => Math.round(v / wsum)) : outline]);
    }
  }
  for (const [x, y, c] of fur) paint(x, y, c);

  ctx.putImageData(im, 0, 0);
  return cv;
}

function slice(img, row, col) {
  const { top, cats } = ROWS[row];
  const [a, b] = cats[col];
  const x0 = a - PAD;
  const w = b - a + 1 + 2 * PAD;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = FRAME_H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, x0, top, w, FRAME_H, 0, 0, w, FRAME_H);
  const im = ctx.getImageData(0, 0, w, FRAME_H);
  keyFrame(im.data, w, FRAME_H);
  ctx.putImageData(im, 0, 0);
  return cv;
}

// Starts loading the sheet once (browser only); safe to call repeatedly.
export function loadSheet() {
  if (state !== 'idle' || typeof Image === 'undefined' || typeof document === 'undefined') return;
  state = 'loading';
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    try {
      frames = {};
      bare = {};
      for (const row of Object.keys(ROWS)) {
        frames[row] = [0, 1, 2, 3].map((col) => slice(img, row, col));
        bare[row] = frames[row].map(bareFrame);
      }
      state = 'ready';
    } catch (err) {
      console.warn('[pets] sprite sheet could not be sliced:', err);
      state = 'failed';
    }
    waiting.forEach((fn) => fn());
    waiting.clear();
  };
  img.onerror = () => {
    console.warn('[pets] sprite sheet failed to load');
    state = 'failed';
    waiting.forEach((fn) => fn());
    waiting.clear();
  };
  img.src = SHEET_URL;
}

export const sheetState = () => state;

// Calls fn once the sheet has loaded (or failed).
export function whenSheetSettles(fn) {
  if (state === 'ready' || state === 'failed') fn();
  else waiting.add(fn);
}

/*
 * The sheet row for a view: walking across (side and three-quarter views)
 * uses the Walk Left / Walk Right rows by the way it faces, walking away
 * the Walk Up row, everything else the Walk Down row. The sheet has its
 * own art for each direction, so frames are never mirrored.
 */
const ACROSS = new Set(['side', 'frontQ', 'rearQ']);
const TURN_POSES = new Set(['sit', 'stand', 'crouch']);

export function sheetRow(p) {
  const pose = p.pose || 'sit';
  if (!TURN_POSES.has(pose)) return 'down';
  if (ACROSS.has(p.view)) return p.facing > 0 ? 'right' : 'left';
  if (p.view === 'rear') return 'up';
  return 'down';
}

// The column: Walk 1 / Walk 2 on alternate steps (and Walk 1 mid-leap), else Idle.
export function sheetCol(p) {
  if (p.legs === 1 || p.legs === 3) return 1;
  if (p.legs === 2) return 2;
  return 0;
}

/*
 * Whether the sheet has a frame for a view. The sheet draws the cat
 * sitting at rest (Idle) and stepping (Walk 1 / Walk 2), eyes open, looking
 * ahead or the way it walks. Every other rig state of the behavior library
 * (lying, crouching, stretching, standing still, blinking and closed eyes,
 * glances, mouth shapes, raised paws, ears, tail, lean, droop, pupils,
 * focus, the book, the crown and coin animations) has no frame on the
 * sheet, so it must not collapse onto the Idle frame: it is drawn by the
 * rig instead (see renderSprite).
 */
const AT_REST_MOUTHS = new Set(['idle', 'rest']);

export function sheetShows(p) {
  const pose = p.pose || 'sit';
  const walking = p.legs === 1 || p.legs === 2 || p.legs === 3;
  if (pose !== (walking ? 'stand' : 'sit')) return false;
  if ((p.eyes || 'open') !== 'open') return false;
  const gaze = p.gaze || 'c';
  if (walking ? gaze === 'u' : gaze !== 'c') return false;
  if (!AT_REST_MOUTHS.has(p.mouth || 'idle')) return false;
  if (p.lean || p.droop || p.pawL || p.pawR || p.ears || p.tail) return false;
  if (p.focus || p.pupils || p.book != null || p.bookPaw || p.bookShift) return false;
  return !p.crown && !p.crownLift && !p.coin;
}

// The keyed frame canvas for a view (bare in the normal state), or null
// until the sheet is ready.
export function sheetFrame(p) {
  if (state !== 'ready') return null;
  return (p.mood === 'idle' ? bare : frames)[sheetRow(p)][sheetCol(p)];
}
