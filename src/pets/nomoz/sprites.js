/*
 * NOMOZ.EXE — 16-bit pixel-art sprite of the lonely black cat (the
 * canonical reference art, see design.md): a front-facing, sitting,
 * solid-black cat with pointed ears (white, tufted inner ear), half-lidded
 * amber eyes (dark lid, dilating slit pupils, a bright highlight), fine
 * whiskers, a lighter chest bib, a haunch / front-leg stack and a tail
 * curling up on one side. Detail is small, hand-placed pixel clusters at
 * the sprite's own density (stepped contours, fur tufts and strokes),
 * never a higher resolution or smoothing. Every pose is built from the
 * SAME shared parts so the cat never changes design between frames:
 *
 *   HEAD     : one mirrored half-grid (ears, forehead "M", cheeks, muzzle, jaw)
 *   TORSO    : mirrored half-grids, sitting (the reference pose) and standing
 *   TAIL     : one shaded grid with a small sway (or lying along the floor)
 *   FACE     : eye / pupil / nose / mouth overlays (the expressions)
 *   RIG      : raised forepaws, ear twitches, tail modes, crouching, lying
 *              and head-down poses, all assembled from those same parts
 *   PROPS    : coin, crown, book, objects, glyphs, pixel font
 *   FX       : sprite-space overlay effects (runes, sparks, orbs, smoke,
 *              dream symbols, notes...) by kind, see FX_KINDS
 *
 * VISIBILITY. The cat is predominantly black, so it is revealed by light
 * rather than by recolouring it: a directional rim light on the upper-left
 * edges, a dim edge on the right, a dithered backlight aura just outside
 * the silhouette, a lit floor pool with a black contact shadow beneath
 * the paws, and near-black internal planes (bib, haunch, stripes). All of
 * it is computed per frame (parameters in ./config.js LIGHTING), so every
 * pose gets it. Depth changes the rim strength (`light`), never the fur.
 *
 * Everything is hard pixels (no smoothing); the canvas is scaled with
 * image-rendering: pixelated.
 *
 * Worn items (crown, chest coin, held coin, book) are not drawn here: they
 * are vanity items (./vanity.js) rendered through the pet's vanity
 * registry. Temporary overlays (cues, the drifting blue flame, objects,
 * glyphs) are drawn by the ITEM_KINDS table below; add a kind there to add
 * a prop.
 */
import { LIGHTING, SPRITE_SIZE } from './config.js';

export const SPRITE_W = SPRITE_SIZE.width;
export const SPRITE_H = SPRITE_SIZE.height;

const PALETTE = {
  0: '#000000', // ink / deepest fur
  1: '#0a0c0f', // fur shadow, tabby stripes
  2: '#13161a', // fur base
  3: '#1c2025', // fur plane
  4: '#292e34', // bib, inner ear, light plane
  5: '#3b424a', // rim light
  6: '#56606a', // rim light, corners
  E: '#e6edf2', // eye highlight
  Y: '#f0cd80', // amber eye
  y: '#c99a4a', // amber eye, shaded
  I: '#d6dde3', // inner ear
  i: '#8d98a2', // inner ear, shaded tufts
  e: '#8d9ba5', // eye highlight (dim)
  a: '#0e1114', // backlight aura
  f: '#0b0e11', // floor pool
  G: '#ffd24a', // gold
  g: '#b88a1e',
  k: '#2a2008', // ink on gold
  C: '#6fe3ff', // cyber cyan
  c: '#2fa6c4',
  R: '#ff5a5a', // stress red
  h: '#ff8aa8', // heart
  p: '#cfd6dc', // book page
  q: '#8a949c',
  m: '#56606a',
  u: '#243038', // book cover
  v: '#3a4a56',
  W: '#f4f4f4', // sparkle
  B: '#1a3fb0', // blue flame: deep outer
  L: '#3d7dff', // blue flame: bright blue
  w: '#e2fbff', // blue flame: white-hot core
  b: '#0c2266', // blue flame: glow
  V: '#b48cff', // arcane violet
  D: '#5b3fa8', // arcane violet, deep
  O: '#ff9a4a', // ember
  r: '#d23c46', // yarn red
  N: '#8fe3a0', // alchemical green
  n: '#3f8f5a',
  S: '#aab4bd', // smoke / silver
};

const FUR = new Set(['0', '1', '2', '3', '4']);

/* ------------------------------------------------------------------ */
/* Grids                                                               */
/* ------------------------------------------------------------------ */

const makeGrid = () => Array.from({ length: SPRITE_H }, () => Array(SPRITE_W).fill('.'));

function put(g, x, y, ch) {
  if (x >= 0 && x < SPRITE_W && y >= 0 && y < SPRITE_H && ch !== '.' && ch !== ' ') g[y][x] = ch;
}

function blit(g, rows, x0, y0) {
  for (let y = 0; y < rows.length; y++) {
    for (let i = 0; i < rows[y].length; i++) put(g, x0 + i, y0 + y, rows[y][i]);
  }
}

// The head and torso are symmetric about the 27|28 column boundary:
// half-grid column c maps to x = 12 + c on the left and 43 - c on the right.
const HX = 12;
const putL = (g, c, y, ch) => put(g, HX + c, y, ch);
const putR = (g, c, y, ch) => put(g, 43 - c, y, ch);
const sym = (g, c, y, ch) => {
  putL(g, c, y, ch);
  putR(g, c, y, ch);
};

/* ------------------------------------------------------------------ */
/* Head                                                                */
/* ------------------------------------------------------------------ */

// Left half (17 cols: one spare column on the outside for the cheek fur,
// so the head is blitted one pixel left of its anchor), centre at the
// right edge. Pointed ears with a pale, tufted inner ear (rows 0-7); a
// domed skull with an "M" tabby mark (rows 7-11); lit brows; full cheeks
// ending in small fur tufts (rows 15-21); whisker pads, a chin and a
// rounded jaw (rows 21-26). Near-black planes only: no light muzzle patch.
const HEAD_HALF = [
  '......2..........',
  '.....222.........',
  '.....2I22........',
  '....23II2........',
  '....2IIi32.......',
  '...23IIi422......',
  '...2IiII4222.....',
  '..2234ii432222222',
  '..222222212212221',
  '..222222221212221',
  '.1222222222221221',
  '.2222222222222222',
  '.2222222222222222',
  '.2222222333222222',
  '.2222222222222222',
  '.2112222222222222',
  '22222222222222222',
  '21112222222222222',
  '.2222222222222222',
  '22333222222222222',
  '22232222222222222',
  '.1222222222233322',
  '..122222222312132',
  '..122222222222222',
  '...12222222222223',
  '.....112222222233',
  '........111111222',
];

const HEAD = HEAD_HALF.map((r) => r + [...r].reverse().join(''));
const HEAD_PAD = 1; // the spare outer column

// 6x6 eye templates; '.' leaves the fur showing. The resting eye is the
// reference's half-lidded amber eye: a heavy dark upper lid, an iris
// shaded under the lid and one bright highlight (always on the same side,
// so both eyes share the light). The pupil is not part of the template:
// it is drawn over the iris from PUPILS below. Every state keeps the same
// box and anchor so nothing shifts between frames.
const EYES = {
  open: ['......', '......', '.0000.', '0yyyE0', 'YYYYYY', '.YYYY.'],
  wide: ['.0000.', '0YYYE0', 'YYYYEY', 'YYYYYY', 'yYYYYy', '.yyyy.'],
  closed: ['......', '......', '......', '50..05', '.5555.', '......'],
  happy: ['......', '..ee..', '.e55e.', 'e5..5e', '......', '......'],
  down: ['......', '......', '......', '.5555.', 'yYYYYy', '.yYYy.'],
  panic: ['.0000.', '0eeeE0', 'eeeeee', 'eeeeee', 'eeeeee', '.eeee.'],
};

/*
 * Pupils: vertical feline slits that dilate into rounded pupils, as four
 * 6x6 masks in the eye box, from 0 (constricted slit) to 3 (dilated).
 * '0' is pupil, 's' darkens the iris around a widening pupil, 'e' is a
 * faint second reflection on the dilated pupil. A mask only paints over
 * iris pixels (IRIS), so the lids clip it and the highlight stays on top.
 * The level moves one step per redraw, so every dilation or constriction
 * passes through the intermediate frames.
 */
