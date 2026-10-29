import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveBudgetProximity, deriveNomozMood } from './nomoz.js';

// A minimal stand-in for the finance store state, with the selectors the derivation reads.
const now = new Date();
const dd = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
const state = ({ budget = null, spent = 0, over = false, income = 0, net = 0, balance = 0, dated = dd } = {}) => ({
  transactions: income ? [{ date: dated }] : [],
  getIsOverBudgetThisMonth: () => over,
  getMonthlyBudgetUZS: () => budget,
  getSpentThisMonthInUZS: () => spent,
  getLedgerTotalsInUZS: (txs) => ({ totalIn: txs.length ? income : 0, net: txs.length ? net : 0 }),
  getTotalBalanceInUZS: () => balance,
});

test('mood rules: stressed over budget or at the limit, content on strong savings, otherwise idle', () => {
  assert.equal(deriveNomozMood(state()), 'idle');
  assert.equal(deriveNomozMood(state({ over: true })), 'stressed');
  assert.equal(deriveNomozMood(state({ budget: 1000, spent: 1000 })), 'stressed'); // limit reached
  assert.equal(deriveNomozMood(state({ budget: 1000, spent: 999 })), 'idle');
  assert.equal(deriveNomozMood(state({ income: 100, net: 30, balance: 1 })), 'content'); // exactly 30% saved
  assert.equal(deriveNomozMood(state({ income: 100, net: 29, balance: 1 })), 'idle');
  assert.equal(deriveNomozMood(state({ income: 100, net: 90, balance: 0 })), 'idle'); // needs a positive net worth
  assert.equal(deriveNomozMood(state({ income: 100, net: 90, balance: 5, dated: '01-01-2000' })), 'idle'); // other months do not count
  // stressed wins over content
  assert.equal(deriveNomozMood(state({ income: 100, net: 90, balance: 5, over: true })), 'stressed');
});

test('budget proximity is visual only and never overlaps stressed', () => {
  assert.equal(deriveBudgetProximity(state({ over: true, budget: 100, spent: 150 })), false);
  assert.equal(deriveBudgetProximity(state()), false);
  assert.equal(deriveBudgetProximity(state({ budget: 100, spent: 10 })), false);
  assert.equal(deriveBudgetProximity(state({ budget: 100, spent: 99 })), true);
  assert.equal(deriveBudgetProximity(state({ budget: 100, spent: 100 })), false); // that is stressed
});
