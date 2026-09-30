import { useEffect } from 'react';
import useFinanceStore from './useFinanceStore.js';
import { PRIMARY_CURRENCY } from '../lib/constants.js';

// UZS-based table: rates[CODE] = units of CODE per 1 UZS
const RATES_URL = `https://open.er-api.com/v6/latest/${PRIMARY_CURRENCY}`;

const normalize = (c) => String(c || '').trim().toUpperCase();

// Fetches a UZS rate for every currency in use that has none; true when all resolved
export async function ensureExchangeRates(extra = []) {
  const s = useFinanceStore.getState();
  const codes = new Set(
    [...extra, ...s.accounts.map((a) => a.currency), ...s.transactions.map((t) => t.currency)].map(normalize)
  );
  const isMissing = (c, rates) => /^[A-Z]{3}$/.test(c) && c !== PRIMARY_CURRENCY && !(rates[c] > 0);
  const missing = [...codes].filter((c) => isMissing(c, s.exchangeRates));
  if (missing.length === 0) return true;

  try {
    const res = await fetch(RATES_URL);
    const data = await res.json();
    const rates = data?.rates || {};
    for (const c of missing) {
      const perUzs = Number(rates[c]);
      if (perUzs > 0) await useFinanceStore.getState().setExchangeRate(c, 1 / perUzs);
    }
  } catch {
    // offline: retried on next data change
  }

  const latest = useFinanceStore.getState().exchangeRates;
  return missing.every((c) => !isMissing(c, latest));
}

export default function useExchangeRates() {
  const isLoaded = useFinanceStore((s) => s.isLoaded);
  const uzsRate = useFinanceStore((s) => s.exchangeRates[PRIMARY_CURRENCY]);
  const currencyKey = useFinanceStore((s) =>
    [...new Set([...s.accounts.map((a) => a.currency), ...s.transactions.map((t) => t.currency)].map(normalize))]
      .sort()
      .join(',')
  );

  // pivot entry keeps generic rate[src] / rate[dst] suggestions working for UZS too
  useEffect(() => {
    if (isLoaded && uzsRate !== 1) useFinanceStore.getState().setExchangeRate(PRIMARY_CURRENCY, 1);
  }, [isLoaded, uzsRate]);

  useEffect(() => {
    if (isLoaded) ensureExchangeRates();
  }, [isLoaded, currencyKey]);
}