const PUPILS = [
  ['...0..', '...0..', '...0..', '...0..', '...0..', '...0..'],
  ['...0..', '...0..', '..s0s.', '..s0s.', '..s0s.', '...0..'],
  ['...0..', '..00..', '.s00s.', '.s00s.', '..00..', '...0..'],
  ['......', '..00..', '.0000.', '.e000.', '.s00s.', '......'],
];
const IRIS = new Set(['Y', 'y', 'e']);
const PUPIL_EYES = new Set(['open', 'wide', 'down', 'panic']);

// Which eye template a frame shows (the financial state decides first).
function eyeKind(p) {
  if (p.mood === 'stressed') return 'panic';
  if (p.mood === 'content') return p.eyes === 'blink' || p.eyes === 'closed' ? 'closed' : 'happy';
  if (p.eyes === 'blink') return 'closed';
  return EYES[p.eyes] ? p.eyes : 'open';
}

// Items the eyes follow while the cat watches them (screen-space x).
const TRACKED_ITEMS = new Set(['block', 'obj', 'text', 'glyph']);

/*
 * The pupil size the current moment calls for, from fields the behaviors
 * already set: surprise and curiosity dilate; tension widens them a little
 * (the stressed eyes stay pale); reading, pondering (concentration) and
 * bright sources constrict. Otherwise the depth light decides: deeper and
 * dimmer widens the pupils, the lit foreground narrows them, and the
 * resting middle depth is a relaxed slit.
 */
function pupilTarget(p, kind, light) {
  if (Number.isInteger(p.pupils)) return Math.max(0, Math.min(3, p.pupils));
  if (kind === 'wide') return 3;
  if (kind === 'panic') return 2; // tense, but the pale panic eyes stay pale
  if (kind === 'down' || p.mouth === 'think') return 0;
  const item = p.item?.kind;
  if (item === 'glyph' || item === 'sparkle') return 0;
  if (TRACKED_ITEMS.has(item)) return 2;
  if (fxWith(p.fx, 'bright')) return 0;
  if (fxWith(p.fx, 'track')) return 2;
  return 2 - light;
}

// Per-canvas pupil level, eased one step per redraw toward its target.
const pupilLevels = new WeakMap();

function easePupil(key, kind, target) {
  const prev = pupilLevels.get(key);
  if (prev == null) {
    pupilLevels.set(key, target);
    return target;
  }
  if (!PUPIL_EYES.has(kind)) return prev; // closed eyes keep their size
  const next = prev + Math.sign(target - prev);
  pupilLevels.set(key, next);
  return next;
}

function drawPupil(g, tpl, level, x, y, ox) {
  const mask = PUPILS[level];
  for (let r = 0; r < mask.length; r++) {
    for (let c = 0; c < mask[r].length; c++) {
      const ch = mask[r][c];
      const tc = c + ox;
      if (ch === '.' || tc < 0 || tc >= tpl[r].length || !IRIS.has(tpl[r][tc])) continue;
      put(g, x + tc, y + r, ch === 's' ? (tpl[r][tc] === 'e' ? '5' : 'y') : ch);
    }
  }
}

// Mouth overlays in head-local coordinates: a small 'w' under the nose,
// with soft corners. Only the happy and panic states open it, and only a little.
const W_MOUTH = [
  [15, 22, '1'], [16, 22, '1'],
  [15, 23, '0'], [16, 23, '0'],
  [12, 23, '1'], [19, 23, '1'],
  [13, 24, '0'], [14, 24, '0'], [17, 24, '0'], [18, 24, '0'],
];

// The nose: a small dark wedge with a dim sheen on its top edge.
const NOSE = ['4554', '.44.'];

const SMILE = ['0000', '0330'];
const PANIC_MOUTH = ['04040404', '00000000', '.000000.'];

function drawEye(g, tpl, x, y, color) {
  for (let r = 0; r < tpl.length; r++) {
    for (let i = 0; i < tpl[r].length; i++) {
      const ch = tpl[r][i];
      if (ch !== '.') put(g, x + i, y + r, color && ch === '0' ? color : ch);
    }
  }
}

function drawHead(g, p, hx, hy) {
  const stressed = p.mood === 'stressed';
  const content = p.mood === 'content';

  blit(g, HEAD, hx - HEAD_PAD, hy);

  // eyes
  const dx = p.gaze === 'l' ? -1 : p.gaze === 'r' ? 1 : 0;
  const dy = p.gaze === 'u' ? -2 : 0;
  const kind = eyeKind(p);
  drawEye(g, EYES[kind], hx + 6 + dx, hy + 12 + dy);
  drawEye(g, EYES[kind], hx + 20 + dx, hy + 12 + dy);

  // pupils: both shift together toward the gaze, and follow a watched
  // object (the blue flame...) only while the cat looks its way
  if (PUPIL_EYES.has(kind)) {
    let ox = dx;
    if (p.focusX != null) {
      const t = Math.max(-1, Math.min(1, Math.round((p.focusX - (hx + 16 + dx)) / 10)));
      if (!(dx && t && t !== dx)) ox = t;
    }
    const level = p.pupil ?? 1;
    drawPupil(g, EYES[kind], level, hx + 6 + dx, hy + 12 + dy, ox);
    drawPupil(g, EYES[kind], level, hx + 20 + dx, hy + 12 + dy, ox);
  }

  // nose
  blit(g, NOSE, hx + 14, hy + 20);

  // mouth
  const mouth = stressed ? 'panic' : content ? 'happy' : p.mouth;
  if (mouth === 'panic') {
    blit(g, PANIC_MOUTH, hx + 12, hy + 23);
    return;
  }

  if (mouth === 'think') {
    put(g, hx + 15, hy + 22, '0');
    put(g, hx + 16, hy + 22, '0');
    for (let x = 14; x <= 17; x++) put(g, hx + x, hy + 23, '0');
    return;
  }

  // a small open 'o' (a yawn, a gasp, a cough)
  if (mouth === 'o') {
    for (const [x, y] of [[15, 22], [16, 22], [14, 23], [17, 23], [14, 24], [17, 24], [15, 25], [16, 25]]) {
      put(g, hx + x, hy + y, '0');
    }
    put(g, hx + 15, hy + 23, '1');
    put(g, hx + 16, hy + 24, '1');
    return;
  }

  // chewing: the jaw drops a pixel
  if (mouth === 'chew') {
    for (let x = 14; x <= 17; x++) put(g, hx + x, hy + 23, '0');
    put(g, hx + 15, hy + 24, '0');
    put(g, hx + 16, hy + 24, '0');
    return;
  }

  for (const [x, y, ch] of W_MOUTH) put(g, hx + x, hy + y, ch);
  if (mouth === 'happy') blit(g, SMILE, hx + 14, hy + 25);
  // licking: the tip of a small pink tongue under the 'w'
  if (mouth === 'lick') {
    put(g, hx + 15, hy + 24, 'h');
    put(g, hx + 16, hy + 24, 'h');
    put(g, hx + 15, hy + 25, 'h');
  }
}

// Three fine whiskers per side, rooted in the whisker pads and fanning
// out: the upper one lifts, the middle one runs level, the lower one
// droops. Tips fade to a darker tone so they read as thin, not as bars.
const WHISKERS = [
  // [head-local column (left side), row offset] from the root outward
  { y: 19, run: [[1, 0], [0, 0], [-1, 0], [-2, 0], [-3, 0], [-4, -1], [-5, -1], [-6, -1], [-7, -2], [-8, -2]] },
  { y: 21, run: [[1, 0], [0, 0], [-1, 0], [-2, 0], [-3, 0], [-4, 0], [-5, 0], [-6, 0], [-7, 0], [-8, 1]] },
  { y: 23, run: [[2, 0], [1, 0], [0, 0], [-1, 0], [-2, 1], [-3, 1], [-4, 1], [-5, 1], [-6, 2]] },
];

function drawWhiskers(g, hx, hy, stressed, f) {
  const lift = stressed ? -1 : 0;
  const mirror = (x) => 2 * hx + 31 - x;

  WHISKERS.forEach((w, i) => {
    const flick = stressed && f && i === 0 ? -1 : 0;
    w.run.forEach(([c, dy], k) => {
      const ch = k >= w.run.length - 2 ? '3' : '4';
      const x = hx + c;
      const y = hy + w.y + dy + lift + flick;
      put(g, x, y, ch);
      put(g, mirror(x), y, ch);
    });
  });
}

