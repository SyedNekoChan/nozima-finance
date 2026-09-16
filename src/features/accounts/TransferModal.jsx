import { useState, useMemo, useEffect } from 'react';
import useFinanceStore from '../../hooks/useFinanceStore.js';
import Modal from '../../components/Modal.jsx';
import Button from '../../components/Button.jsx';
import { formatAmount, parseAmount } from '../../lib/currency.js';

export default function TransferModal({ isOpen, onClose, sourceAccount }) {
  const accounts = useFinanceStore((s) => s.accounts);
  const exchangeRates = useFinanceStore((s) => s.exchangeRates);
  const updateAccount = useFinanceStore((s) => s.updateAccount);
  const addTransaction = useFinanceStore((s) => s.addTransaction);

  const [destinationId, setDestinationId] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [note, setNote] = useState('');
  const [rateInput, setRateInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // reset form whenever a new transfer session starts
  useEffect(() => {
    setDestinationId('');
    setAmountInput('');
    setNote('');
    setRateInput('');
    setErrorMsg('');
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
    setDestinationId('');
    setAmountInput('');
    setNote('');
    setRateInput('');
    setErrorMsg('');
    onClose();
  };

  const handleTransfer = () => {
    if (!destinationAccount) {
      setErrorMsg('SELECT DESTINATION');
      return;
    }
    const amt = parseAmount(amountInput);
    if (isNaN(amt) || amt <= 0) {
      setErrorMsg('INVALID AMOUNT');
      return;
    }
    let rate = null;
    if (isCrossCurrency) {
      rate = parseAmount(rateInput);
      if (isNaN(rate) || rate <= 0) {
        setErrorMsg('INVALID RATE');
        return;
      }
    }
    const finalReceived = isCrossCurrency ? amt * rate : amt;

    const tx = {
      id: crypto.randomUUID(),
      date: new Date().toLocaleDateString('en-GB').replace(/\//g, '-'),
      type: 'TRANSFER',
      amount: amt,
      currency: sourceAccount.currency,
      accountId: sourceAccount.id,
      toAccountId: destinationAccount.id,
      category: null,
      note: note.trim() || 'Transfer',
      imageData: null,
      createdAt: new Date().toISOString(),
      exchangeRate: isCrossCurrency ? rate : null,
    };

    addTransaction(tx);
    updateAccount({ ...sourceAccount, balance: sourceAccount.balance - amt });
    updateAccount({ ...destinationAccount, balance: destinationAccount.balance + finalReceived });

    handleClose();
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
          className="w-full bg-black text-white font-mono border-b-2 border-gray-800 focus:border-white focus:outline-none px-1 py-2 text-2xl"
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
            className="w-full bg-black text-white font-mono border-b-2 border-gray-800 focus:border-white focus:outline-none px-1 py-2 text-sm"
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
          className="w-full bg-black text-white font-mono border-b-2 border-gray-800 focus:border-white focus:outline-none px-1 py-2 text-sm"
        />
      </div>

      {errorMsg && (
        <div className="font-mono text-xs text-gray-400 mb-4 border-l-2 border-white pl-3">{errorMsg}</div>
      )}

      <div className="flex justify-end mt-6 border-t border-gray-800 pt-4">
        <Button onClick={handleTransfer} active={true} disabled={!destinationId || !amountInput}>
          CONFIRM TRANSFER
        </Button>
      </div>
    </Modal>
  );
}
