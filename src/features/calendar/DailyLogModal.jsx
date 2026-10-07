import { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import useHeldValue from '../../hooks/useHeldValue.js';
import AnimatedAmount from '../../components/AnimatedAmount.jsx';
import Modal from '../../components/Modal.jsx';
import Button from '../../components/Button.jsx';
import LedgerRow from '../ledger/LedgerRow.jsx';
import useFinanceStore from '../../hooks/useFinanceStore.js';
import { formatAmount } from '../../lib/currency.js';

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
    return transactions.filter((tx) => tx.date === selectedDate.dateString);
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
    <Modal isOpen={isOpen} onClose={onClose} title={`DAILY LOG: ${selectedDate?.dateString || ''}`} size="md">
      <div className="border-b border-gray-800 pb-3 mb-3 sm:pb-4 sm:mb-4">
        <div className="grid grid-cols-2 gap-2 md:gap-4 font-mono text-[10px] sm:text-xs tracking-widest text-gray-500">
          <div className="min-w-0">
            <div>IN</div>
            <div className="text-white text-xs sm:text-sm mt-1 break-words"><AnimatedAmount value={dayTotals.totalIn} currency="UZS" /></div>
          </div>
          <div className="min-w-0">
            <div>OUT</div>
            <div className="text-white text-xs sm:text-sm mt-1 break-words"><AnimatedAmount value={dayTotals.totalOut} currency="UZS" /></div>
          </div>
        </div>
      </div>

      {dayTransactions.length === 0 ? (
        <div className="font-mono text-sm text-gray-500 py-6 text-center">
          [ NO ENTRIES FOR THIS DAY ]
        </div>
      ) : (
        <div className="flex flex-col">
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
        </div>
      )}

      <div className="flex sm:justify-end mt-4 sm:mt-6 border-t border-gray-800 pt-3 sm:pt-4">
        <Button className="w-full sm:w-auto" onClick={handleAddEntryForDay}>+ ADD ENTRY FOR THIS DAY</Button>
      </div>

      <Modal isOpen={!!deletingTx} onClose={() => setDeletingTx(null)} title="CONFIRM DELETE" size="sm">
        <p className="font-mono text-sm text-white mb-6">DELETE THIS ENTRY? THIS CANNOT BE UNDONE.</p>
        <div className="border border-gray-800 p-3 mb-6 font-mono text-xs text-gray-500">
          <div>[ {heldDeletingTx?.category || 'TRANSFER'} ]</div>
          <div>{heldDeletingTx?.note || '(no note)'}</div>
          <div>{heldDeletingTx ? formatAmount(heldDeletingTx.amount, heldDeletingTx.currency) : ''}</div>
        </div>
        <div className="flex justify-end gap-3">
          <Button onClick={() => setDeletingTx(null)}>CANCEL</Button>
          <Button onClick={handleConfirmDelete} active={true}>CONFIRM</Button>
        </div>
      </Modal>
    </Modal>
  );
}
