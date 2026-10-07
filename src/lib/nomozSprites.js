/*
 * NOMOZ.EXE — 32-bit pixel-art sprite.
 *
 * A 32x32 logical pixel canvas, drawn from small hand-authored pixel
 * grids (strings, one char per pixel, '.' = transparent) over a restrained
 * palette. Frames are organised by view and part rather than as whole
 * pre-drawn images, so every expression, pose, prop and mood reuses the
 * same pieces:
 *
 *   FRONT  : sitting / standing / stretching, facing the viewer
 *   SIDE   : the profile walk cycle (two leg frames), used while moving
 *   PROPS  : crown, $ coin, book (3 page frames), objects, pixel font
 *
 * Both views face right and are mirrored for left. The stressed state is
 * the SAME cat, fragmented after drawing (row slips, cracks, panicked
 * eyes, sweat, marks). Nothing is smoothed: every edge is a hard pixel,
 * and the canvas is scaled with image-rendering: pixelated.
 */

export const SPRITE_SIZE = 32;

const PALETTE = {
  W: '#f4f4f4', // fur highlight
  L: '#c8c8c8', // fur
  M: '#8a8a8a', // fur shade
  D: '#4d4d4d', // deep shade
  S: '#202020', // ground shadow
  K: '#141414', // ink (eyes, mouth)
  P: '#e08fa6', // inner ear / nose
  G: '#ffd24a', // gold
  g: '#b88a1e', // gold shade
  C: '#6fe3ff', // cyber cyan
  c: '#2fa6c4', // cyan shade
  R: '#ff5a5a', // stress red
};

/* ------------------------------------------------------------------ */
/* Pixel grids                                                         */
/* ------------------------------------------------------------------ */

const HEAD_FRONT = [
  '..WL........LW..',
  '.WLPL......LPLM.',
  '.WLPPL....LPPLM.',
  'WLLLLLLLLLLLLLLM',
  'WLLLLLLLLLLLLLLM',
  'WLLLLLLLLLLLLLLM',
  'WLLLLLLLLLLLLLLM',
  'WLLLLLLLLLLLLLLM',
  'WLLLLWWWWWWLLLLM',
  '.LLLLWWWWWWLLLM.',
  '..LLLLLLLLLLLM..',
  '...MMMMMMMMMM...',
];

const BODY_FRONT = [
  '..WLLLLLLLLM..',
  '.WLLLWWWWLLLM.',
  'WLLLWWWWWWLLLM',
  'WLLLWWWWWWLLLM',
  'WLLLLWWWWLLLLM',
  'WLLLLLLLLLLLLM',
  '.LLLLLLLLLLLM.',
  '.MMLLLLLLLLMM.',
];

const LEG_FRONT = ['LLM', 'LLM', 'LLM', 'WWM'];

const TAIL_FRONT = [
  ['....LW', '....LL', '....LM', '....LM', '...LLM', '..LLM.', 'LLLM..'],
  ['...LW.', '...LL.', '....LM', '....LM', '...LLM', '..LLM.', 'LLLM..'],
];

const HEAD_SIDE = [
  '..WL..LW....',
  '.WLPL.LPLM..',
  '.LLLLLLLLM..',
  'LLLLLLLLLLM.',
  'LLLLLLLLLLLM',
  'LLLLLLLLWWWM',
  'LLLLLLLWWWWM',
  '.LLLLLLLLLM.',
  '..MLLLLLMM..',
  '...MMMMM....',
];

const BODY_SIDE = [
  '..WLLLLLLLLM..',
  '.WLLLLLLLLLLM.',
  'WLLLLLLLLLLLLM',
  'WLLLLLLLLLLLLM',
  'WLLLLLLLLLLLLM',
  'WLLLLLLLLLLLLM',
  '.LLLLLLLLLLLM.',
  '..MMMMMMMMMM..',
];

const LEG_SIDE_NEAR = ['LM', 'LM', 'LM', 'LM', 'WM'];
const LEG_SIDE_FAR = ['MD', 'MD', 'MD', 'MD', 'MD'];

