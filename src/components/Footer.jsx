import Button from './Button.jsx';
import useFinanceStore from '../hooks/useFinanceStore.js';
import { useFooterMeasureRef } from '../hooks/useViewportChrome.jsx';

const TABS = ['DASHBOARD', 'LEDGER', 'CALENDAR', 'ACCOUNTS'];

export default function Footer() {
  const activeTab = useFinanceStore((s) => s.activeTab);
  const setActiveTab = useFinanceStore((s) => s.setActiveTab);
  const footerRef = useFooterMeasureRef();

  return (
    <footer
      ref={footerRef}
      className="flex-shrink-0 w-full bg-black border-t border-gray-800 px-3 sm:px-4 md:px-8 py-2 md:py-3 relative z-50"
    >
      <div className="grid grid-cols-2 sm:flex sm:flex-nowrap sm:justify-start gap-2 md:gap-8">
        {TABS.map((tab) => (
          <Button
            key={tab}
            active={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className="!text-[11px] sm:!text-xs md:!text-sm !px-2 sm:!px-4 py-2 w-full sm:w-auto"
          >
            {tab}
          </Button>
        ))}
      </div>
    </footer>
  );
}
