import { useState, useEffect } from 'react';
import useFinanceStore from '../../hooks/useFinanceStore.js';
import { parseAmount, convertBetween } from '../../lib/currency.js';
import Modal from '../../components/Modal.jsx';
import FieldError from '../../components/FieldError.jsx';
import Button from '../../components/Button.jsx';
import { Field, TextInput, AmountInput, Segmented } from '../../components/Field.jsx';
import { accountLabel } from '../../lib/format.js';
import { isCurrencyCode } from '../../lib/rates.js';
import useHeldValue from '../../hooks/useHeldValue.js';
import AnimatedAmount from '../../components/AnimatedAmount.jsx';
import { ensureExchangeRates } from '../../hooks/useExchangeRates.js';

export default function EditAccountModal({ isOpen, onClose, account: accountProp }) {
  // keep the account's content on screen while the modal fades out
  const account = useHeldValue(accountProp, isOpen);
  const updateAccount = useFinanceStore((s) => s.updateAccount);
  const addTransaction = useFinanceStore((s) => s.addTransaction);

  const [adjustmentMode, setAdjustmentMode] = useState('+ ADD');
  const [amountInput, setAmountInput] = useState('');
  const [note, setNote] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [currencyInput, setCurrencyInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const resetState = () => {
    setAdjustmentMode('+ ADD');
    setAmountInput('');
    setNote('');
    setErrorMsg('');
    if (account) {
      setNameInput(account.name);
      setCurrencyInput(account.currency);
    }
  };

  // reload form whenever a different account is opened
  useEffect(() => {
    if (isOpen && account) resetState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id, isOpen]);

  if (!account) return null;

  const isDebt = account.type === 'DEBT';

  // the form is re-seeded on open, so it is not cleared here (it would blank mid fade-out)
  const handleClose = () => {
    onClose();
  };

  const handleSave = async () => {
    if (!nameInput.trim()) {
      setErrorMsg('Give the account a name.');
      return;
    }
    if (!isCurrencyCode(currencyInput)) {
      setErrorMsg('A currency code is three letters, like USD.');
      return;
    }

    const adjAmount = parseAmount(amountInput);
    const hasAdjustment = !isNaN(adjAmount) && adjAmount > 0;
    // something typed that is not an amount above zero is refused, not silently skipped
    if (amountInput.trim() !== '' && !hasAdjustment) {
      setErrorMsg('Enter the adjustment as an amount above zero: Add money or Remove money sets the direction.');
      return;
    }

    /*
     * Currency change: convert the account's existing numeric balance
     * into the new currency using the current exchange rate table, so
     * the stored balance stays mathematically meaningful (e.g. 500
     * USD -> the equivalent amount in the new currency, not a raw
     * "500" reinterpreted under a different currency label).
     *
     * Historical transactions are NEVER touched here — each already
     * carries its own tx.currency snapshot from when it was recorded,
     * and Calendar/DailyLog/Ledger already interpret every
     * transaction via tx.currency, not the account's current
     * currency. Changing the account's currency only ever affects
     * the account's own balance figure going forward.
     */
    const currencyChanged = currencyInput !== account.currency;

    // never convert with a missing rate: it would zero the balance
    if (currencyChanged) {
      const r = await ensureExchangeRates([account.currency, currencyInput]);
      if (r.unsupported.length) {
        setErrorMsg(`The exchange-rate service doesn't recognise ${r.unsupported.join(' or ')}, so the balance can't be converted. Check the code.`);
        return;
      }
      if (!r.ok) {
        setErrorMsg('No exchange rate for this currency yet: the rate service can\'t be reached. Try again when you are online.');
        return;
      }
    }

    const convertedBalance = currencyChanged
      ? convertBetween(
          account.balance,
          account.currency,
          currencyInput,
          useFinanceStore.getState().exchangeRates
        )
      : account.balance;

    // metadata + balance change; balance is converted so its meaning is preserved across the currency change
    const updatedAccount = {
      ...account,
      name: nameInput.trim(),
      currency: currencyInput,
      balance: convertedBalance,
    };

    if (!hasAdjustment) {
      await updateAccount(updatedAccount);
      onClose();
      return;
    }

    // manual DEBT adjustments change the liability only: no transaction, no cash movement
    if (!isDebt) {
      const adjType = adjustmentMode === '+ ADD' ? 'INCOME' : 'EXPENSE';
      const adjTx = {
        id: crypto.randomUUID(),
        date: new Date().toLocaleDateString('en-GB').replace(/\//g, '-'),
        type: adjType,
        amount: adjAmount,
        currency: currencyInput,
        accountId: account.id,
        toAccountId: null,
        category: 'OTHER',
        note: note.trim() || (adjustmentMode === '+ ADD' ? 'Manual add' : 'Manual remove'),
        imageData: null,
        createdAt: new Date().toISOString(),
        exchangeRate: null,
      };
      await addTransaction(adjTx);
    }

    // DEBT: add = more debt (negative), remove = payment toward zero
    const signedAdj = adjustmentMode === '+ ADD' ? adjAmount : -adjAmount;
    const newBalance = isDebt
      ? Math.min(0, updatedAccount.balance - signedAdj)
      : updatedAccount.balance + signedAdj;
    await updateAccount({ ...updatedAccount, balance: newBalance });

    onClose();
  };

  const adjustLabel = isDebt
    ? { add: 'Borrowed more', remove: 'Paid back' }
    : { add: 'Add money', remove: 'Remove money' };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Edit ${accountLabel(account.name)}`}
      size="md"
      footer={
        <>
          <Button onClick={handleClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} data-action="save-account">
            Save changes
          </Button>
        </>
      }
    >
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
      >
        <div className="rounded border border-line bg-white/[0.02] p-4">
          <p className="eyebrow">{isDebt ? 'Currently owed' : 'Current balance'}</p>
          <p className={`mt-1.5 text-2xl font-medium tracking-[-0.02em] ${account.balance < 0 ? 'text-negative' : 'text-ink'}`}>
            <AnimatedAmount value={account.balance} currency={account.currency} split codeClassName="ml-1.5 text-[max(12px,0.55em)] font-mono font-normal text-ink-3" />
          </p>
        </div>

        <fieldset className="space-y-4 min-w-0">
          <legend className="text-base font-medium text-ink mb-1">Adjust the balance</legend>
          <p className="text-xs text-ink-3 -mt-2">
            {isDebt
              ? 'Changes what is owed. No entry is recorded.'
              : 'Recorded in the ledger as an Other entry dated today.'}
          </p>
          <Segmented
            value={adjustmentMode}
            onChange={setAdjustmentMode}
            label="Adjustment"
            className="w-full"
            options={[
              { value: '+ ADD', label: adjustLabel.add },
              { value: '- REMOVE', label: adjustLabel.remove },
            ]}
          />
          <Field label="Amount" htmlFor="adjust-amount">
            <AmountInput
              id="adjust-amount"
              inputMode={isDebt ? 'decimal' : 'numeric'}
              value={amountInput}
              onChange={(e) =>
                setAmountInput(
                  isDebt ? e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1') : e.target.value
                )
              }
              placeholder="0"
              prefix={isDebt ? '−' : undefined}
              currency={account.currency}
              autoComplete="off"
            />
          </Field>
          <Field label="Note" htmlFor="adjust-note" hint="Optional">
            <TextInput id="adjust-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Salary, correction…" />
          </Field>
        </fieldset>

        <fieldset className="space-y-4 pt-6 border-t border-line min-w-0">
          <legend className="text-base font-medium text-ink mb-1 float-left w-full">Account details</legend>
          <div className="grid gap-4 sm:grid-cols-[1fr_140px] clear-both">
            <Field label="Name" htmlFor="edit-name">
              <TextInput
                id="edit-name"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
                className="uppercase tracking-[0.04em]"
                autoComplete="off"
              />
            </Field>
            <Field label="Currency" htmlFor="edit-currency" hint="Converts the balance">
              <TextInput
                id="edit-currency"
                value={currencyInput}
                onChange={(e) => setCurrencyInput(e.target.value.toUpperCase().slice(0, 3))}
                maxLength={3}
                className="uppercase font-mono tracking-[0.08em]"
                autoComplete="off"
              />
            </Field>
          </div>
        </fieldset>

        <FieldError message={errorMsg} className="" />
      </form>
    </Modal>
  );
}
