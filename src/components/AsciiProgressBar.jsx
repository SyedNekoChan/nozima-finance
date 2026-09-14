export default function AsciiProgressBar({ value, max, width = 20 }) {
  const percentage = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;

  if (value > max) {
    return (
      <span className="font-mono text-sm md:text-base whitespace-nowrap">
        [ ! OVER BUDGET ! ]
      </span>
    );
  }

  return (
    <span className="font-mono text-sm md:text-base whitespace-nowrap">
      [{'|'.repeat(filled)}{'_'.repeat(empty)}] {percentage}%
    </span>
  );
}
