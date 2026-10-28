import { useEffect, useRef } from 'react';
import useRpgStore from '../state/store.js';
import { closeRpg } from '../gate.js';
import { GAME_TITLE, OPENING_STEPS } from '../data/content.js';
import Theft from '../sequence/Theft.jsx';
import Screen from '../game/Screen.jsx';
import ClassSelect from '../game/ClassSelect.jsx';
import { selectedClassId } from '../state/story.js';

// Full-screen shell: loading and error states, the opening sequence, class selection, then the placeholder.
export default function RpgHost() {
  const status = useRpgStore((s) => s.status);
  const error = useRpgStore((s) => s.error);
  const openingStep = useRpgStore((s) => s.save?.story?.openingStep);
  const classId = useRpgStore((s) => selectedClassId(s.save));
  const activate = useRpgStore((s) => s.activate);
  const rootRef = useRef(null);

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeRpg();
    }
  };

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={GAME_TITLE}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[1000] flex flex-col overflow-y-auto bg-black p-4 font-mono text-white outline-none"
    >
      <div className="m-auto flex w-full flex-col items-center gap-4">
        <h1 className="text-xl tracking-widest">{GAME_TITLE.toUpperCase()}</h1>

        {status === 'loading' && <p role="status">Loading…</p>}

        {status === 'error' && (
          <div role="alert" className="flex max-w-sm flex-col items-center gap-3 text-center">
            <p>{error?.message || 'The RPG could not start.'}</p>
            {(error?.code === 'corrupt' || error?.code === 'newer-version') && <p className="text-sm">The save has not been modified.</p>}
            <button type="button" onClick={activate} className="min-h-[44px] border border-white px-4">
              Retry
            </button>
          </div>
        )}

        {status === 'ready' &&
          (openingStep !== OPENING_STEPS.ENTERED ? <Theft /> : classId ? <Screen /> : <ClassSelect />)}

        <button type="button" onClick={closeRpg} className="min-h-[44px] border border-white px-4">
          Close
        </button>
      </div>
    </div>
  );
}
