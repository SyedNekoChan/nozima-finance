import { useEffect, useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import AnimatedAmount, { Amount } from '../../components/AnimatedAmount.jsx';
import { DUR, EASE } from '../../lib/motion.js';
import { FUTURE_FUND_NAME, PRIMARY_CURRENCY } from '../../lib/constants.js';
import { convertToBase } from '../../lib/currency.js';
import { accountLabel, accountTypeLabel } from '../../lib/format.js';
import Button, { IconButton } from '../../components/Button.jsx';
import { IconChevronDown, IconEdit, IconHeart, IconTransfer, IconTrash } from '../../components/icons.jsx';
import useFinanceStore from '../../hooks/useFinanceStore.js';

/*
 * One account, as a row of the accounts list: its swatch (its share of the
 * balance in the bar above), name, type and currency, the balance in its own
 * currency with the UZS equivalent, and its actions. Wide screens show the
 * actions inline; phones open them under the row with a tap.
 */
export default function AccountRow({ account, swatch, onEdit, onTransfer, onDelete }) {
  const isFutureFund = account.name.toUpperCase() === FUTURE_FUND_NAME;
  const isNegative = account.balance < 0;
  const isDebt = account.type === 'DEBT';
  const isForeign = String(account.currency).toUpperCase() !== PRIMARY_CURRENCY;

  const anomalyEvent = useFinanceStore((s) => s.anomalyEvent);
  const exchangeRates = useFinanceStore((s) => s.exchangeRates);
  const [isPulsing, setIsPulsing] = useState(false);
  const [open, setOpen] = useState(false);
  const pulseTimeoutRef = useRef(null);

  // OUR_FUTURE: the heart beats when money arrives in it
  useEffect(() => {
    if (!isFutureFund || !anomalyEvent) return;

    const isDirectIncome = anomalyEvent.type === 'INCOME' && anomalyEvent.accountId === account.id;
    const isTransferIn = anomalyEvent.type === 'TRANSFER' && anomalyEvent.toAccountId === account.id;

    if (isDirectIncome || isTransferIn) {
      setIsPulsing(true);
      clearTimeout(pulseTimeoutRef.current);
      pulseTimeoutRef.current = setTimeout(() => setIsPulsing(false), 1500);
    }
  }, [anomalyEvent, isFutureFund, account.id]);

  useEffect(() => () => clearTimeout(pulseTimeoutRef.current), []);

  const inBase = isForeign ? convertToBase(account.balance, account.currency, exchangeRates) : null;
  const name = accountLabel(account.name);

  const actions = (
    <>
      <Button size="sm" onClick={() => onEdit(account)} data-action="edit-account" icon={<IconEdit className="w-4 h-4" />} className="flex-1 md:flex-none">
        Edit
      </Button>
      <Button size="sm" onClick={() => onTransfer(account)} data-action="transfer-account" icon={<IconTransfer className="w-4 h-4" />} className="flex-1 md:flex-none">
        Transfer
      </Button>
      <IconButton
        label={`Delete ${name}`}
        onClick={() => onDelete(account)}
        data-action="delete-account"
        className="md:!h-10 md:!w-10 hover:!text-negative hover:!bg-negative/10"
      >
        <IconTrash className="w-[18px] h-[18px]" />
      </IconButton>
    </>
  );

  return (
    <motion.li
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto', transition: { duration: DUR.content, ease: EASE } }}
      exit={{ opacity: 0, height: 0, transition: { duration: DUR.exit, ease: EASE } }}
      style={{ overflow: 'hidden' }}
      className="list-none border-b border-white/[0.07] last:border-b-0"
    >
      <article aria-label={name} className={`motion-btn ${open ? 'bg-white/[0.04]' : ''}`}>
        <div className="flex items-center gap-2 md:gap-4 md:px-5 md:py-4 md:hover:bg-white/[0.03] motion-btn">
          <button
            type="button"
            data-account-row={account.id}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="md:pointer-events-none flex-1 min-w-0 flex items-center gap-3 md:gap-4 px-4 md:px-0 py-3.5 md:py-0 min-h-[72px] md:min-h-0 text-left cursor-pointer md:cursor-default hover:bg-white/[0.03] md:hover:bg-transparent motion-btn"
          >
            <span
              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isDebt ? 'border-2 border-negative' : ''}`}
              style={isDebt ? undefined : { background: swatch }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-sm font-medium tracking-[0.02em] text-ink truncate">{name}</span>
                {isFutureFund && (
                  <span className={`flex-shrink-0 text-rose ${isPulsing ? 'heart-beat' : 'heart-idle'}`} title="Ours" aria-label="Our future">
                    <IconHeart className="w-4 h-4" />
                  </span>
                )}
              </span>
              <span className="block mt-0.5 text-xs text-ink-3">
                {accountTypeLabel(account.type)} · {account.currency}
              </span>
            </span>
            <span className="text-right flex-shrink-0 min-w-0">
              <span className={`block text-base md:text-lg font-medium tracking-[-0.02em] ${isNegative ? 'text-negative' : 'text-ink'}`}>
                <AnimatedAmount
                  value={account.balance}
                  currency={account.currency}
                  split
                  codeClassName="ml-1 font-mono text-[max(12px,0.7em)] font-normal text-ink-3"
                />
              </span>
              {inBase !== null && (
                <span className="block mt-0.5 text-xs text-ink-3">
                  ≈ <Amount value={inBase} currency="UZS" codeClassName="ml-1 font-mono" />
                </span>
              )}
              {isDebt && <span className="block mt-0.5 text-xs text-ink-3">Owed</span>}
            </span>
            <IconChevronDown
              className={`md:hidden w-[18px] h-[18px] flex-shrink-0 text-ink-3 transition-transform duration-[var(--motion-state)] ${open ? 'rotate-180' : ''}`}
            />
          </button>
          <div className="hidden md:flex items-center gap-2 pl-2">{actions}</div>
        </div>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="actions"
              className="md:hidden"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1, transition: { duration: DUR.state, ease: EASE } }}
              exit={{ height: 0, opacity: 0, transition: { duration: DUR.exit, ease: EASE } }}
              style={{ overflow: 'hidden' }}
            >
              <div className="flex items-center gap-2 px-4 pb-3.5">{actions}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </article>
    </motion.li>
  );
}
