import useFinanceStore from '../hooks/useFinanceStore.js';
import { TABS } from './Header.jsx';
import { IconAccounts, IconCalendar, IconLedger, IconOverview } from './icons.jsx';

const ICONS = {
  DASHBOARD: IconOverview,
  LEDGER: IconLedger,
  CALENDAR: IconCalendar,
  ACCOUNTS: IconAccounts,
};

/*
 * The phone and small-tablet tab bar (wider screens navigate from the
 * header). Icon over label, 56px targets, clear of the home indicator.
 */
export default function Footer() {
  const activeTab = useFinanceStore((s) => s.activeTab);
  const setActiveTab = useFinanceStore((s) => s.setActiveTab);

  return (
    <footer className="on-scene md:hidden flex-shrink-0 relative z-50 w-full bg-[rgb(var(--bar))] border-t border-white/[0.07] pb-[env(safe-area-inset-bottom)]">
      <nav aria-label="Sections" className="grid grid-cols-4 max-w-lg mx-auto">
        {TABS.map(({ key, label }) => {
          const active = activeTab === key;
          const Icon = ICONS[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              aria-current={active ? 'page' : undefined}
              data-tab={key}
              className={`relative flex flex-col items-center justify-center gap-1 h-16 select-none cursor-pointer motion-btn motion-state ${
                active ? 'text-ink' : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              <span
                className={`absolute top-0 h-[2px] w-8 rounded-full bg-ink transition-opacity duration-[var(--motion-state)] ${active ? 'opacity-100' : 'opacity-0'}`}
                aria-hidden="true"
              />
              <Icon className="w-[22px] h-[22px]" />
              <span className={`text-2xs ${active ? 'font-medium' : ''}`}>{label}</span>
            </button>
          );
        })}
      </nav>
    </footer>
  );
}
