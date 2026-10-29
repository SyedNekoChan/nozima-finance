import { test } from 'node:test';
import assert from 'node:assert/strict';
import { msUntilNextMonth } from './useCurrentMonth.js';

test('the month timer targets the first instant of the next local month (plus a second of margin)', () => {
  assert.equal(msUntilNextMonth(new Date(2026, 0, 31, 23, 59, 0)), 61000);
  assert.equal(msUntilNextMonth(new Date(2026, 11, 31, 23, 59, 59)), 2000); // December rolls into January
  assert.equal(msUntilNextMonth(new Date(2028, 1, 29, 12, 0, 0)), 12 * 3600 * 1000 + 1000); // leap day
});

test('long months are capped to setTimeout\'s limit and re-armed rather than overflowing', () => {
  const cap = 2 ** 31 - 1;
  assert.equal(msUntilNextMonth(new Date(2026, 0, 1, 0, 0, 0)), cap); // 31 days away
  assert.ok(msUntilNextMonth(new Date(2026, 0, 20, 0, 0, 0)) < cap); // 11 days away
  assert.ok(msUntilNextMonth(new Date(2026, 0, 1)) > 0);
});
