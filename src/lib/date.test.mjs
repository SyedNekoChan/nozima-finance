import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDateInput } from './date.js';

test('typed dates are stored padded, DD-MM-YYYY', () => {
  assert.equal(normalizeDateInput('18-11-2026'), '18-11-2026');
  assert.equal(normalizeDateInput('1-11-2026'), '01-11-2026');
  assert.equal(normalizeDateInput(' 1/2/2026 '), '01-02-2026');
  assert.equal(normalizeDateInput('29.02.2028'), '29-02-2028');
});

test('anything that is not a real day-month-year date is refused', () => {
  for (const bad of ['abc', '', null, '31-02-2026', '29-02-2026', '32-01-2026', '00-01-2026', '10-13-2026', '2026-11-18', '18-11-26', '18 11 2026', '18-11-2026x']) {
    assert.equal(normalizeDateInput(bad), null, String(bad));
  }
});
