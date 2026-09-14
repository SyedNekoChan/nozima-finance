import {
  DEFAULT_EXCHANGE_RATES,
  PRIMARY_CURRENCY,
  SPECIAL_CURRENCY_SYMBOLS,
} from './constants.js';

// UZS is the pivot, so its rate is always 1 and never stored in the rates table
const getRate = (code, rates) => (code === PRIMARY_CURRENCY ? 1 : rates[code]);

export function getCurrencySymbol(code) {
  const symbol = SPECIAL_CURRENCY_SYMBOLS[code];
  return symbol === undefined ? code : symbol;
}

export function formatAmount(amount, currencyCode = PRIMARY_CURRENCY) {
  const value = Number(amount) || 0;
  const isBase = currencyCode === PRIMARY_CURRENCY;
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

export function convertToBase(amount, fromCurrency, rates = DEFAULT_EXCHANGE_RATES) {
  if (fromCurrency === PRIMARY_CURRENCY) return amount;

  const rate = getRate(fromCurrency, rates);
  if (!rate) {
    console.warn(`[currency] Missing exchange rate for ${fromCurrency}`);
    return 0;
  }
  return amount * rate;
}

export function convertBetween(amount, fromCurrency, toCurrency, rates = DEFAULT_EXCHANGE_RATES) {
  if (fromCurrency === toCurrency) return amount;

  const fromRate = getRate(fromCurrency, rates);
  const toRate = getRate(toCurrency, rates);
  if (!fromRate || !toRate) {
    console.warn(`[currency] Missing exchange rate for ${fromCurrency} or ${toCurrency}`);
    return 0;
  }
  return (amount * fromRate) / toRate;
}

export function parseAmount(inputString) {
  if (typeof inputString === 'number') return Number.isNaN(inputString) ? 0 : inputString;
  if (!inputString) return 0;

  // Keep digits, minus and a single decimal point; drop symbols, codes and separators
  const cleaned = String(inputString).replace(/[^0-9.-]/g, '');
  const parsed = Number.parseFloat(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
}
