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
      <header className="flex-shrink-0 w-full bg-black border-b border-gray-800 px-4 md:px-8 py-3 flex justify-between items-center text-xs md:text-sm font-mono uppercase tracking-widest relative z-30">
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
            className={`ml-4 text-gray-500 transition-none ${showDistance ? 'opacity-100' : 'opacity-0'}`}
          >
            [ DISTANCE: {distance} ]
          </span>
        </span>

        <span
          className="text-gray-500 cursor-pointer whitespace-nowrap"
          onClick={() => setShowSyncModal(true)}
        >
          [ SYNC: {sync.status} _ ]
        </span>

        <span className="text-white whitespace-nowrap">
          [ {formatTime(now)} _ ]
        </span>
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
