import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertBetween, convertToBase, formatAmount, formatRate, getRate, hasRate, parseAmount, suggestRate } from './currency.js';
import { codesInUse, isCurrencyCode, missingRates, normalizeCode, readRateResponse, retryDelay } from './rates.js';
import { DEFAULT_EXCHANGE_RATES } from './constants.js';

const RATES = { ...DEFAULT_EXCHANGE_RATES, UZS: 1, GBP: 16000 };

test('presets keep their stored rates; UZS is the pivot', () => {
  assert.equal(getRate('UZS', {}), 1);
  assert.equal(convertToBase(100, 'USD', RATES), 1265000);
  assert.equal(convertToBase(100, 'UZS', {}), 100);
  for (const c of ['USD', 'EUR', 'RUB', 'KZT', 'TRY']) assert.ok(hasRate(c, DEFAULT_EXCHANGE_RATES), c);
});

test('a custom code converts with its stored rate, whatever its case', () => {
  assert.equal(convertToBase(2.5, 'GBP', RATES), 40000);
  assert.equal(convertToBase(2.5, 'gbp', RATES), 40000);
  assert.equal(convertToBase(2.5, ' GBP ', RATES), 40000);
});

test('a missing rate is never invented: no rate, zero contribution, and hasRate says so', () => {
  assert.equal(hasRate('CHF', RATES), false);
  assert.equal(convertToBase(100, 'CHF', RATES), 0);
  assert.equal(convertBetween(100, 'CHF', 'USD', RATES), 0);
  assert.equal(convertBetween(100, 'USD', 'CHF', RATES), 0);
  assert.equal(suggestRate('USD', 'CHF', RATES), null);
  assert.equal(suggestRate('CHF', 'UZS', RATES), null);
  // zero, negative and non-numeric rates count as missing
  for (const bad of [0, -5, 'abc', null, undefined, NaN]) assert.equal(hasRate('XXX', { XXX: bad }), false, String(bad));
});

test('conversion precision: cross rates through the UZS pivot', () => {
  assert.ok(Math.abs(convertBetween(100, 'EUR', 'USD', RATES) - (100 * 13800) / 12650) < 1e-9);
  assert.ok(Math.abs(convertBetween(1, 'GBP', 'USD', RATES) - 16000 / 12650) < 1e-12);
  // round trip returns the amount
  const there = convertBetween(1234.56, 'GBP', 'KZT', RATES);
  assert.ok(Math.abs(convertBetween(there, 'KZT', 'GBP', RATES) - 1234.56) < 1e-9);
  assert.equal(convertBetween(77, 'GBP', 'GBP', RATES), 77);
});

test('suggested transfer rates keep their precision (UZS -> USD is not rounded to 0.0001)', () => {
  const r = suggestRate('UZS', 'USD', RATES);
  assert.ok(Math.abs(r - 1 / 12650) < 1e-15);
  const shown = formatRate(r);
  assert.equal(shown, '0.0000790514');
  // what the destination receives with the suggested rate, as the store computes it
  const received = parseAmount('1000000') * parseAmount(shown);
  assert.ok(Math.abs(received - 79.05) < 0.01, String(received));
  assert.equal(formatRate(12650), '12650');
  assert.equal(formatRate(16000 / 12650), '1.26482');
  assert.equal(formatRate(0), '');
  assert.ok(!/e/i.test(formatRate(1e-9)), 'never exponent notation');
});

test('currency codes: three letters, normalized', () => {
  for (const ok of ['GBP', 'CHF', 'UZS']) assert.ok(isCurrencyCode(ok), ok);
  for (const bad of ['G8P', 'GB', 'GBPP', 'gbp', '', null, '$$$', 'G P']) assert.ok(!isCurrencyCode(bad), String(bad));
  assert.equal(normalizeCode(' gbp '), 'GBP');
});

test('codes in use and the ones missing a rate', () => {
  const accounts = [{ currency: 'UZS' }, { currency: 'gbp' }, { currency: 'USD' }];
  const txs = [{ currency: 'CHF' }, { currency: 'GBP' }];
  assert.deepEqual(codesInUse(accounts, txs), ['CHF', 'GBP', 'USD', 'UZS']);
  assert.deepEqual(missingRates(codesInUse(accounts, txs), RATES), ['CHF']);
  assert.deepEqual(missingRates(['UZS'], {}), []);
});

test('reading the rate service: found, unsupported, and failures that are not "unsupported"', () => {
  const ok = { result: 'success', rates: { UZS: 1, GBP: 1 / 16000, CHF: 0.0000689655 } };
  const r = readRateResponse(ok, ['GBP', 'chf', 'XYZ']);
  assert.equal(r.ok, true);
  assert.ok(Math.abs(r.found.GBP - 16000) < 1e-6);
  assert.ok(Math.abs(r.found.CHF - 1 / 0.0000689655) < 1e-6);
  assert.deepEqual(r.unsupported, ['XYZ']);
  for (const body of [null, {}, { result: 'error', 'error-type': 'quota-reached' }, { result: 'success' }, 'html']) {
    const f = readRateResponse(body, ['GBP']);
    assert.equal(f.ok, false);
    assert.deepEqual(f.unsupported, [], 'an error is never read as "unsupported"');
    assert.deepEqual(f.found, {});
  }
  // a zero or garbage rate is not a rate
  assert.deepEqual(readRateResponse({ result: 'success', rates: { GBP: 0 } }, ['GBP']).unsupported, ['GBP']);
});

test('retries back off from 15 s to at most 5 min', () => {
  assert.equal(retryDelay(0), 15000);
  assert.equal(retryDelay(1), 30000);
  assert.equal(retryDelay(2), 60000);
  assert.equal(retryDelay(10), 300000);
});

test('amounts keep the currency code, custom codes included', () => {
  assert.equal(formatAmount(1234.5, 'GBP'), '1,234.50 GBP');
  assert.equal(formatAmount(1234.5, 'USD'), '$ 1,234.50 USD');
  assert.equal(formatAmount(1234567, 'UZS'), '1,234,567 UZS');
});
