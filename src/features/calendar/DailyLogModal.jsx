import { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import useHeldValue from '../../hooks/useHeldValue.js';
import AnimatedAmount from '../../components/AnimatedAmount.jsx';
import Modal from '../../components/Modal.jsx';
import Button from '../../components/Button.jsx';
import ConfirmDeleteEntry from '../../components/ConfirmDelete.jsx';
import LedgerRow from '../ledger/LedgerRow.jsx';
import useFinanceStore from '../../hooks/useFinanceStore.js';
import { longDate } from '../../lib/format.js';
import { normalizeDateInput } from '../../lib/date.js';
import { IconPlus } from '../../components/icons.jsx';

export default function DailyLogModal({ isOpen, onClose, selectedDate: selectedDateProp }) {
  // keep the day's content on screen while the modal fades out
  const selectedDate = useHeldValue(selectedDateProp, isOpen);
  const transactions = useFinanceStore((s) => s.transactions);
  const accounts = useFinanceStore((s) => s.accounts);
  const exchangeRates = useFinanceStore((s) => s.exchangeRates);
  const setActiveTab = useFinanceStore((s) => s.setActiveTab);
  const setPendingLedgerDate = useFinanceStore((s) => s.setPendingLedgerDate);
  const setPendingEditTx = useFinanceStore((s) => s.setPendingEditTx);
  const deleteTransaction = useFinanceStore((s) => s.deleteTransaction);

  const [deletingTx, setDeletingTx] = useState(null);
  const heldDeletingTx = useHeldValue(deletingTx, !!deletingTx);

  const dayTransactions = useMemo(() => {
    if (!selectedDate) return [];
    // matched by the normalized date, so entries saved unpadded before dates were validated ("1-11-2026") still show
    return transactions.filter((tx) => tx.date === selectedDate.dateString || normalizeDateInput(tx.date) === selectedDate.dateString);
  }, [transactions, selectedDate]);

  // same accounting source as the Ledger summary, scoped to this exact date
  const dayTotals = useMemo(
    () => useFinanceStore.getState().getLedgerTotalsInUZS(dayTransactions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayTransactions, accounts, exchangeRates]
  );

  if (!selectedDate) return null;

  const handleAddEntryForDay = () => {
    setPendingLedgerDate(selectedDate.dateString);
    onClose();
    setActiveTab('LEDGER');
  };

  // hands the transaction to Ledger's existing edit flow via the store,
  // then switches to the Ledger tab where PunchCard opens in edit mode
  const handleEditFromHere = (tx) => {
    setPendingEditTx(tx);
    onClose();
    setActiveTab('LEDGER');
  };

  const handleConfirmDelete = () => {
    if (deletingTx) {
      deleteTransaction(deletingTx.id);
      setDeletingTx(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={longDate(selectedDate.dateString)}
      size="md"
      footer={
        <Button variant="primary" onClick={handleAddEntryForDay} data-action="add-for-day" icon={<IconPlus className="w-[18px] h-[18px]" />}>
          Add an entry for this day
        </Button>
      }
    >
      <dl className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-4 mb-4 pb-4 border-b border-line">
        <div className="min-w-0">
          <dt className="eyebrow">In</dt>
          <dd className="mt-1.5 text-lg font-medium tracking-[-0.02em] text-positive">
            <AnimatedAmount value={dayTotals.totalIn} currency="UZS" split codeClassName="ml-1 font-mono text-[max(12px,0.6em)] text-ink-3" />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="eyebrow">Out</dt>
          <dd className="mt-1.5 text-lg font-medium tracking-[-0.02em] text-ink">
            <AnimatedAmount value={dayTotals.totalOut} currency="UZS" split codeClassName="ml-1 font-mono text-[max(12px,0.6em)] text-ink-3" />
          </dd>
        </div>
      </dl>

      {dayTransactions.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-3">Nothing recorded on this day.</p>
      ) : (
        <ul className="-mx-3">
          <AnimatePresence initial={false}>
            {dayTransactions.map((tx) => (
              <LedgerRow
                key={tx.id}
                tx={tx}
                showDate={false}
                onEdit={() => handleEditFromHere(tx)}
                onDelete={() => setDeletingTx(tx)}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}

      <ConfirmDeleteEntry isOpen={!!deletingTx} tx={heldDeletingTx} onCancel={() => setDeletingTx(null)} onConfirm={handleConfirmDelete} />
    </Modal>
  );
}
