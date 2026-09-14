import { useFinanceStore } from '../../hooks/useFinanceStore.js';
import { formatAmount } from '../../lib/currency.js';
import Button from '../../components/Button.jsx';

export default function LedgerRow({ tx, onEdit, onDelete, showDate = true }) {
  const accounts = useFinanceStore((s) => s.accounts);

  const sourceAccount = accounts.find((a) => a.id === tx.accountId);
  const destAccount = tx.type === 'TRANSFER' ? accounts.find((a) => a.id === tx.toAccountId) : null;
  const accountName = sourceAccount?.name || 'UNKNOWN';
  const toAccountName = destAccount?.name || 'UNKNOWN';

  // EXPENSE and TRANSFER both deduct from the source account
  const prefix = tx.type === 'INCOME' ? '+' : '-';

  return (
    <div className="group flex flex-col md:flex-row md:items-start justify-between py-4 px-2 border-b border-dashed border-gray-800 hover:bg-white hover:text-black transition-none cursor-pointer">
      <div className="flex flex-col">
        <div className="flex items-center">
          {tx.type === 'TRANSFER' ? (
            <span className="font-mono font-bold tracking-widest text-sm text-white group-hover:text-black">
              [ -&gt; {toAccountName} ]
            </span>
          ) : (
            <span className="font-mono font-bold tracking-widest text-sm text-white group-hover:text-black">
              [ {tx.category} ]
            </span>
          )}
          {!showDate && (
            <span className="font-mono text-xs tracking-widest text-gray-600 group-hover:text-black ml-3">
              {tx.date}
            </span>
          )}
        </div>

        {tx.note && (
          <span className="font-mono text-sm text-gray-400 group-hover:text-black mt-1">
            &gt; {tx.note}
          </span>
        )}

        {tx.imageData && (
          <img
            src={tx.imageData}
            alt="receipt"
            className="mt-2 w-12 h-12 object-cover border-2 border-white filter grayscale contrast-125"
          />
        )}
      </div>

      <div className="flex flex-col items-start md:items-end gap-1 mt-2 md:mt-0">
        <span className="font-mono font-bold text-base md:text-lg text-white group-hover:text-black">
          {prefix}{formatAmount(tx.amount, tx.currency)}
        </span>
        <span className="font-mono text-xs tracking-widest text-gray-500 group-hover:text-black">
          [ {accountName} ]
        </span>
        <div className="hidden md:group-hover:flex gap-2 mt-2">
          <Button className="text-xs px-2 py-1" onClick={() => onEdit(tx.id)}>
            [ EDIT ]
          </Button>
          <Button className="text-xs px-2 py-1" onClick={() => onDelete(tx.id)}>
            [ DELETE ]
          </Button>
        </div>
      </div>
    </div>
  );
}
