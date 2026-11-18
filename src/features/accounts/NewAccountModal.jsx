import { useState, useEffect } from 'react';
import useFinanceStore from '../../hooks/useFinanceStore.js';
import Modal from '../../components/Modal.jsx';
import FieldError from '../../components/FieldError.jsx';
import Reveal from '../../components/Reveal.jsx';
import Button from '../../components/Button.jsx';
import { Field, FieldGroup, TextInput, ChoiceChips } from '../../components/Field.jsx';
import { accountTypeLabel } from '../../lib/format.js';
import { isCurrencyCode } from '../../lib/rates.js';
import { hasRate } from '../../lib/currency.js';
import { ensureExchangeRates } from '../../hooks/useExchangeRates.js';

const ACCOUNT_TYPES = ['BANK', 'CASH', 'CREDIT', 'DEBT'];
const CURRENCY_OPTIONS = ['UZS', 'USD', 'EUR', 'RUB', 'KZT', 'TRY'];

export default function NewAccountModal({ isOpen, onClose }) {
  const addAccount = useFinanceStore((s) => s.addAccount);

  const [name, setName] = useState('');
  const [type, setType] = useState('BANK');
  const [currency, setCurrency] = useState('UZS');
  const [customCurrency, setCustomCurrency] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [checking, setChecking] = useState(false);

  const resetState = () => {
    setName('');
    setType('BANK');
    setCurrency('UZS');
    setCustomCurrency('');
    setErrorMsg('');
    setChecking(false);
  };

  // reset form each time the modal opens
  useEffect(() => {
    if (isOpen) resetState();
  }, [isOpen]);

  const handleNameChange = (e) => {
    setErrorMsg('');
    setName(e.target.value.toUpperCase().replace(/\s+/g, '_'));
  };

  // the form is re-seeded on open, so it is not cleared here (it would blank mid fade-out)
  const handleClose = () => {
    onClose();
  };

  const handleSave = async () => {
    if (checking) return;
    const finalCurrency = currency === 'OTHER' ? customCurrency : currency;

    if (!name.trim()) {
      setErrorMsg('Give the account a name.');
      return;
    }
    if (!isCurrencyCode(finalCurrency)) {
      setErrorMsg('A currency code is three letters, like GBP.');
      return;
    }

    // a currency without a stored rate is checked with the rate service first: a code it
    // does not know is refused; if it cannot be reached the account is still created and
    // its amounts wait for a rate (the screens say so)
    if (!hasRate(finalCurrency, useFinanceStore.getState().exchangeRates)) {
      setChecking(true);
      setErrorMsg('');
      const r = await ensureExchangeRates([finalCurrency]);
      setChecking(false);
      if (r.unsupported.includes(finalCurrency)) {
        setErrorMsg(`The exchange-rate service doesn't recognise ${finalCurrency}. Check the code: it is three letters, like GBP or CHF.`);
        return;
      }
    }

    const account = {
      id: crypto.randomUUID(),
      name: name.trim(),
      type,
      currency: finalCurrency,
      balance: 0,
      ...(type === 'DEBT' ? { liabilityV2: true } : {}),
      createdAt: new Date().toISOString(),
    };

    addAccount(account);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="New account"
      size="md"
      footer={
        <>
          <Button onClick={handleClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} data-action="save-account" disabled={checking}>
            {checking ? 'Checking the rate…' : 'Create account'}
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
        <Field label="Name" htmlFor="account-name" hint="Shown in capitals, with spaces kept as underscores.">
          <TextInput
            id="account-name"
            value={name}
            onChange={handleNameChange}
            placeholder="MAIN_BANK"
            className="uppercase tracking-[0.04em]"
            autoComplete="off"
          />
        </Field>

        <FieldGroup label="Type">
          <ChoiceChips value={type} onChange={setType} options={ACCOUNT_TYPES.map((t) => ({ value: t, label: accountTypeLabel(t) }))} />
          {type === 'DEBT' && <p className="mt-2 text-xs text-ink-3">A debt account tracks what is owed; it starts at zero.</p>}
        </FieldGroup>

        <FieldGroup label="Currency">
          <ChoiceChips
            value={currency}
            onChange={setCurrency}
            options={[...CURRENCY_OPTIONS.map((c) => ({ value: c, label: c })), { value: 'OTHER', label: 'Other' }]}
          />
        </FieldGroup>

        <Reveal show={currency === 'OTHER'}>
          <Field label="Currency code" htmlFor="account-code" hint="Three letters">
            <TextInput
              id="account-code"
              value={customCurrency}
              onChange={(e) => setCustomCurrency(e.target.value.toUpperCase().slice(0, 3))}
              maxLength={3}
              placeholder="GBP"
              className="uppercase font-mono tracking-[0.08em] max-w-[140px]"
              autoComplete="off"
            />
          </Field>
        </Reveal>

        <FieldError message={errorMsg} className="" />
      </form>
    </Modal>
  );
}
