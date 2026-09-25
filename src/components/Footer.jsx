import useFinanceStore from '../hooks/useFinanceStore.js';

const TABS = ['DASHBOARD', 'LEDGER', 'CALENDAR', 'ACCOUNTS'];

const ICONS = {
  DASHBOARD: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
      <rect x="3" y="3" width="8" height="8" />
      <rect x="13" y="3" width="8" height="5" />
      <rect x="13" y="10" width="8" height="11" />
      <rect x="3" y="13" width="8" height="8" />
    </svg>
  ),
  LEDGER: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
      <rect x="4" y="3" width="16" height="18" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="13" y2="16" />
    </svg>
  ),
  CALENDAR: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
      <rect x="3" y="5" width="18" height="16" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="16" y1="2" x2="16" y2="6" />
    </svg>
  ),
  ACCOUNTS: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
      <rect x="2" y="7" width="20" height="13" />
      <path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
      <line x1="2" y1="12" x2="22" y2="12" />
    </svg>
  ),
};

export default function Footer() {
  const activeTab = useFinanceStore((s) => s.activeTab);
  const setActiveTab = useFinanceStore((s) => s.setActiveTab);

  return (
    <footer className="flex-shrink-0 w-full bg-black border-t border-gray-800 relative z-50">
      <div className="grid grid-cols-4 sm:hidden">
        {TABS.map((tab) => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              aria-label={tab}
              title={tab}
              className={`flex items-center justify-center py-3 border-2 transition-none select-none cursor-pointer active:translate-y-[1px] ${
                active
                  ? 'bg-white text-black border-white'
                  : 'bg-black text-white border-transparent'
              }`}
            >
              {ICONS[tab]}
            </button>
          );
        })}
      </div>

      <div className="hidden sm:flex sm:flex-nowrap sm:justify-start gap-2 md:gap-8 px-4 md:px-8 py-2 md:py-3">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`font-mono uppercase tracking-widest text-xs md:text-sm px-3 py-1 border-2 transition-none select-none cursor-pointer active:translate-y-[1px] ${
              activeTab === tab
                ? 'bg-white text-black border-white font-bold'
                : 'bg-black text-white border-transparent hover:border-white'
            }`}
          >
            [ {tab} ]
          </button>
        ))}
      </div>
    </footer>
  );
}
