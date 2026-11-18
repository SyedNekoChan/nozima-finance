/*
 * Exchange-rate acquisition, as pure functions (see hooks/useExchangeRates.js
 * for the side effects and lib/currency.js for conversion).
 *
 * Rates are stored as UZS per one unit of the currency (rates.USD = 12650).
 * The rate service (open.er-api.com, base UZS) answers in the other direction,
 * units of the currency per one UZS, so a stored rate is 1 / its answer.
 *
 * A code without a rate is never given one by default: it is either
 *   pending      a request is on its way, or none has been made yet
 *   unavailable  the service could not be reached; retried later
 *   unsupported  the service answered and does not know the code
 * and amounts in it are left out of UZS totals, with a notice (RateNotice).
 */
import { PRIMARY_CURRENCY } from './constants.js';

export const normalizeCode = (code) => String(code ?? '').trim().toUpperCase();

// an ISO 4217-shaped code: exactly three letters
export const isCurrencyCode = (code) => /^[A-Z]{3}$/.test(String(code ?? ''));

// every currency the data uses, normalized, sorted
export function codesInUse(accounts = [], transactions = []) {
  return [...new Set([...accounts.map((a) => a.currency), ...transactions.map((t) => t.currency)].map(normalizeCode))]
    .filter(Boolean)
    .sort();
}

// codes that need a rate and have none (UZS is the pivot and always has one)
export function missingRates(codes, rates) {
  return codes.map(normalizeCode).filter((c) => c !== PRIMARY_CURRENCY && !(Number(rates?.[c]) > 0));
}

/*
 * Reads a rate-service answer for the codes wanted.
 *   ok          the service answered successfully
 *   found       { CODE: UZS per unit } for every wanted code it knows
 *   unsupported wanted codes it answered without (only when ok)
 * Anything else (an error result, a malformed body) is ok: false: nothing is
 * known to be unsupported, the request should simply be tried again later.
 */
export function readRateResponse(data, wanted) {
  const ok = Boolean(data && data.result === 'success' && data.rates && typeof data.rates === 'object');
  const found = {};
  const unsupported = [];
  if (!ok) return { ok, found, unsupported };
  for (const code of wanted.map(normalizeCode)) {
    const perUzs = Number(data.rates[code]);
    if (perUzs > 0 && Number.isFinite(perUzs)) found[code] = 1 / perUzs;
    else unsupported.push(code);
  }
  return { ok, found, unsupported };
}

// how long to wait before the next attempt after `attempt` failures: 15 s, 30 s, 1 min ... at most 5 min
export const retryDelay = (attempt) => Math.min(5 * 60 * 1000, 15000 * 2 ** Math.max(0, attempt));
