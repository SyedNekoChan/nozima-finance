import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { formatTime } from '../lib/date.js';
import { nextVisualMode } from '../lib/visualMode.js';
import { DUR, EASE } from '../lib/motion.js';
import useVisualMode from '../hooks/useVisualMode.js';
import useFinanceStore from '../hooks/useFinanceStore.js';
import useNote from '../hooks/useNote.js';
import { IconCat, IconCity, IconEye, IconMark } from './icons.jsx';

export const TABS = [
  { key: 'DASHBOARD', label: 'Dashboard' },
  { key: 'LEDGER', label: 'Ledger' },
  { key: 'CALENDAR', label: 'Calendar' },
  { key: 'ACCOUNTS', label: 'Accounts' },
];

// what the mode control calls each backdrop
export const MODE_NAMES = { pet: 'Nomoz', city: 'City' };

const utilBtn =
  'inline-flex items-center justify-center gap-2 h-11 rounded text-ink-2 hover:text-ink hover:bg-white/[0.06] active:bg-white/[0.1] motion-btn select-none cursor-pointer';

/*
 * The backdrop's visual mode: Nomoz (the pet) or City. One button that
 * shows the current scene and switches to the other. Its label is the
 * scene's name; on phones the name is read out but only the icon shows.
 */
export function ModeToggle({ className = '', compact = false, style }) {
  const mode = useVisualMode((s) => s.mode);
  const toggle = useVisualMode((s) => s.toggle);
  const next = nextVisualMode(mode);
  const Icon = mode === 'city' ? IconCity : IconCat;
  return (
    <button
      type="button"
      onClick={toggle}
      data-mode-toggle={mode}
      style={style}
      aria-label={`Scene: ${MODE_NAMES[mode]}. Switch to ${MODE_NAMES[next]}.`}
      title={`Switch to ${MODE_NAMES[next]}`}
      className={`${utilBtn} ${compact ? 'w-11' : 'px-3'} ${className}`}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      <span className={compact ? 'sr-only' : 'text-sm'}>{MODE_NAMES[mode]}</span>
    </button>
  );
}

/*
 * Observation mode: puts the finance interface away and leaves only the
 * environment (see Observation.jsx).
 */
function ObserveToggle({ className = '', compact = false }) {
  const setObserving = useVisualMode((s) => s.setObserving);
  return (
    <button
      type="button"
      onClick={() => setObserving(true)}
      data-observe-toggle=""
      aria-label="Observe: hide the interface and watch the scene"
      title="Observe the scene"
      className={`${utilBtn} ${compact ? 'w-11' : 'px-3'} ${className}`}
    >
      <IconEye className="w-5 h-5 flex-shrink-0" />
      {!compact && <span className="text-sm">Observe</span>}
    </button>
  );
}

/*
 * The persistent over-budget signal: shown in the header on every tab while
 * this month's spending is over the budget. Level-based, never dismissed.
 */
function OverBudgetSignal() {
  const over = useFinanceStore((s) => s.getIsOverBudgetThisMonth());
  if (!over) return null;
  return (
    <span
      role="status"
      data-over-budget=""
      className="inline-flex items-center gap-2 h-7 px-2.5 rounded-full bg-negative/[0.14] border border-negative/40 text-negative text-2xs font-medium whitespace-nowrap"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-negative signal-breathe" aria-hidden="true" />
      <span className="max-[374px]:sr-only">Over budget</span>
    </span>
  );
}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono text-2xs text-ink-2 tnum whitespace-nowrap">{formatTime(now)}</span>;
}

export default function Header() {
  const openNote = useNote((s) => s.setOpen);
  const activeTab = useFinanceStore((s) => s.activeTab);
  const setActiveTab = useFinanceStore((s) => s.setActiveTab);

  return (
    <header className="on-scene flex-shrink-0 relative z-30 w-full h-14 md:h-16 bg-[rgb(var(--bar))] border-b border-white/[0.07]">
      <div className="frame h-full flex items-center gap-3 md:gap-8">
        {/* the mark; it also opens the note, quietly */}
        <button
          type="button"
          onClick={() => openNote(true)}
          data-action="system-message"
          aria-label="Finance. Open the note"
          title="Finance"
          className="flex-shrink-0 -ml-2 pl-2 pr-3 h-11 inline-flex items-center gap-2.5 rounded text-ink hover:bg-white/[0.05] motion-btn cursor-pointer select-none"
        >
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-white text-ground">
            <IconMark className="w-4 h-4 -rotate-12" />
          </span>
          <span className="text-[15px] font-semibold tracking-[-0.01em] max-[374px]:sr-only">Finance</span>
        </button>

        <nav aria-label="Sections" className="hidden md:flex items-stretch h-full gap-1">
          {TABS.map((t) => {
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                aria-current={active ? 'page' : undefined}
                data-tab={t.key}
                className={`relative px-3 text-sm motion-btn cursor-pointer select-none ${
                  active ? 'text-ink font-medium' : 'text-ink-2 hover:text-ink'
                }`}
              >
                {t.label}
                {active && (
                  <motion.span
                    layoutId="nav-indicator"
                    className="absolute left-3 right-3 -bottom-px h-[2px] rounded-full bg-ink"
                    transition={{ duration: DUR.content, ease: EASE }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:gap-4 min-w-0">
          <OverBudgetSignal />
          <Clock />
          {/* the scene controls: the mode toggle closes the row on every screen */}
          <div data-scene-controls="" className="flex items-stretch -mr-2 lg:mr-0">
            <ObserveToggle compact className="lg:hidden" />
            <ObserveToggle className="hidden lg:inline-flex" />
            <ModeToggle compact className="lg:hidden" />
            <ModeToggle className="hidden lg:inline-flex" />
          </div>
        </div>
      </div>
    </header>
  );
}
