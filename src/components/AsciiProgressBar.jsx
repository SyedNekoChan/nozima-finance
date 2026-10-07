import useTweenedText from '../hooks/useTweenedText.js';

const render = (pct, width) => {
  const percentage = Math.round(pct);
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return `[${'|'.repeat(filled)}${'_'.repeat(empty)}] ${percentage}%`;
};

export default function AsciiProgressBar({ value, max, width = 20, className = '' }) {
  // the capped ratio is what eases, so the bar and the percentage move together
  // and the over-budget state still renders maxed out at 100%
  const ratio = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const ref = useTweenedText(ratio, (v) => render(v, width), width);

  /*
   * value > max (over budget) is announced once, globally, by
   * Anomaly.jsx's OverBudgetIndicator — that overlay is visible on
   * every tab including this one, so repeating "[ ! OVER BUDGET ! ]"
   * here would show the same text twice on Dashboard. The bar still
   * renders maxed out at 100% so this component keeps showing the
   * spend-vs-budget shape rather than disappearing.
   */
  return (
    <span
      ref={ref}
      className={`font-mono text-xs sm:text-sm md:text-base whitespace-nowrap ${className}`}
    />
  );
}
