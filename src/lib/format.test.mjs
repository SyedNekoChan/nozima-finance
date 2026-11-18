import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compact, figure, splitAmount } from './format.js';

test('compact amounts pick the unit the rounded figure fits (no "1000K")', () => {
  const cases = [[0, '0'], [999, '999'], [999.6, '1K'], [185000, '185K'], [999499, '999K'], [999999, '1M'], [1250000, '1.25M'], [4557800, '4.56M'], [999999999, '1B'], [45678901234567, '45.7T'], [1.2e15, '1.2Q'], [-185000, '−185K']];
  for (const [v, s] of cases) assert.equal(compact(v), s, String(v));
});

test('figures keep every digit and their code, however large', () => {
  assert.deepEqual(splitAmount(248395103641369, 'UZS'), ['248,395,103,641,369', 'UZS']);
  assert.deepEqual(splitAmount(9876543210.99, 'USD'), ['$9,876,543,210.99', 'USD']);
  assert.equal(figure(-1234567.5, 'USD'), '−$1,234,567.50');
});
