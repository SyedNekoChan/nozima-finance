import { useState, useEffect, useRef } from 'react';
import useFinanceStore from '../../hooks/useFinanceStore.js';
import {
  parseAmount,
  suggestRate,
  formatRate,
} from '../../lib/currency.js';
import {
  TRANSACTION_CATEGORIES,
  DEFAULT_CATEGORY,
} from '../../lib/constants.js';
import { getTodayDateString, normalizeDateInput } from '../../lib/date.js';
import Modal from '../../components/Modal.jsx';
import ImageViewerModal from '../../components/ImageViewerModal.jsx';
import Button from '../../components/Button.jsx';
import SelectorField from '../../components/SelectorField.jsx';
import Reveal from '../../components/Reveal.jsx';
import FieldError from '../../components/FieldError.jsx';
import AnimatedAmount from '../../components/AnimatedAmount.jsx';
import { Field, TextInput, AmountInput, Segmented } from '../../components/Field.jsx';
import { IconImage, IconTransfer, IconTrash } from '../../components/icons.jsx';
import { accountLabel, categoryLabel } from '../../lib/format.js';
import useHeldValue from '../../hooks/useHeldValue.js';

const TYPE_OPTIONS = [
  { value: 'EXPENSE', label: 'Expense' },
  { value: 'INCOME', label: 'Income' },
  { value: 'TRANSFER', label: 'Transfer' },
];

