import { useEffect, useState } from 'react';

/*
 * Spent against the month's budget, with the month's pace: the tick marks
 * how much of the month has gone, so a fill short of the tick is on track.
 * The fill eases to its value (--motion-data): white on track, amber when it
 * runs ahead of the month, red over budget.
 */
export default function BudgetMeter({ spent, budget, day, days }) {
  const ratio = budget > 0 ? spent / budget : 0;
  const pace = days > 0 ? day / days : 0;
  const over = ratio > 1;
  const ahead = !over && ratio > pace + 0.05;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(Math.min(1, ratio)));
    return () => cancelAnimationFrame(raf);
  }, [ratio]);

  return (
    <div>
      <div
        className="relative h-2.5 rounded-full bg-white/[0.08]"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        aria-label={`${Math.round(ratio * 100)}% of the budget spent, ${Math.round(pace * 100)}% of the month gone`}
      >
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${over ? 'bg-negative' : ahead ? 'bg-caution' : 'bg-ink'}`}
          style={{ width: `${shown * 100}%`, transition: 'width var(--motion-data) var(--motion-ease)' }}
        />
        <div
          className="absolute -top-1.5 -bottom-1.5 w-[3px] rounded-full bg-ink shadow-[0_0_0_2px_rgb(var(--ground))]"
          style={{ left: `calc(${Math.min(1, pace) * 100}% - 1px)` }}
          aria-hidden="true"
        />
      </div>
      <div className="mt-2.5 flex justify-between gap-4 text-2xs text-ink-3 tnum">
        <span>
          <span className={over ? 'text-negative' : ahead ? 'text-caution' : 'text-ink'}>{Math.round(ratio * 100)}%</span> spent
        </span>
        <span>
          Day {day} of {days}
        </span>
      </div>
    </div>
  );
}
