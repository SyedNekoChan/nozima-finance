import { useState, useMemo } from 'react';
import Button from '../../components/Button.jsx';
import DailyLogModal from './DailyLogModal.jsx';
import { useFinanceStore } from '../../hooks/useFinanceStore.js';
import { formatAmount, convertToBase } from '../../lib/currency.js';
import { getDaysInMonth, getMonthName } from '../../lib/date.js';

const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const FALLBACK_ALLOWANCE = 100000;

// pads a DD/MM to 2 digits for dateString building
const pad2 = (n) => String(n).padStart(2, '0');

export default function Calendar() {
  const transactions = useFinanceStore((s) => s.transactions);
  const accounts = useFinanceStore((s) => s.accounts);
  const exchangeRates = useFinanceStore((s) => s.exchangeRates);
  const getMonthlyBudgetUZS = useFinanceStore((s) => s.getMonthlyBudgetUZS);
  const getDailyAllowanceUZS = useFinanceStore((s) => s.getDailyAllowanceUZS);

  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [showDailyLog, setShowDailyLog] = useState(false);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth(); // 0-indexed

  const computedDailyAllowance = getDailyAllowanceUZS() || FALLBACK_ALLOWANCE;

  // resolves a transaction's amount into UZS using its account's currency
  const toUZS = (tx) => {
    const account = accounts.find((a) => a.id === tx.accountId);
    const currency = account ? account.currency : 'UZS';
    return convertToBase(tx.amount, currency, exchangeRates);
  };

  const monthTx = useMemo(() => {
    return transactions.filter((tx) => {
      const d = new Date(tx.date);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  }, [transactions, year, month]);

  const { totalIn, totalOut } = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const tx of monthTx) {
      if (tx.type === 'INCOME') income += toUZS(tx);
      if (tx.type === 'EXPENSE') expense += toUZS(tx);
    }
    return { totalIn: income, totalOut: expense };
  }, [monthTx, accounts, exchangeRates]);

  // sum of EXPENSE transactions for a given day-of-month, in UZS
  const getDaySpending = (day) => {
    let sum = 0;
    for (const tx of monthTx) {
      if (tx.type !== 'EXPENSE') continue;
      const d = new Date(tx.date);
      if (d.getDate() === day) sum += toUZS(tx);
    }
    return sum;
  };

  const getSpendingLevel = (spend) => {
    if (spend <= 0) return '.';
    if (spend < computedDailyAllowance) return '.';
    if (spend < computedDailyAllowance * 2) return '*';
    return '#';
  };

  // Monday-start calendar grid, padded to full weeks
  const getCalendarDays = (date) => {
    const y = date.getFullYear();
    const m = date.getMonth();
    const totalDays = getDaysInMonth(y, m + 1);
    const firstDayJs = new Date(y, m, 1).getDay(); // 0=Sun..6=Sat
    const leadingEmpty = firstDayJs === 0 ? 6 : firstDayJs - 1;

    const cells = [];
    for (let i = 0; i < leadingEmpty; i++) cells.push({ empty: true });

    for (let day = 1; day <= totalDays; day++) {
      const dateString = `${pad2(day)}-${pad2(m + 1)}-${y}`;
      const spend = getDaySpending(day);
      cells.push({ day, dateString, spendingLevel: getSpendingLevel(spend) });
    }

    const totalCells = cells.length <= 35 ? 35 : 42;
    while (cells.length < totalCells) cells.push({ empty: true });

    return cells;
  };

  const calendarDays = useMemo(() => getCalendarDays(viewDate), [viewDate, monthTx, computedDailyAllowance]);

  const handlePrevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setViewDate(new Date(year, month + 1, 1));
  const handleCloseDailyLog = () => {
    setShowDailyLog(false);
    setSelectedDate(null);
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden p-4 md:p-8 pb-24">
      <div className="flex justify-between items-center mb-4">
        <h1 className="font-mono uppercase tracking-tighter text-2xl md:text-4xl text-white">
          [ &gt; CALENDAR.LOG ]
        </h1>
        <div className="flex gap-2">
          <Button onClick={handlePrevMonth}>{'< PREV'}</Button>
          <Button onClick={handleNextMonth}>{'NEXT >'}</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 font-mono text-xs tracking-widest text-gray-500 mb-6">
        <div>MONTH: {getMonthName(month + 1)} {year}</div>
        <div>TOTAL IN: {formatAmount(totalIn, 'UZS')}</div>
        <div>TOTAL OUT: {formatAmount(totalOut, 'UZS')}</div>
        <div>BUDGET: {formatAmount(getMonthlyBudgetUZS() || 0, 'UZS')}</div>
      </div>

      <div className="font-mono text-xs tracking-widest text-gray-500 mb-2">
        DAILY ALLOWANCE: {formatAmount(computedDailyAllowance, 'UZS')}
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2">
          {WEEKDAYS.map((day) => (
            <div key={day} className="text-center font-mono text-xs text-gray-500 py-1">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 md:gap-2 flex-1 min-h-0">
          {calendarDays.map((cell, idx) => {
            if (cell.empty) {
              return <div key={idx} className="border border-transparent" />;
            }

            const isSelected = selectedDate && selectedDate.dateString === cell.dateString;

            const baseClass = isSelected
              ? 'flex flex-col items-center justify-center border-2 bg-white text-black border-white transition-none'
              : 'flex flex-col items-center justify-center border-2 border-gray-800 bg-black text-white hover:border-white transition-none';

            return (
              <button
                key={cell.dateString}
                className={`${baseClass} p-1 md:p-2 h-full w-full cursor-pointer`}
                onClick={() => {
                  setSelectedDate({ day: cell.day, dateString: cell.dateString });
                  setShowDailyLog(true);
                }}
              >
                <span className="font-mono text-sm md:text-base font-bold">
                  {isSelected ? `[ ${cell.day} ]` : cell.day}
                </span>
                {!isSelected && (
                  <span className="font-mono text-xs mt-1 text-gray-400">
                    {cell.spendingLevel}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <DailyLogModal isOpen={showDailyLog} onClose={handleCloseDailyLog} selectedDate={selectedDate} />
    </div>
  );
}
