import { useEffect } from 'react';
import useFinanceStore from './hooks/useFinanceStore.js';
import useSync from './hooks/useSync.js';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import Anomaly from './components/Anomaly.jsx';
import Dashboard from './features/dashboard/Dashboard.jsx';
import Ledger from './features/ledger/Ledger.jsx';
import Calendar from './features/calendar/Calendar.jsx';
import Accounts from './features/accounts/Accounts.jsx';

const TAB_COMPONENTS = {
  DASHBOARD: Dashboard,
  LEDGER: Ledger,
  CALENDAR: Calendar,
  ACCOUNTS: Accounts,
};

export default function App() {
  const activeTab = useFinanceStore((s) => s.activeTab);
  const isLoaded = useFinanceStore((s) => s.isLoaded);
  const loadInitialData = useFinanceStore((s) => s.loadInitialData);

  // mounts Yjs/IndexedDB/WebRTC for the app's lifetime; return value has no consumer yet
  useSync();

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const ActiveTabComponent = TAB_COMPONENTS[activeTab] || Dashboard;

  return (
    <div className="h-screen w-screen overflow-hidden bg-black text-white font-mono flex flex-col">
      <Header />
      <main className="relative flex-1 min-h-0 overflow-hidden">
        <Anomaly />
        {isLoaded && <ActiveTabComponent />}
      </main>
      <Footer />
    </div>
  );
}