const TAIL_SIDE = [
  ['L.....', 'LL....', 'LM....', '.LM...', '.LM...', '.LM...', '.LLM..', '..LLM.', '...LLL'],
  ['.L....', '.LL...', 'LM....', '.LM...', '.LM...', '.LM...', '.LLM..', '..LLM.', '...LLL'],
];

const EYES_FRONT = {
  open: { dy: 0, rows: ['KKK', 'KWK', 'KKK'] },
  wide: { dy: -1, rows: ['.K.', 'KKK', 'KWK', 'KKK'] },
  closed: { dy: 0, rows: ['...', 'KKK', '...'] },
  happy: { dy: 0, rows: ['.K.', 'K.K', '...'] },
  down: { dy: 0, rows: ['...', 'KKK', 'KKK'] },
};

const EYE_PANIC_L = ['..K', '.K.', 'K..', '.K.', '..K'];
const EYE_PANIC_R = ['K..', '.K.', '..K', '.K.', 'K..'];

const MOUTH_FRONT = {
  idle: [[6, 9, '.KK.'], [6, 10, 'K..K']],
  happy: [[6, 9, 'K..K'], [6, 10, '.KK.']],
  rest: [[6, 10, '.KK.']],
  think: [[6, 10, 'KKKK']],
  panic: [[5, 9, 'K.K.K'], [5, 10, '.K.K.']],
};

const EYES_SIDE = {
  open: ['KW', 'KK'],
  wide: ['KK', 'KW', 'KK'],
  closed: ['..', 'KK'],
  happy: ['.K', 'K.'],
  down: ['..', 'KK'],
  panic: ['K..', '.K.', 'K..'],
};

const CROWN = ['G.GG.G', 'GGGGGG', 'gGGGGg'];

const COIN = [
  '..GKG..',
  '.GGGGGg',
  'GGGGGGg',
  'GGGGGGg',
  'GGGGGGg',
  '.GGGGgg',
  '..gKg..',
];

const BOOK = [
  [
    '.WWWWWCCWWWWW.',
    'WLLLLLCCLLLLLW',
    'WLMMLLCCLLMMLW',
    'WLLLLLCCLLLLLW',
    'WLMMLLCCLLMMLW',
    '.ccccccccccccc'.slice(0, 14),
  ],
  [
    '.WWWWWCCWWWW..',
    'WLLLLLCCLLLW..',
    'WLMMLLCCLLMW..',
    'WLLLLLCCLLLW..',
    'WLMMLLCCLLMW..',
    '.ccccccccccccc'.slice(0, 14),
  ],
  [
    '.WWWWWWCCWW...',
    'WLLLLLLCCLW...',
    'WLMMLLLCCLW...',
    'WLLLLLLCCLW...',
    'WLMMLLLCCLW...',
    '.cccccccccccc.',
  ],
];

const OBJECTS = {
  box: ['WWWWW', 'WLLLM', 'WLKLM', 'WLLLM', 'MMMMM'],
  gem: ['..C..', '.CWC.', 'CWCCc', 'cCCCc', '.ccc.'],
  disk: ['DDDDD', 'DWWWD', 'DDDDD', 'DLLLD', 'DLKLD'],
};

const DROP = ['.C', 'CC', 'CC'];
const SPARK = ['.#.', '###', '.#.'];

// 3x5 pixel font for cues and floating symbols ('#' = lit).
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

const HEART = ['.P.P.', 'PPPPP', '.PPP.', '..P..'];

/* ------------------------------------------------------------------ */
/* Drawing primitives                                                  */
/* ------------------------------------------------------------------ */

function blit(c, rows, x0, y0, { flip = false, color = null } = {}) {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.' || ch === ' ') continue;
      c.fillStyle = color || PALETTE[ch];
      c.fillRect(flip ? x0 + row.length - 1 - i : x0 + i, y0 + y, 1, 1);
    }
  }
}

const px = (c, x, y, ch) => {
  c.fillStyle = PALETTE[ch];
  c.fillRect(x, y, 1, 1);
};

