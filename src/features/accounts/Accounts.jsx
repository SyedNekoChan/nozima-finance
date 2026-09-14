import { useState } from 'react';
import useFinanceStore from '../../hooks/useFinanceStore.js';
import AccountCard from './AccountCard.jsx';
import NewAccountModal from './NewAccountModal.jsx';
import EditAccountModal from './EditAccountModal.jsx';
import TransferModal from './TransferModal.jsx';
import Modal from '../../components/Modal.jsx';
import Button from '../../components/Button.jsx';
import { formatAmount } from '../../lib/currency.js';

export default function Accounts() {
  const accounts = useFinanceStore((s) => s.accounts);
  const deleteAccount = useFinanceStore((s) => s.deleteAccount);
  const getTotalBalanceInUZS = useFinanceStore((s) => s.getTotalBalanceInUZS);

  const [isNewOpen, setIsNewOpen] = useState(false);
  const [editAccount, setEditAccount] = useState(null);
  const [transferAccount, setTransferAccount] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const totalUZS = getTotalBalanceInUZS();

  const handleEdit = (account) => setEditAccount(account);
  const handleEditClose = () => setEditAccount(null);

  const handleTransfer = (account) => setTransferAccount(account);
  const handleTransferClose = () => setTransferAccount(null);

  const handleDelete = (account) => setDeleteTarget(account);
  const handleDeleteCancel = () => setDeleteTarget(null);
  const handleDeleteConfirm = () => {
    if (deleteTarget) deleteAccount(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-800">
        <div>
          <span className="font-mono text-sm uppercase tracking-widest text-gray-500 block mb-1">
            [ &gt; ACCOUNTS ]
          </span>
          <span className="font-mono text-3xl font-bold">{formatAmount(totalUZS, 'UZS')}</span>
        </div>
        <Button onClick={() => setIsNewOpen(true)} active={true}>
          + NEW ACCOUNT
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24">
        {accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <span className="font-mono text-sm text-gray-500">[ NO ACCOUNTS ]</span>
            <Button onClick={() => setIsNewOpen(true)} active={true}>
              + NEW ACCOUNT
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onEdit={handleEdit}
                onTransfer={handleTransfer}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      <NewAccountModal isOpen={isNewOpen} onClose={() => setIsNewOpen(false)} />

      <EditAccountModal isOpen={!!editAccount} onClose={handleEditClose} account={editAccount} />

      <TransferModal
        isOpen={!!transferAccount}
        onClose={handleTransferClose}
        sourceAccount={transferAccount}
      />

      <Modal isOpen={!!deleteTarget} onClose={handleDeleteCancel} title="CONFIRM DELETE" size="sm">
        {deleteTarget && (
          <>
            <div className="mb-6">
              <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">ACCOUNT</span>
              <span className="font-mono text-sm text-white">[ {deleteTarget.name} ]</span>
            </div>
            <div className="mb-6">
              <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">BALANCE</span>
              <span className="font-mono text-sm text-white">
                {formatAmount(deleteTarget.balance, deleteTarget.currency)}
              </span>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-800 pt-4">
              <Button onClick={handleDeleteCancel}>CANCEL</Button>
              <Button onClick={handleDeleteConfirm} active={true}>
                CONFIRM DELETE
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
