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

      <div className="flex justify-between gap-2 pt-3 border-t border-gray-800">
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
