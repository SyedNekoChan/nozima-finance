import { useEffect, useRef } from 'react';
import useRpgStore from '../state/store.js';
import { closeRpg } from '../gate.js';
import { GAME_TITLE } from '../data/content.js';

// Phase 1 placeholder: full-screen shell with loading, error and ready states.
export default function RpgHost() {
  const status = useRpgStore((s) => s.status);
  const error = useRpgStore((s) => s.error);
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
      className="fixed inset-0 z-[1000] flex flex-col items-center justify-center gap-6 bg-black p-4 font-mono text-white outline-none"
    >
      <h1 className="text-xl tracking-widest">{GAME_TITLE.toUpperCase()}</h1>

      {status === 'loading' && <p role="status">Loading…</p>}

      {status === 'error' && (
        <div role="alert" className="flex max-w-sm flex-col items-center gap-3 text-center">
          <p>{error?.message || 'The RPG could not start.'}</p>
          <button type="button" onClick={activate} className="min-h-[44px] border border-white px-4">
            Retry
          </button>
        </div>
      )}

      {status === 'ready' && (
        <p className="max-w-sm text-center text-sm">Placeholder. The adventure begins in a later phase.</p>
      )}

      <button type="button" onClick={closeRpg} className="min-h-[44px] border border-white px-4">
        Close
      </button>
    </div>
  );
}
