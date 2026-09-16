import { useState } from 'react';
import Modal from './Modal.jsx';
import Button from './Button.jsx';

export default function SyncModal({ isOpen, onClose, sync }) {
  const {
    status,
    connected,
    peerCount,
    lastSyncedAt,
    error,
    confirmationCode,
    recoveryMnemonic,
    qrPayload,
    createPairing,
    joinPairingWithMnemonic,
    joinPairingWithQrPayload,
    forceSync,
    disconnect,
    reconnect,
    unpair,
  } = sync;

  const [mnemonicInput, setMnemonicInput] = useState('');
  const [qrInput, setQrInput] = useState('');
  const [showJoinByMnemonic, setShowJoinByMnemonic] = useState(false);
  const [showJoinByQr, setShowJoinByQr] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [showUnpairConfirm, setShowUnpairConfirm] = useState(false);

  const handleClose = () => {
    setMnemonicInput('');
    setQrInput('');
    setShowJoinByMnemonic(false);
    setShowJoinByQr(false);
    setShowRecovery(false);
    setShowUnpairConfirm(false);
    onClose();
  };

  const isPaired = status !== 'UNPAIRED' && status !== 'PAIRING';

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="SYNC" size="sm">
      <div className="mb-6">
        <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">STATUS</span>
        <span className="font-mono text-2xl text-white">[ {status} ]</span>
      </div>

      {error && (
        <div className="mb-6 border-l-2 border-white pl-3">
          <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">ERROR</span>
          <span className="font-mono text-xs text-gray-400">{String(error)}</span>
        </div>
      )}

      {!isPaired && (
        <div className="space-y-6">
          <div>
            <span className="block font-mono text-xs tracking-widest text-gray-500 mb-2">
              NO PAIRING YET
            </span>
            <Button
              onClick={() => createPairing()}
              active={true}
              className="w-full"
            >
              GENERATE NEW PAIRING
            </Button>
          </div>

          <div className="border-t border-gray-800 pt-4">
            <Button
              onClick={() => setShowJoinByMnemonic((v) => !v)}
              className="w-full mb-2"
            >
              ENTER RECOVERY KEY
            </Button>

            {showJoinByMnemonic && (
              <div className="mt-2">
                <textarea
                  value={mnemonicInput}
                  onChange={(e) => setMnemonicInput(e.target.value)}
                  placeholder="12-word recovery key"
                  rows={2}
                  className="w-full bg-black text-white font-mono border-2 border-gray-800 focus:border-white focus:outline-none px-2 py-2 text-xs"
                />
                <Button
                  onClick={async () => {
                    const ok = await joinPairingWithMnemonic(mnemonicInput.trim());
                    if (ok) {
                      setMnemonicInput('');
                      setShowJoinByMnemonic(false);
                    }
                  }}
                  active={true}
                  className="w-full mt-2"
                >
                  PAIR WITH THIS KEY
                </Button>
              </div>
            )}
          </div>

          <div className="border-t border-gray-800 pt-4">
            <Button
              onClick={() => setShowJoinByQr((v) => !v)}
              className="w-full mb-2"
            >
              ENTER PAIRING CODE
            </Button>

            {showJoinByQr && (
              <div className="mt-2">
                <span className="block font-mono text-xs text-gray-500 mb-2">
                  PASTE SCANNED PAIRING PAYLOAD
                </span>
                <textarea
                  value={qrInput}
                  onChange={(e) => setQrInput(e.target.value)}
                  placeholder='{"version":"v1","entropy":"..."}'
                  rows={2}
                  className="w-full bg-black text-white font-mono border-2 border-gray-800 focus:border-white focus:outline-none px-2 py-2 text-xs"
                />
                <Button
                  onClick={async () => {
                    const ok = await joinPairingWithQrPayload(qrInput.trim());
                    if (ok) {
                      setQrInput('');
                      setShowJoinByQr(false);
                    }
                  }}
                  active={true}
                  className="w-full mt-2"
                >
                  PAIR WITH THIS CODE
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {isPaired && (
        <>
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

          {confirmationCode && (
            <div className="mb-6">
              <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">
                CONFIRMATION CODE
              </span>
              <span className="font-mono text-lg text-white tracking-widest">
                {confirmationCode}
              </span>
              <span className="block font-mono text-xs text-gray-500 mt-1">
                MATCH THIS ON BOTH DEVICES
              </span>
            </div>
          )}

          {recoveryMnemonic && !showRecovery && (
            <div className="mb-6">
              <Button onClick={() => setShowRecovery(true)} className="w-full">
                SHOW RECOVERY KEY
              </Button>
            </div>
          )}

          {showRecovery && recoveryMnemonic && (
            <div className="mb-6 border-l-2 border-white pl-3">
              <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">
                RECOVERY KEY
              </span>
              <span className="font-mono text-xs text-gray-300 break-words">
                {recoveryMnemonic}
              </span>
              <span className="block font-mono text-xs text-gray-500 mt-2">
                WRITE THIS DOWN. IT PAIRS A NEW DEVICE.
              </span>
            </div>
          )}

          {qrPayload && (
            <div className="mb-6">
              <span className="block font-mono text-xs tracking-widest text-gray-500 mb-1">
                PAIRING CODE (SCAN OR COPY)
              </span>
              <span className="font-mono text-xs text-gray-300 break-all">{qrPayload}</span>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-800 pt-4">
            {status === 'DISCONNECTED' ? (
              <Button onClick={reconnect}>RECONNECT</Button>
            ) : (
              <Button onClick={disconnect}>DISCONNECT</Button>
            )}
            <Button onClick={forceSync} active={true}>FORCE SYNC</Button>
          </div>

          <div className="border-t border-gray-800 pt-4 mt-4">
            {!showUnpairConfirm ? (
              <Button onClick={() => setShowUnpairConfirm(true)} className="w-full">
                UNPAIR
              </Button>
            ) : (
              <div>
                <span className="block font-mono text-xs text-gray-500 mb-2">
                  THIS REMOVES SYNC PAIRING ON THIS DEVICE. FINANCE DATA IS KEPT.
                </span>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      unpair();
                      setShowUnpairConfirm(false);
                    }}
                    className="flex-1"
                  >
                    CONFIRM UNPAIR
                  </Button>
                  <Button onClick={() => setShowUnpairConfirm(false)} className="flex-1">
                    CANCEL
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
