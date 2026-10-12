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
 *   TAIL     : one shaded grid with a small sway
 *   FACE     : eye / pupil / nose / mouth overlays (the expressions)
 *   PROPS    : coin, crown, book, objects, glyphs, pixel font
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
  if (kind === 'wide') return 3;
  if (kind === 'panic') return 2; // tense, but the pale panic eyes stay pale
  if (kind === 'down' || p.mouth === 'think') return 0;
  const item = p.item?.kind;
  if (item === 'glyph' || item === 'sparkle') return 0;
  if (TRACKED_ITEMS.has(item)) return 2;
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

  for (const [x, y, ch] of W_MOUTH) put(g, hx + x, hy + y, ch);
  if (mouth === 'happy') blit(g, SMILE, hx + 14, hy + 25);
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

// Standing: used by the walk cycle. legs 1 lifts the left paw, 2 the right.
function drawStandTorso(g, legs) {
  blitHalf(g, STAND_HALF, 30);

  const leg = (side, lifted) => {
    const set = side === 'L' ? putL : putR;
    const end = lifted ? 23 : 25;
    for (let t = 14; t <= end; t++) {
      for (let c = 8; c <= 12; c++) set(g, c, 30 + t, c === 8 ? '3' : c === 12 ? '1' : '2');
    }
    set(g, 10, 30 + 17, '3'); // fur clump on the foreleg
    set(g, 11, 30 + 20, '1');
    if (lifted) {
      // paw tucked up and forward
      for (let c = 8; c <= 13; c++) set(g, c, 30 + 24, c >= 9 && c <= 12 ? '3' : '2');
      for (let c = 9; c <= 13; c++) set(g, c, 30 + 25, c === 11 ? '0' : '1');
    } else {
      // planted paw: knuckles, then toes and sole
      for (let c = 7; c <= 12; c++) set(g, c, 30 + 26, c === 7 ? '2' : c === 12 ? '1' : '3');
      for (let c = 7; c <= 12; c++) set(g, c, 30 + 27, c === 9 || c === 11 ? '1' : '2');
    }
  };

  leg('L', legs === 1);
  leg('R', legs === 2);

  for (let t = 14; t <= 27; t++) for (let c = 13; c <= 15; c++) sym(g, c, 30 + t, '0');
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

export function drawBook(ctx, frame) {
  const rows = bookRows(frame);
  fillPixels(ctx, rows, 16, 56 - rows.length, paletteColor);
  // paws resting on the book
  fillPixels(ctx, ['22222', '23332', '.222.'], 17, 52, paletteColor);
  fillPixels(ctx, ['22222', '23332', '.222.'], 34, 52, paletteColor);
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
/* Cat composition                                                     */
/* ------------------------------------------------------------------ */

function buildCat(p) {
  const cat = makeGrid();
  const over = makeGrid();
  const stand = p.pose === 'stand';
  const stretch = p.pose === 'stretch';
  const stressed = p.mood === 'stressed';
  const lowered = p.book != null || p.eyes === 'down' || (p.eyes === 'closed' && !stand);
  const walkBob = stand && p.legs !== 0 ? (p.legs === 1 ? 0 : 1) : p.frame % 2;

  const hx = HX + p.lean + (stressed ? (p.frame % 2 ? -1 : 1) : 0);
  const droop = stressed ? 0 : p.droop || 0;
  const hy =
    4 + (stand ? -1 : 0) + walkBob + (stretch ? 5 : 0) + (lowered ? 2 : 0) + droop + (stressed ? 1 : 0);

  // tail (behind), torso, head
  const sway = stressed ? (p.frame % 2 ? 2 : -1) : p.frame % 3 === 2 ? 1 : 0;
  if (stand) drawTail(cat, 38, 31, sway);
  else drawTail(cat, 42, 28, sway);

  if (stand) drawStandTorso(cat, p.legs);
  else drawSitTorso(cat);

  if (stretch) {
    // paws reach toward the viewer
    for (let c = 4; c <= 13; c++) {
      sym(cat, c, 54, '2');
      sym(cat, c, 55, c % 3 ? '3' : '1');
    }
  }

  drawHead(cat, p, hx, hy);
  drawWhiskers(over, hx, hy, stressed, p.frame % 2);

  return { cat, over, hx, hy, footY: stand ? LIGHTING.shadow.standY : LIGHTING.shadow.sitY };
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
 *      book, crown, crownLift, coin, droop, glitch, frame, light }
 * vanity: the pet's vanity registry (worn items).
 * The caller's ctx is a SPRITE_W x SPRITE_H canvas context. The base art
 * has its tail on the right (as in the concept art); facing > 0 mirrors it.
 */
export function renderSprite(ctx, p, vanity) {
  const { a, ac, b, bc } = layers();
  const flip = p.facing > 0;
  const stressed = p.mood === 'stressed';
  const light = Math.max(0, Math.min(2, p.light ?? 1));

  // gaze / lean are screen-space; the base art is unmirrored
  const q = {
    ...p,
    gaze: flip ? { l: 'r', r: 'l' }[p.gaze] || p.gaze : p.gaze,
    lean: flip ? -p.lean : p.lean,
  };

  // pupil size (eased per canvas) and the watched item's x in base space
  const kind = eyeKind(q);
  q.pupil = easePupil(ctx, kind, pupilTarget(q, kind, light));
  const it = p.item;
  if (it && TRACKED_ITEMS.has(it.kind) && typeof it.x === 'number') {
    q.focusX = flip ? SPRITE_W - 2 - it.x : it.x + 1;
  }

  const { cat, over, hx, hy, footY } = buildCat(q);
  const lit = rimLight(cat, light);
  const under = makeGrid();
  const stand = q.pose === 'stand';
  const [f0, f1] = stand ? LIGHTING.shadow.standFeet : LIGHTING.shadow.sitFeet;
  drawUnder(under, lit, light, footY, f0, f1);

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
    drawText(ctx, p.cue, stressed ? Math.round((SPRITE_W - w) / 2) : SPRITE_W - 1 - w, 0, stressed ? PALETTE.R : PALETTE.C);
  }
  drawItem(ctx, p.item, stressed, p.frame || 0);
}
