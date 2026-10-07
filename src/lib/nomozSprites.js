/*
 * NOMOZ.EXE — 16-bit pixel-art sprite of the solid-black tabby.
 *
 * The character is the attached concept art (design.md): a front-facing,
 * sitting solid-black tabby with pointed ears (lighter inner ear), big
 * round black eyes with a bright vertical highlight, a small grey nose,
 * long whiskers, an open mouth, a lighter chest bib, a haunch / front-leg
 * stack and a tail curling up on one side. Every pose is built from the
 * SAME shared parts so the cat never changes design between frames:
 *
 *   HEAD     : one mirrored half-grid (ears, forehead stripes, cheek stripes)
 *   TORSO    : sitting (the reference pose) and standing (walk cycle)
 *   TAIL     : one grid with a small sway
 *   FACE     : eye / nose / mouth overlays (the expressions)
 *   PROPS    : crown, $ coin, book, objects, pixel font
 *
 * VISIBILITY. The cat is predominantly black, so it is revealed by light
 * rather than by recolouring it: a directional rim light on the upper-left
 * edges, a dim edge on the right, a dithered backlight aura just outside
 * the silhouette, a lit floor pool with a black contact shadow beneath
 * the paws, and near-black internal planes (bib, haunch, stripes). All of
 * it is computed per frame, so every pose gets it. Depth changes the rim
 * strength (`light`), never the fur colour.
 *
 * Everything is hard pixels (no smoothing); the canvas is scaled with
 * image-rendering: pixelated.
 */

export const SPRITE_W = 56;
export const SPRITE_H = 60;

const PALETTE = {
  0: '#000000', // ink / deepest fur
  1: '#0a0c0f', // fur shadow, tabby stripes
  2: '#13161a', // fur base
  3: '#1c2025', // fur plane
  4: '#292e34', // bib, inner ear, light plane
  5: '#3b424a', // rim light
  6: '#56606a', // rim light, corners
  E: '#e6edf2', // eye highlight
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

// Left half (16 cols), centre at the right edge. Ears rows 0-8, forehead
// tabby stripes rows 8-10, cheek stripes rows 14-16, then a wide, rounded
// cat face (rows 19-26) with a short chin — no long jaw, no light muzzle patch.
const HEAD_HALF = [
  '.....22.........',
  '....2222........',
  '...22222........',
  '...23422........',
  '..2234422.......',
  '..2234442222....',
  '..22344422222...',
  '.222344222222222',
  '2222222222212121',
  '2222222222212121',
  '2222222222222121',
  '2222222222222222',
  '2222222222222222',
  '2222222222222222',
  '2111222222222222',
  '2222222222222222',
  '2211122222222222',
  '2222222222222222',
  '2222222222222222',
  '2222222222222222',
  '2222222222222222',
  '.222222222222222',
  '..22222222222222',
  '...2222222222222',
  '....222222222222',
  '......2222222222',
  '.........2222222',
];

const HEAD = HEAD_HALF.map((r) => r + [...r].reverse().join(''));

// 6x6 eye templates; '.' leaves the fur showing.
const EYES = {
  open: ['.0000.', '00EE00', '00EE00', '00ee00', '000000', '.0000.'],
  wide: ['.0000.', '0EEE00', '0EEe00', '0EEe00', '00ee00', '.0000.'],
  closed: ['......', '......', '......', '5....5', '.5555.', '......'],
  happy: ['......', '..ee..', '.e..e.', 'e....e', '......', '......'],
  down: ['......', '......', '.5555.', '000000', '00ee00', '.0000.'],
  panic: ['.0000.', '0eeee0', 'eeeeee', 'ee00ee', 'ee00ee', '.eeee.'],
};

// Mouth overlays in head-local coordinates: a small 'w' under the nose.
// Only the happy and panic states open it, and only a little.
const W_MOUTH = [
  [15, 22], [16, 22],
  [15, 23], [16, 23],
  [12, 23], [19, 23],
  [13, 24], [14, 24], [17, 24], [18, 24],
];

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

  blit(g, HEAD, hx, hy);

  // eyes
  const dx = p.gaze === 'l' ? -1 : p.gaze === 'r' ? 1 : 0;
  const dy = p.gaze === 'u' ? -2 : 0;
  const kind = stressed
    ? 'panic'
    : content
    ? p.eyes === 'blink' || p.eyes === 'closed'
      ? 'closed'
      : 'happy'
    : p.eyes === 'blink'
    ? 'closed'
    : EYES[p.eyes]
    ? p.eyes
    : 'open';
  drawEye(g, EYES[kind], hx + 6 + dx, hy + 12 + dy);
  drawEye(g, EYES[kind], hx + 20 + dx, hy + 12 + dy);

  // nose
  blit(g, ['5555', '.55.'], hx + 14, hy + 20);

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

  for (const [x, y] of W_MOUTH) put(g, hx + x, hy + y, '0');
  if (mouth === 'happy') blit(g, SMILE, hx + 14, hy + 25);
}