/* ------------------------------------------------------------------ */
/* Torso, legs, tail                                                   */
/* ------------------------------------------------------------------ */

// Torso half-grids (16 cols, centre at the right edge, row t = y - 30),
// mirrored by sym(). Shared chest: a shadow under the jaw, rounded
// shoulders, the lighter bib with a fluffy edge and a V of darker fur
// strands, and curved flank tabby stripes.
//
// Sitting (the concept art's pose): rounded haunches with a lit upper
// curve and tabby marks, a curved haunch / leg seam, front legs with a
// lit edge and a shaded inner edge, knuckled paws with toe seams, small
// hind paws, and the black gap between the front legs.
const SIT_HALF = [
  '...........11111',
  '..........221111',
  '.........2222344',
  '........22223444',
  '.......222234444',
  '......2122343444',
  '......2123444344',
  '.....21222234434',
  '.....22212344443',
  '.....22122223444',
  '.....21222224434',
  '....221222222343',
  '....222221222244',
  '...2333213222213',
  '..23322313222100',
  '.233222213222100',
  '.332212213222100',
  '2322221213222100',
  '2322221213222100',
  '2221222213212100',
  '2222122113222100',
  '.222222113222100',
  '.221111212222100',
  '.223333212333100',
  '.221212112121100',
  '..11111101111100',
];

// Standing (walk cycle) chest and hips; the legs are drawn per frame.
const STAND_HALF = [
  '...........11111',
  '..........221111',
  '.........2222344',
  '........22223444',
  '.......222234444',
  '.......122343444',
  '......2123444344',
  '......1222234434',
  '......2212344443',
  '......2122223444',
  '......1222224434',
  '......1222222343',
  '......2222222244',
  '......2211112233',
];

function blitHalf(g, rows, ty0) {
  rows.forEach((row, t) => {
    for (let c = 0; c < row.length; c++) if (row[c] !== '.') sym(g, c, ty0 + t, row[c]);
  });
}

function drawSitTorso(g) {
  blitHalf(g, SIT_HALF, 30);
}

// The tail, tip at the top: a rounded, slightly narrower tip, a lit left
// edge, a shaded right edge, thin tabby rings, and a base that sweeps
// into the haunch.
const TAIL = [
  '.......22.',
  '......3222',
  '......3221',
  '.....32221',
  '.....31111',
  '.....32221',
  '.....32221',
  '.....31111',
  '.....32221',
  '.....32221',
  '.....31111',
  '.....32221',
  '.....32221',
  '.....31111',
  '.....32221',
  '.....32221',
  '....322221',
  '...3222221',
  '..32222211',
  '.322222211',
  '3222222211',
  '2222222211',
  '2222222221',
  '222222221.',
  '22222221..',
  '2222221...',
];

function drawTail(g, x0, y0, sway) {
  for (let r = 0; r < TAIL.length; r++) {
    // the tip sways; the base stays attached
    const shift = r < 10 ? sway : r < 14 ? Math.round(sway / 2) : 0;
    for (let c = 0; c < TAIL[r].length; c++) put(g, x0 + c + shift, y0 + r, TAIL[r][c]);
  }
}

// The same tail lying along the floor (lying poses): lit top, shaded
// underside, the same thin rings, and a tip that curls up at the end.
function drawFloorTail(g, x0, x1, y, sway) {
  const dir = x1 > x0 ? 1 : -1;
  for (let x = x0, i = 0; x !== x1 + dir; x += dir, i++) {
    const ring = i % 4 === 3;
    put(g, x, y, ring ? '1' : '3');
    put(g, x, y + 1, ring ? '1' : '2');
    put(g, x, y + 2, '1');
  }
  // the curled tip lifts a pixel when it sways
  const lift = sway > 0 ? 1 : 0;
  for (let k = 1; k <= 3; k++) {
    put(g, x1, y - k - lift, k === 3 ? '2' : '3');
    put(g, x1 + dir, y - k - lift, k === 3 ? '.' : '1');
  }
  put(g, x1 - dir, y - 1, '3');
}

/* ------------------------------------------------------------------ */
/* Rig: crouching, head-down and lying poses                           */
/* ------------------------------------------------------------------ */

// The standing walk-cycle body, lowered by `drop` rows (crouching, head
// down): the chest sinks and the legs shorten, the paws stay on the floor.
// legs 1 / 2 lift one paw, 3 both (mid-leap); `omit` leaves out a leg
// whose paw is raised ('L', 'R').
function drawUprightTorso(g, legs, drop = 0, omit = '') {
  blitHalf(g, STAND_HALF, 30 + drop);
  const top = 44 + drop;

  const leg = (side, lifted) => {
    if (omit.includes(side)) return;
    const set = side === 'L' ? putL : putR;
    const end = lifted ? 53 : 55;
    for (let y = top; y <= end; y++) {
      for (let c = 8; c <= 12; c++) set(g, c, y, c === 8 ? '3' : c === 12 ? '1' : '2');
    }
    set(g, 10, top + 3, '3'); // fur clump on the foreleg
    set(g, 11, top + 6, '1');
    if (lifted) {
      // paw tucked up and forward
      for (let c = 8; c <= 13; c++) set(g, c, 54, c >= 9 && c <= 12 ? '3' : '2');
      for (let c = 9; c <= 13; c++) set(g, c, 55, c === 11 ? '0' : '1');
    } else {
      // planted paw: knuckles, then toes and sole
      for (let c = 7; c <= 12; c++) set(g, c, 56, c === 7 ? '2' : c === 12 ? '1' : '3');
      for (let c = 7; c <= 12; c++) set(g, c, 57, c === 9 || c === 11 ? '1' : '2');
    }
  };

  leg('L', legs === 1 || legs === 3);
  leg('R', legs === 2 || legs === 3);

  for (let y = top; y <= 57; y++) for (let c = 13; c <= 15; c++) sym(g, c, y, '0');
}

/*
 * A low mound of the same fur for the lying poses (and the back seen
 * behind a lowered head): an ellipse with a lit upper plane, a shadowed
 * underside and curved flank stripes, symmetric about the centre.
 */
function drawMound(g, cx, cy, rx, ry) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      let ch = ny < -0.62 ? '3' : ny > 0.6 ? '1' : '2';
      const side = Math.abs(x + 0.5 - cx);
      if (Math.abs(nx) > 0.5 && ny > -0.62 && (Math.round(side) + Math.round(ny * ny * 5)) % 4 === 0) ch = '1';
      put(g, x, y, ch);
    }
  }
}

// A front paw resting on the floor in front of a lying cat.
const LIE_PAW = ['.2222.', '233332', '231312', '.1111.'];

// Lying front paws; a raised one (pawL / pawR set) lifts off the floor.
function drawLyingPaws(g, p, x0, y0) {
  const lift = (lv) => (lv ? 3 : 0);
  blit(g, LIE_PAW, x0 - (p.pawL ? 1 : 0), y0 - lift(p.pawL));
  blit(g, LIE_PAW, 55 - x0 - LIE_PAW[0].length + 1 + (p.pawR ? 1 : 0), y0 - lift(p.pawR));
}

// Sphinx pose: lying with the head up, front paws forward, tail along the floor.
function drawLoaf(g) {
  drawMound(g, 27.5, 48, 22, 9.5);
}
function drawLoafFront(g, p, sway) {
  drawLyingPaws(g, p, 15, 52);
  drawFloorTail(g, 41, 52, 54, sway);
}

// Curled up: a round body, the head resting low, the tail wrapped in front.
function drawCurl(g) {
  drawMound(g, 27.5, 46, 25, 11);
}
function drawCurlFront(g, p, sway) {
  drawLyingPaws(g, p, 14, 50);
  drawFloorTail(g, 47, 8, 54, sway);
}

/*
 * Poses. Every pose is the same cat: which torso parts are drawn, where
 * the head sits (hy before expression offsets), where the tail goes and
 * which floor shadow it casts. Unknown poses fall back to sitting.
 *   tail: [x, y] upright tail grid position, or null (the pose draws its own)
 */
