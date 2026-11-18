import Modal from './Modal.jsx';
import Button from './Button.jsx';
import { Amount } from './AnimatedAmount.jsx';
import { categoryLabel, shortDate } from '../lib/format.js';

/* "Delete this entry?" — shared by the Ledger and the day's log */
export default function ConfirmDeleteEntry({ isOpen, tx, onCancel, onConfirm }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="Delete this entry?"
      description="This can't be undone. The account balance is restored."
      size="sm"
      footer={
        <>
          <Button onClick={onCancel}>Keep it</Button>
          <Button variant="danger" onClick={onConfirm} data-action="confirm-delete">
            Delete entry
          </Button>
        </>
      }
    >
      {tx && (
        <div className="rounded border border-line bg-white/[0.02] p-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-ink truncate">{tx.note || categoryLabel(tx.category)}</p>
            <p className="mt-1 text-xs text-ink-3">
              {categoryLabel(tx.category)} · {shortDate(tx.date)}
            </p>
          </div>
          <Amount value={tx.amount} currency={tx.currency} className="text-sm font-medium text-ink" />
        </div>
      )}
    </Modal>
  );
}
