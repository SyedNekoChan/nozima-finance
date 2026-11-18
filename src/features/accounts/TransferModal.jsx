import { useState, useMemo, useEffect } from 'react';
import useFinanceStore from '../../hooks/useFinanceStore.js';
import Modal from '../../components/Modal.jsx';
import FieldError from '../../components/FieldError.jsx';
import Reveal from '../../components/Reveal.jsx';
import AnimatedAmount from '../../components/AnimatedAmount.jsx';
import useHeldValue from '../../hooks/useHeldValue.js';
import Button from '../../components/Button.jsx';
import { Field, FieldGroup, TextInput, AmountInput, ChoiceChips } from '../../components/Field.jsx';
import { accountLabel } from '../../lib/format.js';
import { IconArrowRight } from '../../components/icons.jsx';
import { parseAmount } from '../../lib/currency.js';
import { getTodayDateString } from '../../lib/date.js';

export default function TransferModal({ isOpen, onClose, sourceAccount: sourceAccountProp }) {
  // keep the source account on screen while the modal fades out
  const sourceAccount = useHeldValue(sourceAccountProp, isOpen);
  const accounts = useFinanceStore((s) => s.accounts);
  const exchangeRates = useFinanceStore((s) => s.exchangeRates);
  const createTransfer = useFinanceStore((s) => s.createTransfer);

  const [destinationId, setDestinationId] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [note, setNote] = useState('');
  const [rateInput, setRateInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // reset form whenever a new transfer session starts
  useEffect(() => {
    if (!isOpen) return; // keep the form intact while the modal fades out
    setDestinationId('');
    setAmountInput('');
    setNote('');
    setRateInput('');
    setErrorMsg('');
    setIsSubmitting(false);
  }, [sourceAccount, isOpen]);

  const availableDestinations = useMemo(
    () => accounts.filter((a) => a.id !== sourceAccount?.id),
    [accounts, sourceAccount]
  );

  const destinationAccount = useMemo(
    () => accounts.find((a) => a.id === destinationId),
    [accounts, destinationId]
  );

  const isCrossCurrency = Boolean(
    sourceAccount && destinationAccount && sourceAccount.currency !== destinationAccount.currency
  );

  // auto-suggest a rate the moment currencies diverge
  useEffect(() => {
    if (isCrossCurrency && !rateInput && sourceAccount && destinationAccount) {
      const suggested =
        exchangeRates[sourceAccount.currency] / exchangeRates[destinationAccount.currency];
      if (!isNaN(suggested)) setRateInput(suggested.toFixed(4));
    } else if (!isCrossCurrency && rateInput) {
      setRateInput('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCrossCurrency, sourceAccount, destinationAccount]);

  const received = useMemo(() => {
    const amt = parseAmount(amountInput);
    if (!isCrossCurrency) return amt;
    return amt * parseAmount(rateInput);
  }, [amountInput, rateInput, isCrossCurrency]);

  const showReceived =
    amountInput && (isCrossCurrency ? rateInput : destinationAccount) && !isNaN(received);

  if (!sourceAccount) return null;

  // the form is re-seeded on open, so it is not cleared here (it would blank mid fade-out)
  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  // The centralized store-level createTransfer() action owns every part of
  // the transfer's balance math (validation, same/cross-currency handling,
  // source/destination updates, persistence). This component only collects
  // input and forwards it — it never computes or applies a balance itself.
  const handleTransfer = async () => {
    // Guards against rapid double-click / repeated submission: once a
    // submission is in flight, further clicks are ignored until it
    // resolves (the button is also disabled below for the same reason).
    if (isSubmitting) return;

    if (!destinationAccount) {
      setErrorMsg('Choose the account to transfer to.');
      return;
    }

    const amt = parseAmount(amountInput);
    if (isNaN(amt) || amt <= 0) {
      setErrorMsg('Enter an amount above zero.');
      return;
    }

    if (isCrossCurrency) {
      const rate = parseAmount(rateInput);
      if (isNaN(rate) || rate <= 0) {
        setErrorMsg('Enter an exchange rate above zero.');
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      await createTransfer({
        sourceAccountId: sourceAccount.id,
        destinationAccountId: destinationAccount.id,
        amount: amt,
        date: getTodayDateString(),
        note,
        exchangeRate: isCrossCurrency ? rateInput : null,
      });

      // The modal only closes after the full transfer (persistence +
      // both account balance updates) has completed successfully.
      handleClose();
    } catch (err) {
      setErrorMsg(err?.message || 'TRANSFER FAILED');
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Transfer from ${accountLabel(sourceAccount?.name)}`}
      size="md"
      footer={
        <>
          <Button onClick={handleClose} disabled={isSubmitting}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleTransfer}
            disabled={isSubmitting || !destinationId || !amountInput}
            data-action="confirm-transfer"
          >
            {isSubmitting ? 'Transferring…' : 'Transfer'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          handleTransfer();
        }}
      >
        <div className="rounded border border-line bg-white/[0.02] p-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">From</p>
            <p className="mt-1 text-sm text-ink break-words">{accountLabel(sourceAccount.name)}</p>
          </div>
          <div className="text-right">
            <p className="eyebrow">Available</p>
            <p className="mt-1 text-sm text-ink">
              <AnimatedAmount value={sourceAccount.balance} currency={sourceAccount.currency} split codeClassName="ml-1 font-mono text-[max(12px,0.8em)] text-ink-3" />
            </p>
          </div>
        </div>

        <FieldGroup label="To">
          {availableDestinations.length === 0 ? (
            <p className="text-sm text-ink-3">There is no other account to transfer to yet.</p>
          ) : (
            <ChoiceChips
              value={destinationId}
              disabled={isSubmitting}
              onChange={(id) => {
                setDestinationId(id);
                setErrorMsg('');
              }}
              options={availableDestinations.map((a) => ({ value: a.id, label: accountLabel(a.name), meta: a.currency }))}
            />
          )}
        </FieldGroup>

        <Field label="Amount" htmlFor="transfer-amount">
          <AmountInput
            id="transfer-amount"
            inputMode="decimal"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="0"
            disabled={isSubmitting}
            currency={sourceAccount.currency}
            autoComplete="off"
          />
        </Field>

        <Reveal show={isCrossCurrency}>
          <Field
            label="Exchange rate"
            htmlFor="transfer-rate"
            hint={`1 ${sourceAccount.currency} = this many ${destinationAccount?.currency || ''}`}
          >
            <TextInput
              id="transfer-rate"
              inputMode="decimal"
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              disabled={isSubmitting}
              className="tnum"
              autoComplete="off"
            />
          </Field>
        </Reveal>

        <Reveal show={Boolean(showReceived) && Boolean(destinationAccount)}>
          <div className="flex items-center gap-3 rounded bg-positive/[0.08] border border-positive/25 px-4 py-3 text-sm text-ink-2">
            <IconArrowRight className="w-[18px] h-[18px] text-positive flex-shrink-0" />
            <span>
              {accountLabel(destinationAccount?.name)} receives{' '}
              <AnimatedAmount value={received} currency={destinationAccount?.currency} className="text-ink font-medium" />
            </span>
          </div>
        </Reveal>

        <Field label="Note" htmlFor="transfer-note" hint="Optional">
          <TextInput id="transfer-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What is it for?" disabled={isSubmitting} />
        </Field>

        <FieldError message={errorMsg} className="" />
      </form>
    </Modal>
  );
}