export default function PunchCard({
  isOpen,
  onClose,
  editingTx: editingTxProp,
  initialDate: initialDateProp,
}) {
  // keep the entry being edited on screen while the modal fades out
  const editingTx = useHeldValue(editingTxProp, isOpen);
  const initialDate = useHeldValue(initialDateProp, isOpen);

  const accounts =
    useFinanceStore((s) => s.accounts);

  const exchangeRates =
    useFinanceStore(
      (s) => s.exchangeRates
    );

  const addTransaction =
    useFinanceStore(
      (s) => s.addTransaction
    );

  const updateTransaction =
    useFinanceStore(
      (s) => s.updateTransaction
    );

  const createTransfer =
    useFinanceStore(
      (s) => s.createTransfer
    );

  const editTransfer =
    useFinanceStore(
      (s) => s.editTransfer
    );

  const [date, setDate] =
    useState(getTodayDateString());

  const [type, setType] =
    useState('EXPENSE');

  const [accountId, setAccountId] =
    useState(accounts[0]?.id || '');

  const [toAccountId, setToAccountId] =
    useState(null);

  const [amountInput, setAmountInput] =
    useState('');

  const [category, setCategory] =
    useState(DEFAULT_CATEGORY);

  const [note, setNote] =
    useState('');

  const [imageData, setImageData] =
    useState(null);

  const [
    imageViewerOpen,
    setImageViewerOpen,
  ] = useState(false);

  const [
    exchangeRateInput,
    setExchangeRateInput,
  ] = useState('');

  const [errorMsg, setErrorMsg] =
    useState('');

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const fileInputRef =
    useRef(null);

  useEffect(() => {
    if (!isOpen) return; // form is re-seeded on open; do not blank it mid fade-out
    if (editingTx) {
      setDate(editingTx.date);
      setType(editingTx.type);
      setAccountId(
        editingTx.accountId
      );
      setToAccountId(
        editingTx.toAccountId
      );
      setAmountInput(
        String(editingTx.amount)
      );
      setCategory(
        editingTx.category ||
          DEFAULT_CATEGORY
      );
      setNote(
        editingTx.note || ''
      );
      setImageData(
        editingTx.imageData ||
          null
      );
      setExchangeRateInput(
        editingTx.exchangeRate
          ? String(
              editingTx.exchangeRate
            )
          : ''
      );
    } else {
      setDate(
        initialDate ||
          getTodayDateString()
      );

      setType('EXPENSE');

      setAccountId(
        accounts[0]?.id || ''
      );

      setToAccountId(null);
      setAmountInput('');
      setCategory(DEFAULT_CATEGORY);
      setNote('');
      setImageData(null);
      setExchangeRateInput('');
    }

    setErrorMsg('');
    setIsSubmitting(false);
  }, [
    editingTx,
    isOpen,
    initialDate,
    accounts,
  ]);

  const sourceAccount =
    accounts.find(
      (a) =>
        a.id === accountId
    );

  const destAccount =
    type === 'TRANSFER'
      ? accounts.find(
          (a) =>
            a.id ===
            toAccountId
        )
      : null;

  const currencyCode =
    sourceAccount?.currency ||
    'UZS';

  const isCrossCurrency =
    Boolean(
      sourceAccount &&
        destAccount &&
        sourceAccount.currency !==
          destAccount.currency
    );

  useEffect(() => {
    if (
      isCrossCurrency &&
      !exchangeRateInput &&
      sourceAccount &&
      destAccount
    ) {
      // the shared suggestion; null when either currency has no rate (then the person types one)
      const rate = suggestRate(
        sourceAccount.currency,
        destAccount.currency,
        exchangeRates
      );

      if (rate !== null) {
        setExchangeRateInput(
          formatRate(rate)
        );
      }
    }
  }, [
    isCrossCurrency,
    sourceAccount,
    destAccount,
    exchangeRates,
    exchangeRateInput,
  ]);

  const handleTypeChange =
    (option) => {
      setType(option);

      if (
        option === 'TRANSFER'
      ) {
        setCategory(null);
      } else {
        setToAccountId(null);
      }
    };

  const handleAccountChange =
    (id) => {
      setAccountId(id);

      setAmountInput('');
    };

  const handleImageUpload =
    (event) => {
      const file =
        event.target.files?.[0];

      if (!file) {
        return;
      }

      const reader =
        new FileReader();

      reader.onload = () =>
        setImageData(
          reader.result
        );

      reader.readAsDataURL(file);
    };

  const calculatedDestination =
    parseAmount(
      amountInput
    ) *
    (
      parseAmount(
        exchangeRateInput
      ) || 0
    );

  const handleSave =
    async () => {
      if (isSubmitting) {
        return;
      }

      if (!accountId) {
        setErrorMsg('Choose an account.');
        return;
      }

      if (!sourceAccount) {
        setErrorMsg('Choose an account.');
        return;
      }

      const amount =
        parseAmount(
          amountInput
        );

      if (
        !amount ||
        Number.isNaN(amount)
      ) {
        setErrorMsg('Enter an amount.');
        return;
      }

      // the type says which way the money goes; a negative amount would reverse it
      // (a "-50,000" expense used to add 50,000 to the account)
      if (amount < 0) {
        setErrorMsg('Enter the amount without a minus: the type says whether money goes out or comes in.');
        return;
      }

      if (
        type === 'TRANSFER' &&
        (
          !toAccountId ||
          toAccountId ===
            accountId
        )
      ) {
        setErrorMsg('Choose the account to transfer to.');
        return;
      }

      // stored as DD-MM-YYYY exactly: an entry is found on its day by that string
      const resolvedDate = date.trim()
        ? normalizeDateInput(date)
        : getTodayDateString();

      if (!resolvedDate) {
        setErrorMsg('Enter a real date as day-month-year, like 18-11-2026.');
        return;
      }

      setIsSubmitting(true);
      setErrorMsg('');

      try {
        if (type === 'TRANSFER') {
          if (editingTx) {
            await editTransfer(
              editingTx,
              {
                sourceAccountId:
                  accountId,
                destinationAccountId:
                  toAccountId,
                amount,
                date: resolvedDate,
                note,
                exchangeRate:
                  isCrossCurrency
                    ? exchangeRateInput
                    : null,
                imageData,
              }
            );
          } else {
            await createTransfer({
              sourceAccountId:
                accountId,
              destinationAccountId:
                toAccountId,
              amount,
              date: resolvedDate,
              note,
              exchangeRate:
                isCrossCurrency
                  ? exchangeRateInput
                  : null,
              imageData,
            });
          }

          onClose();
          return;
        }

        const tx = {
          id:
            editingTx?.id ||
            crypto.randomUUID(),

          date: resolvedDate,

          type,

          amount,

          currency:
            sourceAccount.currency,

          accountId,

          toAccountId: null,

          category,

          note:
            note.trim(),

          imageData,

          createdAt:
            editingTx?.createdAt ||
            new Date().toISOString(),

          exchangeRate: null,
        };

        if (editingTx) {
          await updateTransaction(
            tx,
            true
          );
        } else {
          await addTransaction(
            tx,
            true
          );
        }

        onClose();
      } catch (err) {
        setErrorMsg(
          err?.message ||
            'SAVE FAILED'
        );
        setIsSubmitting(false);
      }
    };

  const accountOptions = accounts.map((account) => ({
    value: account.id,
    label: accountLabel(account.name),
    meta: account.currency,
  }));

  const categoryOptions = (category && !TRANSACTION_CATEGORIES.includes(category)
    ? [category, ...TRANSACTION_CATEGORIES] // keep legacy values (e.g. FOOD) selectable
    : TRANSACTION_CATEGORIES
  ).map((option) => ({ value: option, label: categoryLabel(option) }));

  const isTransfer = type === 'TRANSFER';

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={editingTx ? 'Edit entry' : 'New entry'}
        size="md"
        footer={
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} disabled={isSubmitting} data-action="save-entry">
              {isSubmitting ? 'Saving…' : editingTx ? 'Save changes' : 'Save entry'}
            </Button>
          </>
        }
      >
        <form
          className="space-y-5"
          onSubmit={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            // Enter in a text field saves, as a form should
            if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'file') {
              e.preventDefault();
              handleSave();
            }
          }}
        >
          <Segmented
            value={type}
            options={TYPE_OPTIONS}
            onChange={handleTypeChange}
            label="Type of entry"
            optionAttr="data-type-option"
            className="w-full"
          />

          <Field label="Amount" htmlFor="entry-amount">
            <AmountInput
              id="entry-amount"
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="0"
              currency={currencyCode}
              autoComplete="off"
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={isTransfer ? 'From account' : 'Account'} htmlFor="entry-account">
              {accounts.length === 0 ? (
                <p className="text-sm text-ink-3">No accounts yet. Create one in Accounts first.</p>
              ) : (
                <SelectorField
                  id="entry-account"
                  value={accountId}
                  options={accountOptions}
                  onChange={handleAccountChange}
                  placeholder="Choose an account"
                />
              )}
            </Field>

            {isTransfer ? (
              <Field label="To account" htmlFor="entry-to-account">
                <SelectorField
                  id="entry-to-account"
                  value={toAccountId}
                  options={accountOptions.filter((a) => a.value !== accountId)}
                  onChange={setToAccountId}
                  placeholder="Choose where it goes"
                />
              </Field>
            ) : (
              <Field label="Category" htmlFor="entry-category">
                <SelectorField
                  id="entry-category"
                  value={category}
                  options={categoryOptions}
                  onChange={setCategory}
                  placeholder="Choose a category"
                  searchable={false}
                />
              </Field>
            )}
          </div>

          <Reveal show={isTransfer && isCrossCurrency}>
            <div className="rounded border border-line bg-white/[0.02] p-4">
              <Field label="Exchange rate" htmlFor="entry-rate" hint={`1 ${sourceAccount?.currency || ''} = this many ${destAccount?.currency || ''}`}>
                <div className="flex items-center gap-3">
                  <TextInput
                    id="entry-rate"
                    inputMode="decimal"
                    value={exchangeRateInput}
                    onChange={(e) => setExchangeRateInput(e.target.value)}
                    className="tnum"
                  />
                  <IconTransfer className="w-5 h-5 text-ink-3 flex-shrink-0" />
                </div>
              </Field>
              <p className="mt-3 text-sm text-ink-2">
                {accountLabel(destAccount?.name)} receives{' '}
                <AnimatedAmount value={calculatedDestination} currency={destAccount?.currency} className="text-ink font-medium" />
              </p>
            </div>
          </Reveal>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Date" htmlFor="entry-date" hint="Day-month-year">
              <TextInput
                id="entry-date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="DD-MM-YYYY"
                className="tnum"
                autoComplete="off"
              />
            </Field>
            <Field label="Note" htmlFor="entry-note" hint="Optional">
              <TextInput id="entry-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was it for?" />
            </Field>
          </div>

          <div>
            <span className="block text-sm font-medium text-ink-2 mb-2">Receipt</span>
            {imageData ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setImageViewerOpen(true)}
                  aria-label="View receipt"
                  className="w-14 h-14 rounded overflow-hidden border border-line-strong hover:border-white/40 motion-btn cursor-pointer"
                >
                  <img src={imageData} alt="" className="w-full h-full object-cover" />
                </button>
                <Button size="sm" variant="quiet" onClick={() => setImageData(null)} icon={<IconTrash className="w-4 h-4" />}>
                  Remove
                </Button>
              </div>
            ) : (
              <>
                <Button size="sm" onClick={() => fileInputRef.current?.click()} icon={<IconImage className="w-4 h-4" />}>
                  Attach a photo
                </Button>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" ref={fileInputRef} />
              </>
            )}
          </div>

          <FieldError message={errorMsg} className="" />
        </form>
      </Modal>

      <ImageViewerModal isOpen={imageViewerOpen} onClose={() => setImageViewerOpen(false)} imageData={imageData} />
    </>
  );
}
