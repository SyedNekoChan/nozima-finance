import { useState } from 'react';
import { motion } from 'framer-motion';
import { DUR, EASE } from '../../lib/motion.js';
import useFinanceStore from '../../hooks/useFinanceStore.js';
import { formatAmount } from '../../lib/currency.js';
import Button from '../../components/Button.jsx';
import ImageViewerModal from '../../components/ImageViewerModal.jsx';

const iconBtn =
  'flex items-center justify-center w-7 h-7 bg-black text-white border-2 border-transparent hover:border-white motion-btn select-none cursor-pointer active:translate-y-[1px]';

export default function LedgerRow({ tx, onEdit, onDelete, showDate = true }) {
  const accounts = useFinanceStore((s) => s.accounts);
  const [viewerOpen, setViewerOpen] = useState(false);

  const sourceAccount = accounts.find((a) => a.id === tx.accountId);
  const destAccount = tx.type === 'TRANSFER' ? accounts.find((a) => a.id === tx.toAccountId) : null;
  const accountName = sourceAccount?.name || 'UNKNOWN';
  const toAccountName = destAccount?.name || 'UNKNOWN';

  // EXPENSE and TRANSFER both deduct from the source account
  const prefix = tx.type === 'INCOME' ? '+' : '-';

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto', transition: { duration: DUR.content, ease: EASE } }}
      exit={{ opacity: 0, height: 0, transition: { duration: DUR.exit, ease: EASE } }}
      style={{ overflow: 'hidden' }}
    >
    <div className="group flex flex-row sm:flex-col md:flex-row md:items-start justify-between gap-3 sm:gap-0 py-3 sm:py-4 px-2 border-b border-dashed border-gray-800 hover:bg-white hover:text-black motion-row cursor-pointer">
      <div className="flex flex-col min-w-0 flex-1 sm:flex-none md:flex-1">
        <div className="flex flex-wrap items-center">
          {tx.type === 'TRANSFER' ? (
            <span className="font-mono font-bold tracking-widest text-sm text-white group-hover:text-black break-words min-w-0">
              [ -&gt; {toAccountName} ]
            </span>
          ) : (
            <span className="font-mono font-bold tracking-widest text-sm text-white group-hover:text-black break-words min-w-0">
              [ {tx.category} ]
            </span>
          )}
          {!showDate && (
            <span className="font-mono text-xs tracking-widest text-gray-600 group-hover:text-black ml-2 sm:ml-3">
              {tx.date}
            </span>
          )}
        </div>

        {tx.note && (
          <span className="font-mono text-sm text-gray-400 group-hover:text-black mt-1 break-words">
            &gt; {tx.note}
          </span>
        )}

        {tx.imageData && (
          <img
            src={tx.imageData}
            alt="receipt"
            onClick={(e) => {
              e.stopPropagation();
              setViewerOpen(true);
            }}
            className="mt-2 w-12 h-12 object-cover border-2 border-white filter grayscale contrast-125 cursor-pointer"
          />
        )}
      </div>

      <div className="flex flex-col items-end sm:items-start md:items-end gap-1 mt-0 sm:mt-2 md:mt-0 flex-shrink-0 max-w-[55%] sm:max-w-none">
        <span className="font-mono font-bold text-sm sm:text-base md:text-lg text-white group-hover:text-black text-right sm:text-left md:text-right break-words">
          {prefix}{formatAmount(tx.amount, tx.currency)}
        </span>
        <span className="font-mono text-xs tracking-widest text-gray-500 group-hover:text-black text-right sm:text-left md:text-right break-words">
          [ {accountName} ]
        </span>

        <div className="flex sm:hidden gap-1 mt-1">
          <button
            type="button"
            aria-label="EDIT"
            title="EDIT"
            onClick={() => onEdit(tx.id)}
            className={iconBtn}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="DELETE"
            title="DELETE"
            onClick={() => onDelete(tx.id)}
            className={iconBtn}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </button>
        </div>

        <div className="hidden sm:flex md:hidden md:group-hover:flex gap-2 mt-2">
          <Button className="text-xs px-2 py-1" onClick={() => onEdit(tx.id)}>
            EDIT
          </Button>
          <Button className="text-xs px-2 py-1" onClick={() => onDelete(tx.id)}>
            DELETE
          </Button>
        </div>
      </div>

      <ImageViewerModal
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        imageData={tx.imageData}
      />
    </div>
    </motion.div>
  );
}
