import { useState, useMemo, useEffect } from 'react';
import useFinanceStore from '../../hooks/useFinanceStore.js';
import Modal from '../../components/Modal.jsx';
import Button from '../../components/Button.jsx';
import { formatAmount, parseAmount } from '../../lib/currency.js';
import { getTodayDateString } from '../../lib/date.js';

export default function TransferModal({ isOpen, onClose, sourceAccount }) {
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

  const handleClose = () => {
    if (isSubmitting) return;
    setDestinationId('');
    setAmountInput('');
    setNote('');
    setRateInput('');
    setErrorMsg('');
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
      setErrorMsg('SELECT DESTINATION');
      return;
    }

    const amt = parseAmount(amountInput);
    if (isNaN(amt) || amt <= 0) {
      setErrorMsg('INVALID AMOUNT');
      return;
    }

    if (isCrossCurrency) {
      const rate = parseAmount(rateInput);
      if (isNaN(rate) || rate <= 0) {
        setErrorMsg('INVALID RATE');
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
    <Modal isOpen={isOpen} onClose={handleClose} title={`TRANSFER: ${sourceAccount?.name || ''}`} size="md">
      <div className="border-b border-gray-800 pb-4 mb-6">
        <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">FROM</span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-mono text-sm text-white min-w-0 break-words">[ {sourceAccount.name} ]</span>
          <span className="font-mono text-xs text-gray-500 flex-shrink-0">{sourceAccount.currency}</span>
          <span className="font-mono text-xs text-gray-500 sm:ml-auto flex-shrink-0">
            {formatAmount(sourceAccount.balance, sourceAccount.currency)}
          </span>
        </div>
      </div>

      <div className="mb-6">
        <span className="block font-mono text-xs tracking-widest text-gray-500 mb-2">TO</span>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {availableDestinations.length === 0 ? (
            <span className="font-mono text-xs text-gray-500">[ NO OTHER ACCOUNTS ]</span>
          ) : (
            availableDestinations.map((account) => (
              <Button
                key={account.id}
                active={destinationId === account.id}
                disabled={isSubmitting}
                onClick={() => {
                  setDestinationId(account.id);
                  setErrorMsg('');
                }}
              >
                {account.name}
              </Button>
            ))
          )}
        </div>
      </div>

      <div className="mb-6">
        <span className="block font-mono text-xs tracking-widest text-gray-500 mb-2">AMOUNT</span>
        <input
          type="text"
          inputMode="numeric"
          value={amountInput}
          onChange={(e) => setAmountInput(e.target.value)}
          placeholder="0"
          disabled={isSubmitting}
          className="w-full bg-black text-white font-mono border-b-2 border-gray-800 focus:border-white focus:outline-none px-1 py-2 text-2xl disabled:opacity-40"
        />
        <span className="font-mono text-xs text-gray-500 mt-1 block">{sourceAccount.currency}</span>
      </div>

      {isCrossCurrency && (
        <div className="mb-6">
          <span className="block font-mono text-xs tracking-widest text-gray-500 mb-2">EXCHANGE RATE</span>
          <span className="block font-mono text-xs text-gray-500 mb-2">
            1 {sourceAccount.currency} = ? {destinationAccount.currency}
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={rateInput}
            onChange={(e) => setRateInput(e.target.value)}
            disabled={isSubmitting}
            className="w-full bg-black text-white font-mono border-b-2 border-gray-800 focus:border-white focus:outline-none px-1 py-2 text-sm disabled:opacity-40"
          />
          {showReceived && (
            <div className="mt-3 font-mono text-sm text-gray-400">
              YOU WILL RECEIVE: {formatAmount(received, destinationAccount.currency)}
            </div>
          )}
        </div>
      )}

      {!isCrossCurrency && showReceived && destinationAccount && (
        <div className="mb-6 font-mono text-sm text-gray-400">
          YOU WILL RECEIVE: {formatAmount(received, destinationAccount.currency)}
        </div>
      )}

      <div className="mb-6">
        <span className="block font-mono text-xs tracking-widest text-gray-500 mb-2">NOTE</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="optional"
          disabled={isSubmitting}
          className="w-full bg-black text-white font-mono border-b-2 border-gray-800 focus:border-white focus:outline-none px-1 py-2 text-sm disabled:opacity-40"
        />
      </div>

      {errorMsg && (
        <div className="font-mono text-xs text-gray-400 mb-4 border-l-2 border-white pl-3">{errorMsg}</div>
      )}

      <div className="flex justify-end mt-6 border-t border-gray-800 pt-4">
        <Button
          onClick={handleTransfer}
          active={true}
          disabled={isSubmitting || !destinationId || !amountInput}
        >
          {isSubmitting ? 'TRANSFERRING...' : 'CONFIRM TRANSFER'}
        </Button>
      </div>
    </Modal>
  );
}
