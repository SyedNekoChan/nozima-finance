import { useRateGaps } from '../hooks/useExchangeRates.js';
import { IconAlert } from './icons.jsx';

const list = (codes) => (codes.length < 2 ? codes.join('') : `${codes.slice(0, -1).join(', ')} and ${codes[codes.length - 1]}`);

/*
 * Says which currencies in use have no exchange rate, and why, wherever a UZS
 * total is shown. Without a rate an amount is left out of those totals (it is
 * never converted at a guessed rate), and this is where the person learns so.
 * Renders nothing when every currency has a rate.
 */
export default function RateNotice({ className = '' }) {
  const gaps = useRateGaps();
  if (gaps.length === 0) return null;
  const unsupported = gaps.filter((g) => g.status === 'unsupported').map((g) => g.code);
  const waiting = gaps.filter((g) => g.status !== 'unsupported');
  const unreachable = waiting.filter((g) => g.status === 'unavailable').map((g) => g.code);
  const pending = waiting.filter((g) => g.status !== 'unavailable').map((g) => g.code);

  return (
    <div role="status" data-rate-notice="" className={`flex items-start gap-2.5 rounded border border-caution/35 bg-caution/[0.1] px-3 py-2.5 text-xs text-ink-2 ${className}`}>
      <IconAlert className="w-4 h-4 mt-px flex-shrink-0 text-caution" />
      <div className="space-y-1 min-w-0">
        {unreachable.length > 0 && (
          <p>
            <span className="text-ink font-medium">No exchange rate for {list(unreachable)} yet.</span> The rate service can't be reached; trying again. Amounts in{' '}
            {list(unreachable)} are left out of UZS totals until then.
          </p>
        )}
        {pending.length > 0 && (
          <p>
            <span className="text-ink font-medium">Getting the exchange rate for {list(pending)}…</span> Amounts in {list(pending)} are left out of UZS totals until it arrives.
          </p>
        )}
        {unsupported.length > 0 && (
          <p>
            <span className="text-ink font-medium">No exchange rate exists for {list(unsupported)}.</span> The rate service doesn't recognise{' '}
            {unsupported.length > 1 ? 'these codes' : 'this code'}, so amounts in {list(unsupported)} are left out of UZS totals. Check the account's currency code.
          </p>
        )}
      </div>
    </div>
  );
}
