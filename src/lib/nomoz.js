import { FINANCE } from '../pets/finance/config.js';

/*
 * Financial integration for the backdrop pet (NOMOZ.EXE and any pet that
 * replaces it).
 *
 * This file is the only bridge between the finance store and the pet
 * subsystem (src/pets): the financial-mood derivation, a pure read of
 * existing store selectors, the visual-only budget proximity flag, and the
 * one-shot reaction table for store events. Pets never write back: no
 * animation outcome touches financial data. Randomness, space, sprites,
 * behaviors and the financial reaction director live in src/pets.
 */

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

/*
 * VISUAL-ONLY budget proximity: the existing budget utilisation (spent
 * this month / monthly budget, the ratio the dashboard bar shows) has
 * reached the pet's configurable approach ratio while the application still
 * considers the budget intact. No new financial rule: over-budget and
 * budget-reached remain exactly what deriveNomozMood reports as 'stressed',
 * and a boolean keeps this safe as a zustand selector.
 */
export function deriveBudgetProximity(state) {
  if (state.getIsOverBudgetThisMonth()) return false;

  const budget = state.getMonthlyBudgetUZS();
  if (budget === null || !(budget > 0)) return false;

  const ratio = state.getSpentThisMonthInUZS() / budget;
  return ratio >= FINANCE.approachRatio && ratio < 1;
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
