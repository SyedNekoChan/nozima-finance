import { useState, useEffect } from 'react';
import useFinanceStore from '../../hooks/useFinanceStore.js';
import { formatAmount, parseAmount } from '../../lib/currency.js';
import Modal from '../../components/Modal.jsx';
import Button from '../../components/Button.jsx';

export default function EditAccountModal({ isOpen, onClose, account }) {
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

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleSave = async () => {
    if (!nameInput.trim()) {
      setErrorMsg('NAME REQUIRED');
      return;
    }
    if (!currencyInput || currencyInput.length !== 3) {
      setErrorMsg('CURRENCY MUST BE 3 LETTERS');
      return;
    }

    const adjAmount = parseAmount(amountInput);
    const hasAdjustment = !isNaN(adjAmount) && adjAmount > 0;

    // metadata-only change; balance meaning shifts with currency but the number is left untouched intentionally
    const updatedAccount = { ...account, name: nameInput.trim(), currency: currencyInput };

    if (!hasAdjustment) {
      await updateAccount(updatedAccount);
      onClose();
      return;
    }

    const adjType = adjustmentMode === '+ ADD' ? 'INCOME' : 'EXPENSE';
    const adjTx = {
      id: crypto.randomUUID(),
      date: new Date().toLocaleDateString('en-GB').replace(/\//g, '-'),
      type: adjType,
      amount: adjAmount,
      currency: account.currency,
      accountId: account.id,
      toAccountId: null,
      category: 'OTHER',
      note: note.trim() || (adjustmentMode === '+ ADD' ? 'Manual add' : 'Manual remove'),
      imageData: null,
      createdAt: new Date().toISOString(),
      exchangeRate: null,
    };
    await addTransaction(adjTx);

    const newBalance = adjustmentMode === '+ ADD'
      ? account.balance + adjAmount
      : account.balance - adjAmount;
    await updateAccount({ ...updatedAccount, balance: newBalance });

    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={`EDIT: ${account.name}`} size="md">
      <div className="border-b border-gray-800 pb-4 mb-6">
        <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">CURRENT BALANCE</span>
        <span className="font-mono text-2xl md:text-3xl text-white">
          {formatAmount(account.balance, account.currency)}
        </span>
      </div>

      <div className="mb-6 pb-6 border-b border-gray-800">
        <div className="mb-5">
          <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">ADJUSTMENT</span>
          <div className="flex gap-2">
            <Button active={adjustmentMode === '+ ADD'} onClick={() => setAdjustmentMode('+ ADD')}>
              + ADD
            </Button>
            <Button active={adjustmentMode === '- REMOVE'} onClick={() => setAdjustmentMode('- REMOVE')}>
              - REMOVE
            </Button>
          </div>
        </div>

        <div className="mb-5">
          <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">AMOUNT</span>
          <input
            type="text"
            inputMode="numeric"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="0"
            className="w-full bg-black text-white font-mono border-b-2 border-gray-800 focus:border-white focus:outline-none px-1 py-2 text-2xl"
          />
          <span className="font-mono text-xs text-gray-500 mt-1 block">{account.currency}</span>
        </div>

        <div>
          <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">NOTE</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. salary, correction"
            className="w-full bg-black text-white font-mono border-b-2 border-gray-800 focus:border-white focus:outline-none px-1 py-2 text-sm"
          />
        </div>
      </div>

      <div className="mb-6">
        <span className="block font-mono text-xs tracking-widest text-gray-500 mb-4">ACCOUNT DETAILS</span>

        <div className="mb-5">
          <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">NAME</span>
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
            className="w-full bg-black text-white font-mono border-b-2 border-gray-800 focus:border-white focus:outline-none px-1 py-2 text-sm uppercase tracking-widest"
          />
        </div>

        <div>
          <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">CURRENCY</span>
          <input
            type="text"
            value={currencyInput}
            onChange={(e) => setCurrencyInput(e.target.value.toUpperCase().slice(0, 3))}
            maxLength={3}
            className="w-full bg-black text-white font-mono border-b-2 border-gray-800 focus:border-white focus:outline-none px-1 py-2 text-sm uppercase tracking-widest"
          />
          <span className="font-mono text-xs text-gray-600 mt-1 block">3-LETTER CODE</span>
        </div>
      </div>

      {errorMsg && (
        <div className="font-mono text-xs text-gray-400 mb-4 border-l-2 border-white pl-3">
          {errorMsg}
        </div>
      )}

      <div className="flex justify-end mt-6 border-t border-gray-800 pt-4">
        <Button onClick={handleSave} active={true}>
          SAVE CHANGES
        </Button>
      </div>
    </Modal>
  );
}