export function textWidth(text) {
  return text === '<3' ? 5 : text.length * 4 - 1;
}

function drawGlyphs(c, text, x, y, color) {
  if (text === '<3') {
    blit(c, HEART, x, y);
    return;
  }

  for (let i = 0; i < text.length; i++) {
    const glyph = FONT[text[i]];
    if (!glyph) continue;
    // in "zZ" the small z sits lower than the big Z
    const dy = text === 'zZ' && i === 0 ? 2 : 0;
    blit(c, glyph.map((r) => r.replace(/#/g, 'C')), x + i * 4, y + dy, { color });
  }
}

function drawItem(c, item) {
  if (!item) return;

  switch (item.kind) {
    case 'text':
      drawGlyphs(c, item.text, item.x, item.y, PALETTE.C);
      break;
    case 'block':
      c.fillStyle = PALETTE.C;
      c.fillRect(item.x, item.y, 2, 2);
      break;
    case 'obj':
      blit(c, OBJECTS[item.name], item.x, item.y);
      break;
    case 'crown':
      blit(c, CROWN, item.x, item.y);
      break;
    case 'coin':
      blit(c, COIN, item.x, item.y);
      drawGlyphs(c, '$', item.x + 2, item.y + 1, PALETTE.K);
      if (item.spark) blit(c, SPARK, item.x + 6, item.y - 3, { color: PALETTE.W });
      break;
    case 'sparkle':
      blit(c, SPARK, item.x, item.y, { color: PALETTE.W });
      break;
    default:
  }
}

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

const gazeDx = (g) => (g === 'l' ? -1 : g === 'r' ? 1 : 0);

function drawShadow(c, wide) {
  c.fillStyle = PALETTE.S;
  c.fillRect(wide ? 6 : 8, 29, wide ? 22 : 16, 1);
  c.fillRect(wide ? 8 : 10, 30, wide ? 18 : 12, 1);
}

function drawCoin(c, x, y) {
  blit(c, COIN, x, y);
  drawGlyphs(c, '$', x + 2, y + 1, PALETTE.K);
}

function drawFront(c, p) {
  const content = p.mood === 'content';
  const stressed = p.mood === 'stressed';
  const stretch = p.pose === 'stretch';
  const bob = p.frame % 2;
  const hx = 8 + p.lean;
  const hy = 5 + bob + (stretch ? 2 : 0);

  drawShadow(c, stretch);

  // tail trails on the left (the sprite faces right; mirrored for left)
  blit(c, TAIL_FRONT[p.frame % 3 === 2 ? 1 : 0], 4, 18, { flip: true });

  // legs / seat
  if (stretch) {
    c.fillStyle = PALETTE.L;
    c.fillRect(4, 26, 24, 2);
    c.fillStyle = PALETTE.W;
    c.fillRect(4, 27, 3, 1);
    c.fillRect(25, 27, 3, 1);
  } else if (p.pose === 'sit') {
    blit(c, ['MLLLLLLLLLLLLLLM', 'MMWWLLLLLLLLWWMM'.slice(0, 16)], 8, 25);
  } else {
    blit(c, LEG_FRONT, 11, p.legs === 1 ? 24 : 25);
    blit(c, LEG_FRONT, 18, p.legs === 2 ? 24 : 25);
  }

  blit(c, BODY_FRONT, 9, stretch ? 18 : 17);
  if (content || stressed) drawCoin(c, 13, stretch ? 19 : 18);

  // head
  blit(c, HEAD_FRONT, hx, hy);

  // whiskers
  c.fillStyle = PALETTE.L;
  for (let i = 1; i <= 3; i++) {
    c.fillRect(hx - i, hy + 8, 1, 1);
    c.fillRect(hx + 15 + i, hy + 8, 1, 1);
  }
  c.fillRect(hx - 2, hy + 10, 2, 1);
  c.fillRect(hx + 16, hy + 10, 2, 1);

  // eyes
  const sx = gazeDx(p.gaze);
  const sy = p.gaze === 'u' ? -2 : 0;

  if (stressed) {
    for (const ex of [3, 10]) {
      blit(c, ['WWW', 'WWW', 'WWW', 'WWW', 'WWW'], hx + ex + sx, hy + 4);
    }
    blit(c, EYE_PANIC_L, hx + 3 + sx, hy + 4);
    blit(c, EYE_PANIC_R, hx + 10 + sx, hy + 4);
  } else {
    const kind = content
      ? p.eyes === 'blink' || p.eyes === 'closed'
        ? 'closed'
        : 'happy'
      : p.eyes === 'blink'
      ? 'closed'
      : EYES_FRONT[p.eyes]
      ? p.eyes
      : 'open';
    const e = EYES_FRONT[kind];
    blit(c, e.rows, hx + 3 + sx, hy + 5 + sy + e.dy);
    blit(c, e.rows, hx + 10 + sx, hy + 5 + sy + e.dy);
  }

  // nose + mouth
  px(c, hx + 7, hy + 8, 'P');
  px(c, hx + 8, hy + 8, 'P');
  const mouth = stressed ? 'panic' : content ? 'happy' : p.mouth;
  for (const [mx, my, row] of MOUTH_FRONT[mouth] || MOUTH_FRONT.idle) {
    blit(c, [row], hx + mx, hy + my, { color: PALETTE.K });
  }

  if (content) blit(c, CROWN, hx + 5 + p.crown, hy + 1);
}

function drawSide(c, p) {
  const content = p.mood === 'content';
  const stressed = p.mood === 'stressed';
  const a = p.legs === 1;
  const hy = 10 + (a ? 0 : 1);

  drawShadow(c, true);

  // far legs (darker), tail, body, near legs, head
  blit(c, LEG_SIDE_FAR, a ? 17 : 21, a ? 23 : 24);
  blit(c, LEG_SIDE_FAR, a ? 14 : 10, a ? 24 : 23);
  blit(c, TAIL_SIDE[a ? 0 : 1], 3, 10);
  blit(c, BODY_SIDE, 9, 16);
  blit(c, LEG_SIDE_NEAR, a ? 20 : 16, a ? 24 : 23);
  blit(c, LEG_SIDE_NEAR, a ? 9 : 13, a ? 23 : 24);

  if (content || stressed) drawCoin(c, 13, 17);

  blit(c, HEAD_SIDE, 18, hy);

  // whiskers
  c.fillStyle = PALETTE.L;
  c.fillRect(30, hy + 5, 2, 1);
  c.fillRect(30, hy + 7, 2, 1);

  // eye, nose, mouth
  const kind = stressed
    ? 'panic'
    : content
    ? p.eyes === 'blink' || p.eyes === 'closed'
      ? 'closed'
      : 'happy'
    : p.eyes === 'blink'
    ? 'closed'
    : EYES_SIDE[p.eyes]
    ? p.eyes
    : 'open';
  if (stressed) blit(c, ['WWW', 'WWW', 'WWW'], 18 + 6, hy + 3);
  blit(c, EYES_SIDE[kind], 18 + 6, hy + 3);
  px(c, 18 + 11, hy + 5, 'P');
  const mouthRow = stressed ? 'K.K' : content ? 'KK' : 'K';
  blit(c, [mouthRow], 18 + 9, hy + 7, { color: PALETTE.K });

  if (content) blit(c, CROWN, 18 + 3, hy);
}

function drawBook(c, frame) {
  blit(c, BOOK[frame], 9, 20);
}

/* ------------------------------------------------------------------ */
/* Compose: mirror, fragment, glitch                                   */
/* ------------------------------------------------------------------ */

let scratch = null;

function layers() {
  if (!scratch) {
    const mk = () => {
      const cv = document.createElement('canvas');
      cv.width = SPRITE_SIZE;
      cv.height = SPRITE_SIZE;
      return cv;
    };
    const a = mk();
    const b = mk();
    scratch = { a, ac: a.getContext('2d'), b, bc: b.getContext('2d') };
  }
  return scratch;
}

// Row slips for the stressed fragmentation (two alternating frames).
const STRESS_SHIFTS = [
  [[8, 11, 1], [12, 16, -1], [17, 20, 2], [25, 28, -1]],
  [[8, 11, -1], [12, 16, 1], [17, 20, -2], [21, 24, 1], [25, 28, 1]],
];

// Brief, restrained glitch variants.
const GLITCH_SHIFTS = {
  1: [[14, 16, 2]],
  2: [[9, 11, -2], [20, 22, 2]],
  3: [[12, 13, -3], [24, 26, 2]],
};

function shiftTable(plan) {
  const t = new Array(SPRITE_SIZE).fill(0);
  for (const [y0, y1, dx] of plan) for (let y = y0; y <= y1; y++) t[y] = dx;
  return t;
}

/*
 * p: { mood, gaze, eyes, mouth, legs, pose, lean, facing, cue, item,
 *      book, crown, glitch, frame }
 * The caller's ctx is a SPRITE_SIZE x SPRITE_SIZE canvas context.
 */
export function renderSprite(ctx, p) {
  const { a, ac, b, bc } = layers();
  const flip = p.facing < 0;
  const stressed = p.mood === 'stressed';

  // gaze / lean are screen-space; the base art faces right
  const q = {
    ...p,
    gaze: flip ? { l: 'r', r: 'l' }[p.gaze] || p.gaze : p.gaze,
    lean: flip ? -p.lean : p.lean,
  };

  ac.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  if (q.legs !== 0 && q.pose === 'stand') drawSide(ac, q);
  else drawFront(ac, q);
  if (q.book !== null && q.book !== undefined) drawBook(ac, q.book);

  // mirror into b (or straight copy)
  bc.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  bc.save();
  if (flip) {
    bc.translate(SPRITE_SIZE, 0);
    bc.scale(-1, 1);
  }
  bc.drawImage(a, 0, 0);
  bc.restore();

  ctx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

  const plan = [];
  if (stressed) plan.push(...STRESS_SHIFTS[p.frame % 2]);
  if (p.glitch && GLITCH_SHIFTS[p.glitch]) plan.push(...GLITCH_SHIFTS[p.glitch]);
  const shifts = shiftTable(plan);

  // cyan ghost for the glitch
  if (p.glitch) {
    ac.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    ac.drawImage(b, 0, 0);
    ac.globalCompositeOperation = 'source-in';
    ac.fillStyle = PALETTE.C;
    ac.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    ac.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.55;
    ctx.drawImage(a, 2, 0);
    ctx.globalAlpha = 1;
  }

  for (let y = 0; y < SPRITE_SIZE; y++) {
    ctx.drawImage(b, 0, y, SPRITE_SIZE, 1, shifts[y], y, SPRITE_SIZE, 1);
  }

  // cracks: sparse missing pixels through the stressed sprite
  if (stressed) {
    for (let y = 6; y < 29; y++) {
      for (let x = 4; x < 28; x++) {
        if ((x * 7 + y * 13 + (p.frame % 2) * 5) % 41 === 0) ctx.clearRect(x, y, 1, 1);
      }
    }

    const f = p.frame % 2;
    blit(ctx, DROP, f ? 3 : 5, f ? 6 : 3);
    blit(ctx, DROP, f ? 27 : 26, f ? 2 : 6);
    drawGlyphs(ctx, f ? '?' : '!', 0, f ? 14 : 12, PALETTE.R);
    drawGlyphs(ctx, f ? 'X' : '?', 29, f ? 11 : 14, PALETTE.R);
  }

  // unmirrored overlays: cue text and held items
  if (p.cue) {
    const w = textWidth(p.cue);
    drawGlyphs(ctx, p.cue, stressed ? Math.round((SPRITE_SIZE - w) / 2) : SPRITE_SIZE - 1 - w, 0, stressed ? PALETTE.R : PALETTE.C);
  }
  drawItem(ctx, p.item);
}