function drawWhiskers(g, hx, hy, stressed, f) {
  const lift = stressed ? -1 : 0;
  const mirror = (x) => 2 * hx + 31 - x;
  const line = (xs, y) => {
    for (const x of xs) {
      put(g, x, y, '4');
      put(g, mirror(x), y, '4');
    }
  };
  const run = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

  line(run(hx - 8, hx - 1), hy + 19 + lift - (stressed && f ? 1 : 0));
  line(run(hx - 7, hx - 1), hy + 22 + lift);
}

/* ------------------------------------------------------------------ */
/* Torso, legs, tail                                                   */
/* ------------------------------------------------------------------ */

// Left edge column (half-grid) per torso row t0..t25 (y = 30 + t).
const SIT_L = [11, 11, 9, 8, 7, 6, 5, 5, 5, 5, 5, 5, 4, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1];
const STAND_L = [11, 11, 9, 8, 7, 7, 6, 6, 6, 6, 6, 6, 6, 6];

const BIB_W = [6, 6, 5, 5, 4, 3, 2, 1, 1]; // rows t3..t11

function drawChest(g, rows, ty0) {
  for (let t = 0; t < rows.length; t++) {
    for (let c = rows[t]; c <= 15; c++) sym(g, c, ty0 + t, '2');
  }

  // lighter chest bib, tapering to a point
  BIB_W.forEach((w, i) => {
    const y = ty0 + 3 + i;
    for (let c = 16 - w; c <= 15; c++) sym(g, c, y, '4');
    sym(g, 15 - w, y, '3');
  });

  // flank tabby stripes
  for (const [c, t] of [[6, 5], [6, 6], [7, 7], [7, 8], [8, 9], [8, 10], [9, 11]]) {
    sym(g, c, ty0 + t, '1');
  }
}

// Sitting: the concept art's pose (haunches, two front legs, black gap).
function drawSitTorso(g) {
  drawChest(g, SIT_L.slice(0, 12), 30);

  for (let t = 12; t < SIT_L.length; t++) {
    for (let c = SIT_L[t]; c <= 15; c++) sym(g, c, 30 + t, c >= 14 && t >= 14 ? '0' : '2');
  }

  for (let t = 14; t <= 22; t++) sym(g, 8, 30 + t, '1'); // haunch / leg seam
  for (let t = 14; t <= 16; t++) for (let c = 3; c <= 5; c++) sym(g, c, 30 + t, '3');
  for (const [c, t] of [[3, 17], [4, 17], [3, 18]]) sym(g, c, 30 + t, '3');
  for (let t = 14; t <= 21; t++) sym(g, 9, 30 + t, '3'); // leg light
  for (let t = 14; t <= 23; t++) sym(g, 13, 30 + t, '1'); // leg inner shade
  for (let c = 9; c <= 13; c++) sym(g, c, 30 + 23, '3'); // paw top
  for (let c = 3; c <= 6; c++) sym(g, c, 30 + 23, '3'); // hind paw
  for (let c = 8; c <= 13; c++) sym(g, c, 30 + 25, '1'); // sole
  for (const c of [10, 12]) sym(g, c, 30 + 24, '1'); // toe seams
}