const POSES = {
  sit: { hy: 4, tail: [42, 28], shadow: 'sit', torso: (g) => drawSitTorso(g) },
  stretch: { hy: 9, tail: [42, 28], shadow: 'sit', torso: (g) => drawSitTorso(g), front: drawStretchPaws },
  stand: { hy: 3, tail: [38, 31], shadow: 'stand', upright: 0, torso: (g, p, o) => drawUprightTorso(g, p.legs, 0, o) },
  crouch: { hy: 7, tail: [38, 31], shadow: 'stand', upright: 4, torso: (g, p, o) => drawUprightTorso(g, p.legs, 4, o) },
  low: {
    hy: 20,
    tail: [38, 4],
    shadow: 'stand',
    upright: 6,
    torso: (g, p, o) => {
      drawMound(g, 27.5, 25, 12, 7); // the back, seen behind the lowered head
      drawUprightTorso(g, p.legs, 6, o);
    },
  },
  loaf: { hy: 20, tail: null, shadow: 'lie', lying: true, torso: drawLoaf, front: drawLoafFront },
  curl: { hy: 25, tail: null, shadow: 'lie', lying: true, torso: drawCurl, front: drawCurlFront },
};

function drawStretchPaws(g) {
  // paws reach toward the viewer
  for (let c = 4; c <= 13; c++) {
    sym(g, c, 54, '2');
    sym(g, c, 55, c % 3 ? '3' : '1');
  }
}

/* ------------------------------------------------------------------ */
/* Rig: raised forepaws                                                */
/* ------------------------------------------------------------------ */

/*
 * Where a raised forepaw goes, for the cat's own left side in base space
 * (the right side mirrors about the centre). Levels near the head follow
 * the head as it moves (hx, hy = the head's anchor).
 *   low    lifted just off the floor in front (taps, bats, holding down)
 *   front  in front of the chest, toward the centre (cupping, holding)
 *   mid    at chest height (inspecting a paw, gestures)
 *   out    out to the side (reaching, swatting, typing on a side keyboard)
 *   high   at the mouth (licking)
 *   face   over the cheek (rubbing the face)
 *   ear    over the ear (cleaning around it)
 *   up     raised beside the head (casting, pointing up)
 *   reach  high overhead (reaching for something above)
 */
const PAW_AT = {
  low: () => [20, 50],
  front: () => [25, 46],
  mid: () => [22, 42],
  out: () => [9, 46],
  high: (hx, hy) => [hx + 12, hy + 23],
  face: (hx, hy) => [hx + 3, hy + 19],
  ear: (hx, hy) => [hx, hy + 7],
  up: (hx, hy) => [hx - 3, hy + 14],
  reach: (hx, hy) => [hx + 1, hy + 2],
};

// Paw positions while standing / crouching (the shoulder is lower).
const PAW_UPRIGHT = {
  low: () => [18, 52],
  front: () => [23, 50],
  mid: (d) => [19, 44 + d],
  out: (d) => [9, 47 + Math.round(d / 2)],
};

const SHOULDER_IN = [23, 41];
const SHOULDER_OUT = [19, 39];
const OUTER_LEVELS = new Set(['out', 'up', 'reach', 'ear', 'face']);

// A raised paw seen from the front: lit top edge, toe seams.
const PAW = ['.555.', '53335', '31313', '.333.'];

function line(x0, y0, x1, y1, fn) {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    fn(x0, y0);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

// The sitting front leg a raised paw came from leaves a shadowed recess.
function liftSitLeg(g, side) {
  const set = side === 'L' ? putL : putR;
  for (let y = 44; y <= 54; y++) for (let c = 9; c <= 13; c++) set(g, c, y, c === 9 ? '2' : '1');
}

/*
 * Draws the raised forepaws (pawL / pawR in base space): a 3-pixel
 * forearm from the shoulder to the paw, then an ink seam where it crosses
 * the body and a lit upper edge, so a black paw still reads over black fur.
 */
function drawForepaws(g, p, hx, hy, pose) {
  const sides = [['L', p.pawL], ['R', p.pawR]].filter(([, lv]) => lv && PAW_AT[lv]);
  if (!sides.length) return;

  const limb = new Set();
  const key = (x, y) => y * SPRITE_W + x;
  const drop = pose.upright ?? 0;

  for (const [side, level] of sides) {
    const mx = (x) => (side === 'L' ? x : 55 - x);
    const mark = (x, y, ch) => {
      const X = mx(x);
      if (X < 0 || X >= SPRITE_W || y < 0 || y >= SPRITE_H) return;
      g[y][X] = ch;
      limb.add(key(X, y));
    };
    const upright = pose.upright !== undefined;
    const [px, py] = (upright && PAW_UPRIGHT[level]?.(drop)) || PAW_AT[level](hx, hy);
    const [sx, sy] = upright ? [21, 43 + drop] : OUTER_LEVELS.has(level) ? SHOULDER_OUT : SHOULDER_IN;
    if (!upright) liftSitLeg(g, side);

    line(sx, sy, px, py, (x, y) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) mark(x + dx, y + dy, '2');
    });
    PAW.forEach((row, r) => {
      for (let i = 0; i < row.length; i++) if (row[i] !== '.') mark(px - 2 + i, py - 2 + r, row[i]);
    });
  }

  for (const k of limb) {
    const x = k % SPRITE_W;
    const y = (k - x) / SPRITE_W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= SPRITE_W || ny >= SPRITE_H || limb.has(key(nx, ny))) continue;
      if (FUR.has(g[ny][nx])) g[ny][nx] = '0';
    }
  }
  for (const k of limb) {
    const x = k % SPRITE_W;
    const y = (k - x) / SPRITE_W;
    if (g[y][x] === '2' && (!limb.has(key(x, y - 1)) || !limb.has(key(x - 1, y)))) g[y][x] = '4';
  }
}

/* ------------------------------------------------------------------ */
/* Rig: ears                                                           */
/* ------------------------------------------------------------------ */

// [outward dx, dy] per ear mode: a flick tips it out, back flattens it,
// perk lifts it. The ear (head rows 0-6, above the skull) is cut out and
// set down again, so it is the same ear, only moved.
const EAR_SHIFT = { flick: [1, 1], back: [1, 2], perk: [0, -1] };

function moveEar(g, hx, hy, side, mode) {
  const [ox, dy] = EAR_SHIFT[mode] || [0, 0];
  if (!ox && !dy) return;
  const moved = [];
  for (let y = hy; y <= hy + 6; y++) {
    for (let x = hx - 1; x <= hx + 10; x++) {
      const X = side === 'L' ? x : 2 * hx + 31 - x;
      if (X < 0 || X >= SPRITE_W || y < 0 || y >= SPRITE_H || g[y][X] === '.') continue;
      moved.push([X, y, g[y][X]]);
      g[y][X] = '.';
    }
  }
  const dx = side === 'L' ? -ox : ox;
  for (const [X, y, ch] of moved) put(g, X + dx, y + dy, ch);
}

// ears: 'back' | 'perk' | 'flick' (both) | 'flickL' | 'flickR' (base space)
function drawEars(g, ears, hx, hy) {
  if (!ears) return;
  if (ears === 'flickL' || ears === 'flickR') {
    moveEar(g, hx, hy, ears === 'flickL' ? 'L' : 'R', 'flick');
    return;
  }
  moveEar(g, hx, hy, 'L', ears);
  moveEar(g, hx, hy, 'R', ears);
}

/* ------------------------------------------------------------------ */
/* Visibility: rim light, aura, floor pool                             */
/* ------------------------------------------------------------------ */

const RIM = LIGHTING.rim;

function rimLight(cat, light) {
  const [tl, corner, right] = RIM[light];
  const out = cat.map((r) => r.slice());

  const empty = (x, y) => x < 0 || y < 0 || x >= SPRITE_W || y >= SPRITE_H || cat[y][x] === '.';

  for (let y = 0; y < SPRITE_H; y++) {
    for (let x = 0; x < SPRITE_W; x++) {
      const ch = cat[y][x];
      if (!FUR.has(ch)) continue;

      const up = empty(x, y - 1);
      const left = empty(x - 1, y);
      let rim = null;

      if (up && left) rim = corner;
      else if (up || left) rim = tl;
      else if (empty(x + 1, y)) rim = right;
      else if (empty(x, y + 1)) rim = '3';

      if (rim && rim > ch) out[y][x] = rim;
    }
  }
  return out;
}

