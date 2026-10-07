import { DUR } from './motion.js';

/*
 * NOMOZ.EXE — the ASCII backdrop entity.
 *
 * Everything that defines the character's look lives here: one sprite
 * builder (a fixed SPRITE_COLS x SPRITE_ROWS grid, so state/pose changes
 * never shift layout), the financial-mood derivation (a pure read of
 * existing store selectors), and the one-shot reaction table. Spatial
 * math is in nomozSpace.js and behavior planning in nomozBehaviors.js.
 *
 * The character is a feline-looking block/ASCII entity (pointed ears,
 * muzzle, whiskers, tail) — an aesthetic identity only; its behavior is
 * that of a generic living backdrop entity.
 */

export const SPRITE_COLS = 15;
export const SPRITE_ROWS = 11;

export const AMBIENT_MS = Math.round(DUR.ambient * 1000);
export const STEP_MS = 480;

/* ------------------------------------------------------------------ */
/* Runtime randomness                                                  */
/* ------------------------------------------------------------------ */

// A fresh seed on every page load / mount: nothing about startup is scripted.
export function runtimeSeed() {
  try {
    const a = new Uint32Array(2);
    crypto.getRandomValues(a);
    return (a[0] ^ a[1] ^ (Date.now() | 0)) >>> 0;
  } catch {
    return Math.floor(Math.random() * 4294967296) ^ (Date.now() | 0);
  }
}

