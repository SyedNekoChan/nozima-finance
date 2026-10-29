import { useEffect, useReducer } from 'react';
import { getCurrentMonthKey } from '../lib/date.js';

const MAX_TIMEOUT = 2 ** 31 - 1; // setTimeout's limit (~24.8 days); a month can be longer

// Milliseconds from `now` to the first instant of the next local month (plus a
// second of margin so a timer that fires a hair early still lands in it).
export function msUntilNextMonth(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return Math.min(next.getTime() - now.getTime() + 1000, MAX_TIMEOUT);
}

/*
 * The current local month ("YYYY-MM"), read on every render, so components
 * whose derived values depend on "this month" (the pet's mood: spent this
 * month, income this month, this month's budget) can re-derive when it
 * changes. A store subscription alone never notices a rollover, because
 * nothing in the store changes at midnight.
 *
 * It re-renders its component at the month boundary with ONE timer per
 * month (not a ticking clock, so it costs nothing under reduced motion), and
 * again when the page wakes up (visible, focused, restored from the cache),
 * which covers a computer that slept or a clock that was changed.
 */
export default function useCurrentMonth() {
  const [, refresh] = useReducer((n) => n + 1, 0);
  const month = getCurrentMonthKey();

  useEffect(() => {
    let timer = null;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        refresh();
        arm();
      }, msUntilNextMonth());
    };
    arm();

    const wake = () => {
      refresh();
      arm();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('pageshow', wake);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
      window.removeEventListener('pageshow', wake);
    };
  }, [month]);

  return month;
}
