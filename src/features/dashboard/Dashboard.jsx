import { useState, useMemo } from 'react';
import useFinanceStore from '../../hooks/useFinanceStore.js';
import { convertToBase } from '../../lib/currency.js';
import AnimatedAmount from '../../components/AnimatedAmount.jsx';
import { getMonthName } from '../../lib/date.js';
import HeroStats from './HeroStats.jsx';
import AsciiProgressBar from '../../components/AsciiProgressBar.jsx';
import DotMatrixGraph from '../../components/DotMatrixGraph.jsx';
import Modal from '../../components/Modal.jsx';
import Button from '../../components/Button.jsx';

export default function Dashboard() {
  const spentThisMonth = useFinanceStore((s) => s.getSpentThisMonthInUZS());
  const monthlyBudget = useFinanceStore((s) => s.getMonthlyBudgetUZS());
  const setMonthlyBudget = useFinanceStore((s) => s.setMonthlyBudget);
  const transactions = useFinanceStore((s) => s.transactions);
  const exchangeRates = useFinanceStore((s) => s.exchangeRates);

  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [granularity, setGranularity] = useState('MONTH');

  const now = new Date();

  const { graphData, graphLabels } = useMemo(() => {
    const today = new Date();
    const buckets = [];
    if (granularity === 'DAY') {
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
        const dd = String(d.getDate()).padStart(2, '0');
        buckets.push({ key: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`, label: `${dd} ${getMonthName(d.getMonth() + 1)}` });
      }
    } else if (granularity === 'YEAR') {
      for (let i = 5; i >= 0; i--) {
        const y = today.getFullYear() - i;
        buckets.push({ key: `${y}`, label: `${y}` });
      }
    } else {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        buckets.push({ key: `${d.getFullYear()}-${d.getMonth() + 1}`, label: getMonthName(d.getMonth() + 1) });
      }
    }

    const totals = new Map(buckets.map((b) => [b.key, 0]));
    for (const tx of transactions) {
      if (tx.type !== 'EXPENSE') continue;
      const [d, m, y] = tx.date.split('-').map(Number);
      const key = granularity === 'DAY' ? `${y}-${m}-${d}` : granularity === 'YEAR' ? `${y}` : `${y}-${m}`;
      if (!totals.has(key)) continue;
      totals.set(key, totals.get(key) + convertToBase(tx.amount, tx.currency, exchangeRates));
    }

    return { graphData: buckets.map((b) => totals.get(b.key)), graphLabels: buckets.map((b) => b.label) };
  }, [transactions, exchangeRates, granularity]);

  function openBudgetModal() {
    setBudgetInput(monthlyBudget ? String(monthlyBudget) : '');
    setShowBudgetModal(true);
  }

  function handleSaveBudget() {
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (budgetInput.trim() === '') {
      setMonthlyBudget(monthKey, null);
      setShowBudgetModal(false);
      setBudgetInput('');
      return;
    }
    const parsedAmount = parseFloat(budgetInput);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;
    setMonthlyBudget(monthKey, parsedAmount);
    setShowBudgetModal(false);
    setBudgetInput('');
  }

  return (
    <div className="relative z-10 h-full w-full px-4 pt-6 pb-3 sm:p-6 sm:pb-24 md:p-10 flex flex-col gap-3 sm:gap-0 overflow-hidden">
      <div className="contents sm:flex sm:flex-col md:flex-row md:justify-between sm:gap-6 md:gap-12 sm:flex-shrink-0">
        <div className="order-1 sm:order-none sm:flex-1 min-w-0">
          <HeroStats />
        </div>

        <div className="order-3 sm:order-none flex flex-col items-start md:items-end gap-3 sm:gap-6 flex-shrink-0 min-w-0 w-full md:w-auto border-t border-gray-800 pt-3 sm:border-t-0 sm:pt-0">
          <div className="w-full sm:w-auto">
            <span className="font-mono uppercase tracking-widest text-xs md:text-sm text-gray-500">
              SPENT THIS MONTH
            </span>
            <br />
            <span className="font-mono text-[length:clamp(1.125rem,6vw,1.5rem)] sm:text-3xl md:text-4xl text-white mt-1 break-words">
              <AnimatedAmount value={spentThisMonth} currency="UZS" />
            </span>
          </div>

          <div className="w-full sm:w-auto border-t border-dashed border-gray-700 pt-3 sm:border-t-0 sm:pt-0">
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <span className="font-mono uppercase tracking-widest text-xs md:text-sm text-gray-500">
                BUDGET LIMIT
              </span>
              <button
                type="button"
                aria-label="EDIT BUDGET"
                title="EDIT BUDGET"
                onClick={openBudgetModal}
                className="sm:hidden flex items-center justify-center w-8 h-8 border-2 border-transparent hover:border-white text-white motion-btn select-none cursor-pointer active:translate-y-[1px]"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
              <Button className="hidden sm:inline-block" onClick={openBudgetModal}>EDIT</Button>
            </div>
            {monthlyBudget ? (
              <>
                <span className="font-mono text-[length:clamp(1.125rem,6vw,1.5rem)] sm:text-3xl md:text-4xl text-white mt-1 break-words">
                  <AnimatedAmount value={monthlyBudget} currency="UZS" />
                </span>
                <div className="mt-2">
                  <AsciiProgressBar value={spentThisMonth} max={monthlyBudget} width={30} className="sm:hidden" />
                  <AsciiProgressBar value={spentThisMonth} max={monthlyBudget} width={24} className="hidden sm:inline" />
                </div>
              </>
            ) : (
              <span className="font-mono text-[length:clamp(1.125rem,6vw,1.5rem)] sm:text-3xl md:text-4xl text-white mt-1 break-words">
                [ ! SET BUDGET ! ]
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="order-2 sm:order-none flex-1 flex flex-col justify-end mt-0 sm:mt-6 min-h-[7rem] sm:min-h-0">
        <div className="flex items-center justify-between gap-2 mb-1 sm:mb-2 min-w-0">
          <span className="font-mono uppercase tracking-widest text-xs md:text-sm text-gray-500 whitespace-nowrap truncate">
            SPENDING<span className="hidden sm:inline"> GRAPH</span> (UZS)
          </span>
          <div className="flex flex-shrink-0">
            {['DAY', 'MONTH', 'YEAR'].map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGranularity(g)}
                className={`font-mono uppercase tracking-wider sm:tracking-widest text-[10px] sm:text-xs px-1.5 py-0.5 border-2 whitespace-nowrap motion-btn motion-state select-none cursor-pointer ${
                  granularity === g
                    ? 'bg-white text-black border-white font-bold'
                    : 'bg-black text-white border-transparent hover:border-white'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <DotMatrixGraph data={graphData} labels={graphLabels} granularity={granularity} currencyCode="UZS" />
      </div>

      <Modal isOpen={showBudgetModal} onClose={() => setShowBudgetModal(false)} title="SET MONTHLY BUDGET" size="sm">
        <span className="text-gray-500">
          MONTH: {getMonthName(now.getMonth() + 1)} {now.getFullYear()}
        </span>
        <div>
          <span className="text-xs tracking-widest text-gray-500">AMOUNT (UZS)</span>
          <input
            type="number"
            inputMode="numeric"
            value={budgetInput}
            onChange={(e) => setBudgetInput(e.target.value)}
            className="w-full bg-black text-white font-mono border-2 border-white px-4 py-3 mt-4 text-2xl focus:outline-none focus:border-white"
            placeholder="2000000"
          />
        </div>
        <div className="flex justify-end mt-6">
          <Button onClick={handleSaveBudget}>SAVE BUDGET</Button>
        </div>
      </Modal>
    </div>
  );
}
