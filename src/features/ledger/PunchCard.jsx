import { useState, useEffect, useRef } from 'react';
import useFinanceStore from '../../hooks/useFinanceStore.js';
import {
  formatAmount,
  parseAmount,
} from '../../lib/currency.js';
import { getTodayDateString } from '../../lib/date.js';
import Modal from '../../components/Modal.jsx';
import ImageViewerModal from '../../components/ImageViewerModal.jsx';
import Button from '../../components/Button.jsx';
import SelectorField from '../../components/SelectorField.jsx';

const CATEGORIES = [
  'FOOD',
  'CLOTHING',
  'SOCIAL',
  'BILLS',
  'OTHER',
];

export default function PunchCard({
  isOpen,
  onClose,
  editingTx,
  initialDate,
}) {
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
    useState('FOOD');

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
          'FOOD'
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
      setCategory('FOOD');
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
      const srcRate =
        exchangeRates[
          sourceAccount.currency
        ];

      const dstRate =
        exchangeRates[
          destAccount.currency
        ];

      if (
        srcRate &&
        dstRate
      ) {
        const rate =
          srcRate / dstRate;

        setExchangeRateInput(
          rate.toFixed(4)
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
        return;
      }

      if (!sourceAccount) {
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
        return;
      }

      const resolvedDate =
        date.trim() ||
        getTodayDateString();

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

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={
        editingTx
          ? 'EDIT ENTRY'
          : 'NEW LEDGER ENTRY'
      }
      size="md"
    >
      <div className="mb-4">
        <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1 leading-none">
          DATE
        </span>

        <input
          type="text"
          value={date}
          onChange={(e) =>
            setDate(
              e.target.value
            )
          }
          placeholder="DD-MM-YYYY"
          className="w-full bg-black text-white font-mono border-b-2 border-gray-800 focus:border-white focus:outline-none px-1 py-2 text-sm tracking-widest"
        />
      </div>

      <div className="mb-4">
        <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1 leading-none">
          TYPE
        </span>

        <div className="flex gap-2 overflow-x-auto">
          {[
            'EXPENSE',
            'INCOME',
            'TRANSFER',
          ].map(
            (option) => (
              <Button
                key={option}
                active={
                  type === option
                }
                className="whitespace-nowrap flex-shrink-0"
                onClick={() =>
                  handleTypeChange(
                    option
                  )
                }
              >
                {option}
              </Button>
            )
          )}
        </div>
      </div>

      <div className="mb-4">
        <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1 leading-none">
          ACCOUNT
        </span>

        {accounts.length ===
        0 ? (
          <span className="font-mono text-xs text-gray-500 leading-normal">
            NO ACCOUNTS — CREATE ONE
            FIRST
          </span>
        ) : (
          <SelectorField
            value={accountId}
            options={accounts.map(
              (account) => ({
                value: account.id,
                label: account.name,
              })
            )}
            onChange={
              handleAccountChange
            }
            placeholder="SELECT ACCOUNT"
          />
        )}
      </div>

      {type === 'TRANSFER' && (
        <div className="mb-4">
          <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1 leading-none">
            TO ACCOUNT
          </span>

          <SelectorField
            value={toAccountId}
            options={accounts
              .filter(
                (a) =>
                  a.id !==
                  accountId
              )
              .map(
                (account) => ({
                  value:
                    account.id,
                  label:
                    account.name,
                })
              )}
            onChange={
              setToAccountId
            }
            placeholder="SELECT DESTINATION"
          />
        </div>
      )}

      <div className="mb-4">
        <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1 leading-none">
          AMOUNT
        </span>

        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={
              amountInput
            }
            onChange={(e) =>
              setAmountInput(
                e.target.value
              )
            }
            placeholder="0"
            className="w-full bg-black text-white font-mono border-b-2 border-gray-800 focus:border-white focus:outline-none px-1 py-2 text-2xl"
          />

          <span className="font-mono text-xs text-gray-500">
            {
              currencyCode
            }
          </span>
        </div>
      </div>

      {type !== 'TRANSFER' && (
        <div className="mb-4">
          <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1 leading-none">
            CATEGORY
          </span>

          <SelectorField
            value={category}
            options={CATEGORIES.map(
              (option) => ({
                value: option,
                label: option,
              })
            )}
            onChange={setCategory}
            placeholder="SELECT CATEGORY"
            searchable={false}
          />
        </div>
      )}

      <div className="mb-4">
        <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1 leading-none">
          NOTE
        </span>

        <input
          type="text"
          value={note}
          onChange={(e) =>
            setNote(
              e.target.value
            )
          }
          placeholder="optional"
          className="w-full bg-black text-white font-mono border-b-2 border-gray-800 focus:border-white focus:outline-none px-1 py-2 text-sm"
        />
      </div>

      <div className="mb-4">
        <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1 leading-none">
          ATTACH
        </span>

        {imageData ? (
          <div>
            <img
              src={imageData}
              alt="receipt"
              onClick={() =>
                setImageViewerOpen(
                  true
                )
              }
              className="w-12 h-12 object-cover border-2 border-white filter grayscale contrast-125 cursor-pointer"
            />

            <div className="mt-2">
              <Button
                onClick={() =>
                  setImageData(
                    null
                  )
                }
              >
                REMOVE IMAGE
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Button
              onClick={() =>
                fileInputRef.current?.click()
              }
            >
              + UPLOAD IMAGE
            </Button>

            <input
              type="file"
              accept="image/*"
              onChange={
                handleImageUpload
              }
              className="hidden"
              ref={
                fileInputRef
              }
            />
          </>
        )}
      </div>

      {type === 'TRANSFER' &&
        isCrossCurrency && (
          <div className="mb-4">
            <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1 leading-none">
              EXCHANGE RATE
            </span>

            <span className="block font-mono text-xs text-gray-500 mb-1">
              1{' '}
              {
                sourceAccount.currency
              }{' '}
              ={' '}
              {
                destAccount.currency
              }
            </span>

            <input
              type="text"
              inputMode="decimal"
              value={
                exchangeRateInput
              }
              onChange={(e) =>
                setExchangeRateInput(
                  e.target.value
                )
              }
              className="w-full bg-black text-white font-mono border-b-2 border-gray-800 focus:border-white focus:outline-none px-1 py-2 text-sm"
            />

            <span className="font-mono text-xs text-gray-500 mt-2 block">
              YOU WILL RECEIVE:{' '}
              {formatAmount(
                calculatedDestination,
                destAccount.currency
              )}
            </span>
          </div>
        )}

      {errorMsg && (
        <div className="font-mono text-xs text-gray-400 mb-4 border-l-2 border-white pl-3">
          {errorMsg}
        </div>
      )}

      <div className="flex justify-end mt-6 border-t border-gray-800 pt-4">
        <Button
          onClick={handleSave}
          disabled={isSubmitting}
        >
          {isSubmitting
            ? 'SAVING...'
            : editingTx
              ? 'SAVE CHANGES'
              : 'SAVE ENTRY'}
        </Button>
      </div>
      </Modal>

      <ImageViewerModal
        isOpen={imageViewerOpen}
        onClose={() =>
          setImageViewerOpen(false)
        }
        imageData={imageData}
      />
    </>
  );
}
