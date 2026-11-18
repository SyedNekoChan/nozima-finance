import { formatAmount } from '../lib/currency.js';
import { figure } from '../lib/format.js';
import useTweenedText from '../hooks/useTweenedText.js';

/*
 * A money figure that eases between values instead of snapping (320ms,
 * zero React renders per frame). Formatting still goes through
 * formatAmount, so any currency code the app handles works unchanged.
 *
 * split: the figure and its currency code are set separately, the code
 * smaller and quieter (`codeClassName`). `sign` forces a leading + / −.
 */
export default function AnimatedAmount({ value, currency = 'UZS', className = '', split = false, codeClassName = '', sign = false }) {
  const v = Number(value) || 0;
  const signed = (text, n) => (sign && n > 0 ? `+${text}` : text);
  const ref = useTweenedText(
    v,
    split ? (n) => signed(figure(n, currency), n) : (n) => signed(formatAmount(n, currency), n),
    currency
  );

  if (!split) return <span ref={ref} className={`tnum ${className}`} />;

  const code = (formatAmount(0, currency).match(/([A-Z]{3})$/) || [])[1] || '';
  return (
    <span className={`tnum whitespace-nowrap ${className}`}>
      <span ref={ref} />
      {code && <span className={`ml-[0.3em] ${codeClassName || 'text-[max(12px,0.5em)] font-mono font-normal tracking-wide text-ink-3 align-[0.15em]'}`}>{code}</span>}
    </span>
  );
}

/* the same, without the tween: rows, lists, anything static */
export function Amount({ value, currency = 'UZS', className = '', codeClassName = 'ml-1 font-mono text-[max(12px,0.72em)] text-ink-3', sign }) {
  const v = Number(value) || 0;
  const code = (formatAmount(0, currency).match(/([A-Z]{3})$/) || [])[1] || '';
  let text = figure(v, currency);
  if (sign === '+') text = `+${text}`;
  if (sign === '-') text = `−${text.replace(/^−/, '')}`;
  return (
    <span className={`tnum whitespace-nowrap ${className}`}>
      {text}
      {code && <span className={codeClassName}>{code}</span>}
    </span>
  );
}