// Dithered backlight just outside the silhouette + lit floor pool with a
// black contact shadow under the paws. Drawn beneath the cat.
function drawUnder(under, cat, light, footY, footX0, footX1) {
  const { cx, rx, ry, solid, dy } = LIGHTING.pool;
  const cy = footY + dy;

  // floor pool
  for (let y = footY - 2; y < SPRITE_H; y++) {
    for (let x = 0; x < SPRITE_W; x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const d = nx * nx + ny * ny;
      if (d <= 1 && (d < solid || (x + y) % 2 === 0)) under[y][x] = 'f';
    }
  }

  // contact shadow
  for (let x = footX0; x <= footX1; x++) {
    under[footY][x] = '0';
    if (x > footX0 + 1 && x < footX1 - 1) under[footY + 1][x] = '0';
  }

  if (light < LIGHTING.auraFromLevel) return;

  // aura
  for (let y = 0; y < SPRITE_H; y++) {
    for (let x = 0; x < SPRITE_W; x++) {
      if (cat[y][x] !== '.' || (x + y) % 2) continue;
      const near =
        (y > 0 && cat[y - 1][x] !== '.') ||
        (x > 0 && cat[y][x - 1] !== '.') ||
        (x < SPRITE_W - 1 && cat[y][x + 1] !== '.') ||
        (y < SPRITE_H - 1 && cat[y + 1][x] !== '.');
      if (near && under[y][x] === '.') under[y][x] = 'a';
    }
  }
}

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */

export const CROWN = ['G..GG..G', 'GG.GG.GG', 'GGGGGGGG', 'gggggggg'];

const COIN = ['..GGGG..', '.GGGGGg.', 'GGGGGGGg', 'GGGGGGGg', 'GGGGGGGg', 'GGGGGGGg', '.GGGGGg.', '..gggg..'];

// The coin turning about its vertical axis: face, narrowing, edge, back.
// Rows are 8 tall; the back is plain gold with a small notch.
const COIN_TURN = [
  null, // 0: face (the full coin)
  ['...GG...', '..GGGg..', '.GGGGg..', '.GGGGg..', '.GGGGg..', '.GGGGg..', '..GGgg..', '...gg...'],
  ['...Gg...', '...Gg...', '...Gg...', '...Gg...', '...Gg...', '...Gg...', '...Gg...', '...gg...'],
  ['...GG...', '..gGGG..', '..gGGG..', '..gGkG..', '..gGGG..', '..gGGG..', '..gGGG..', '...gg...'],
  ['..GGGG..', '.GGGGGg.', 'GGGGGGGg', 'GGGkkGGg', 'GGGGGGGg', 'GGGGGGGg', '.GGGGGg.', '..gggg..'],
];

const OBJECTS = {
  box: ['uuuuuuu', 'uvvvvvu', 'uvuuuvu', 'uvuuuvu', 'uvvvvvu', 'uuuuuuu'],
  gem: ['..CCC..', '.CWCCc.', 'CWCCCCc', 'cCCCCcc', '.cCCcc.', '..ccc..', '...c...'],
  disk: ['qqqqqqq', 'qpppppq', 'qpppppq', 'qqqqqqq', 'qmmmmmq', 'qmuummq', 'qqqqqqq'],
};

// Small pixel glyphs (the environmental "idea" symbol and friends).
const GLYPHS = {
  bulb: [
    ['..G..', '.GGG.', 'GGWGG', 'GGGGG', '.GGG.', '..g..', '..g..'],
    ['G.G.G', '.GGG.', 'GGWGG', 'GGGGG', '.GGG.', '..g..', '..g..'],
  ],
  bang: [['.G.', '.G.', '.G.', '...', '.G.']],
  note: [['..GG', '..G.', '.G..', 'GG..', 'GG..']],
};

