import { DUR } from './motion.js';

/*
 * NOMOZ.EXE — the ASCII backdrop entity.
 *
 * Everything that defines the character lives here so no component
 * carries its own copy of the art: one sprite builder (a fixed
 * SPRITE_COLS x SPRITE_ROWS grid, so state/pose changes never shift
 * layout), the financial-mood derivation (a pure read of existing
 * store selectors), and the idle/content/stressed behavior planners.
 * The hook in hooks/useNomoz.js only schedules what these return.
 */

export const SPRITE_COLS = 11;
export const SPRITE_ROWS = 7;

export const AMBIENT_MS = Math.round(DUR.ambient * 1000);
export const STEP_MS = 480;
const NERVOUS_STEP_MS = 320;

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

const EYE_GLYPH = { open: 'o', blink: '-', closed: '-', happy: '^', wide: 'O' };
const GAZE_SLOTS = { c: [1, 3], l: [0, 2], r: [2, 4] };
const MOUTH = { idle: '  _  ', rest: '  .  ', think: '  -  ', happy: ' \\_/ ' };
const CUE_COL = { idle: 8, content: 9, stressed: 5 };

// Spaces are transparent, so parts can overlap without erasing each other.
function put(grid, row, col, str) {
  for (let i = 0; i < str.length; i++) {
    const c = col + i;
    if (c >= 0 && c < SPRITE_COLS && str[i] !== ' ') grid[row][c] = str[i];
  }
}

function faceRow(eyes, gaze) {
  const glyph = EYE_GLYPH[eyes] || 'o';
  const [a, b] = GAZE_SLOTS[gaze] || GAZE_SLOTS.c;
  const row = [' ', ' ', ' ', ' ', ' '];
  row[a] = glyph;
  row[b] = glyph;
  return row.join('');
}

// legs: 0 standing, 1/2 alternating walk frames
function putLegs(grid, pose, legs) {
  if (pose === 'sit') {
    put(grid, 5, 2, '▀▀▀▀▀▀▀');
  } else if (legs === 1) {
    put(grid, 5, 2, '█');
    put(grid, 5, 7, '█');
  } else if (legs === 2) {
    put(grid, 5, 3, '█');
    put(grid, 5, 8, '█');
  } else {
    put(grid, 5, 3, '█');
    put(grid, 5, 7, '█');
  }
}

function stressedRows(grid, frame, cue) {
  const f = frame % 2;

  // detached sweat droplets
  put(grid, 0, f ? 0 : 1, "'");
  put(grid, 0, f ? 10 : 9, "'");

  // misaligned head, panicked < > eyes, flailing limbs
  put(grid, 1, f ? 2 : 3, f ? '░███▒' : '▒███░');
  put(grid, 2, 0, f ? '/ ░ < > █ \\' : '\\ █ < > ▒ /');
  put(grid, 3, f ? 0 : 2, f ? '░█  ?  █▒' : '▒█  !  █░');
  put(grid, 4, 0, f ? ' ░ /█$\\█ ░ ' : ' ░ \\█$/█ ░ ');
  put(grid, 5, 0, f ? '   █▒  ░█  ' : '  ▒█   █░  ');
  put(grid, 6, f ? 3 : 2, f ? '░ ░ ░' : '░ ░ ░ ░');

  if (cue) put(grid, 0, CUE_COL.stressed, cue);
}

/*
 * One builder for all three states, so the character keeps one
 * identity: same head/body/feet grid, transformed by mood.
 */
