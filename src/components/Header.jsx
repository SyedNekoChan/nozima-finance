import { useState, useEffect } from 'react';
import { formatTime } from '../lib/date.js';
import { getDistanceBetweenUs, formatDistance } from '../lib/distance.js';
import { SYSTEM_MESSAGE } from '../lib/constants.js';
import Modal from './Modal.jsx';

export default function Header() {
  const [showSystemMessage, setShowSystemMessage] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const distance = formatDistance(getDistanceBetweenUs());

  return (
    <>
      <header className="flex-shrink-0 w-full bg-black border-b border-gray-800 px-4 md:px-8 py-3 flex justify-between items-center text-xs md:text-sm font-mono uppercase tracking-widest relative z-30">
        <span className="group flex items-center">
          <span
            className="text-white cursor-pointer"
            onClick={() => setShowSystemMessage(true)}
          >
            [ SYSTEM: ONLINE ]
          </span>
          <span className="opacity-0 group-hover:opacity-100 transition-none ml-4 text-gray-500">
            [ DISTANCE: {distance} ]
          </span>
        </span>

        <span className="hidden md:block text-gray-500 cursor-default">
          [ SYNC: OFF _ ]
        </span>

        <span className="text-white">
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
    </>
  );
}
