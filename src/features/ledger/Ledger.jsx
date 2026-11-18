import { useState, useMemo, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DUR, EASE } from '../../lib/motion.js';
import useHeldValue from '../../hooks/useHeldValue.js';
import AnimatedAmount, { Amount } from '../../components/AnimatedAmount.jsx';
import useFinanceStore from '../../hooks/useFinanceStore.js';
import { convertToBase } from '../../lib/currency.js';
import { dayHeading } from '../../lib/format.js';
import LedgerRow from './LedgerRow.jsx';
import SortBar from './SortBar.jsx';
import PunchCard from './PunchCard.jsx';
import Button from '../../components/Button.jsx';
import PageHeader, { StatRow } from '../../components/PageHeader.jsx';
import RateNotice from '../../components/RateNotice.jsx';
import ConfirmDeleteEntry from '../../components/ConfirmDelete.jsx';
import { IconPlus } from '../../components/icons.jsx';

export default function Ledger() {
  const transactions = useFinanceStore((s) => s.transactions);
  const accounts = useFinanceStore((s) => s.accounts);
  const exchangeRates = useFinanceStore((s) => s.exchangeRates);
  const totalLiability = useFinanceStore((s) => s.getTotalLiabilityInUZS());
  const deleteTransaction = useFinanceStore((s) => s.deleteTransaction);
  const pendingLedgerDate = useFinanceStore((s) => s.pendingLedgerDate);
  const clearPendingLedgerDate = useFinanceStore((s) => s.clearPendingLedgerDate);
  const pendingEditTx = useFinanceStore((s) => s.pendingEditTx);
  const clearPendingEditTx = useFinanceStore((s) => s.clearPendingEditTx);

  const [sortBy, setSortBy] = useState('DATE');
  const [sortDirection, setSortDirection] = useState('DESC');
  const [showPunchCard, setShowPunchCard] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [deletingTx, setDeletingTx] = useState(null);
  const [initialDate, setInitialDate] = useState(null);
  const heldDeletingTx = useHeldValue(deletingTx, !!deletingTx);

  useEffect(() => {
    if (pendingLedgerDate) {
      setEditingTx(null);
      setInitialDate(pendingLedgerDate);
      setShowPunchCard(true);
      clearPendingLedgerDate();
    }
  }, [pendingLedgerDate, clearPendingLedgerDate]);

  useEffect(() => {
    if (pendingEditTx) {
      setInitialDate(null);
      setEditingTx(pendingEditTx);
      setShowPunchCard(true);
      clearPendingEditTx();
    }
  }, [pendingEditTx, clearPendingEditTx]);

  const totals = useMemo(
    () => useFinanceStore.getState().getLedgerTotalsInUZS(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, accounts, exchangeRates]
  );

  const parseDate = (dateStr) => {
    const [d, m, y] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  };

  const sortedTransactions = useMemo(() => {
    const copy = [...transactions];

    copy.sort((a, b) => {
      if (sortBy === 'DATE') {
        return parseDate(b.date) - parseDate(a.date);
      }
      if (sortBy === 'AMOUNT') {
        const uzsA = Math.abs(convertToBase(a.amount, a.currency, exchangeRates));
        const uzsB = Math.abs(convertToBase(b.amount, b.currency, exchangeRates));
        return uzsB - uzsA;
      }
      if (sortBy === 'CATEGORY') {
        if (a.category === null && b.category === null) return parseDate(b.date) - parseDate(a.date);
        if (a.category === null) return 1;
        if (b.category === null) return -1;
        const cmp = a.category.localeCompare(b.category);
        return cmp !== 0 ? cmp : parseDate(b.date) - parseDate(a.date);
      }
      if (sortBy === 'ACCOUNT') {
        const nameA = accounts.find((acc) => acc.id === a.accountId)?.name || '';
        const nameB = accounts.find((acc) => acc.id === b.accountId)?.name || '';
        const cmp = nameA.localeCompare(nameB);
        return cmp !== 0 ? cmp : parseDate(b.date) - parseDate(a.date);
      }
      return 0;
    });

    if (sortDirection === 'ASC') copy.reverse();
    return copy;
  }, [transactions, sortBy, sortDirection, accounts, exchangeRates]);

  const handleSortChange = ({ sortBy: newSortBy, sortDirection: newSortDirection }) => {
    setSortBy(newSortBy);
    setSortDirection(newSortDirection);
  };

  const handleOpenNewEntry = () => {
    setEditingTx(null);
    setInitialDate(null);
    setShowPunchCard(true);
  };

  const handleOpenEdit = (tx) => {
    setEditingTx(tx);
    setInitialDate(null);
    setShowPunchCard(true);
  };

  const handleClosePunchCard = () => {
    setShowPunchCard(false);
    setEditingTx(null);
    setInitialDate(null);
  };

  const handleConfirmDelete = () => {
    if (deletingTx) {
      deleteTransaction(deletingTx.id);
      setDeletingTx(null);
    }
  };

  const groupedByDate = useMemo(() => {
    if (sortBy !== 'DATE') return null;
    const groups = [];
    let currentDate = null;
    let currentGroup = null;
    sortedTransactions.forEach((tx) => {
      if (tx.date !== currentDate) {
        currentDate = tx.date;
        currentGroup = { date: tx.date, items: [] };
        groups.push(currentGroup);
      }
      currentGroup.items.push(tx);
    });
    // the day's spending, from the same accounting source as the totals above
    const get = useFinanceStore.getState().getLedgerTotalsInUZS;
    return groups.map((g) => ({ ...g, out: get(g.items).totalOut }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedTransactions, sortBy, accounts, exchangeRates]);

  const row = (tx, showDate) => (
    <LedgerRow key={tx.id} tx={tx} showDate={showDate} onEdit={() => handleOpenEdit(tx)} onDelete={() => setDeletingTx(tx)} />
  );

  return (
    <div className="h-full overflow-y-auto overscroll-contain">
      {/* phones: one column, the page scrolls. Desktop: the title, figures and order sit on
          the scene in a column, the entries in a veil beside them; the page fits the screen
          and the entries scroll inside their veil */}
      <div className="frame py-6 sm:py-8 lg:py-10 short:py-6 lg:grid lg:grid-cols-12 lg:gap-12 lg:grid-rows-[minmax(0,1fr)] lg:h-full lg:min-h-[560px]">
        <aside className="lg:col-span-4 lg:sticky lg:top-10 lg:self-start">
        <PageHeader
          title="Ledger"
          subtitle={`${transactions.length} ${transactions.length === 1 ? 'entry' : 'entries'}`}
          action={
            <Button variant="primary" onClick={handleOpenNewEntry} data-action="new-entry" icon={<IconPlus className="w-[18px] h-[18px]" />}>
              New entry
            </Button>
          }
        >
          <StatRow
            layout="grid"
            items={[
              { label: 'Money in', value: <AnimatedAmount value={totals.totalIn} currency="UZS" split codeClassName="ml-1 font-mono text-[max(12px,0.6em)] text-ink-3" />, tone: 'text-positive' },
              { label: 'Money out', value: <AnimatedAmount value={totals.totalOut} currency="UZS" split codeClassName="ml-1 font-mono text-[max(12px,0.6em)] text-ink-3" /> },
              { label: 'Net', value: <AnimatedAmount value={totals.net} currency="UZS" split codeClassName="ml-1 font-mono text-[max(12px,0.6em)] text-ink-3" /> },
              ...(totalLiability > 0
                ? [{ label: 'Owed', value: <AnimatedAmount value={totalLiability} currency="UZS" split codeClassName="ml-1 font-mono text-[max(12px,0.6em)] text-ink-3" />, tone: 'text-negative' }]
                : []),
            ]}
          />
          <RateNotice className="mt-5" />
          </PageHeader>
        <div className="hidden lg:block mt-10 short:mt-6 pt-6 short:pt-5 border-t border-white/[0.08]">
          <p className="eyebrow mb-3 on-scene">Order</p>
          <SortBar stacked sortBy={sortBy} sortDirection={sortDirection} onSortChange={handleSortChange} />
        </div>
        </aside>

        <div className="mt-8 lg:mt-0 lg:col-span-8 veil lg:self-start lg:max-h-full lg:min-h-0 lg:flex lg:flex-col lg:overflow-hidden">
          <div className="lg:hidden sticky top-0 z-10 px-3 sm:px-4 py-3 border-b border-white/[0.08] rounded-t-[12px] veil-strong">
            <SortBar sortBy={sortBy} sortDirection={sortDirection} onSortChange={handleSortChange} />
          </div>

          <motion.div
            key={`${sortBy}-${sortDirection}`}
            className="p-1.5 sm:p-2 lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain"
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 1, transition: { duration: DUR.content, ease: EASE } }}
          >
            {sortedTransactions.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-base text-ink">No entries yet</p>
                <p className="mt-1 text-sm text-ink-3">Record what you spend and earn; it appears here, newest first.</p>
              </div>
            ) : sortBy === 'DATE' ? (
              <AnimatePresence initial={false}>
                {groupedByDate.map((group) => (
                  <motion.section
                    key={group.date}
                    aria-label={dayHeading(group.date)}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto', transition: { duration: DUR.content, ease: EASE } }}
                    exit={{ opacity: 0, height: 0, transition: { duration: DUR.exit, ease: EASE } }}
                    style={{ overflow: 'hidden' }}
                  >
                    <h2 className="flex items-baseline justify-between gap-3 px-3 pt-4 pb-2">
                      <span className="text-xs font-medium text-ink-2">{dayHeading(group.date)}</span>
                      {group.out > 0 && (
                        <span className="text-2xs text-ink-3 tnum">
                          <Amount value={group.out} currency="UZS" sign="-" codeClassName="ml-1" /> out
                        </span>
                      )}
                    </h2>
                    <ul>
                      <AnimatePresence initial={false}>{group.items.map((tx) => row(tx, false))}</AnimatePresence>
                    </ul>
                  </motion.section>
                ))}
              </AnimatePresence>
            ) : (
              <ul>
                <AnimatePresence initial={false}>{sortedTransactions.map((tx) => row(tx, true))}</AnimatePresence>
              </ul>
            )}
          </motion.div>
        </div>
      </div>

      <PunchCard isOpen={showPunchCard} onClose={handleClosePunchCard} editingTx={editingTx} initialDate={initialDate} />

      <ConfirmDeleteEntry isOpen={!!deletingTx} tx={heldDeletingTx} onCancel={() => setDeletingTx(null)} onConfirm={handleConfirmDelete} />
    </div>
  );
}
