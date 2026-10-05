import { useState, useEffect } from 'react';
import { formatTime } from '../lib/date.js';
import { getDistanceBetweenUs, formatDistance } from '../lib/distance.js';
import { SYSTEM_MESSAGE } from '../lib/constants.js';
import Modal from './Modal.jsx';

export default function Header() {
  const [showSystemMessage, setShowSystemMessage] = useState(false);
  const [showDistance, setShowDistance] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const distance = formatDistance(getDistanceBetweenUs());

  return (
    <>
      <header className="flex-shrink-0 w-full bg-black border-b border-gray-800 relative z-30 font-mono uppercase">
        <div className="md:hidden grid grid-cols-2 grid-rows-2 font-mono uppercase text-[10px] leading-none tracking-wider">
          <span
            className="col-start-1 row-start-1 min-w-0 truncate px-3 pt-2 pb-1.5 text-white cursor-pointer whitespace-nowrap"
            onClick={() => setShowSystemMessage(true)}
          >
            SYSTEM: ONLINE
          </span>

          <span className="col-start-1 row-start-2 min-w-0 truncate px-3 pt-1.5 pb-2 text-gray-500 whitespace-nowrap">
            [ DISTANCE: {distance} ]
          </span>

          <span className="col-start-2 row-start-2 min-w-0 truncate px-3 pt-1.5 pb-2 text-right text-white whitespace-nowrap">
            [ {formatTime(now)} ]
          </span>
        </div>

        <div className="hidden md:flex md:justify-between md:items-center gap-4 px-6 lg:px-8 py-3 text-xs lg:text-sm tracking-widest">
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

          <span className="text-white whitespace-nowrap">
            [ {formatTime(now)} _ ]
          </span>
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
    </>
  );
}
