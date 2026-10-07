import { DUR } from './motion.js';

/*
 * NOMOZ.EXE — the pixel-art backdrop entity (the solid-black tabby).
 *
 * Shared definitions live here: the runtime randomness, the
 * financial-mood derivation (a pure read of existing store selectors),
 * the one-shot reaction table and a few constants. The pixel art is in
 * nomozSprites.js, spatial math in nomozSpace.js and behavior planning
 * in nomozBehaviors.js.
 */

// A walking step moves the sprite by 1/12 of its width.
export const STEPS_PER_SPRITE = 12;

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
export const MOOD_ALPHA = { idle: 0.95, content: 1, stressed: 1 };
