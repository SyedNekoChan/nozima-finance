/*
 * Shared motion tokens. Every transition in the app draws its timing and
 * easing from here (JS) or from the matching CSS custom properties in
 * styles/index.css, so durations stay in four fixed tiers:
 *
 *   micro   ~120ms  hover / pressed / focus feedback
 *   state   ~180ms  UI state changes (tab fill, field reveal, popovers)
 *   content ~220ms  content swaps (tabs, modals, calendar months, lists)
 *   data    ~320ms  financial figures and progress values
 *
 * One ease-out curve everywhere: no springs, no bounce.
 */
export const DUR = {
  micro: 0.12,
  state: 0.18,
  content: 0.22,
  data: 0.32,
  exit: 0.14,
};

export const EASE = [0.2, 0, 0, 1];

// px offsets, deliberately small and terminal-like
export const SHIFT = {
  tab: 6,
  modal: 10,
  popover: 5,
  month: 8,
  item: 4,
  error: 3,
};

export const tabVariants = {
  enter: (dir) => ({ opacity: 0, x: dir * SHIFT.tab }),
  center: { opacity: 1, x: 0, transition: { duration: DUR.content, ease: EASE } },
  exit: (dir) => ({
    opacity: 0,
    x: -dir * SHIFT.tab,
    transition: { duration: DUR.state, ease: EASE },
  }),
};

export const monthVariants = {
  enter: (dir) => ({ opacity: 0, x: dir * SHIFT.month }),
  center: { opacity: 1, x: 0, transition: { duration: DUR.state, ease: EASE } },
  exit: (dir) => ({
    opacity: 0,
    x: -dir * SHIFT.month,
    transition: { duration: DUR.micro, ease: EASE },
  }),
};