// Open book: left page, spine, right page. Frames 1-2 turn a page.
function bookRows(frame) {
  const L = ['pppppppppp', 'pmmmmmmmqp', 'pppppppppq', 'pmmmmmmqpq', 'pppppppppq', 'pmmmmmqppq', 'pppppppppq', 'qqqqqqqqqq'];
  const R = L.map((r) => [...r].reverse().join(''));
  const rows = L.map((l, i) => `.${l}uu${R[i]}.`);
  rows.push('.vvvvvvvvvvuuvvvvvvvvvv.', '..uuuuuuuuuuuuuuuuuuuuuu.'.slice(0, 24));

  if (frame === 1) {
    // right page corner curls up
    for (let i = 0; i < 3; i++) rows[i] = rows[i].slice(0, 19) + '.'.repeat(5);
    rows.unshift('.'.repeat(13) + 'ppppppp' + '.'.repeat(4));
  } else if (frame === 2) {
    // right page standing on its edge, left stack thicker
    for (let i = 0; i < 6; i++) rows[i] = rows[i].slice(0, 16) + '..' + 'p' + '.'.repeat(5);
    rows.unshift('.'.repeat(15) + 'pq' + '.'.repeat(7), '.'.repeat(15) + 'pq' + '.'.repeat(7));
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Pixel font and glyphs                                               */
/* ------------------------------------------------------------------ */

const FONT = {
  '?': ['###', '..#', '.#.', '...', '.#.'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  z: ['###', '..#', '.#.', '#..', '###'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '*': ['#.#', '.#.', '###', '.#.', '#.#'],
  '.': ['...', '...', '...', '...', '.#.'],
  o: ['...', '.#.', '#.#', '.#.', '...'],
  "'": ['.#.', '.#.', '...', '...', '...'],
  $: ['###', '#..', '###', '..#', '###'],
  '%': ['#.#', '..#', '.#.', '#..', '#.#'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  '-': ['...', '...', '###', '...', '...'],
  '=': ['...', '###', '...', '###', '...'],
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['###', '..#', '###', '#..', '###'],
  5: ['###', '#..', '###', '..#', '###'],
  '#': ['#.#', '###', '#.#', '###', '#.#'],
  '@': ['###', '#.#', '###', '#..', '###'],
  '&': ['.#.', '#.#', '.##', '#.#', '.##'],
  '~': ['...', '...', '.##', '##.', '...'],
};

const HEART = ['.h.h.', 'hhhhh', '.hhh.', '..h..'];
const DROP = ['.C.', 'CCC', 'CCC', '.C.'];
const SPARK = ['..W..', '..W..', 'WWWWW', '..W..', '..W..'];

// The drifting blue flame (the item NOMOZ.EXE watches pass by): a small
// wisp with a deep-blue rim, bright-blue and cyan layers and a white-hot
// core. Three flicker frames vary the tongue and lean of the tip; the base
// stays put so it reads as one flame, not three.
const FLAME = [
  ['..B..', '.BL..', '.BLB.', 'BLCLB', 'BCwCB', 'BCwCB', '.BLB.'],
  ['...B.', 'B.LB.', '.BCB.', 'BLCLB', 'BCwCB', 'BLwCB', '.BLB.'],
  ['.B...', '.LB.B', '.BCLB', 'BLCLB', 'BCwCB', 'BCwLB', '.BLB.'],
];
const FLAME_W = 5;
const FLAME_H = 7;

// A restrained glow: a dithered ring of dim blue just outside the flame,
// alternating with the flicker so it shimmers instead of sitting flat.
function drawFlame(ctx, x, y, frame) {
  const rows = FLAME[frame % FLAME.length];
  const lit = (c, r) => r >= 0 && r < FLAME_H && c >= 0 && c < FLAME_W && rows[r][c] !== '.';

  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = PALETTE.b;
  for (let r = -1; r <= FLAME_H; r++) {
    for (let c = -1; c <= FLAME_W; c++) {
      if (lit(c, r) || (c + r + frame) % 2) continue;
      if (lit(c - 1, r) || lit(c + 1, r) || lit(c, r - 1) || lit(c, r + 1)) ctx.fillRect(x + c, y + r, 1, 1);
    }
  }
  ctx.restore();

  fillPixels(ctx, rows, x, y, paletteColor);
}

export function textWidth(text) {
  return text === '<3' ? 5 : text.length * 4 - 1;
}

// Draws pixel glyphs straight onto a canvas context.
export function fillPixels(ctx, rows, x0, y0, colorFor) {
  for (let y = 0; y < rows.length; y++) {
    for (let i = 0; i < rows[y].length; i++) {
      const ch = rows[y][i];
      if (ch === '.' || ch === ' ') continue;
      ctx.fillStyle = colorFor(ch);
      ctx.fillRect(x0 + i, y0 + y, 1, 1);
    }
  }
}

export const paletteColor = (ch) => PALETTE[ch];

export function drawText(ctx, text, x, y, color) {
  if (text === '<3') {
    fillPixels(ctx, HEART, x, y, paletteColor);
    return;
  }
  for (let i = 0; i < text.length; i++) {
    const glyph = FONT[text[i]];
    if (!glyph) continue;
    const dy = text === 'zZ' && i === 0 ? 3 : 0;
    fillPixels(ctx, glyph, x + i * 4, y + dy, () => color);
  }
}

// turn: 0 = face, 1..4 = the coin turning over to its back and round again
export function drawCoin(ctx, x, y, turn = 0) {
  const rows = turn > 0 ? COIN_TURN[Math.min(turn, COIN_TURN.length - 1)] : null;
  if (rows) {
    fillPixels(ctx, rows, x, y, paletteColor);
    return;
  }
  fillPixels(ctx, COIN, x, y, paletteColor);
  fillPixels(ctx, FONT.$, x + 2, y + 1, () => PALETTE.k);
  ctx.fillStyle = PALETTE.k;
  ctx.fillRect(x + 3, y, 2, 1);
  ctx.fillRect(x + 3, y + 7, 2, 1);
}

const BOOK_PAW = ['22222', '23332', '.222.'];

/*
 * The open book of the reading behaviors. p.bookShift (-1..1) nudges it
 * sideways; p.bookPaw (0..5) lifts the left paw onto the page and follows
 * the lines: line floor(i / 2), left or right half by i % 2.
 */
export function drawBook(ctx, frame, p = {}) {
  const rows = bookRows(frame);
  const dx = p.bookShift || 0;
  fillPixels(ctx, rows, 16 + dx, 56 - rows.length, paletteColor);
  // paws resting on the book, or one reading along the lines
  if (Number.isInteger(p.bookPaw)) {
    const i = Math.max(0, Math.min(5, p.bookPaw));
    fillPixels(ctx, BOOK_PAW, 18 + dx + (i % 2) * 4, 45 + Math.floor(i / 2) * 2, paletteColor);
  } else {
    fillPixels(ctx, BOOK_PAW, 17 + dx, 52, paletteColor);
  }
  fillPixels(ctx, BOOK_PAW, 34 + dx, 52, paletteColor);
}

/*
 * Temporary overlays (view.item): one drawer per kind. Adding a prop kind
 * is adding an entry here; unknown kinds are ignored.
 */
const ITEM_KINDS = {
  text: (ctx, i) => drawText(ctx, i.text, i.x, i.y, PALETTE.C),
  // the drifting environmental object: a glowing blue flame centred on
  // the item's 2x2 anchor. Its flicker follows its own position and the
  // animation clock, so it changes on every step without a new timer.
  block: (ctx, i, frame) => drawFlame(ctx, i.x - 1, i.y, (i.x + i.y + frame) % FLAME.length),
  obj: (ctx, i) => fillPixels(ctx, OBJECTS[i.name], i.x, i.y, paletteColor),
  crown: (ctx, i) => fillPixels(ctx, CROWN, i.x, i.y, paletteColor),
  coin: (ctx, i) => {
    drawCoin(ctx, i.x, i.y, i.turn || 0);
    if (i.spark) fillPixels(ctx, SPARK, i.x + 6, i.y - 5, paletteColor);
  },
  sparkle: (ctx, i) => fillPixels(ctx, SPARK, i.x, i.y, paletteColor),
  glyph: (ctx, i) => {
    const frames = GLYPHS[i.name];
    if (frames) fillPixels(ctx, frames[(i.frame || 0) % frames.length], i.x, i.y, paletteColor);
  },
};

// Kinds that never clash with the stressed appearance.
const STRESS_SAFE_ITEMS = new Set(['text', 'block']);

function drawItem(ctx, item, stressed, frame) {
  if (!item || (stressed && !STRESS_SAFE_ITEMS.has(item.kind))) return;
  ITEM_KINDS[item.kind]?.(ctx, item, frame);
}

/* ------------------------------------------------------------------ */
/* FX: sprite-space overlay effects                                    */
/* ------------------------------------------------------------------ */

/*
 * view.fx is a keyed set of small temporary effects drawn on the cat's own
 * canvas, in screen orientation (never mirrored), so they move with the
 * cat. Each spec: { kind, x, y (the effect's centre), c (palette key),
 * a (alpha), back (drawn behind the cat), ...kind fields }. A kind is
 * { draw(ctx, f, frame), bright, track }: bright effects narrow the
 * pupils, tracked ones draw the pupils toward them. Unknown kinds are
 * ignored; add a kind by adding an entry here.
 */

const STAR5 = ['..#..', '.###.', '#####', '.###.', '.#.#.'];
const SPARK_S = ['.#.', '###', '.#.'];
const X_SPARK = ['#.#', '.#.', '#.#'];

const RUNES = {
  ka: ['..#..', '.#.#.', '#...#', '.#.#.', '..#..'],
  ur: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  sol: ['.###.', '#...#', '#.#.#', '#...#', '.###.'],
  ix: ['#.#.#', '.#.#.', '..#..', '.#.#.', '#.#.#'],
  om: ['.###.', '#...#', '..#..', '.#.#.', '#...#'],
  ve: ['#...#', '.#.#.', '..#..', '..#..', '..#..'],
  ar: ['..#..', '..#..', '#####', '..#..', '.#.#.'],
  eh: ['###..', '#..#.', '###..', '#.#..', '#..#.'],
};
export const RUNE_NAMES = Object.keys(RUNES);

// Orbs: 'o' rim, 'b' body, 'w' core, recoloured per tint.
const ORBS = [
  ['.o.', 'owo', '.o.'],
  ['.ooo.', 'obwbo', 'owwbo', 'obbbo', '.ooo.'],
  ['..ooo..', '.obbbo.', 'obwwbbo', 'obwbbbo', 'obbbbbo', '.obbbo.', '..ooo..'],
];
const TINTS = {
  C: { o: 'c', b: 'C', w: 'W' },
  V: { o: 'D', b: 'V', w: 'W' },
  G: { o: 'g', b: 'G', w: 'W' },
  O: { o: 'R', b: 'O', w: 'W' },
  N: { o: 'n', b: 'N', w: 'W' },
  L: { o: 'B', b: 'L', w: 'w' },
};

const DREAMS = {
  fish: [['.##.#', '#####', '.##.#'], 'C'],
  moon: [['.##.', '#...', '#...', '#...', '.##.'], 'G'],
  star: [STAR5, 'W'],
  yarn: [['.###.', '#.#.#', '##.##', '#.#.#', '.###.'], 'r'],
  coin: [['.###.', '##.##', '#.#.#', '##.##', '.###.'], 'G'],
  mouse: [['#.#..', '####.', '.####', '..#.#'], 'q'],
};

const NOTES = [
  ['..##', '..#.', '..#.', '###.', '##..'],
  ['.###', '.#.#', '.#.#', '##.#', '#...'],
];

const PAGE = [
  ['pppq', 'pmmq', 'pppq', 'pmmq', 'qqqq'],
  ['.ppq', 'pmmq', 'pppq', 'pmm.', 'qqq.'],
];

// glyph rows in one palette colour, centred on (x, y)
function glyphAt(ctx, rows, x, y, col) {
  fillPixels(ctx, rows, Math.round(x - rows[0].length / 2 + 0.5), Math.round(y - rows.length / 2 + 0.5), () => col);
}

// a restrained dithered halo just outside a glyph (the flame's glow)
function haloAt(ctx, rows, x, y, col, frame) {
  const x0 = Math.round(x - rows[0].length / 2 + 0.5);
  const y0 = Math.round(y - rows.length / 2 + 0.5);
  const h = rows.length;
  const w = rows[0].length;
  const lit = (c, r) => r >= 0 && r < h && c >= 0 && c < w && rows[r][c] !== '.';
  ctx.save();
  ctx.globalAlpha *= 0.45;
  ctx.fillStyle = col;
  for (let r = -1; r <= h; r++) {
    for (let c = -1; c <= w; c++) {
      if (lit(c, r) || (c + r + frame) % 2) continue;
      if (lit(c - 1, r) || lit(c + 1, r) || lit(c, r - 1) || lit(c, r + 1)) ctx.fillRect(x0 + c, y0 + r, 1, 1);
    }
  }
  ctx.restore();
}

const col = (key, fallback = 'W') => PALETTE[key] || PALETTE[fallback];

export const FX_KINDS = {
  // a tiny twinkle ('x' turns it diagonal, big uses the five-pixel spark)
  spark: {
    bright: true,
    draw: (ctx, f) => glyphAt(ctx, f.big ? SPARK : f.x2 ? X_SPARK : SPARK_S, f.x, f.y, col(f.c)),
  },
  // a single mote of light or fur (size 1 or 2)
  mote: {
    draw: (ctx, f) => {
      ctx.fillStyle = col(f.c, 'C');
      const s = f.size || 1;
      ctx.fillRect(Math.round(f.x), Math.round(f.y), s, s);
    },
  },
  star: {
    bright: true,
    track: true,
    draw: (ctx, f, frame) => {
      const rows = f.small ? SPARK_S : STAR5;
      if (!f.small) haloAt(ctx, rows, f.x, f.y, col(f.c, 'G'), frame);
      glyphAt(ctx, rows, f.x, f.y, col(f.c, 'G'));
    },
  },
  // a glowing rune (name from RUNES); dim runes have no halo
  rune: {
    bright: true,
    draw: (ctx, f, frame) => {
      const rows = RUNES[f.name] || RUNES.ka;
      if (!f.dim) haloAt(ctx, rows, f.x, f.y, col(f.c, 'C'), frame);
      glyphAt(ctx, rows, f.x, f.y, col(f.c, 'C'));
    },
  },
  // the glowing path a paw draws: older points dimmer, the tip white
  trail: {
    bright: true,
    draw: (ctx, f) => {
      const pts = f.pts || [];
      pts.forEach(([x, y], i) => {
        ctx.fillStyle = i >= pts.length - 1 ? PALETTE.W : i < pts.length / 3 ? col(f.dimC || 'c') : col(f.c, 'C');
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      });
    },
  },
  // a floating magical orb, size 0..2, tint C / V / G / O / N / L
  orb: {
    bright: true,
    track: true,
    draw: (ctx, f, frame) => {
      const rows = ORBS[Math.max(0, Math.min(2, f.size ?? 1))];
      const tint = TINTS[f.c] || TINTS.C;
      haloAt(ctx, rows, f.x, f.y, col(tint.o), frame + (f.phase || 0));
      const x0 = Math.round(f.x - rows[0].length / 2 + 0.5);
      const y0 = Math.round(f.y - rows.length / 2 + 0.5);
      fillPixels(ctx, rows, x0, y0, (ch) => col(tint[ch]));
    },
  },
  // a pixel-smoke puff, frame 0..3 (grows, then thins out)
  smoke: {
    draw: (ctx, f) => {
      const fr = Math.max(0, Math.min(3, f.frame || 0));
      const r = [2, 3, 4, 4.5][fr];
      const keep = [1, 0.95, 0.7, 0.4][fr];
      for (let y = -5; y <= 5; y++) {
        for (let x = -5; x <= 5; x++) {
          const d = Math.hypot(x, y * 1.15);
          if (d > r) continue;
          const h = ((x * 73856093) ^ (y * 19349663) ^ (fr * 83492791)) >>> 0;
          if ((h % 100) / 100 > keep) continue;
          ctx.fillStyle = d < r * 0.45 ? PALETTE.p : d < r * 0.8 ? PALETTE.S : PALETTE.q;
          ctx.fillRect(Math.round(f.x + x), Math.round(f.y + y), 1, 1);
        }
      }
    },
  },
  // a small dream symbol above the sleeping head
  dream: {
    draw: (ctx, f) => {
      const [rows, c] = DREAMS[f.name] || DREAMS.star;
      glyphAt(ctx, rows, f.x, f.y, col(f.c || c));
    },
  },
  // a music note (n: 0 single, 1 double)
  note: { draw: (ctx, f) => glyphAt(ctx, NOTES[f.n ? 1 : 0], f.x, f.y, col(f.c, 'C')) },
  text: { draw: (ctx, f) => drawText(ctx, f.text, Math.round(f.x - textWidth(f.text) / 2), Math.round(f.y - 2), col(f.c, 'C')) },
  glyph: {
    bright: true,
    draw: (ctx, f) => {
      const frames = GLYPHS[f.name];
      if (frames) {
        const rows = frames[(f.frame || 0) % frames.length];
        fillPixels(ctx, rows, Math.round(f.x - rows[0].length / 2), Math.round(f.y - rows.length / 2), paletteColor);
      }
    },
  },
  // a small object held or examined (box / gem / disk)
  obj: {
    track: true,
    draw: (ctx, f) => {
      const rows = OBJECTS[f.name] || OBJECTS.gem;
      fillPixels(ctx, rows, Math.round(f.x - rows[0].length / 2), Math.round(f.y - rows.length / 2), paletteColor);
    },
  },
  // a loose page (frame 0 flat, 1 fluttering)
  page: {
    track: true,
    draw: (ctx, f) => {
      const rows = PAGE[(f.frame || 0) % 2];
      fillPixels(ctx, rows, Math.round(f.x - 2), Math.round(f.y - 2), paletteColor);
    },
  },
  // a dotted circle of light (radius r), turning with `phase`
  ring: {
    bright: true,
    draw: (ctx, f) => {
      const r = f.r || 4;
      const n = Math.max(6, Math.round(r * 3));
      ctx.fillStyle = col(f.c, 'C');
      for (let i = 0; i < n; i++) {
        if ((i + (f.phase || 0)) % 3 === 2) continue;
        const a = (i / n) * Math.PI * 2;
        ctx.fillRect(Math.round(f.x + Math.cos(a) * r), Math.round(f.y + Math.sin(a) * r * (f.flat ?? 1)), 1, 1);
      }
    },
  },
};

function drawFx(ctx, fx, back, stressed, frame) {
  if (!fx) return;
  for (const f of Object.values(fx)) {
    if (!f || !!f.back !== back || (stressed && !f.safe)) continue;
    const kind = FX_KINDS[f.kind];
    if (!kind) continue;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, f.a ?? 1));
    try {
      kind.draw(ctx, f, frame);
    } finally {
      ctx.restore();
    }
  }
}

// The first effect of a kind the pupils react to.
function fxWith(fx, flag) {
  if (!fx) return null;
  for (const f of Object.values(fx)) if (f && FX_KINDS[f.kind]?.[flag]) return f;
  return null;
}

/*
 * Screen-space centre of a raised forepaw while sitting (for an effect that
 * rides on the paw: a rune, a spark, a held object). side 'l' | 'r'; hy is
 * the head's row (4 at rest, 6 with the eyes lowered).
 */
export function pawSpot(level, side = 'l', hy = 4) {
  const at = PAW_AT[level];
  if (!at) return [28, 50];
  const [x, y] = at(HX, hy);
  return [side === 'l' ? x : 55 - x, y];
}

/* ------------------------------------------------------------------ */
/* Cat composition                                                     */
/* ------------------------------------------------------------------ */

function buildCat(p) {
  const cat = makeGrid();
  const over = makeGrid();
  const poseName = POSES[p.pose] ? p.pose : 'sit';
  const pose = POSES[poseName];
  const stand = poseName === 'stand';
  const upright = pose.upright !== undefined;
  const stressed = p.mood === 'stressed';
  const lowered = p.book != null || p.eyes === 'down' || (p.eyes === 'closed' && !stand);
  const walkBob = upright && p.legs !== 0 ? (p.legs === 1 ? 0 : 1) : p.frame % 2;

  const hx = HX + p.lean + (stressed ? (p.frame % 2 ? -1 : 1) : 0);
  const droop = stressed ? 0 : p.droop || 0;
  const hy = pose.hy + walkBob + (lowered ? 2 : 0) + droop + (stressed ? 1 : 0);

  // tail (behind), torso, head, then what lies in front of it
  const tail = stressed ? null : p.tail;
  const sway =
    stressed || tail === 'swish' ? (p.frame % 2 ? 2 : -1) : tail === 'still' ? 0 : p.frame % 3 === 2 ? 1 : 0;
  if (pose.tail) drawTail(cat, pose.tail[0], pose.tail[1] - (tail === 'up' ? 2 : 0), sway);

  // a raised paw while standing lifts that leg off the floor
  const omit = upright ? `${p.pawL ? 'L' : ''}${p.pawR ? 'R' : ''}` : '';
  pose.torso(cat, p, omit);

  drawHead(cat, p, hx, hy);
  drawEars(cat, stressed ? null : p.ears, hx, hy);
  if (pose.front) pose.front(cat, p, sway);
  if (!pose.lying && poseName !== 'stretch') drawForepaws(cat, p, hx, hy, pose);
  drawWhiskers(over, hx, hy, stressed, p.frame % 2);

  const shadow = LIGHTING.shadow;
  const footY = pose.shadow === 'lie' ? shadow.lieY : pose.shadow === 'stand' ? shadow.standY : shadow.sitY;
  const feet = pose.shadow === 'lie' ? shadow.lieFeet : pose.shadow === 'stand' ? shadow.standFeet : shadow.sitFeet;
  // cues ride above the head when it is low (lying, head down)
  const cueY = pose.lying || poseName === 'low' ? Math.max(0, hy - 7) : 0;
  return { cat, over, hx, hy, footY, feet, cueY };
}

// Worn and held items render through the pet's vanity registry, after the
// lighting passes, using the head anchor of this frame.
function drawProps(ctx, p, hx, hy, vanity) {
  if (!vanity) return;
  vanity.draw(ctx, { ...p, hx, hy }, { fillPixels, colorFor: paletteColor });
}

/* ------------------------------------------------------------------ */
/* Compose: mirror, fragment, glitch                                   */
/* ------------------------------------------------------------------ */

let scratch = null;

function layers() {
  if (!scratch) {
    const mk = () => {
      const cv = document.createElement('canvas');
      cv.width = SPRITE_W;
      cv.height = SPRITE_H;
      return cv;
    };
    const a = mk();
    const b = mk();
    scratch = { a, ac: a.getContext('2d'), b, bc: b.getContext('2d') };
  }
  return scratch;
}

const STRESS_SHIFTS = [
  [[10, 18, 1], [19, 28, -1], [30, 40, 2], [48, 56, -1]],
  [[10, 18, -1], [19, 28, 1], [30, 40, -2], [41, 47, 1], [48, 56, 1]],
];

const GLITCH_SHIFTS = {
  1: [[24, 28, 2]],
  2: [[10, 16, -3], [44, 48, 2]],
  3: [[30, 34, -4], [50, 54, 3]],
};

function shiftTable(plan) {
  const t = new Array(SPRITE_H).fill(0);
  for (const [y0, y1, dx] of plan) for (let y = y0; y <= y1; y++) t[y] = dx;
  return t;
}

function paintGrid(ctx, g) {
  for (let y = 0; y < SPRITE_H; y++) {
    for (let x = 0; x < SPRITE_W; x++) {
      const ch = g[y][x];
      if (ch === '.') continue;
      ctx.fillStyle = PALETTE[ch];
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

/*
 * p: { mood, gaze, eyes, mouth, legs, pose, lean, facing, cue, item,
 *      book, crown, crownLift, coin, droop, glitch, frame, light,
 *      pawL, pawR, ears, tail, focus, pupils, bookPaw, bookShift, fx }
 * vanity: the pet's vanity registry (worn items).
 * The caller's ctx is a SPRITE_W x SPRITE_H canvas context. The base art
 * has its tail on the right (as in the concept art); facing > 0 mirrors it.
 */
export function renderSprite(ctx, p, vanity) {
  const { a, ac, b, bc } = layers();
  const flip = p.facing > 0;
  const stressed = p.mood === 'stressed';
  const light = Math.max(0, Math.min(2, p.light ?? 1));

  // gaze, lean, paws, ears and the book's shift are screen-space; the base
  // art is unmirrored
  const q = {
    ...p,
    gaze: flip ? { l: 'r', r: 'l' }[p.gaze] || p.gaze : p.gaze,
    lean: flip ? -(p.lean || 0) : p.lean || 0,
    pawL: flip ? p.pawR : p.pawL,
    pawR: flip ? p.pawL : p.pawR,
    ears: flip ? { flickL: 'flickR', flickR: 'flickL' }[p.ears] || p.ears : p.ears,
    bookShift: flip ? -(p.bookShift || 0) : p.bookShift || 0,
  };

  // pupil size (eased per canvas) and the watched thing's x in base space:
  // a tracked item, else the behavior's focus point, else a tracked effect
  const kind = eyeKind(q);
  q.pupil = easePupil(ctx, kind, pupilTarget(q, kind, light));
  const it = p.item;
  const tracked = fxWith(p.fx, 'track');
  if (it && TRACKED_ITEMS.has(it.kind) && typeof it.x === 'number') {
    q.focusX = flip ? SPRITE_W - 2 - it.x : it.x + 1;
  } else if (typeof p.focus === 'number') {
    q.focusX = flip ? SPRITE_W - 1 - p.focus : p.focus;
  } else if (tracked && typeof tracked.x === 'number') {
    q.focusX = flip ? SPRITE_W - 1 - tracked.x : tracked.x;
  }

  const { cat, over, hx, hy, footY, feet, cueY } = buildCat(q);
  const lit = rimLight(cat, light);
  const under = makeGrid();
  drawUnder(under, lit, light, footY, feet[0], feet[1]);

  ac.clearRect(0, 0, SPRITE_W, SPRITE_H);
  paintGrid(ac, under);
  paintGrid(ac, lit);
  paintGrid(ac, over);
  drawProps(ac, q, hx, hy, vanity);

  bc.clearRect(0, 0, SPRITE_W, SPRITE_H);
  bc.save();
  if (flip) {
    bc.translate(SPRITE_W, 0);
    bc.scale(-1, 1);
  }
  bc.drawImage(a, 0, 0);
  bc.restore();

  ctx.clearRect(0, 0, SPRITE_W, SPRITE_H);

  // effects behind the cat (an orbiting star passing behind it...)
  drawFx(ctx, p.fx, true, stressed, p.frame || 0);

  const plan = [];
  if (stressed) plan.push(...STRESS_SHIFTS[p.frame % 2]);
  if (p.glitch && GLITCH_SHIFTS[p.glitch]) plan.push(...GLITCH_SHIFTS[p.glitch]);
  const shifts = shiftTable(plan);

  // cyan ghost for the glitch
  if (p.glitch) {
    ac.clearRect(0, 0, SPRITE_W, SPRITE_H);
    ac.drawImage(b, 0, 0);
    ac.globalCompositeOperation = 'source-in';
    ac.fillStyle = PALETTE.C;
    ac.fillRect(0, 0, SPRITE_W, SPRITE_H);
    ac.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.32;
    ctx.drawImage(a, 2, 0);
    ctx.globalAlpha = 1;
  }

  for (let y = 0; y < SPRITE_H; y++) {
    ctx.drawImage(b, 0, y, SPRITE_W, 1, shifts[y], y, SPRITE_W, 1);
  }

  if (stressed) {
    // cracks: sparse missing pixels through the fur
    for (let y = 6; y < 57; y++) {
      for (let x = 8; x < 48; x++) {
        if ((x * 7 + y * 13 + (p.frame % 2) * 5) % 37 === 0) ctx.clearRect(x, y, 1, 1);
      }
    }

    const f = p.frame % 2;
    fillPixels(ctx, DROP, f ? 5 : 8, f ? 9 : 5, paletteColor);
    fillPixels(ctx, DROP, f ? 49 : 47, f ? 5 : 11, paletteColor);
    drawText(ctx, f ? '?' : '!', 0, f ? 22 : 18, PALETTE.R);
    drawText(ctx, f ? 'X' : '?', 52, f ? 16 : 20, PALETTE.R);
  }

  // unmirrored overlays: cue text and held items
  if (p.cue) {
    const w = textWidth(p.cue);
    drawText(ctx, p.cue, stressed ? Math.round((SPRITE_W - w) / 2) : SPRITE_W - 1 - w, stressed ? 0 : cueY, stressed ? PALETTE.R : PALETTE.C);
  }
  drawItem(ctx, p.item, stressed, p.frame || 0);
  drawFx(ctx, p.fx, false, stressed, p.frame || 0);
}