// Standing: used by the walk cycle. legs 1 lifts the left paw, 2 the right.
function drawStandTorso(g, legs) {
  drawChest(g, STAND_L, 30);

  const leg = (side, lifted) => {
    const set = side === 'L' ? putL : putR;
    const end = lifted ? 23 : 27;
    for (let t = 14; t <= end; t++) {
      for (let c = 8; c <= 12; c++) set(g, c, 30 + t, c === 8 ? '3' : c === 12 ? '1' : '2');
    }
    if (lifted) {
      // paw tucked up and forward
      for (let c = 8; c <= 13; c++) set(g, c, 30 + 24, '2');
      for (let c = 9; c <= 13; c++) set(g, c, 30 + 25, '1');
    } else {
      for (let c = 7; c <= 12; c++) set(g, c, 30 + 26, '2');
      for (let c = 7; c <= 12; c++) set(g, c, 30 + 27, c % 2 ? '1' : '2');
    }
  };

  leg('L', legs === 1);
  leg('R', legs === 2);

  for (let t = 14; t <= 27; t++) for (let c = 13; c <= 15; c++) sym(g, c, 30 + t, '0');
  for (let t = 12; t <= 13; t++) for (let c = 6; c <= 12; c++) sym(g, c, 30 + t, '2');
}

const TAIL = [
  '......222.',
  '.....22222',
  '.....22222',
  '.....22222',
  '.....22222',
  '.....22222',
  '.....22222',
  '.....22222',
  '.....22222',
  '.....22222',
  '.....22222',
  '.....22222',
  '.....22222',
  '.....22222',
  '.....22222',
  '.....22222',
  '....222222',
  '...2222222',
  '..22222222',
  '.222222222',
  '2222222222',
  '2222222222',
  '2222222222',
  '222222222.',
  '22222222..',
  '2222222...',
];

function drawTail(g, x0, y0, sway) {
  const rows = TAIL.map((r) => r.split(''));

  for (let r = 1; r <= 14; r++) {
    rows[r][5] = '3';
    rows[r][9] = r > 2 ? '1' : '2';
  }
  for (const r of [4, 7, 10, 13]) for (let c = 5; c <= 9; c++) rows[r][c] = '1';
  rows[0][6] = '3';

  for (let r = 0; r < rows.length; r++) {
    // the tip sways; the base stays attached
    const shift = r < 10 ? sway : r < 14 ? Math.round(sway / 2) : 0;
    for (let c = 0; c < rows[r].length; c++) put(g, x0 + c + shift, y0 + r, rows[r][c]);
  }
}

/* ------------------------------------------------------------------ */
/* Visibility: rim light, aura, floor pool                             */
/* ------------------------------------------------------------------ */

// [top/left, corner, right] rim levels by depth light 0..2
const RIM = [
  ['4', '4', '3'],
  ['5', '5', '4'],
  ['5', '6', '4'],
];

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
  // floor pool
  const cx = 27.5;
  const cy = footY + 1.5;
  for (let y = footY - 2; y < SPRITE_H; y++) {
    for (let x = 0; x < SPRITE_W; x++) {
      const nx = (x - cx) / 23;
      const ny = (y - cy) / 3.6;
      const d = nx * nx + ny * ny;
      if (d <= 1 && (d < 0.45 || (x + y) % 2 === 0)) under[y][x] = 'f';
    }
  }

  // contact shadow
  for (let x = footX0; x <= footX1; x++) {
    under[footY][x] = '0';
    if (x > footX0 + 1 && x < footX1 - 1) under[footY + 1][x] = '0';
  }

  if (light < 1) return;

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

const CROWN = ['G..GG..G', 'GG.GG.GG', 'GGGGGGGG', 'gggggggg'];

const COIN = ['..GGGG..', '.GGGGGg.', 'GGGGGGGg', 'GGGGGGGg', 'GGGGGGGg', 'GGGGGGGg', '.GGGGGg.', '..gggg..'];

