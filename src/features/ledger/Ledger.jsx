import { useState, useMemo, useEffect } from 'react';
import useFinanceStore from '../../hooks/useFinanceStore.js';
import { formatAmount, convertToBase } from '../../lib/currency.js';
import LedgerRow from './LedgerRow.jsx';
import SortBar from './SortBar.jsx';
import PunchCard from './PunchCard.jsx';
import Button from '../../components/Button.jsx';
import Modal from '../../components/Modal.jsx';

export default function Ledger() {
  const transactions = useFinanceStore((s) => s.transactions);
  const accounts = useFinanceStore((s) => s.accounts);
  const exchangeRates = useFinanceStore((s) => s.exchangeRates);
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

  const totals = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    transactions.forEach((tx) => {
      const uzs = convertToBase(tx.amount, tx.currency, exchangeRates);
      if (tx.type === 'INCOME') totalIn += uzs;
      if (tx.type === 'EXPENSE') totalOut += uzs;
    });
    return { totalIn, totalOut, net: totalIn - totalOut };
  }, [transactions, exchangeRates]);

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
    return groups;
  }, [sortedTransactions, sortBy]);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div className="flex-shrink-0 w-full bg-black border-b border-gray-800 p-3 md:p-6">
        <div className="flex justify-between items-center gap-2 mb-2 md:mb-3">
          <h1 className="font-mono uppercase tracking-tighter text-lg md:text-4xl text-white leading-none whitespace-nowrap">
            [ &gt; LEDGER.LOG ]
          </h1>
          <button
            type="button"
            aria-label="NEW ENTRY"
            title="NEW ENTRY"
            onClick={handleOpenNewEntry}
            className="sm:hidden flex items-center justify-center w-9 h-9 border-2 border-transparent hover:border-white text-white transition-none select-none cursor-pointer active:translate-y-[1px] flex-shrink-0"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <Button className="hidden sm:inline-block whitespace-nowrap flex-shrink-0" onClick={handleOpenNewEntry}>+ NEW ENTRY</Button>
        </div>

        <div className="flex items-center gap-3 md:grid md:grid-cols-4 md:gap-4 font-mono text-[10px] md:text-xs tracking-widest text-gray-500 leading-none">
          <div className="flex items-baseline gap-1">
            <span>IN</span>
            <span className="text-white text-xs md:text-sm">{formatAmount(totals.totalIn, 'UZS')}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span>OUT</span>
            <span className="text-white text-xs md:text-sm">{formatAmount(totals.totalOut, 'UZS')}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span>NET</span>
            <span className="text-white text-xs md:text-sm">{formatAmount(totals.net, 'UZS')}</span>
          </div>
          <div className="hidden md:block">[ {transactions.length} ENTRIES ]</div>
        </div>
      </div>

      <SortBar sortBy={sortBy} sortDirection={sortDirection} onSortChange={handleSortChange} />

      <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-black">
        <div className="pb-24">
          {sortedTransactions.length === 0 ? (
            <div className="text-gray-500 font-mono text-sm">[ NO ENTRIES YET ]</div>
          ) : sortBy === 'DATE' ? (
            groupedByDate.map((group) => (
              <div key={group.date}>
                <div className="mt-6 mb-2 border-b border-dashed border-gray-700 pb-1">
                  <span className="font-mono text-xs tracking-widest text-gray-500">--- {group.date} ---</span>
                </div>
                {group.items.map((tx) => (
                  <LedgerRow
                    key={tx.id}
                    tx={tx}
                    showDate={false}
                    onEdit={() => handleOpenEdit(tx)}
                    onDelete={() => setDeletingTx(tx)}
                  />
                ))}
              </div>
            ))
          ) : (
            sortedTransactions.map((tx) => (
              <LedgerRow
                key={tx.id}
                tx={tx}
                showDate={true}
                onEdit={() => handleOpenEdit(tx)}
                onDelete={() => setDeletingTx(tx)}
              />
            ))
          )}
        </div>
      </div>

      <PunchCard isOpen={showPunchCard} onClose={handleClosePunchCard} editingTx={editingTx} initialDate={initialDate} />

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
    </div>
  );
}
