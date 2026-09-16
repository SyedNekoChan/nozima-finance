import Button from './Button.jsx';
import useFinanceStore from '../hooks/useFinanceStore.js';

const TABS = ['DASHBOARD', 'LEDGER', 'CALENDAR', 'ACCOUNTS'];

export default function Footer() {
  const activeTab = useFinanceStore((s) => s.activeTab);
  const setActiveTab = useFinanceStore((s) => s.setActiveTab);

  return (
    <footer className="flex-shrink-0 w-full bg-black border-t border-gray-800 px-4 md:px-8 py-3 relative z-50 overflow-x-auto">
      <div className="flex flex-nowrap justify-around md:justify-start gap-2 md:gap-8 min-w-full w-max mx-auto md:mx-0 md:w-auto">
        {TABS.map((tab) => (
          <Button
            key={tab}
            active={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className="px-4 py-2"
          >
            {tab}
          </Button>
        ))}
      </div>
    </footer>
  );
}
