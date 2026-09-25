import { useEffect, useState, useRef } from 'react';
import { formatAmount } from '../../lib/currency.js';
import { FUTURE_FUND_NAME } from '../../lib/constants.js';
import Button from '../../components/Button.jsx';
import useFinanceStore from '../../hooks/useFinanceStore.js';

export default function AccountCard({ account, onEdit, onTransfer, onDelete }) {
  const isFutureFund = account.name.toUpperCase() === FUTURE_FUND_NAME;
  const isNegative = account.balance < 0;

  const anomalyEvent = useFinanceStore((s) => s.anomalyEvent);
  const [isPulsing, setIsPulsing] = useState(false);
  const pulseTimeoutRef = useRef(null);

  useEffect(() => {
    if (!isFutureFund || !anomalyEvent) return;

    const isDirectIncome =
      anomalyEvent.type === 'INCOME' && anomalyEvent.accountId === account.id;
    const isTransferIn =
      anomalyEvent.type === 'TRANSFER' && anomalyEvent.toAccountId === account.id;

    if (isDirectIncome || isTransferIn) {
      setIsPulsing(true);
      clearTimeout(pulseTimeoutRef.current);
      pulseTimeoutRef.current = setTimeout(() => setIsPulsing(false), 1500);
    }
  }, [anomalyEvent, isFutureFund, account.id]);

  useEffect(() => {
    return () => clearTimeout(pulseTimeoutRef.current);
  }, []);

  return (
    <div className="border-2 border-white bg-black p-4 flex flex-col justify-between min-h-[160px] relative">
      <div>
        <div className="flex justify-between items-start">
          <h3 className="font-mono uppercase tracking-widest text-sm text-white">
            [ {account.name} ]
          </h3>
          {isFutureFund && (
            <span
              className={`font-mono text-white text-lg ${isPulsing ? 'brutalist-heart-pulse' : ''}`}
            >
              ♥
            </span>
          )}
        </div>
        <span className="font-mono text-xs tracking-widest text-gray-500 mt-1 block">
          {account.currency}
        </span>
      </div>

      <div className="my-4">
        {/* opacity subordinates negative balances instead of color */}
        <span className={`font-mono font-bold text-2xl md:text-3xl text-white ${isNegative ? 'opacity-70' : ''}`}>
          {formatAmount(account.balance, account.currency)}
        </span>
      </div>

      <div className="flex sm:hidden justify-between gap-2 pt-3 border-t border-gray-800">
        <button
          type="button"
          aria-label="EDIT"
          title="EDIT"
          onClick={() => onEdit(account)}
          className="flex-1 flex items-center justify-center py-2 border-2 border-transparent hover:border-white text-white transition-none select-none cursor-pointer active:translate-y-[1px]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="TRANSFER"
          title="TRANSFER"
          onClick={() => onTransfer(account)}
          className="flex-1 flex items-center justify-center py-2 border-2 border-transparent hover:border-white text-white transition-none select-none cursor-pointer active:translate-y-[1px]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
            <polyline points="17 1 21 5 17 9" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <polyline points="7 23 3 19 7 15" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="DELETE"
          title="DELETE"
          onClick={() => onDelete(account)}
          className="flex-1 flex items-center justify-center py-2 border-2 border-transparent hover:border-white text-white transition-none select-none cursor-pointer active:translate-y-[1px]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </button>
      </div>

      <div className="hidden sm:flex justify-between gap-2 pt-3 border-t border-gray-800">
        <Button onClick={() => onEdit(account)} className="text-xs px-2 py-1 whitespace-nowrap flex-shrink-0">
          EDIT
        </Button>
        <Button onClick={() => onTransfer(account)} className="text-xs px-2 py-1 whitespace-nowrap flex-shrink-0">
          TRANSFER
        </Button>
        <Button onClick={() => onDelete(account)} className="text-xs px-2 py-1 whitespace-nowrap flex-shrink-0">
          DELETE
        </Button>
      </div>
    </div>
  );
}
