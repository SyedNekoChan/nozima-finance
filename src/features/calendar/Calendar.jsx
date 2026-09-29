import { useState, useMemo } from 'react';
import Button from '../../components/Button.jsx';
import DailyLogModal from './DailyLogModal.jsx';
import useFinanceStore from '../../hooks/useFinanceStore.js';
import { formatAmount, convertToBase } from '../../lib/currency.js';
import { getDaysInMonth, getMonthName } from '../../lib/date.js';

const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const FALLBACK_ALLOWANCE = 100000;

const pad2 = (n) => String(n).padStart(2, '0');

const parseTxDate = (dateStr) => {
  const [d, m, y] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export default function Calendar() {
  const transactions = useFinanceStore((s) => s.transactions);
  const exchangeRates = useFinanceStore((s) => s.exchangeRates);
  const getMonthlyBudgetUZS = useFinanceStore((s) => s.getMonthlyBudgetUZS);
  const getDailyAllowanceUZS = useFinanceStore((s) => s.getDailyAllowanceUZS);

  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [showDailyLog, setShowDailyLog] = useState(false);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const computedDailyAllowance = getDailyAllowanceUZS() || FALLBACK_ALLOWANCE;

  const toUZS = (tx) => {
    return convertToBase(tx.amount, tx.currency, exchangeRates);
  };

  const monthTx = useMemo(() => {
    return transactions.filter((tx) => {
      const d = parseTxDate(tx.date);
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
  }, [monthTx, exchangeRates]);

  const getDaySpending = (day) => {
    let sum = 0;
    for (const tx of monthTx) {
      if (tx.type !== 'EXPENSE') continue;
      const d = parseTxDate(tx.date);
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

  const getCalendarDays = (date) => {
    const y = date.getFullYear();
    const m = date.getMonth();
    const totalDays = getDaysInMonth(y, m + 1);
    const firstDayJs = new Date(y, m, 1).getDay();
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
    <div className="flex flex-col h-full w-full overflow-hidden px-4 pt-3 pb-3 sm:p-4 sm:pb-24 md:p-8">
      <div className="flex justify-between items-center mb-2 sm:mb-4 gap-2 min-w-0">
        <h1 className="font-mono uppercase tracking-tighter text-lg sm:text-2xl md:text-4xl text-white whitespace-nowrap leading-none min-w-0">
          [ &gt; CALENDAR.LOG ]
        </h1>
        <div className="flex gap-2 flex-shrink-0">
          <button
            type="button"
            aria-label="PREVIOUS MONTH"
            title="PREVIOUS MONTH"
            onClick={handlePrevMonth}
            className="sm:hidden flex items-center justify-center w-9 h-9 border-2 border-transparent hover:border-white text-white transition-none select-none cursor-pointer active:translate-y-[1px]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="NEXT MONTH"
            title="NEXT MONTH"
            onClick={handleNextMonth}
            className="sm:hidden flex items-center justify-center w-9 h-9 border-2 border-transparent hover:border-white text-white transition-none select-none cursor-pointer active:translate-y-[1px]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <Button className="hidden sm:inline-block whitespace-nowrap" onClick={handlePrevMonth}>{'< PREV'}</Button>
          <Button className="hidden sm:inline-block whitespace-nowrap" onClick={handleNextMonth}>{'NEXT >'}</Button>
        </div>
      </div>

      <div className="grid sm:hidden grid-cols-2 gap-x-3 gap-y-1.5 font-mono tracking-widest text-gray-500 mb-2 border-y border-dashed border-gray-800 py-2">
        {[
          ['MONTH', `${getMonthName(month + 1)} ${year}`],
          ['BUDGET', formatAmount(getMonthlyBudgetUZS() || 0, 'UZS')],
          ['TOTAL IN', formatAmount(totalIn, 'UZS')],
          ['TOTAL OUT', formatAmount(totalOut, 'UZS')],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <div className="text-[10px] leading-tight">{label}</div>
            <div className="text-xs text-white tracking-normal break-words leading-tight">{value}</div>
          </div>
        ))}
      </div>

      <div className="hidden sm:grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 font-mono text-xs tracking-widest text-gray-500 mb-6">
        <div>MONTH: {getMonthName(month + 1)} {year}</div>
        <div>TOTAL IN: {formatAmount(totalIn, 'UZS')}</div>
        <div>TOTAL OUT: {formatAmount(totalOut, 'UZS')}</div>
        <div>BUDGET: {formatAmount(getMonthlyBudgetUZS() || 0, 'UZS')}</div>
      </div>

      <div className="font-mono text-[10px] sm:text-xs tracking-widest text-gray-500 mb-2 leading-tight">
        DAILY ALLOWANCE: {formatAmount(computedDailyAllowance, 'UZS')}
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2">
          {WEEKDAYS.map((day) => (
            <div key={day} className="text-center font-mono text-[10px] sm:text-xs text-gray-500 py-1">
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
              ? 'flex flex-row sm:flex-col items-center justify-center border bg-white text-black border-white md:border-2 transition-none'
              : 'flex flex-row sm:flex-col items-center justify-center border border-gray-800 bg-black text-white hover:border-white md:border-2 transition-none';

            return (
              <button
                key={cell.dateString}
                className={`${baseClass} p-0 sm:p-1 md:p-2 h-full w-full min-w-0 cursor-pointer`}
                onClick={() => {
                  setSelectedDate({ day: cell.day, dateString: cell.dateString });
                  setShowDailyLog(true);
                }}
              >
                <span className={`font-mono ${isSelected ? 'text-[10px]' : 'text-xs'} sm:text-sm md:text-base font-bold whitespace-nowrap`}>
                  {isSelected ? `[ ${cell.day} ]` : cell.day}
                </span>
                {!isSelected && (
                  <span className="font-mono text-[10px] sm:text-xs ml-0.5 sm:ml-0 mt-0 sm:mt-1 text-gray-400">
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
