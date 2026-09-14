import { useState, useEffect, useRef } from 'react';
import useFinanceStore from '../../hooks/useFinanceStore.js';
import { formatAmount, parseAmount } from '../../lib/currency.js';
import { getTodayDateString } from '../../lib/date.js';
import Modal from '../../components/Modal.jsx';
import Button from '../../components/Button.jsx';

const CATEGORIES = ['FOOD', 'CLOTHING', 'SOCIAL', 'BILLS', 'OTHER'];

export default function PunchCard({ isOpen, onClose, editingTx, initialDate }) {
  const accounts = useFinanceStore((s) => s.accounts);
  const exchangeRates = useFinanceStore((s) => s.exchangeRates);
  const addTransaction = useFinanceStore((s) => s.addTransaction);
  const updateTransaction = useFinanceStore((s) => s.updateTransaction);

  const [date, setDate] = useState(getTodayDateString());
  const [type, setType] = useState('EXPENSE');
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [toAccountId, setToAccountId] = useState(null);
  const [amountInput, setAmountInput] = useState('');
  const [category, setCategory] = useState('FOOD');
  const [note, setNote] = useState('');
  const [imageData, setImageData] = useState(null);
  const [exchangeRateInput, setExchangeRateInput] = useState('');

  const fileInputRef = useRef(null);

  // reset form whenever the modal target changes (new entry vs editing a tx)
  useEffect(() => {
    if (editingTx) {
      setDate(editingTx.date);
      setType(editingTx.type);
      setAccountId(editingTx.accountId);
      setToAccountId(editingTx.toAccountId);
      setAmountInput(String(editingTx.amount));
      setCategory(editingTx.category || 'FOOD');
      setNote(editingTx.note || '');
      setImageData(editingTx.imageData || null);
      setExchangeRateInput(editingTx.exchangeRate ? String(editingTx.exchangeRate) : '');
    } else {
      // initialDate (e.g. from Calendar's "add entry for this day") prefills
      // the date only; the user can still edit it like any other new entry
      setDate(initialDate || getTodayDateString());
      setType('EXPENSE');
      setAccountId(accounts[0]?.id || '');
      setToAccountId(null);
      setAmountInput('');
      setCategory('FOOD');
      setNote('');
      setImageData(null);
      setExchangeRateInput('');
    }
  }, [editingTx, isOpen, initialDate]);

  const sourceAccount = accounts.find((a) => a.id === accountId);
  const destAccount = type === 'TRANSFER' ? accounts.find((a) => a.id === toAccountId) : null;
  const currencyCode = sourceAccount?.currency || 'UZS';
  const isCrossCurrency = Boolean(sourceAccount && destAccount && sourceAccount.currency !== destAccount.currency);

  // prefill exchange rate from store rates only once, when cross-currency transfer is entered
  useEffect(() => {
    if (isCrossCurrency && !exchangeRateInput) {
      const srcRate = exchangeRates[sourceAccount.currency];
      const dstRate = exchangeRates[destAccount.currency];
      if (srcRate && dstRate) {
        const rate = srcRate / dstRate;
        setExchangeRateInput(rate.toFixed(4));
      }
    }
  }, [isCrossCurrency, sourceAccount, destAccount, exchangeRates, exchangeRateInput]);

  const handleTypeChange = (option) => {
    setType(option);
    if (option === 'TRANSFER') {
      setCategory(null);
    } else {
      setToAccountId(null);
    }
  };

  const handleAccountChange = (id) => {
    setAccountId(id);
    setAmountInput(''); // clear so stale currency amount doesn't carry over
  };

  const handleImageUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageData(reader.result);
    reader.readAsDataURL(file);
  };

  const calculatedDestination = parseAmount(amountInput) * (parseAmount(exchangeRateInput) || 0);

  const handleSave = () => {
    if (!accountId) return;
    const amount = parseAmount(amountInput);
    if (!amount || Number.isNaN(amount)) return;
    if (type === 'TRANSFER' && (!toAccountId || toAccountId === accountId)) return;

    const tx = {
      id: editingTx?.id || crypto.randomUUID(),
      date: date.trim() || getTodayDateString(),
      type,
      amount,
      currency: sourceAccount.currency,
      accountId,
      toAccountId: type === 'TRANSFER' ? toAccountId : null,
      category: type === 'TRANSFER' ? null : category,
      note: note.trim(),
      imageData,
      createdAt: editingTx?.createdAt || new Date().toISOString(),
      exchangeRate: type === 'TRANSFER' && isCrossCurrency ? parseAmount(exchangeRateInput) : null,
    };

    if (editingTx) {
      updateTransaction(tx);
    } else {
      addTransaction(tx);
    }
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingTx ? 'EDIT ENTRY' : 'NEW LEDGER ENTRY'} size="md">
      <div className="mb-4">
        <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">DATE</span>
        <input
          type="text"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          placeholder="DD-MM-YYYY"
          className="w-full bg-black text-white font-mono border-b-2 border-gray-800 focus:border-white focus:outline-none px-1 py-2 text-sm tracking-widest"
        />
      </div>

      <div className="mb-4">
        <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">TYPE</span>
        <div className="flex gap-2">
          {['EXPENSE', 'INCOME', 'TRANSFER'].map((option) => (
            <Button key={option} active={type === option} onClick={() => handleTypeChange(option)}>
              {option}
            </Button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">ACCOUNT</span>
        {accounts.length === 0 ? (
          <span className="font-mono text-xs text-gray-500">[ NO ACCOUNTS — CREATE ONE FIRST ]</span>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {accounts.map((account) => (
              <Button key={account.id} active={accountId === account.id} onClick={() => handleAccountChange(account.id)}>
                {account.name}
              </Button>
            ))}
          </div>
        )}
      </div>

      {type === 'TRANSFER' && (
        <div className="mb-4">
          <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">TO ACCOUNT</span>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {accounts
              .filter((a) => a.id !== accountId)
              .map((account) => (
                <Button key={account.id} active={toAccountId === account.id} onClick={() => setToAccountId(account.id)}>
                  {account.name}
                </Button>
              ))}
          </div>
        </div>
      )}

      <div className="mb-4">
        <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">AMOUNT</span>
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="0"
            className="w-full bg-black text-white font-mono border-b-2 border-gray-800 focus:border-white focus:outline-none px-1 py-2 text-2xl"
          />
          <span className="font-mono text-xs text-gray-500">{currencyCode}</span>
        </div>
      </div>

      {type !== 'TRANSFER' && (
        <div className="mb-4">
          <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">CATEGORY</span>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map((option) => (
              <Button key={option} active={category === option} onClick={() => setCategory(option)}>
                {option}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4">
        <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">NOTE</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="optional"
          className="w-full bg-black text-white font-mono border-b-2 border-gray-800 focus:border-white focus:outline-none px-1 py-2 text-sm"
        />
      </div>

      <div className="mb-4">
        <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">ATTACH</span>
        {imageData ? (
          <div>
            <img src={imageData} alt="receipt" className="w-24 h-24 object-cover border-2 border-white filter grayscale contrast-125" />
            <div className="mt-2">
              <Button onClick={() => setImageData(null)}>REMOVE IMAGE</Button>
            </div>
          </div>
        ) : (
          <>
            <Button onClick={() => fileInputRef.current?.click()}>+ UPLOAD IMAGE</Button>
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" ref={fileInputRef} />
          </>
        )}
      </div>

      {type === 'TRANSFER' && isCrossCurrency && (
        <div className="mb-4">
          <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">EXCHANGE RATE</span>
          <span className="block font-mono text-xs text-gray-500 mb-1">
            1 {sourceAccount.currency} = {destAccount.currency}
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={exchangeRateInput}
            onChange={(e) => setExchangeRateInput(e.target.value)}
            className="w-full bg-black text-white font-mono border-b-2 border-gray-800 focus:border-white focus:outline-none px-1 py-2 text-sm"
          />
          <span className="font-mono text-xs text-gray-500 mt-2 block">
            YOU WILL RECEIVE: {formatAmount(calculatedDestination, destAccount.currency)}
          </span>
        </div>
      )}

      <div className="flex justify-end mt-6 border-t border-gray-800 pt-4">
        <Button onClick={handleSave}>{editingTx ? 'SAVE CHANGES' : 'SAVE ENTRY'}</Button>
      </div>
    </Modal>
  );
}
