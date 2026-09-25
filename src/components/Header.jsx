import { useState, useEffect } from 'react';
import { formatTime } from '../lib/date.js';
import { getDistanceBetweenUs, formatDistance } from '../lib/distance.js';
import { SYSTEM_MESSAGE } from '../lib/constants.js';
import Modal from './Modal.jsx';
import SyncModal from './SyncModal.jsx';

export default function Header({ sync }) {
  const [showSystemMessage, setShowSystemMessage] = useState(false);
  const [showDistance, setShowDistance] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const distance = formatDistance(getDistanceBetweenUs());

  return (
    <>
      <header className="flex-shrink-0 w-full bg-black border-b border-gray-800 relative z-30 font-mono uppercase">
        <div className="md:hidden text-[10px] tracking-wide">
          <div className="grid grid-cols-2 gap-2 px-3 py-2.5">
            <div
              className="min-w-0 cursor-pointer"
              onClick={() => setShowSystemMessage(true)}
            >
              <div className="text-gray-500 leading-none whitespace-nowrap">SYSTEM</div>
              <div className="text-white leading-none whitespace-nowrap mt-1.5 text-xs">ONLINE</div>
            </div>
            <div
              className="min-w-0 text-right cursor-pointer"
              onClick={() => setShowSyncModal(true)}
            >
              <div className="text-gray-500 leading-none whitespace-nowrap">SYNC</div>
              <div className="text-white leading-none whitespace-nowrap mt-1.5 text-xs truncate">{sync.status}</div>
            </div>
          </div>

          <div className="border-t border-gray-800" />

          <div className="grid grid-cols-2 gap-2 px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-gray-500 leading-none whitespace-nowrap">DISTANCE</div>
              <div className="text-white leading-none whitespace-nowrap mt-1.5 text-xs">{distance}</div>
            </div>
            <div className="min-w-0 text-right">
              <div className="text-gray-500 leading-none whitespace-nowrap">TIME</div>
              <div className="text-white leading-none whitespace-nowrap mt-1.5 text-xs">{formatTime(now)}</div>
            </div>
          </div>
        </div>

        <div className="hidden md:flex md:justify-between md:items-center gap-4 px-8 py-3 text-sm tracking-widest">
          <div className="flex items-center justify-start">
            <span className="flex items-center whitespace-nowrap">
              <span
                className="text-white cursor-pointer"
                onClick={() => setShowSystemMessage(true)}
                onMouseEnter={() => setShowDistance(true)}
                onMouseLeave={() => setShowDistance(false)}
              >
                [ SYSTEM: ONLINE ]
              </span>
              <span
                className={`ml-4 text-gray-500 transition-none inline ${showDistance ? 'opacity-100' : 'opacity-0'}`}
              >
                [ DISTANCE: {distance} ]
              </span>
            </span>
          </div>

          <div className="contents">
            <span
              className="text-gray-500 cursor-pointer whitespace-nowrap"
              onClick={() => setShowSyncModal(true)}
            >
              [ SYNC: {sync.status} _ ]
            </span>

            <span className="text-white whitespace-nowrap">
              [ {formatTime(now)} _ ]
            </span>
          </div>
        </div>
      </header>

      <Modal
        isOpen={showSystemMessage}
        onClose={() => setShowSystemMessage(false)}
        title="SYSTEM MESSAGE"
        size="md"
      >
        <pre className="whitespace-pre-wrap font-mono text-white text-sm leading-relaxed">
          {SYSTEM_MESSAGE}
        </pre>
      </Modal>

      <SyncModal
        isOpen={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        sync={sync}
      />
    </>
  );
}
