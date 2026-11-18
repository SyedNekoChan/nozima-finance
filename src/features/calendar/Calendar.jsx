import { useState, useMemo, useRef, useLayoutEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { monthVariants } from '../../lib/motion.js';
import DailyLogModal from './DailyLogModal.jsx';
import useFinanceStore from '../../hooks/useFinanceStore.js';
import { convertToBase } from '../../lib/currency.js';
import { getDaysInMonth } from '../../lib/date.js';
import { categoryLabel, compact, monthLong, shortDate } from '../../lib/format.js';
import { Amount } from '../../components/AnimatedAmount.jsx';
import PageHeader, { StatRow } from '../../components/PageHeader.jsx';
import RateNotice from '../../components/RateNotice.jsx';
import { IconButton } from '../../components/Button.jsx';
import { IconChevronLeft, IconChevronRight } from '../../components/icons.jsx';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FALLBACK_ALLOWANCE = 100000;

const pad2 = (n) => String(n).padStart(2, '0');

const parseTxDate = (dateStr) => {
  const [d, m, y] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/*
 * A day's spending against the daily allowance, in four steps:
 *   none   nothing spent
 *   under  within the allowance
 *   over   up to twice the allowance
 *   far    more than twice the allowance
 */
const LEVEL = {
  none: { cell: 'hover:bg-white/[0.04]', figure: '', dot: '' },
  under: { cell: 'bg-white/[0.035] hover:bg-white/[0.07]', figure: 'text-ink-2', dot: 'bg-ink-3' },
  over: { cell: 'bg-caution/[0.16] hover:bg-caution/[0.24]', figure: 'text-caution', dot: 'bg-caution' },
  far: { cell: 'bg-negative/[0.24] hover:bg-negative/[0.32]', figure: 'text-negative', dot: 'bg-negative' },
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
  const monthKey = `${year}-${month}`;

  // +1 when moving to a later month, -1 to an earlier one (drives the slide direction)
  const lastMonthIndex = useRef(year * 12 + month);
  const monthDir = useRef(1);
  if (lastMonthIndex.current !== year * 12 + month) {
    monthDir.current = year * 12 + month > lastMonthIndex.current ? 1 : -1;
    lastMonthIndex.current = year * 12 + month;
  }
  const dir = monthDir.current;
  const monthMotion = { custom: dir, variants: monthVariants, initial: 'enter', animate: 'center', exit: 'exit' };

  const budgetAllowance = getDailyAllowanceUZS();
  const computedDailyAllowance = budgetAllowance || FALLBACK_ALLOWANCE;

  const monthTx = useMemo(
    () =>
      transactions.filter((tx) => {
        const d = parseTxDate(tx.date);
        return d.getFullYear() === year && d.getMonth() === month;
      }),
    [transactions, year, month]
  );

  const calendar = useMemo(() => {
    const spendByDay = new Map();
    for (const tx of monthTx) {
      if (tx.type !== 'EXPENSE') continue;
      const day = parseTxDate(tx.date).getDate();
      spendByDay.set(day, (spendByDay.get(day) || 0) + convertToBase(tx.amount, tx.currency, exchangeRates));
    }
    const level = (spend) => {
      if (spend <= 0) return 'none';
      if (spend < computedDailyAllowance) return 'under';
      if (spend < computedDailyAllowance * 2) return 'over';
      return 'far';
    };

    const totalDays = getDaysInMonth(year, month + 1);
    const firstDayJs = new Date(year, month, 1).getDay();
    const leadingEmpty = firstDayJs === 0 ? 6 : firstDayJs - 1;
    const today = new Date();
    const cells = [];
    for (let i = 0; i < leadingEmpty; i++) cells.push({ empty: true });
    let spent = 0;
    let overDays = 0;
    for (let day = 1; day <= totalDays; day++) {
      const spend = spendByDay.get(day) || 0;
      const lv = level(spend);
      spent += spend;
      if (lv === 'over' || lv === 'far') overDays++;
      const date = new Date(year, month, day);
      cells.push({
        day,
        dateString: `${pad2(day)}-${pad2(month + 1)}-${year}`,
        spend,
        level: lv,
        isToday: date.toDateString() === today.toDateString(),
        future: date > today,
      });
    }
    const totalCells = cells.length <= 35 ? 35 : 42;
    while (cells.length < totalCells) cells.push({ empty: true });
    return { cells, spent, overDays };
  }, [monthTx, exchangeRates, computedDailyAllowance, year, month]);

  const handlePrevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setViewDate(new Date(year, month + 1, 1));
  const handleCloseDailyLog = () => {
    setShowDailyLog(false);
    setSelectedDate(null);
  };

  // newest first: the month's entries beside (or under) the grid
  const monthFeed = useMemo(() => [...monthTx].sort((a, b) => parseTxDate(b.date) - parseTxDate(a.date)), [monthTx]);

  const openDay = (cell) => {
    setSelectedDate({ day: cell.day, dateString: cell.dateString });
    setShowDailyLog(true);
  };

  const openDayFromTx = (tx) => {
    const [d] = tx.date.split('-').map(Number);
    setSelectedDate({ day: d, dateString: tx.date });
    setShowDailyLog(true);
  };

  const monthName = `${monthLong(month)} ${year}`;
  const weeks = calendar.cells.length / 7;
  const subtitle = budgetAllowance
    ? `Daily allowance ${compact(budgetAllowance)} UZS, from this month's budget`
    : `No budget this month: days are measured against ${compact(FALLBACK_ALLOWANCE)} UZS`;
  const figures = [
    { label: `Spent in ${monthLong(month)}`, value: <Amount value={calendar.spent} currency="UZS" codeClassName="ml-1 font-mono text-[max(12px,0.6em)] text-ink-3" /> },
    { label: 'Days over allowance', value: <span className="tnum">{calendar.overDays}</span>, tone: calendar.overDays ? 'text-caution' : 'text-ink' },
  ];

  /*
   * Phones: the whole month, last week included, fits the first screen. The
   * day cells take the height left between the weekday row and the bottom of
   * the screen, shared by the weeks, but never more than a little taller than
   * they are wide (no stretched cells) and never under 36px (readable, tappable).
   * Wider screens size their cells with CSS.
   */
  const scrollerRef = useRef(null);
  const frameRef = useRef(null);
  const weekRowRef = useRef(null);
  const [cellH, setCellH] = useState(null);
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const row = weekRowRef.current;
    if (!scroller || !row) return undefined;
    const GAP = 4; // gap-1 between weeks on phones
    const measure = () => {
      if (window.innerWidth >= 640) {
        setCellH(null);
        return;
      }
      const top = row.getBoundingClientRect().bottom - scroller.getBoundingClientRect().top + scroller.scrollTop + 6; // mb-1.5
      const room = scroller.clientHeight - top - 12 - 8; // the veil's bottom padding and a little air
      const byHeight = Math.floor((room - GAP * (weeks - 1)) / weeks);
      const cellW = (row.getBoundingClientRect().width - GAP * 6) / 7;
      const h = Math.max(36, Math.min(byHeight, Math.round(cellW * 1.05), 56));
      setCellH((prev) => (prev === h ? prev : h));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    if (frameRef.current) ro.observe(frameRef.current);
    return () => ro.disconnect();
  }, [weeks]);

  return (
    <div ref={scrollerRef} className="h-full overflow-y-auto overscroll-contain">
      {/* phones: the month first, whole on the first screen, its figures under it.
          desktop: the page fits the screen; the days share the height left under the title,
          the month's entries scroll inside their veil */}
      <div ref={frameRef} className="frame pt-5 pb-6 sm:py-8 lg:py-10 short:py-6 lg:h-full lg:min-h-[560px] lg:flex lg:flex-col">
        <PageHeader figuresBeside titleOnlyOnPhone title="Calendar" subtitle={subtitle}>
          <StatRow className="lg:mt-0" items={figures} />
        </PageHeader>
        <RateNotice className="mt-5" />

        <div className="mt-4 sm:mt-8 short:mt-5 grid gap-6 lg:grid-cols-12 lg:flex-1 lg:min-h-0 lg:max-h-[880px] lg:grid-rows-[minmax(0,1fr)]">
          {/* the month */}
          <section aria-label={monthName} className="lg:col-span-8 veil p-3 sm:p-5 short:py-4 self-start lg:self-stretch lg:min-h-0 lg:flex lg:flex-col">
            <div className="flex items-center justify-between gap-2 mb-1 sm:mb-4 short:mb-2">
              <IconButton label="Previous month" onClick={handlePrevMonth} data-action="prev-month">
                <IconChevronLeft />
              </IconButton>
              <h2 className="text-base sm:text-lg font-medium text-ink text-center" aria-live="polite">
                <AnimatePresence mode="wait" initial={false} custom={dir}>
                  <motion.span key={monthKey} className="inline-block" {...monthMotion}>
                    {monthName}
                  </motion.span>
                </AnimatePresence>
              </h2>
              <IconButton label="Next month" onClick={handleNextMonth} data-action="next-month">
                <IconChevronRight />
              </IconButton>
            </div>

            <div ref={weekRowRef} className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1.5" aria-hidden="true">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-center text-2xs font-medium text-ink-3 py-1">
                  <span className="sm:hidden">{d.charAt(0)}</span>
                  <span className="hidden sm:inline">{d}</span>
                </div>
              ))}
            </div>

            <AnimatePresence mode="wait" initial={false} custom={dir}>
              <motion.div
                key={monthKey}
                className="grid grid-cols-7 gap-1 sm:gap-1.5 lg:flex-1 lg:min-h-0 lg:grid-rows-[repeat(var(--weeks),minmax(44px,1fr))]"
                style={{ '--weeks': weeks, ...(cellH ? { '--cell-h': `${cellH}px` } : {}) }}
                {...monthMotion}
              >
                {calendar.cells.map((cell, idx) => {
                  if (cell.empty) return <div key={idx} aria-hidden="true" />;
                  const lv = LEVEL[cell.level];
                  const isSelected = selectedDate && selectedDate.dateString === cell.dateString;
                  return (
                    <button
                      key={cell.dateString}
                      type="button"
                      data-day={cell.dateString}
                      onClick={() => openDay(cell)}
                      aria-label={`${cell.day} ${monthLong(month)}${cell.isToday ? ', today' : ''}: ${
                        cell.spend > 0 ? `${Math.round(cell.spend).toLocaleString('en-US')} UZS spent` : 'nothing spent'
                      }`}
                      className={`relative flex flex-col justify-between min-w-0 h-[var(--cell-h,44px)] sm:h-[64px] lg:h-auto rounded-sm sm:rounded p-1.5 sm:p-2.5 short:px-2 short:py-1.5 text-left motion-btn cursor-pointer ${lv.cell} ${
                        isSelected ? 'ring-1 ring-ink' : cell.isToday ? 'ring-1 ring-accent' : ''
                      }`}
                    >
                      <span
                        className={`text-xs sm:text-sm tnum leading-none ${
                          cell.isToday ? 'text-accent font-medium' : cell.future ? 'text-ink-3' : 'text-ink'
                        }`}
                      >
                        {cell.day}
                      </span>
                      {cell.spend > 0 && (
                        <>
                          <span className={`hidden sm:block text-2xs font-medium tnum truncate ${lv.figure}`}>{compact(cell.spend)}</span>
                          <span className={`sm:hidden self-end w-1.5 h-1.5 rounded-full ${lv.dot}`} aria-hidden="true" />
                        </>
                      )}
                    </button>
                  );
                })}
              </motion.div>
            </AnimatePresence>

            <ul className="mt-4 short:mt-3 flex flex-wrap gap-x-5 gap-y-2 px-1 text-2xs text-ink-3" aria-label="Legend">
              <li className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded-[3px] bg-white/[0.12]" />Within allowance</li>
              <li className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded-[3px] bg-caution/70" />Over allowance</li>
              <li className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded-[3px] bg-negative/70" />Over twice the allowance</li>
            </ul>
          </section>

          {/* phones: the allowance and the month's figures, under the month */}
          <div className="sm:hidden on-scene -mt-2">
            <p className="text-sm text-ink-2">{subtitle}</p>
            <StatRow className="mt-4" items={figures} />
          </div>

          {/* the month's entries */}
          <section aria-labelledby="month-feed" className="lg:col-span-4 veil flex flex-col max-h-[560px] lg:max-h-none lg:h-full lg:min-h-0">
            <h2 id="month-feed" className="flex-shrink-0 flex items-baseline justify-between gap-3 px-5 pt-5 pb-3">
              <span className="eyebrow">This month's entries</span>
              <span className="text-2xs text-ink-3 tnum">{monthFeed.length}</span>
            </h2>
            <AnimatePresence mode="wait" initial={false} custom={dir}>
              <motion.ul key={monthKey} className="flex-1 min-h-0 overflow-y-auto px-2 pb-2" {...monthMotion}>
                {monthFeed.length === 0 ? (
                  <li className="px-3 py-8 text-sm text-ink-3">Nothing recorded in {monthLong(month)}.</li>
                ) : (
                  monthFeed.map((tx) => {
                    const income = tx.type === 'INCOME';
                    return (
                      <li key={tx.id}>
                        <button
                          type="button"
                          onClick={() => openDayFromTx(tx)}
                          className="w-full flex items-center justify-between gap-3 min-h-[56px] px-3 py-2 rounded text-left hover:bg-white/[0.05] motion-btn cursor-pointer"
                        >
                          <span className="min-w-0">
                            <span className="block text-sm text-ink truncate">{tx.note || categoryLabel(tx.category)}</span>
                            <span className="block mt-0.5 text-xs text-ink-3 truncate">
                              <span className="tnum">{shortDate(tx.date)}</span> · {categoryLabel(tx.category)}
                            </span>
                          </span>
                          <Amount
                            value={tx.amount}
                            currency={tx.currency}
                            sign={income ? '+' : '-'}
                            className={`min-w-0 max-w-[60%] text-right text-sm ${income ? 'text-positive' : 'text-ink'}`}
                            codeClassName="ml-1 font-mono text-[max(12px,0.72em)] text-ink-3"
                          />
                        </button>
                      </li>
                    );
                  })
                )}
              </motion.ul>
            </AnimatePresence>
          </section>
        </div>
      </div>

      <DailyLogModal isOpen={showDailyLog} onClose={handleCloseDailyLog} selectedDate={selectedDate} />
    </div>
  );
}