// mulberry32: small seeded PRNG
export function createRng(seed) {
  let t = seed >>> 0;
  return function next() {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* Financial mood                                                      */
/* ------------------------------------------------------------------ */

// Share of this month's income that must remain unspent for CONTENT.
const HEALTHY_SAVINGS_RATE = 0.3;

/*
 * Pure read of existing store selectors — no new business rules.
 *   stressed : over budget (existing rule) or the budget limit reached
 *   content  : income this month, strong savings, positive net worth
 *   idle     : everything else
 * Returns a string so it is safe as a zustand selector.
 */
export function deriveNomozMood(state) {
  if (state.getIsOverBudgetThisMonth()) return 'stressed';

  const budget = state.getMonthlyBudgetUZS();

  if (budget !== null && budget > 0 && state.getSpentThisMonthInUZS() >= budget) {
    return 'stressed';
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const monthTx = state.transactions.filter((t) => {
    const [, mm, yyyy] = t.date.split('-').map(Number);
    return yyyy === year && mm === month;
  });

  const { totalIn, net } = state.getLedgerTotalsInUZS(monthTx);

  if (
    totalIn > 0 &&
    net / totalIn >= HEALTHY_SAVINGS_RATE &&
    state.getTotalBalanceInUZS() > 0
  ) {
    return 'content';
  }

  return 'idle';
}

/* ------------------------------------------------------------------ */
/* Sprite                                                              */
/* ------------------------------------------------------------------ */

const EYE_GLYPH = { open: 'o', blink: '-', closed: '-', happy: '^', wide: 'O', down: '.' };
const GAZE_SLOTS = { c: [2, 6], l: [1, 5], r: [3, 7] };
const MOUTH = {
  idle: '    w    ',
  rest: '    .    ',
  think: '    -    ',
  happy: '   \\w/   ',
};
const CUE_COL = { idle: 11, content: 11, stressed: 7 };

// Open book held in the paws; frames 1-2 are a page being turned.
const BOOK = [
  ['/==|==\\', '\\__|__/'],
  ['/==|/=\\', '\\__|__/'],
  ['/=/|\\=\\', '\\__|__/'],
];

// Spaces are transparent, so parts can overlap without erasing each other.
function put(grid, row, col, str) {
  for (let i = 0; i < str.length; i++) {
    const c = col + i;
    if (c >= 0 && c < SPRITE_COLS && str[i] !== ' ') grid[row][c] = str[i];
  }
}

function eyeInterior(glyph, gaze) {
  const [a, b] = GAZE_SLOTS[gaze] || GAZE_SLOTS.c;
  const row = Array(9).fill(' ');
  row[a] = glyph;
  row[b] = glyph;
  return row.join('');
}

// Pointed ears, head, whiskered muzzle. ox leans the whole head.
function drawHead(grid, ox, eyeGlyph, gaze, mouth) {
  put(grid, 1, 3 + ox, '/\\');
  put(grid, 1, 10 + ox, '/\\');
  put(grid, 2, 2 + ox, '/██\\___/██\\');
  put(grid, 3, 2 + ox, '███████████');

  if (gaze === 'u') {
    put(grid, 3, 5 + ox, eyeGlyph);
    put(grid, 3, 9 + ox, eyeGlyph);
    put(grid, 4, 2 + ox, '█         █');
  } else {
    put(grid, 4, 2 + ox, `█${eyeInterior(eyeGlyph, gaze)}█`);
  }

  put(grid, 5, ox, '==█    v    █==');
  put(grid, 6, ox, `--█${mouth}█--`);
  put(grid, 7, 2 + ox, '▀█████████▀');
}

function putLegs(grid, pose, legs) {
  if (pose === 'stretch') {
    put(grid, 9, 1, '▀▀▀▀▀▀▀▀▀▀▀▀▀');
  } else if (pose === 'sit') {
    put(grid, 9, 3, '▀▀▀▀▀▀▀▀▀');
  } else if (legs === 1) {
    put(grid, 9, 3, '██');
    put(grid, 9, 9, '██');
  } else if (legs === 2) {
    put(grid, 9, 4, '██');
    put(grid, 9, 10, '██');
  } else {
    put(grid, 9, 4, '██');
    put(grid, 9, 9, '██');
  }
}

// The tail trails behind, opposite the direction it is facing.
function putTail(grid, facing) {
  if (facing > 0) {
    put(grid, 8, 0, '██▒');
    put(grid, 7, 0, '█');
  } else {
    put(grid, 8, 12, '▒██');
    put(grid, 7, 14, '█');
  }
}

function drawBody(grid, o, content) {
  if (o.pose === 'stretch') {
    put(grid, 8, 1, '░▒█████████▒░');
  } else {
    put(grid, 8, 3, content ? '▒██ $ ██▒' : '▒███████▒');
  }
  putLegs(grid, o.pose, o.legs);
  putTail(grid, o.facing);
  put(grid, 10, 2, '░░░░░░░░░░░');
}

/*
 * Stressed: the same cat, fragmented. Two frames, misaligned rows,
 * splayed whiskers, panicked < > eyes, X ? ! and detached ' droplets.
 */
function drawStressed(grid, o) {
  const f = o.frame % 2;

  if (f === 0) {
    put(grid, 0, 2, "'");
    put(grid, 0, 12, "'");
    put(grid, 1, 3, '/\\');
    put(grid, 1, 11, '/\\');
    put(grid, 2, 2, '/██\\_ _/▒█\\');
    put(grid, 3, 2, '▒██░███▒███');
    put(grid, 4, 2, '█');
    put(grid, 4, 5, '<');
    put(grid, 4, 9, '>');
    put(grid, 4, 12, '▒');
    put(grid, 5, 1, '\\█ ?  v  ! █/');
    put(grid, 6, 2, '/█ X _w_ █\\');
    put(grid, 7, 3, '▒▀██████▀░');
    put(grid, 8, 2, '░▒█ \\$/ █▒░');
    put(grid, 9, 3, '▒█    █░ ▒');
    put(grid, 10, 2, '░ ░ ░ ░ ░');
  } else {
    put(grid, 0, 1, "'");
    put(grid, 0, 13, "'");
    put(grid, 1, 2, '/\\');
    put(grid, 1, 10, '/\\');
    put(grid, 2, 3, '/▒█\\___/█░\\');
    put(grid, 3, 1, '███▒██░████');
    put(grid, 4, 1, '▒');
    put(grid, 4, 5, '<');
    put(grid, 4, 9, '>');
    put(grid, 4, 13, '█');
    put(grid, 5, 0, '/░ !  v  ? ░█\\');
    put(grid, 6, 1, '\\█ _w_ X █/');
    put(grid, 7, 2, '░▀██████▀▒');
    put(grid, 8, 3, '█▒░ /$\\ ░▒█');
    put(grid, 9, 2, '░█  ▒█ █▒');
    put(grid, 10, 3, '░ ░ ░ ░');
  }

  putTail(grid, o.facing);
  if (f) put(grid, 7, o.facing > 0 ? 1 : 13, '\\');

  if (o.cue) put(grid, 0, CUE_COL.stressed, o.cue);
}

// Restrained terminal glitch: a few rows slip sideways, a few blocks drop.
const GLITCH_PLANS = { 1: [[5, 1]], 2: [[3, -2], [8, 1]], 3: [[6, -1], [9, 2]] };

function applyGlitch(grid, g) {
  const plan = GLITCH_PLANS[g];
  if (!plan) return;

  for (const [row, dx] of plan) {
    const r = grid[row];
    grid[row] =
      dx > 0
        ? [...Array(dx).fill(' '), ...r.slice(0, SPRITE_COLS - dx)]
        : [...r.slice(-dx), ...Array(-dx).fill(' ')];
  }

  let n = 0;
  grid[4] = grid[4].map((ch) => (ch === '█' && n++ % 3 === 2 ? '░' : ch));
}

/*
 * One builder for all three states, so the character keeps one
 * identity: same head, whiskers, body and tail, transformed by mood.
 */
export function buildSprite({
  mood = 'idle',
  gaze = 'c',
  eyes = 'open',
  mouth = 'idle',
  legs = 0,
  pose = 'stand',
  lean = 0,
  facing = 1,
  cue = null,
  item = null,
  book = null,
  crown = 0,
  glitch = 0,
  frame = 0,
}) {
  const grid = Array.from({ length: SPRITE_ROWS }, () =>
    Array(SPRITE_COLS).fill(' ')
  );

  if (mood === 'stressed') {
    drawStressed(grid, { frame, facing, cue });
  } else {
    const content = mood === 'content';
    const glyph = content
      ? eyes === 'blink' || eyes === 'closed'
        ? '-'
        : '^'
      : EYE_GLYPH[eyes] || 'o';

    drawHead(grid, lean, glyph, gaze, MOUTH[content ? 'happy' : mouth] || MOUTH.idle);
    drawBody(grid, { pose, legs, facing }, content);

    if (content) put(grid, 1, 5 + lean + crown, '[_/_]');
    if (cue) put(grid, 0, CUE_COL[mood], cue);
  }

  if (book !== null && BOOK[book]) {
    put(grid, 8, 4, BOOK[book][0]);
    put(grid, 9, 4, BOOK[book][1]);
  }

  if (item) put(grid, item.row, item.col, item.ch);

  applyGlitch(grid, glitch);

  return grid.map((r) => r.join('')).join('\n');
}

/* ------------------------------------------------------------------ */
/* One-shot reactions (anomalyEvent / special date)                    */
/* ------------------------------------------------------------------ */

export const REACTIONS = {
  INCOME: { ms: 1800, eyes: 'happy', cue: '$' },
  EXPENSE: { ms: 1400, eyes: 'wide', cue: "'" },
  TRANSFER: {
    ms: 1500,
    gazeSeq: [
      [0, 'l'],
      [500, 'r'],
      [1000, 'c'],
    ],
  },
  OVERSPEND: { ms: 3000, cue: 'X', fast: true },
  CELEBRATE: { ms: 2000, eyes: 'happy', cue: '*' },
  HEART: { ms: 8000, eyes: 'happy', cue: '<3' },
};

// Base opacity per state; depth then dims distant placements slightly.
export const MOOD_ALPHA = { idle: 0.6, content: 0.7, stressed: 0.8 };
