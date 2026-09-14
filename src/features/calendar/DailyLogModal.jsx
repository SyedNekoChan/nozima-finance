import { useMemo, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import Button from '../../components/Button.jsx';
import LedgerRow from '../ledger/LedgerRow.jsx';
import useFinanceStore from '../../hooks/useFinanceStore.js';
import { formatAmount, convertToBase } from '../../lib/currency.js';

const FALLBACK_ALLOWANCE = 100000;

export default function DailyLogModal({ isOpen, onClose, selectedDate }) {
  const transactions = useFinanceStore((s) => s.transactions);
  const accounts = useFinanceStore((s) => s.accounts);
  const exchangeRates = useFinanceStore((s) => s.exchangeRates);
  const getDailyAllowanceUZS = useFinanceStore((s) => s.getDailyAllowanceUZS);
  const setActiveTab = useFinanceStore((s) => s.setActiveTab);
  const setPendingLedgerDate = useFinanceStore((s) => s.setPendingLedgerDate);
  const setPendingEditTx = useFinanceStore((s) => s.setPendingEditTx);
  const deleteTransaction = useFinanceStore((s) => s.deleteTransaction);

  const [deletingTx, setDeletingTx] = useState(null);

  const dailyAllowance = getDailyAllowanceUZS() || FALLBACK_ALLOWANCE;

  const dayTransactions = useMemo(() => {
    if (!selectedDate) return [];
    return transactions.filter((tx) => tx.date === selectedDate.dateString);
  }, [transactions, selectedDate]);

  const spentToday = useMemo(() => {
    let sum = 0;
    for (const tx of dayTransactions) {
      if (tx.type !== 'EXPENSE') continue;
      const account = accounts.find((a) => a.id === tx.accountId);
      const currency = account ? account.currency : 'UZS';
      sum += convertToBase(tx.amount, currency, exchangeRates);
    }
    return sum;
  }, [dayTransactions, accounts, exchangeRates]);

  const status = spentToday > dailyAllowance ? 'OVER' : 'UNDER';

  if (!isOpen || !selectedDate) return null;

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
      <div className="border-b border-gray-800 pb-4 mb-4">
        <div className="grid grid-cols-3 gap-2 md:gap-4 font-mono text-xs tracking-widest text-gray-500">
          <div>
            <div>DAILY ALLOWANCE</div>
            <div className="text-white text-sm mt-1">{formatAmount(dailyAllowance, 'UZS')}</div>
          </div>
          <div>
            <div>SPENT TODAY</div>
            <div className="text-white text-sm mt-1">{formatAmount(spentToday, 'UZS')}</div>
          </div>
          <div>
            <div>STATUS</div>
            <div className={`text-white text-sm mt-1 font-bold ${status === 'OVER' ? 'underline' : ''}`}>
              [ {status} ]
            </div>
          </div>
        </div>
      </div>

      {dayTransactions.length === 0 ? (
        <div className="font-mono text-sm text-gray-500 py-6 text-center">
          [ NO ENTRIES FOR THIS DAY ]
        </div>
      ) : (
        <div className="flex flex-col">
          {dayTransactions.map((tx) => (
            <LedgerRow
              key={tx.id}
              tx={tx}
              showDate={false}
              onEdit={() => handleEditFromHere(tx)}
              onDelete={() => setDeletingTx(tx)}
            />
          ))}
        </div>
      )}

      <div className="flex justify-end mt-6 border-t border-gray-800 pt-4">
        <Button onClick={handleAddEntryForDay}>+ ADD ENTRY FOR THIS DAY</Button>
      </div>

      <Modal isOpen={!!deletingTx} onClose={() => setDeletingTx(null)} title="CONFIRM DELETE" size="sm">
        <p className="font-mono text-sm text-white mb-6">DELETE THIS ENTRY? THIS CANNOT BE UNDONE.</p>
        <div className="border border-gray-800 p-3 mb-6 font-mono text-xs text-gray-500">
          <div>[ {deletingTx?.category || 'TRANSFER'} ]</div>
          <div>{deletingTx?.note || '(no note)'}</div>
          <div>{deletingTx ? formatAmount(deletingTx.amount, deletingTx.currency) : ''}</div>
        </div>
        <div className="flex justify-end gap-3">
          <Button onClick={() => setDeletingTx(null)}>CANCEL</Button>
          <Button onClick={handleConfirmDelete} active={true}>CONFIRM</Button>
        </div>
      </Modal>
    </Modal>
  );
}
