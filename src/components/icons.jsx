/*
 * The app's icon set: one 24px grid, 1.5 stroke, round joins, currentColor.
 * Decorative by default (aria-hidden); the control that holds one names it.
 */
const Svg = ({ children, className = 'w-5 h-5', strokeWidth = 1.5 }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    className={className}
  >
    {children}
  </svg>
);

export const IconOverview = (p) => (
  <Svg {...p}>
    <path d="M4 19V11" />
    <path d="M9.33 19V5" />
    <path d="M14.67 19v-6" />
    <path d="M20 19V8" />
  </Svg>
);

export const IconLedger = (p) => (
  <Svg {...p}>
    <path d="M5 6h14" />
    <path d="M5 12h14" />
    <path d="M5 18h9" />
  </Svg>
);

export const IconCalendar = (p) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17" />
    <path d="M8 3v4" />
    <path d="M16 3v4" />
  </Svg>
);

export const IconAccounts = (p) => (
  <Svg {...p}>
    <rect x="3" y="6" width="18" height="13" rx="2.5" />
    <path d="M3 10.5h18" />
    <path d="M16 15h2" />
  </Svg>
);

export const IconPlus = (p) => (
  <Svg {...p}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Svg>
);

export const IconClose = (p) => (
  <Svg {...p}>
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </Svg>
);

export const IconEdit = (p) => (
  <Svg {...p}>
    <path d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4Z" />
    <path d="M13.5 6.5l4 4" />
  </Svg>
);

export const IconTrash = (p) => (
  <Svg {...p}>
    <path d="M4 7h16" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
    <path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" />
  </Svg>
);

export const IconTransfer = (p) => (
  <Svg {...p}>
    <path d="M4 8h14" />
    <path d="M15 4.5L18.5 8 15 11.5" />
    <path d="M20 16H6" />
    <path d="M9 12.5L5.5 16 9 19.5" />
  </Svg>
);

export const IconArrowRight = (p) => (
  <Svg {...p}>
    <path d="M5 12h14" />
    <path d="M13 6l6 6-6 6" />
  </Svg>
);

export const IconChevronLeft = (p) => (
  <Svg {...p}>
    <path d="M15 18l-6-6 6-6" />
  </Svg>
);

export const IconChevronRight = (p) => (
  <Svg {...p}>
    <path d="M9 18l6-6-6-6" />
  </Svg>
);

export const IconChevronDown = (p) => (
  <Svg {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);

export const IconCheck = (p) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);

export const IconSortDesc = (p) => (
  <Svg {...p}>
    <path d="M8 4v16" />
    <path d="M4 16l4 4 4-4" />
    <path d="M14 6h6" />
    <path d="M14 11h4" />
    <path d="M14 16h2" />
  </Svg>
);

export const IconSortAsc = (p) => (
  <Svg {...p}>
    <path d="M8 20V4" />
    <path d="M4 8l4-4 4 4" />
    <path d="M14 6h2" />
    <path d="M14 11h4" />
    <path d="M14 16h6" />
  </Svg>
);

export const IconEye = (p) => (
  <Svg {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.75" />
  </Svg>
);

/* Nomoz mode: a cat's head */
export const IconCat = (p) => (
  <Svg {...p}>
    <path d="M5 20v-9.5L4 4l5 3.5h6L20 4l-1 6.5V20" />
    <path d="M5 20h14" />
    <path d="M9.5 13.5h.01" strokeWidth="2.5" />
    <path d="M14.5 13.5h.01" strokeWidth="2.5" />
  </Svg>
);

/* City mode: towers */
export const IconCity = (p) => (
  <Svg {...p}>
    <path d="M3 21h18" />
    <path d="M5 21V10h5v11" />
    <path d="M10 21V4h6v17" />
    <path d="M16 21v-8h3v8" />
    <path d="M13 8h.01M13 12h.01M13 16h.01" strokeWidth="2" />
  </Svg>
);

export const IconImage = (p) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <circle cx="9" cy="10" r="1.75" />
    <path d="M20.5 16l-5-5-9 8.5" />
  </Svg>
);

export const IconHeart = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className} fill="currentColor">
    <path d="M12 20.5s-8-4.9-8-11A4.5 4.5 0 0 1 12 6.6 4.5 4.5 0 0 1 20 9.5c0 6.1-8 11-8 11Z" />
  </svg>
);

export const IconAlert = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5" />
    <path d="M12 16h.01" strokeWidth="2.25" />
  </Svg>
);

/* the app's mark: a crescent, for an app that lives at night */
export const IconMark = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className} fill="currentColor">
    <path d="M14.5 3.2a9 9 0 1 0 6.3 13.9A7.4 7.4 0 0 1 14.5 3.2Z" />
  </svg>
);

/* a folded note */
export const IconNote = (p) => (
  <Svg {...p}>
    <path d="M4 7.5 12 13l8-5.5" />
    <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
  </Svg>
);
