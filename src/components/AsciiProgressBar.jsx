export default function AsciiProgressBar({ value, max, width = 20 }) {
  const percentage = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;

  /*
   * value > max (over budget) is announced once, globally, by
   * Anomaly.jsx's OverBudgetIndicator — that overlay is visible on
   * every tab including this one, so repeating "[ ! OVER BUDGET ! ]"
   * here would show the same text twice on Dashboard. The bar still
   * renders maxed out at 100% so this component keeps showing the
   * spend-vs-budget shape rather than disappearing.
   */
  return (
    <span className="font-mono text-sm md:text-base whitespace-nowrap">
      [{'|'.repeat(filled)}{'_'.repeat(empty)}] {percentage}%
    </span>
  );
}
