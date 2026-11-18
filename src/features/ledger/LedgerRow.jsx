import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DUR, EASE } from '../../lib/motion.js';
import useFinanceStore from '../../hooks/useFinanceStore.js';
import { accountLabel, categoryLabel, shortDate } from '../../lib/format.js';
import { Amount } from '../../components/AnimatedAmount.jsx';
import Button from '../../components/Button.jsx';
import ImageViewerModal from '../../components/ImageViewerModal.jsx';
import { IconEdit, IconImage, IconTransfer, IconTrash } from '../../components/icons.jsx';

/*
 * One entry. The row reads left to right: what kind of money it is, what it
 * was, where it came from, how much. Pressing the row opens its actions
 * (Edit, Delete, the receipt) under it, by mouse, touch or keyboard alike.
 */
function Glyph({ tx }) {
  if (tx.type === 'TRANSFER') {
    return (
      <span className="flex items-center justify-center w-10 h-10 rounded-full bg-white/[0.05] text-ink-2 flex-shrink-0" aria-hidden="true">
        <IconTransfer className="w-[18px] h-[18px]" />
      </span>
    );
  }
  const income = tx.type === 'INCOME';
  return (
    <span
      className={`flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0 text-[13px] font-medium ${
        income ? 'bg-positive/[0.12] text-positive' : 'bg-white/[0.05] text-ink-2'
      }`}
      aria-hidden="true"
    >
      {categoryLabel(tx.category).slice(0, 2)}
    </span>
  );
}

export default function LedgerRow({ tx, onEdit, onDelete, showDate = true }) {
  const accounts = useFinanceStore((s) => s.accounts);
  const [open, setOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  const sourceName = accountLabel(accounts.find((a) => a.id === tx.accountId)?.name);
  const destName = tx.type === 'TRANSFER' ? accountLabel(accounts.find((a) => a.id === tx.toAccountId)?.name) : null;

  const isTransfer = tx.type === 'TRANSFER';
  const income = tx.type === 'INCOME';
  const title = tx.note || (isTransfer ? 'Transfer' : categoryLabel(tx.category));
  const meta = isTransfer ? `${sourceName} → ${destName}` : tx.note ? `${categoryLabel(tx.category)} · ${sourceName}` : sourceName;

  return (
    <motion.li
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto', transition: { duration: DUR.content, ease: EASE } }}
      exit={{ opacity: 0, height: 0, transition: { duration: DUR.exit, ease: EASE } }}
      style={{ overflow: 'hidden' }}
      className="list-none"
    >
      <div className={`rounded motion-btn ${open ? 'bg-white/[0.05]' : ''}`}>
        <button
          type="button"
          data-tx-row={tx.id}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center gap-3 sm:gap-4 px-3 py-3 min-h-[64px] rounded text-left hover:bg-white/[0.04] motion-btn cursor-pointer"
        >
          <Glyph tx={tx} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm sm:text-base text-ink truncate">{title}</span>
            <span className="mt-0.5 flex items-center gap-2 text-xs text-ink-3 min-w-0">
              <span className="truncate">{meta}</span>
              {showDate && <span className="flex-shrink-0 tnum">· {shortDate(tx.date)}</span>}
              {tx.imageData && <IconImage className="w-3.5 h-3.5 flex-shrink-0 text-ink-2" />}
            </span>
          </span>
          <Amount
            value={tx.amount}
            currency={tx.currency}
            sign={income ? '+' : '-'}
            className={`flex-shrink-0 text-sm sm:text-base font-medium ${income ? 'text-positive' : isTransfer ? 'text-ink-2' : 'text-ink'}`}
            codeClassName={`ml-1 font-mono text-[max(12px,0.72em)] font-normal ${income ? 'text-positive/70' : 'text-ink-3'}`}
          />
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="actions"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1, transition: { duration: DUR.state, ease: EASE } }}
              exit={{ height: 0, opacity: 0, transition: { duration: DUR.exit, ease: EASE } }}
              style={{ overflow: 'hidden' }}
            >
              <div className="flex flex-wrap items-center gap-2 pl-[64px] sm:pl-[68px] pr-3 pb-3">
                {tx.imageData && (
                  <button
                    type="button"
                    onClick={() => setViewerOpen(true)}
                    aria-label="View receipt"
                    className="w-11 h-11 rounded overflow-hidden border border-line-strong hover:border-white/40 motion-btn cursor-pointer"
                  >
                    <img src={tx.imageData} alt="" className="w-full h-full object-cover" />
                  </button>
                )}
                <Button size="sm" onClick={() => onEdit(tx.id)} data-action="edit-entry" icon={<IconEdit className="w-4 h-4" />}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={() => onDelete(tx.id)}
                  data-action="delete-entry"
                  className="!text-negative hover:!bg-negative/10"
                  icon={<IconTrash className="w-4 h-4" />}
                >
                  Delete
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ImageViewerModal isOpen={viewerOpen} onClose={() => setViewerOpen(false)} imageData={tx.imageData} />
    </motion.li>
  );
}
