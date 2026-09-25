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
        <div className="md:hidden flex items-center justify-between px-2 py-2.5 text-[8px] leading-none tracking-tight gap-1 overflow-hidden">
          <span
            className="flex-shrink-0 flex items-center gap-1 text-white cursor-pointer whitespace-nowrap"
            onClick={() => setShowSystemMessage(true)}
          >
            <span className="text-white">●</span>
            <span>ONLINE</span>
          </span>

          <span className="flex-shrink-0 text-gray-500 whitespace-nowrap">
            {distance}
          </span>

          <span
            className="min-w-0 text-gray-500 cursor-pointer whitespace-nowrap truncate"
            onClick={() => setShowSyncModal(true)}
          >
            SYNC:{sync.status}
          </span>

          <span className="flex-shrink-0 text-white whitespace-nowrap">
            {formatTime(now)}
          </span>
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