export function buildSprite({
  mood = 'idle',
  gaze = 'c',
  eyes = 'open',
  mouth = 'idle',
  legs = 0,
  pose = 'stand',
  lean = 0,
  cue = null,
  frame = 0,
}) {
  const grid = Array.from({ length: SPRITE_ROWS }, () =>
    Array(SPRITE_COLS).fill(' ')
  );

  if (mood === 'stressed') {
    stressedRows(grid, frame, cue);
  } else {
    const content = mood === 'content';

    if (content) put(grid, 0, 3 + lean, '[_/_]');
    put(grid, 1, 3 + lean, '█████');
    put(grid, 2, 2 + lean, `█${faceRow(content ? 'happy' : eyes, gaze)}█`);
    put(grid, 3, 2 + lean, `█${MOUTH[content ? 'happy' : mouth] || MOUTH.idle}█`);
    put(grid, 4, 1, content ? '░▒█ $ █▒░' : '░▒█████▒░');
    putLegs(grid, pose, legs);
    put(grid, 6, 2, '░░░░░░░');

    if (cue) put(grid, 0, CUE_COL[mood], cue);
  }

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

/* ------------------------------------------------------------------ */
/* Placement / depth                                                   */
/* ------------------------------------------------------------------ */

export const MOOD_ALPHA = { idle: 0.5, content: 0.62, stressed: 0.7 };

const DEPTH = {
  wide: {
    '-1': { scale: 0.78, y: -14, alpha: 0.6 },
    0: { scale: 1, y: 0, alpha: 1 },
    1: { scale: 1.14, y: 2, alpha: 1.15 },
  },
  compact: {
    '-1': { scale: 0.86, y: -8, alpha: 0.65 },
    0: { scale: 1, y: 0, alpha: 1 },
    1: { scale: 1, y: 0, alpha: 1 },
  },
};

export const getDepth = (compact, depth) =>
  DEPTH[compact ? 'compact' : 'wide'][depth];

export const moodBaseDepth = (mood, compact) =>
  mood === 'stressed' && !compact ? 1 : 0;

// Horizontal walking range in px; margins keep it clear of the edges
// and the slack covers the "near" scale growing past the sprite box.
export function getRange({ width, spriteW }, compact) {
  const margin = compact ? 8 : 16;
  const slack = spriteW * 0.07;
  const minX = margin + slack;
  const maxX = Math.max(minX, width - spriteW - margin - slack);
  return { minX, maxX };
}

/* ------------------------------------------------------------------ */
/* Deterministic-enough randomness                                     */
/* ------------------------------------------------------------------ */

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
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

const rnd = (rng, a, b) => a + rng() * (b - a);
const int = (rng, a, b) => Math.floor(rnd(rng, a, b + 1));

function weighted(rng, table, last) {
  const entries = table.filter(([name]) => name !== last);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let pick = rng() * total;
  for (const [name, w] of entries) {
    pick -= w;
    if (pick <= 0) return name;
  }
  return entries[0][0];
}

/* ------------------------------------------------------------------ */
/* Behavior planners                                                   */
/* ------------------------------------------------------------------ */

/*
 * planBehavior returns { name, beats: [{ t, patch }], end } — absolute
 * ms offsets of view patches, and when to plan the next behavior.
 * Positions are only ever changed in cell-sized steps (or an explicit
 * slide for peeking), so walking reads as walking, not teleporting.
 */

const BEHAVIORS = {
  idle: [
    ['sit', 22],
    ['walk', 22],
    ['look', 14],
    ['ponder', 8],
    ['sleep', 7],
    ['peek', 7],
    ['depth', 8],
    ['twitch', 12],
  ],
  content: [
    ['sit', 30],
    ['look', 18],
    ['walk', 15],
    ['glint', 20],
    ['twitch', 10],
  ],
  stressed: [
    ['shuffle', 40],
    ['flinch', 35],
    ['still', 25],
  ],
};

// With reduced motion only stationary, low-motion behaviors remain.
const REDUCED_OK = {
  idle: [['sit', 30], ['look', 20], ['ponder', 12], ['sleep', 10]],
  content: [['sit', 40], ['look', 25], ['glint', 20]],
  stressed: [['still', 1]],
};

function blink(at, t) {
  at(t, { eyes: 'blink' });
  at(t + 140, { eyes: 'open' });
}

function walk(at, ctx, x0, dir, steps, t0, stepMs = STEP_MS) {
  for (let i = 0; i < steps; i++) {
    at(t0 + i * stepMs, {
      x: x0 + dir * ctx.cell * (i + 1),
      legs: i % 2 ? 2 : 1,
      gaze: dir < 0 ? 'l' : 'r',
      pose: 'stand',
      transitionMs: stepMs,
    });
  }
  const end = t0 + steps * stepMs;
  at(end, { legs: 0, transitionMs: stepMs });
  return end;
}

function pickDirection(ctx, wanted) {
  const roomL = Math.floor((ctx.x - ctx.minX) / ctx.cell);
  const roomR = Math.floor((ctx.maxX - ctx.x) / ctx.cell);
  let dir = ctx.rng() < 0.5 ? -1 : 1;
  if ((dir < 0 ? roomL : roomR) < 2) dir = -dir;
  const room = dir < 0 ? roomL : roomR;
  return { dir, steps: Math.min(wanted, room) };
}

const PLANNERS = {
  sit(ctx, at) {
    const hold = rnd(ctx.rng, 3500, 7000);
    at(0, { pose: 'sit', gaze: 'c', eyes: 'open', mouth: 'idle', legs: 0 });
    blink(at, hold * 0.5);
    return hold;
  },

  look(ctx, at) {
    at(0, { pose: 'stand', legs: 0 });
    at(300, { gaze: 'l' });
    at(1500, { gaze: 'r' });
    blink(at, 2300);
    at(2900, { gaze: 'c' });
    return 3600;
  },

  ponder(ctx, at) {
    at(0, { pose: 'stand', gaze: ctx.rng() < 0.5 ? 'l' : 'r', mouth: 'think', cue: '.o?' });
    at(1500, { cue: '?' });
    at(3400, { cue: null, mouth: 'idle', gaze: 'c' });
    return 4000;
  },

  sleep(ctx, at) {
    const dur = rnd(ctx.rng, 7000, 11000);
    at(0, { pose: 'sit', eyes: 'closed', mouth: 'rest', gaze: 'c', legs: 0, cue: 'z' });
    for (let t = 1600, i = 0; t < dur; t += 1600, i++) {
      at(t, { cue: i % 2 ? 'z' : 'zZ' });
    }
    at(dur, { cue: null, eyes: 'blink' });
    at(dur + 250, { eyes: 'open', mouth: 'idle', pose: 'stand' });
    return dur + 1200;
  },

  twitch(ctx, at) {
    const lean = ctx.rng() < 0.5 ? -1 : 1;
    at(0, { lean });
    at(700, { lean: 0 });
    return rnd(ctx.rng, 1800, 3000);
  },

  glint(ctx, at) {
    at(0, { cue: '*' });
    at(1400, { cue: null });
    return rnd(ctx.rng, 4000, 7000);
  },

  depth(ctx, at) {
    const options = ctx.compact ? [-1, 0] : [-1, 0, 1];
    const current = ctx.depth;
    const next =
      current !== 0 && ctx.rng() < 0.6
        ? 0
        : options.filter((d) => d !== current)[
            int(ctx.rng, 0, options.length - 2)
          ];
    at(0, { depth: next, pose: 'stand', legs: 0 });
    return AMBIENT_MS + rnd(ctx.rng, 5000, 9000);
  },

  walk(ctx, at) {
    const wanted = ctx.mood === 'content'
      ? int(ctx.rng, 1, 4)
      : ctx.compact
      ? int(ctx.rng, 3, 8)
      : int(ctx.rng, 5, 16);
    const { dir, steps } = pickDirection(ctx, wanted);

    if (steps < 1) return PLANNERS.look(ctx, at);

    // occasionally stop partway, as though distracted or curious
    if (steps > 4 && ctx.mood === 'idle' && ctx.rng() < 0.35) {
      const first = int(ctx.rng, 2, steps - 2);
      const t1 = walk(at, ctx, ctx.x, dir, first, 0);
      at(t1, { eyes: 'wide', cue: '?', gaze: 'c' });
      at(t1 + 1500, { eyes: 'open', cue: null });
      const t2 = walk(
        at, ctx, ctx.x + dir * ctx.cell * first, dir, steps - first, t1 + 1700
      );
      return t2 + rnd(ctx.rng, 800, 1500);
    }

    const end = walk(at, ctx, ctx.x, dir, steps, 0);
    return end + rnd(ctx.rng, 800, 1500);
  },

  peek(ctx, at) {
    const left = ctx.x < (ctx.minX + ctx.maxX) / 2;
    const s = left ? -1 : 1;
    const hiddenX = left ? -ctx.spriteW * 1.15 : ctx.width + ctx.spriteW * 0.15;
    const peekX = left ? -ctx.spriteW * 0.6 : ctx.width - ctx.spriteW * 0.4;
    const homeX = left ? ctx.minX : ctx.maxX;

    // leave the visible area while faded out, slide back in partially
    at(0, { fade: 0 });
    at(AMBIENT_MS + 60, {
      x: hiddenX, transitionMs: 0, depth: 0, peeking: true,
      gaze: left ? 'r' : 'l', legs: 0, pose: 'stand',
    });
    at(AMBIENT_MS + 160, { fade: 1 });
    at(AMBIENT_MS + 260, { x: peekX, transitionMs: 1300 });
    blink(at, AMBIENT_MS + 260 + 2000);
    at(AMBIENT_MS + 260 + 2600, { x: hiddenX, transitionMs: 1100 });

    // walk back in from the edge
    const t0 = AMBIENT_MS + 260 + 2600 + 3200;
    const steps = Math.max(1, Math.ceil(Math.abs(homeX - hiddenX) / ctx.cell));
    at(t0 - 100, { x: hiddenX, transitionMs: 0 });
    const end = walk(at, ctx, hiddenX, -s, steps, t0, STEP_MS);
    at(end, { peeking: false });
    return end + 600;
  },

  shuffle(ctx, at) {
    const { dir, steps } = pickDirection(ctx, int(ctx.rng, 1, 2));
    if (steps < 1) return PLANNERS.still(ctx, at);
    const t1 = walk(at, ctx, ctx.x, dir, steps, 0, NERVOUS_STEP_MS);
    const t2 = walk(at, ctx, ctx.x + dir * ctx.cell * steps, -dir, steps, t1 + 900, NERVOUS_STEP_MS);
    return t2 + rnd(ctx.rng, 1500, 2800);
  },

  flinch(ctx, at) {
    const lean = ctx.rng() < 0.5 ? -1 : 1;
    at(0, { lean });
    at(450, { lean: 0 });
    at(900, { lean: -lean });
    at(1300, { lean: 0 });
    return rnd(ctx.rng, 2200, 3500);
  },

  still(ctx, at) {
    at(0, { lean: 0, legs: 0, pose: 'stand' });
    return rnd(ctx.rng, 2500, 4000);
  },
};

export function planBehavior(ctx) {
  const table = (ctx.reduced ? REDUCED_OK : BEHAVIORS)[ctx.mood] || BEHAVIORS.idle;
  const name = weighted(ctx.rng, table, ctx.last);

  const beats = [];
  const at = (t, patch) => beats.push({ t, patch });
  let end = PLANNERS[name](ctx, at);

  if (ctx.reduced) end *= 1.5;

  return { name, beats, end: Math.max(end, 600) };
}