const OBJECTS = {
  box: ['uuuuuuu', 'uvvvvvu', 'uvuuuvu', 'uvuuuvu', 'uvvvvvu', 'uuuuuuu'],
  gem: ['..CCC..', '.CWCCc.', 'CWCCCCc', 'cCCCCcc', '.cCCcc.', '..ccc..', '...c...'],
  disk: ['qqqqqqq', 'qpppppq', 'qpppppq', 'qqqqqqq', 'qmmmmmq', 'qmuummq', 'qqqqqqq'],
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

export function textWidth(text) {
  return text === '<3' ? 5 : text.length * 4 - 1;
}

// Draws pixel glyphs straight onto a canvas context.
function fillPixels(ctx, rows, x0, y0, colorFor) {
  for (let y = 0; y < rows.length; y++) {
    for (let i = 0; i < rows[y].length; i++) {
      const ch = rows[y][i];
      if (ch === '.' || ch === ' ') continue;
      ctx.fillStyle = colorFor(ch);
      ctx.fillRect(x0 + i, y0 + y, 1, 1);
    }
  }
}

const paletteColor = (ch) => PALETTE[ch];

function drawText(ctx, text, x, y, color) {
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

function drawCoin(ctx, x, y) {
  fillPixels(ctx, COIN, x, y, paletteColor);
  fillPixels(ctx, FONT.$, x + 2, y + 1, () => PALETTE.k);
  ctx.fillStyle = PALETTE.k;
  ctx.fillRect(x + 3, y, 2, 1);
  ctx.fillRect(x + 3, y + 7, 2, 1);
}

function drawItem(ctx, item) {
  if (!item) return;

  switch (item.kind) {
    case 'text':
      drawText(ctx, item.text, item.x, item.y, PALETTE.C);
      break;
    case 'block':
      ctx.fillStyle = PALETTE.C;
      ctx.fillRect(item.x, item.y, 2, 2);
      break;
    case 'obj':
      fillPixels(ctx, OBJECTS[item.name], item.x, item.y, paletteColor);
      break;
    case 'crown':
      fillPixels(ctx, CROWN, item.x, item.y, paletteColor);
      break;
    case 'coin':
      drawCoin(ctx, item.x, item.y);
      if (item.spark) fillPixels(ctx, SPARK, item.x + 6, item.y - 5, paletteColor);
      break;
    case 'sparkle':
      fillPixels(ctx, SPARK, item.x, item.y, paletteColor);
      break;
    default:
  }
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
  const lowered = p.book !== null || p.eyes === 'down' || (p.eyes === 'closed' && !stand);
  const walkBob = stand && p.legs !== 0 ? (p.legs === 1 ? 0 : 1) : p.frame % 2;

  const hx = HX + p.lean + (stressed ? (p.frame % 2 ? -1 : 1) : 0);
  const hy = 4 + (stand ? -1 : 0) + walkBob + (stretch ? 5 : 0) + (lowered ? 2 : 0) + (stressed ? 1 : 0);

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

  return { cat, over, hx, hy, footY: stand ? 58 : 56 };
}

// Chest charm, crown, book: drawn after the lighting passes.
function drawProps(ctx, p, hx, hy) {
  const content = p.mood === 'content';
  const stressed = p.mood === 'stressed';

  if (content || stressed) drawCoin(ctx, 24, 34);
  if (content) fillPixels(ctx, CROWN, hx + 12 + p.crown, hy + 3, paletteColor);

  if (p.book !== null && p.book !== undefined && p.pose !== 'stand') {
    const rows = bookRows(p.book);
    fillPixels(ctx, rows, 16, 56 - rows.length, paletteColor);
    // paws resting on the book
    fillPixels(ctx, ['22222', '23332', '.222.'], 17, 52, paletteColor);
    fillPixels(ctx, ['22222', '23332', '.222.'], 34, 52, paletteColor);
  }
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
 *      book, crown, glitch, frame, light }
 * The caller's ctx is a SPRITE_W x SPRITE_H canvas context. The base art
 * has its tail on the right (as in the concept art); facing > 0 mirrors it.
 */
export function renderSprite(ctx, p) {
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

  const { cat, over, hx, hy, footY } = buildCat(q);
  const lit = rimLight(cat, light);
  const under = makeGrid();
  drawUnder(under, lit, light, footY, q.pose === 'stand' ? 16 : 14, q.pose === 'stand' ? 39 : 41);

  ac.clearRect(0, 0, SPRITE_W, SPRITE_H);
  paintGrid(ac, under);
  paintGrid(ac, lit);
  paintGrid(ac, over);
  drawProps(ac, q, hx, hy);

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
  drawItem(ctx, p.item);
}
