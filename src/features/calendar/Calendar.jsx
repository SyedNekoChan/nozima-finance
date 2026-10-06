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

  // newest first, for the compact mobile feed under the grid
  const monthFeed = useMemo(
    () => [...monthTx].sort((a, b) => parseTxDate(b.date) - parseTxDate(a.date)),
    [monthTx]
  );

  const openDay = (cell) => {
    setSelectedDate({ day: cell.day, dateString: cell.dateString });
    setShowDailyLog(true);
  };

  const openDayFromTx = (tx) => {
    const [d] = tx.date.split('-').map(Number);
    setSelectedDate({ day: d, dateString: tx.date });
    setShowDailyLog(true);
  };

  const navBtn =
    'flex items-center justify-center w-9 h-9 border-2 border-transparent hover:border-white text-white transition-none select-none cursor-pointer active:translate-y-[1px]';

  return (
    <>
      {/* MOBILE: mockup composition */}
      <div className="sm:hidden flex flex-col h-full w-full overflow-hidden px-4 pt-2 pb-2">
        <div className="flex-shrink-0 font-mono uppercase tracking-tighter text-xs text-gray-500 leading-none mb-1">
          [ &gt; CALENDAR.LOG ]
        </div>

        <div className="flex-shrink-0 grid grid-cols-[2.25rem_1fr_2.25rem] items-center mb-1">
          <button
            type="button"
            aria-label="PREVIOUS MONTH"
            title="PREVIOUS MONTH"
            onClick={handlePrevMonth}
            className={navBtn}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span className="text-center font-mono uppercase tracking-widest text-sm text-white leading-none whitespace-nowrap">
            {getMonthName(month + 1)} {year}
          </span>
          <button
            type="button"
            aria-label="NEXT MONTH"
            title="NEXT MONTH"
            onClick={handleNextMonth}
            className={navBtn}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        <div className="flex-shrink-0 grid grid-cols-7 mb-1">
          {WEEKDAYS.map((day) => (
            <div key={day} className="text-center font-mono text-[10px] tracking-widest text-gray-500 py-1 leading-none">
              {day}
            </div>
          ))}
        </div>

        <div className="flex-shrink-0 grid grid-cols-7 auto-rows-[2rem] gap-y-0.5">
          {calendarDays.map((cell, idx) => {
            if (cell.empty) return <div key={idx} />;

            const isSelected = selectedDate && selectedDate.dateString === cell.dateString;

            return (
              <button
                key={cell.dateString}
                type="button"
                onClick={() => openDay(cell)}
                className={`min-w-0 flex items-center justify-center border transition-none cursor-pointer font-mono text-xs leading-none whitespace-nowrap ${
                  isSelected
                    ? 'bg-white text-black border-white font-bold'
                    : 'bg-transparent text-white border-transparent hover:border-white'
                }`}
              >
                {cell.day}
                <span className={`text-[10px] ${isSelected ? 'text-black' : 'text-gray-500'}`}>
                  {cell.spendingLevel}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto mt-2 border-t border-gray-800">
          {monthFeed.length === 0 ? (
            <div className="font-mono text-xs text-gray-500 py-3">[ NO ENTRIES THIS MONTH ]</div>
          ) : (
            monthFeed.map((tx) => (
              <button
                key={tx.id}
                type="button"
                onClick={() => openDayFromTx(tx)}
                className="w-full flex justify-between items-start gap-3 py-2 border-b border-dashed border-gray-800 text-left font-mono transition-none cursor-pointer"
              >
                <span className="min-w-0 flex flex-col gap-1">
                  <span className="text-xs font-bold tracking-widest text-white truncate">
                    [ {tx.type === 'TRANSFER' ? 'TRANSFER' : tx.category} ]
                  </span>
                  <span className="text-[10px] tracking-widest text-gray-500">{tx.date}</span>
                </span>
                <span className="flex-shrink-0 text-xs font-bold text-white">
                  {tx.type === 'INCOME' ? '+' : '-'}{formatAmount(tx.amount, tx.currency)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* SM+: original desktop/tablet layout, untouched */}
      <div className="hidden sm:flex flex-col h-full w-full overflow-hidden p-4 md:p-8 pb-24">
        <div className="flex justify-between items-center mb-4 gap-2">
          <h1 className="font-mono uppercase tracking-tighter text-2xl md:text-4xl text-white whitespace-nowrap leading-none">
            [ &gt; CALENDAR.LOG ]
          </h1>
          <div className="flex gap-2 flex-shrink-0">
            <Button className="whitespace-nowrap" onClick={handlePrevMonth}>{'< PREV'}</Button>
            <Button className="whitespace-nowrap" onClick={handleNextMonth}>{'NEXT >'}</Button>
          </div>
        </div>

        <div className="font-mono text-xs tracking-widest text-gray-500 mb-6">
          MONTH: {getMonthName(month + 1)} {year}
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
                ? 'flex flex-col items-center justify-center border bg-white text-black border-white md:border-2 transition-none'
                : 'flex flex-col items-center justify-center border border-gray-800 bg-black text-white hover:border-white md:border-2 transition-none';

              return (
                <button
                  key={cell.dateString}
                  className={`${baseClass} p-1 md:p-2 h-full w-full cursor-pointer`}
                  onClick={() => openDay(cell)}
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
      </div>

      <DailyLogModal isOpen={showDailyLog} onClose={handleCloseDailyLog} selectedDate={selectedDate} />
    </>
  );
}
