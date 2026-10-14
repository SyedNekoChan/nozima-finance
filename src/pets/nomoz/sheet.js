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
      for (const row of Object.keys(ROWS)) frames[row] = [0, 1, 2, 3].map((col) => slice(img, row, col));
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

// The keyed frame canvas for a view, or null until the sheet is ready.
export function sheetFrame(p) {
  if (state !== 'ready') return null;
  return frames[sheetRow(p)][sheetCol(p)];
}
