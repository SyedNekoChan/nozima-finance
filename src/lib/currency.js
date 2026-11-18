import {
  DEFAULT_EXCHANGE_RATES,
  PRIMARY_CURRENCY,
  SPECIAL_CURRENCY_SYMBOLS,
} from './constants.js';

const normCode = (code) => String(code || '').trim().toUpperCase();

// UZS is the pivot, so its rate is always 1; any other code is looked up by normalized 3-letter code
const getRate = (code, rates) => {
  const c = normCode(code);
  return c === PRIMARY_CURRENCY ? 1 : rates?.[c] ?? rates?.[code];
};

export { getRate };

export function getCurrencySymbol(code) {
  // unknown codes have no sign; the code suffix is shown instead
  return SPECIAL_CURRENCY_SYMBOLS[normCode(code)] || '';
}

export function formatAmount(amount, currencyCode = PRIMARY_CURRENCY) {
  const value = Number(amount) || 0;
  const isBase = normCode(currencyCode) === PRIMARY_CURRENCY;
  const decimals = isBase ? 0 : 2;

  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  if (isBase) return `${formatted} ${PRIMARY_CURRENCY}`;

  const symbol = getCurrencySymbol(currencyCode);
  // Empty symbol means no known sign — fall back to the code alone
  return symbol ? `${symbol} ${formatted} ${currencyCode}` : `${formatted} ${currencyCode}`;
}

// whether `code` can be converted to UZS with `rates` (UZS always can)
export function hasRate(code, rates) {
  return Number(getRate(code, rates)) > 0;
}

// one console warning per missing code, not one per render
const warned = new Set();
const warnMissing = (code) => {
  const c = normCode(code);
  if (warned.has(c)) return;
  warned.add(c);
  console.warn(`[currency] No exchange rate for ${c}: amounts in ${c} are left out of UZS totals until one is available`);
};

/*
 * Converts to UZS. A currency without a rate converts to 0 so totals stay
 * finite, but it is never silent to the person: every screen that shows a
 * UZS total checks for missing rates (useRateGaps) and says what is left out.
 * No rate is ever invented here.
 */
export function convertToBase(amount, fromCurrency, rates = DEFAULT_EXCHANGE_RATES) {
  if (normCode(fromCurrency) === PRIMARY_CURRENCY) return amount;

  const rate = getRate(fromCurrency, rates);
  if (!(Number(rate) > 0)) {
    warnMissing(fromCurrency);
    return 0;
  }
  return amount * rate;
}

export function convertBetween(amount, fromCurrency, toCurrency, rates = DEFAULT_EXCHANGE_RATES) {
  if (normCode(fromCurrency) === normCode(toCurrency)) return amount;

  const fromRate = getRate(fromCurrency, rates);
  const toRate = getRate(toCurrency, rates);
  if (!(Number(fromRate) > 0) || !(Number(toRate) > 0)) {
    warnMissing(Number(fromRate) > 0 ? toCurrency : fromCurrency);
    return 0;
  }
  return (amount * fromRate) / toRate;
}

/*
 * The rate to suggest for a cross-currency transfer: units of `to` per one
 * unit of `from`, or null when either currency has no rate (the person then
 * types one; nothing is guessed).
 */
export function suggestRate(fromCurrency, toCurrency, rates) {
  if (!hasRate(fromCurrency, rates) || !hasRate(toCurrency, rates)) return null;
  return getRate(fromCurrency, rates) / getRate(toCurrency, rates);
}

/*
 * A rate as the person sees and edits it: six significant digits, never
 * rounded away (1 UZS = 0.0000790514 USD, not 0.0001), never in exponent
 * form (parseAmount would misread it), no trailing zeros.
 */
export function formatRate(rate) {
  const r = Number(rate);
  if (!(r > 0) || !Number.isFinite(r)) return '';
  const decimals = Math.min(12, Math.max(4, 5 - Math.floor(Math.log10(r))));
  return r.toFixed(decimals).replace(/\.?0+$/, '');
}

export function parseAmount(inputString) {
  if (typeof inputString === 'number') return Number.isNaN(inputString) ? 0 : inputString;
  if (!inputString) return 0;

  // Keep digits, minus and a single decimal point; drop symbols, codes and separators
  const cleaned = String(inputString).replace(/[^0-9.-]/g, '');
  const parsed = Number.parseFloat(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
}
