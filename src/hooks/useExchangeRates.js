import { useEffect } from 'react';
import { create } from 'zustand';
import useFinanceStore from './useFinanceStore.js';
import { PRIMARY_CURRENCY } from '../lib/constants.js';
import { codesInUse, isCurrencyCode, missingRates, normalizeCode, readRateResponse, retryDelay } from '../lib/rates.js';

/*
 * Exchange rates for every currency in use (see lib/rates.js).
 *
 * Preset currencies carry their stored rates (DEFAULT_EXCHANGE_RATES, then
 * anything saved). Any other code is fetched once from the rate service and
 * saved with setExchangeRate, so it survives reloads. A code the service
 * cannot be asked about right now is retried with a backoff, when the device
 * comes back online and when the app returns to the foreground; a code the
 * service does not know is marked unsupported. Nothing ever gets a guessed
 * rate: until a real one arrives, amounts in that currency are left out of
 * UZS totals and the screens say so (useRateGaps, components/RateNotice).
 */

// rates[CODE] = units of CODE per 1 UZS
const RATES_URL = `https://open.er-api.com/v6/latest/${PRIMARY_CURRENCY}`;

// per-code status for this session: 'pending' | 'unavailable' | 'unsupported'
export const useRateStatus = create((set) => ({
  status: {},
  mark: (codes, value) =>
    set((s) => {
      const status = { ...s.status };
      for (const c of codes) {
        if (value) status[c] = value;
        else delete status[c];
      }
      return { status };
    }),
}));

let inflight = null;

/*
 * Fetches a UZS rate for every valid code in use (plus `extra`) that has none.
 * Concurrent calls share one request. Resolves to
 *   { ok, unavailable: [codes], unsupported: [codes] }
 * where ok means every wanted code now has a rate.
 */
export function ensureExchangeRates(extra = []) {
  if (inflight) return inflight.then(() => fetchMissing(extra));
  return fetchMissing(extra);
}

async function fetchMissing(extra) {
  const s = useFinanceStore.getState();
  const known = useRateStatus.getState().status;
  const wanted = [...new Set([...extra.map(normalizeCode), ...codesInUse(s.accounts, s.transactions)])];
  // a code that can never have a rate (not three letters) is reported, never requested
  const invalid = wanted.filter((c) => c !== PRIMARY_CURRENCY && !isCurrencyCode(c));
  const missing = missingRates(wanted, s.exchangeRates).filter((c) => isCurrencyCode(c));
  // codes already found unsupported are only asked about again when named explicitly (`extra`)
  const ask = missing.filter((c) => known[c] !== 'unsupported' || extra.map(normalizeCode).includes(c));
  if (invalid.length) useRateStatus.getState().mark(invalid, 'unsupported');
  if (ask.length === 0) {
    const unsupported = [...invalid, ...missing.filter((c) => known[c] === 'unsupported')];
    return { ok: unsupported.length === 0, unavailable: [], unsupported };
  }

  useRateStatus.getState().mark(ask, 'pending');
  const run = (async () => {
    let answer = { ok: false, found: {}, unsupported: [] };
    try {
      const res = await fetch(RATES_URL);
      answer = readRateResponse(await res.json(), ask);
    } catch {
      // unreachable: stays unavailable, retried by useExchangeRates
    }
    for (const [code, rate] of Object.entries(answer.found)) {
      await useFinanceStore.getState().setExchangeRate(code, rate);
    }
    const mark = useRateStatus.getState().mark;
    mark(Object.keys(answer.found), null);
    mark(answer.unsupported, 'unsupported');
    const unavailable = answer.ok ? [] : ask;
    mark(unavailable, 'unavailable');
    return { unsupported: answer.unsupported, unavailable };
  })();
  inflight = run;
  try {
    const r = await run;
    const unsupported = [...invalid, ...r.unsupported, ...missing.filter((c) => !ask.includes(c))];
    return { ok: unsupported.length === 0 && r.unavailable.length === 0, unavailable: r.unavailable, unsupported };
  } finally {
    if (inflight === run) inflight = null;
  }
}

/*
 * Codes in use that have no rate, each with its status, for the notices:
 * [{ code, status }] ('pending' when nothing has been tried yet).
 */
export function useRateGaps() {
  const key = useFinanceStore((s) => missingRates(codesInUse(s.accounts, s.transactions), s.exchangeRates).join(','));
  const status = useRateStatus((s) => s.status);
  if (!key) return [];
  return key.split(',').map((code) => ({ code, status: isCurrencyCode(code) ? status[code] || 'pending' : 'unsupported' }));
}

export default function useExchangeRates() {
  const isLoaded = useFinanceStore((s) => s.isLoaded);
  const uzsRate = useFinanceStore((s) => s.exchangeRates[PRIMARY_CURRENCY]);
  const missingKey = useFinanceStore((s) => missingRates(codesInUse(s.accounts, s.transactions), s.exchangeRates).join(','));

  // pivot entry keeps generic rate[src] / rate[dst] lookups working for UZS too
  useEffect(() => {
    if (isLoaded && uzsRate !== 1) useFinanceStore.getState().setExchangeRate(PRIMARY_CURRENCY, 1);
  }, [isLoaded, uzsRate]);

  // whenever a currency in use lacks a rate: ask, and keep asking while it is unreachable
  useEffect(() => {
    if (!isLoaded || !missingKey) return undefined;
    let cancelled = false;
    let timer = 0;
    let attempt = 0;
    const tryNow = async () => {
      clearTimeout(timer);
      const r = await ensureExchangeRates();
      if (cancelled || r.unavailable.length === 0) return;
      timer = setTimeout(tryNow, retryDelay(attempt++));
    };
    const onBack = () => {
      if (document.visibilityState === 'visible') {
        attempt = 0;
        tryNow();
      }
    };
    tryNow();
    window.addEventListener('online', onBack);
    document.addEventListener('visibilitychange', onBack);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('online', onBack);
      document.removeEventListener('visibilitychange', onBack);
    };
  }, [isLoaded, missingKey]);
}
