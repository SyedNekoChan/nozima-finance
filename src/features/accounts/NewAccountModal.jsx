import { useState, useEffect } from 'react';
import useFinanceStore from '../../hooks/useFinanceStore.js';
import Modal from '../../components/Modal.jsx';
import Button from '../../components/Button.jsx';

const ACCOUNT_TYPES = ['BANK', 'CASH', 'CREDIT', 'DEBT'];
const CURRENCY_OPTIONS = ['UZS', 'USD', 'EUR', 'RUB', 'KZT', 'TRY'];

export default function NewAccountModal({ isOpen, onClose }) {
  const addAccount = useFinanceStore((s) => s.addAccount);

  const [name, setName] = useState('');
  const [type, setType] = useState('BANK');
  const [currency, setCurrency] = useState('UZS');
  const [customCurrency, setCustomCurrency] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const resetState = () => {
    setName('');
    setType('BANK');
    setCurrency('UZS');
    setCustomCurrency('');
    setErrorMsg('');
  };

  // reset form each time the modal opens
  useEffect(() => {
    if (isOpen) resetState();
  }, [isOpen]);

  const handleNameChange = (e) => {
    setErrorMsg('');
    setName(e.target.value.toUpperCase().replace(/\s+/g, '_'));
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleSave = () => {
    const finalCurrency = currency === 'OTHER' ? customCurrency : currency;

    if (!name.trim()) {
      setErrorMsg('NAME REQUIRED');
      return;
    }
    if (!finalCurrency || finalCurrency.length !== 3) {
      setErrorMsg('CURRENCY CODE MUST BE 3 LETTERS');
      return;
    }

    const account = {
      id: crypto.randomUUID(),
      name: name.trim(),
      type,
      currency: finalCurrency,
      balance: 0,
      createdAt: new Date().toISOString(),
    };

    addAccount(account);
    resetState();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="NEW ACCOUNT" size="md">
      <div className="mb-5">
        <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">NAME</span>
        <input
          type="text"
          value={name}
          onChange={handleNameChange}
          placeholder="e.g. MAIN_BANK"
          className="w-full bg-black text-white font-mono border-b-2 border-gray-800 focus:border-white focus:outline-none px-1 py-2 text-sm uppercase tracking-widest"
        />
      </div>

      <div className="mb-5">
        <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">TYPE</span>
        <div className="flex flex-wrap gap-2">
          {ACCOUNT_TYPES.map((option) => (
            <Button key={option} onClick={() => setType(option)} active={type === option}>
              {option}
            </Button>
          ))}
        </div>
      </div>

      <div className="mb-5">
        <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">CURRENCY</span>
        <div className="flex flex-wrap gap-2">
          {CURRENCY_OPTIONS.map((option) => (
            <Button key={option} onClick={() => setCurrency(option)} active={currency === option}>
              {option}
            </Button>
          ))}
          <Button onClick={() => setCurrency('OTHER')} active={currency === 'OTHER'}>
            OTHER
          </Button>
        </div>
      </div>

      {currency === 'OTHER' && (
        <div className="mb-5">
          <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">CODE</span>
          <input
            type="text"
            value={customCurrency}
            onChange={(e) => setCustomCurrency(e.target.value.toUpperCase().slice(0, 3))}
            maxLength={3}
            placeholder="GBP"
            className="w-full bg-black text-white font-mono border-b-2 border-gray-800 focus:border-white focus:outline-none px-1 py-2 text-sm uppercase tracking-widest"
          />
          <span className="font-mono text-xs text-gray-600 mt-1 block">3-LETTER CODE</span>
        </div>
      )}

      {errorMsg && (
        <div className="font-mono text-xs text-gray-400 mb-4 border-l-2 border-white pl-3">
          {errorMsg}
        </div>
      )}

      <div className="flex justify-end mt-6 border-t border-gray-800 pt-4">
        <Button onClick={handleSave} active={true}>
          SAVE ACCOUNT
        </Button>
      </div>
    </Modal>
  );
}
