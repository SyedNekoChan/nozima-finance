import Modal from './Modal.jsx';
import Button from './Button.jsx';

export default function SyncModal({ isOpen, onClose, sync }) {
  const { status, connected, peerCount, lastSyncedAt, error, forceSync, disconnect } = sync;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="SYNC STATUS" size="sm">
      <div className="mb-6">
        <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">STATUS</span>
        <span className="font-mono text-2xl text-white">[ {status} ]</span>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <div>
          <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">CONNECTED</span>
          <span className="font-mono text-sm text-white">{connected ? 'YES' : 'NO'}</span>
        </div>
        <div>
          <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">DEVICES</span>
          <span className="font-mono text-sm text-white">{peerCount}</span>
        </div>
      </div>

      <div className="mb-6">
        <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">LAST SYNCED</span>
        <span className="font-mono text-sm text-white">
          {lastSyncedAt ? lastSyncedAt.toLocaleTimeString() : '[ NEVER ]'}
        </span>
      </div>

      {error && (
        <div className="mb-6 border-l-2 border-white pl-3">
          <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">ERROR</span>
          <span className="font-mono text-xs text-gray-400">{String(error.message || error)}</span>
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-gray-800 pt-4">
        <Button onClick={disconnect}>DISCONNECT</Button>
        <Button onClick={forceSync} active={true}>FORCE SYNC</Button>
      </div>
    </Modal>
  );
}
