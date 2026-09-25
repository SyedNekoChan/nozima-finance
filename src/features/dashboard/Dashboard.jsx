import { useState, useMemo } from 'react';
import useFinanceStore from '../../hooks/useFinanceStore.js';
import { formatAmount, convertToBase } from '../../lib/currency.js';
import { getMonthName } from '../../lib/date.js';
import HeroStats from './HeroStats.jsx';
import AsciiProgressBar from '../../components/AsciiProgressBar.jsx';
import DotMatrixGraph from '../../components/DotMatrixGraph.jsx';
import Modal from '../../components/Modal.jsx';
import Button from '../../components/Button.jsx';

const parseTxDate = (dateStr) => {
  const [d, m, y] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export default function Dashboard() {
  const spentThisMonth = useFinanceStore((s) => s.getSpentThisMonthInUZS());
  const monthlyBudget = useFinanceStore((s) => s.getMonthlyBudgetUZS());
  const setMonthlyBudget = useFinanceStore((s) => s.setMonthlyBudget);
  const transactions = useFinanceStore((s) => s.transactions);
  const exchangeRates = useFinanceStore((s) => s.exchangeRates);

  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');

  const now = new Date();

  const { graphData, graphLabels } = useMemo(() => {
    const months = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }

    const data = months.map(({ year, month }) => {
      return transactions
        .filter((tx) => {
          if (tx.type !== 'EXPENSE') return false;
          const txDate = parseTxDate(tx.date);
          return txDate.getFullYear() === year && txDate.getMonth() + 1 === month;
        })
        .reduce((sum, tx) => sum + convertToBase(tx.amount, tx.currency, exchangeRates), 0);
    });

    const labels = months.map(({ month }) => getMonthName(month));

    return { graphData: data, graphLabels: labels };
  }, [transactions, exchangeRates, now]);

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
    <div className="relative z-10 h-full w-full p-6 md:p-10 pb-24 flex flex-col overflow-hidden">
      <div className="flex flex-col md:flex-row md:justify-between gap-6 md:gap-12 flex-shrink-0">
        <div className="flex-1">
          <HeroStats />
        </div>

        <div className="flex flex-col items-start md:items-end gap-6 flex-shrink-0 min-w-0 w-full md:w-auto">
          <div>
            <span className="font-mono uppercase tracking-widest text-xs md:text-sm text-gray-500">
              SPENT THIS MONTH
            </span>
            <br />
            <span className="font-mono text-xl sm:text-3xl md:text-4xl text-white mt-1">
              {formatAmount(spentThisMonth, 'UZS')}
            </span>
          </div>

          <div>
            <div className="flex items-center gap-3">
              <span className="font-mono uppercase tracking-widest text-xs md:text-sm text-gray-500">
                BUDGET LIMIT
              </span>
              <Button onClick={openBudgetModal}>EDIT</Button>
            </div>
            {monthlyBudget ? (
              <>
                <span className="font-mono text-xl sm:text-3xl md:text-4xl text-white mt-1">
                  {formatAmount(monthlyBudget, 'UZS')}
                </span>
                <div className="mt-2">
                  <AsciiProgressBar value={spentThisMonth} max={monthlyBudget} width={24} />
                </div>
              </>
            ) : (
              <span className="font-mono text-xl sm:text-3xl md:text-4xl text-white mt-1">
                [ ! SET BUDGET ! ]
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-end mt-6 min-h-0">
        <span className="font-mono uppercase tracking-widest text-xs md:text-sm text-gray-500 mb-2">
          SPENDING GRAPH (UZS)
        </span>
        <DotMatrixGraph data={graphData} labels={graphLabels} currencyCode="UZS" />
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
