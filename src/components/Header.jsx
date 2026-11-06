import { useState, useEffect } from 'react';
import { formatTime } from '../lib/date.js';
import { getDistanceBetweenUs, formatDistance } from '../lib/distance.js';
import { SYSTEM_MESSAGE } from '../lib/constants.js';
import { nextVisualMode, visualModeLabel } from '../lib/visualMode.js';
import useVisualMode from '../hooks/useVisualMode.js';
import Modal from './Modal.jsx';

/*
 * [ MODE: PET ] / [ MODE: CITY ]: text-only toggle for the backdrop's visual
 * mode. On phones it fills the empty top-right cell of the header grid with
 * the same type and padding as its neighbours, so no row changes height; an
 * invisible extension of its hit area down over the (non-interactive) clock
 * cell makes it a comfortable touch target without moving anything. The
 * focus ring is for keyboard focus only: after a tap or click a ring around
 * the cell would read as the header changing.
 */
function ModeToggle({ className = '', mobile = false }) {
  const mode = useVisualMode((s) => s.mode);
  const toggle = useVisualMode((s) => s.toggle);
  const label = visualModeLabel(mode);
  return (
    <button
      type="button"
      onClick={toggle}
      data-mode-toggle={mode}
      aria-label={`Visual mode: ${label.toLowerCase()}. Switch to ${nextVisualMode(mode)}.`}
      title={`Switch to ${nextVisualMode(mode)} mode`}
      className={`font-mono uppercase whitespace-nowrap cursor-pointer select-none motion-btn hover:text-white focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 ${
        mobile ? "relative after:content-[''] after:absolute after:inset-x-0 after:top-0 after:h-[200%]" : ''
      } ${className}`}
    >
      [ MODE: {label} ]
    </button>
  );
}

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

          <ModeToggle
            mobile
            className="col-start-2 row-start-1 min-w-0 px-3 pt-2 pb-1.5 text-right text-gray-400 tracking-wider leading-none"
          />

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
                className={`ml-4 text-gray-500 motion-fade inline ${showDistance ? 'opacity-100' : 'opacity-0'}`}
              >
                [ DISTANCE: {distance} ]
              </span>
            </span>
          </div>

          <span className="flex items-center gap-4 lg:gap-6">
            <ModeToggle className="text-gray-400 tracking-widest" />
            <span className="text-white whitespace-nowrap">
              [ {formatTime(now)} _ ]
            </span>
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
