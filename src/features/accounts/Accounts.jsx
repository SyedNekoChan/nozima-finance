import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import useFinanceStore from '../../hooks/useFinanceStore.js';
import AccountRow from './AccountRow.jsx';
import NewAccountModal from './NewAccountModal.jsx';
import EditAccountModal from './EditAccountModal.jsx';
import TransferModal from './TransferModal.jsx';
import Modal from '../../components/Modal.jsx';
import Button from '../../components/Button.jsx';
import PageHeader, { StatRow } from '../../components/PageHeader.jsx';
import RateNotice from '../../components/RateNotice.jsx';
import AnimatedAmount, { Amount } from '../../components/AnimatedAmount.jsx';
import Reveal from '../../components/Reveal.jsx';
import useHeldValue from '../../hooks/useHeldValue.js';
import { accountLabel } from '../../lib/format.js';
import { convertToBase } from '../../lib/currency.js';
import { FUTURE_FUND_NAME } from '../../lib/constants.js';
import { IconPlus } from '../../components/icons.jsx';

export default function Accounts() {
  const accounts = useFinanceStore((s) => s.accounts);
  const deleteAccount = useFinanceStore((s) => s.deleteAccount);
  const getTotalBalanceInUZS = useFinanceStore((s) => s.getTotalBalanceInUZS);
  const totalLiability = useFinanceStore((s) => s.getTotalLiabilityInUZS());
  const transactions = useFinanceStore((s) => s.transactions);
  const exchangeRates = useFinanceStore((s) => s.exchangeRates);

  const [isNewOpen, setIsNewOpen] = useState(false);
  const [editAccount, setEditAccount] = useState(null);
  const [transferAccount, setTransferAccount] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const totalUZS = getTotalBalanceInUZS();
  const heldDeleteTarget = useHeldValue(deleteTarget, !!deleteTarget);
  // deleting an account also deletes every entry that uses it (the store cascades)
  const linkedEntries = heldDeleteTarget
    ? transactions.filter((t) => t.accountId === heldDeleteTarget.id || t.toAccountId === heldDeleteTarget.id).length
    : 0;

  const handleDeleteCancel = () => setDeleteTarget(null);
  const handleDeleteConfirm = () => {
    if (deleteTarget) deleteAccount(deleteTarget.id);
    setDeleteTarget(null);
  };

  const code = 'ml-1 font-mono text-[max(12px,0.6em)] text-ink-3';

  // where the balance sits: each positive account's share in UZS, in greys
  // (largest brightest), OUR_FUTURE in the heart's rose
  const GREYS = ['rgb(237 237 235)', 'rgb(190 190 187)', 'rgb(145 145 142)', 'rgb(105 105 103)', 'rgb(75 75 74)'];
  const shares = accounts
    .filter((a) => a.type !== 'DEBT' && a.balance > 0)
    .map((a) => ({ a, v: convertToBase(a.balance, a.currency, exchangeRates) }))
    .filter((x) => x.v > 0)
    .sort((x, y) => y.v - x.v);
  const shareTotal = shares.reduce((t, x) => t + x.v, 0);
  const swatchOf = {};
  let gi = 0;
  for (const x of shares) {
    swatchOf[x.a.id] = x.a.name.toUpperCase() === FUTURE_FUND_NAME ? 'rgb(var(--rose))' : GREYS[Math.min(gi++, GREYS.length - 1)];
  }

  return (
    <div className="h-full overflow-y-auto overscroll-contain">
      {/* desktop: fits the screen; a long list of accounts scrolls inside its veil */}
      <div className="frame py-6 sm:py-8 lg:py-10 short:py-6 lg:grid lg:grid-cols-12 lg:gap-12 lg:grid-rows-[minmax(0,1fr)] lg:h-full lg:min-h-[560px]">
        <aside className="lg:col-span-4 lg:sticky lg:top-10 lg:self-start">
          <PageHeader
            title="Accounts"
            subtitle={`${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'}`}
            action={
              <Button variant="primary" onClick={() => setIsNewOpen(true)} data-action="new-account" icon={<IconPlus className="w-[18px] h-[18px]" />}>
                New account
              </Button>
            }
          >
            <StatRow
              layout="grid"
              items={[
                { label: 'Total balance', value: <AnimatedAmount value={totalUZS} currency="UZS" split codeClassName={code} /> },
                ...(totalLiability > 0
                  ? [{ label: 'Owed', value: <AnimatedAmount value={totalLiability} currency="UZS" split codeClassName={code} />, tone: 'text-negative' }]
                  : []),
              ]}
            />
            <RateNotice className="mt-5" />
          </PageHeader>

          {shareTotal > 0 && (
            <div className="mt-8">
              <p className="eyebrow on-scene mb-2.5">Where the balance is</p>
              <div
                className="flex h-2.5 gap-[3px] rounded-full overflow-hidden"
                role="img"
                aria-label={shares.map((x) => `${accountLabel(x.a.name)} ${Math.round((x.v / shareTotal) * 100)}%`).join(', ')}
              >
                {shares.map((x) => (
                  <span key={x.a.id} style={{ flexGrow: x.v, background: swatchOf[x.a.id] }} className="min-w-[3px]" />
                ))}
              </div>
              <p className="mt-2.5 text-2xs text-ink-3 on-scene">
                {shares
                  .slice(0, 3)
                  .map((x) => `${accountLabel(x.a.name)} ${Math.round((x.v / shareTotal) * 100)}%`)
                  .join(' · ')}
              </p>
            </div>
          )}
        </aside>

        <div className="mt-8 lg:mt-0 lg:col-span-8 lg:h-full lg:min-h-0">
          <Reveal show={accounts.length === 0}>
            <div className="veil py-16 px-6 text-center">
              <p className="text-base text-ink">No accounts yet</p>
              <p className="mt-1 text-sm text-ink-3">Add a bank account, cash or a card to start recording money</p>
            </div>
          </Reveal>
          {accounts.length > 0 && (
            <ul className="veil lg:max-h-full lg:overflow-y-auto lg:overscroll-contain">
              <AnimatePresence initial={false}>
                {accounts.map((account) => (
                  <AccountRow
                    key={account.id}
                    account={account}
                    swatch={swatchOf[account.id] || 'rgb(255 255 255 / 0.18)'}
                    onEdit={setEditAccount}
                    onTransfer={setTransferAccount}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>

      <NewAccountModal isOpen={isNewOpen} onClose={() => setIsNewOpen(false)} />

      <EditAccountModal isOpen={!!editAccount} onClose={() => setEditAccount(null)} account={editAccount} />

      <TransferModal isOpen={!!transferAccount} onClose={() => setTransferAccount(null)} sourceAccount={transferAccount} />

      <Modal
        isOpen={!!deleteTarget}
        onClose={handleDeleteCancel}
        title={`Delete ${accountLabel(heldDeleteTarget?.name)}?`}
        description={
          linkedEntries > 0
            ? `Its ${linkedEntries} ${linkedEntries === 1 ? 'entry is' : 'entries are'} deleted with it, and their effect on other accounts is reversed. This can't be undone.`
            : "This can't be undone."
        }
        size="sm"
        footer={
          <>
            <Button onClick={handleDeleteCancel}>Keep it</Button>
            <Button variant="danger" onClick={handleDeleteConfirm} data-action="confirm-delete">
              Delete account
            </Button>
          </>
        }
      >
        {heldDeleteTarget && (
          <div className="rounded border border-line bg-white/[0.02] p-4 flex items-center justify-between gap-4">
            <span className="text-sm text-ink">{accountLabel(heldDeleteTarget.name)}</span>
            <Amount value={heldDeleteTarget.balance} currency={heldDeleteTarget.currency} className="min-w-0 max-w-[60%] text-right text-sm font-medium text-ink" />
          </div>
        )}
      </Modal>
    </div>
  );
}
