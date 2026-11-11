import { useEffect, useRef } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { tabVariants } from './lib/motion.js';
import useFinanceStore from './hooks/useFinanceStore.js';
import useExchangeRates from './hooks/useExchangeRates.js';
import useVisualMode from './hooks/useVisualMode.js';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import Snow from './components/Snow.jsx';
import Anomaly from './components/Anomaly.jsx';
import { Hideable, ObservationControls } from './components/Observation.jsx';
import Dashboard from './features/dashboard/Dashboard.jsx';
import Ledger from './features/ledger/Ledger.jsx';
import Calendar from './features/calendar/Calendar.jsx';
import Accounts from './features/accounts/Accounts.jsx';

const TAB_ORDER = ['DASHBOARD', 'LEDGER', 'CALENDAR', 'ACCOUNTS'];

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
  const hydrateVisualMode = useVisualMode((s) => s.hydrate);
  // the snow belongs to Pet mode; nothing is shown until the stored mode is known
  const showSnow = useVisualMode((s) => s.hydrated && s.mode !== 'city');

  useExchangeRates();

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    hydrateVisualMode();
  }, [hydrateVisualMode]);

  const ActiveTabComponent = TAB_COMPONENTS[activeTab] || Dashboard;

  // +1 when moving forward through the tab order, -1 backward, 0 on first render (plain fade-in)
  const tabIndex = TAB_ORDER.indexOf(activeTab);
  const lastTabIndex = useRef(tabIndex);
  const direction = useRef(0);
  if (lastTabIndex.current !== tabIndex) {
    direction.current = tabIndex > lastTabIndex.current ? 1 : -1;
    lastTabIndex.current = tabIndex;
  }

  return (
    <MotionConfig reducedMotion="user">
    <div className="h-screen [height:100dvh] w-screen overflow-hidden bg-black text-white font-mono flex flex-col">
      {showSnow && <Snow />}
      <Hideable name="header">
        <Header />
      </Hideable>
      <main className="relative flex-1 min-h-0 overflow-hidden">
        <Anomaly />
        <Hideable name="content">
        <AnimatePresence custom={direction.current}>
          {isLoaded && (
            <motion.div
              key={activeTab}
              custom={direction.current}
              variants={tabVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="absolute inset-0 z-10"
            >
              <ActiveTabComponent />
            </motion.div>
          )}
        </AnimatePresence>
        </Hideable>
      </main>
      <Hideable name="footer">
        <Footer />
      </Hideable>
      <ObservationControls />
    </div>
    </MotionConfig>
  );
}
