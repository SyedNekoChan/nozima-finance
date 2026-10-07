import { formatAmount } from '../lib/currency.js';
import useTweenedText from '../hooks/useTweenedText.js';

/*
 * Drop-in replacement for `{formatAmount(value, currency)}` that eases
 * between values instead of snapping. Formatting still goes through
 * formatAmount, so any currency code the app handles works unchanged.
 */
export default function AnimatedAmount({ value, currency = 'UZS', className }) {
  const ref = useTweenedText(
    Number(value) || 0,
    (v) => formatAmount(v, currency),
    currency
  );

  return <span ref={ref} className={className} />;
}
