import { useEffect, useRef, useState } from 'react';
import { CLASSES, STARTING_KIT, getClass } from '../data/classes/index.js';
import { commitClass } from '../state/story.js';

/*
 * First-adventure class choice. Browsing a class only previews it; nothing is
 * saved until Confirm, and the flow advances only once the RPG database holds
 * the class. A failed write leaves this screen as it was, with Retry.
 * No class art exists yet, so the presentation is text-only on purpose.
 */
export default function ClassSelect() {
  const [pickedId, setPickedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);
  const inFlight = useRef(false);
  const tileRefs = useRef({});

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const picked = getClass(pickedId);

  const choose = (id) => {
    if (busy) return;
    setPickedId(id);
    setFailed(false);
  };

  const onKeyDown = (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step || busy) return;
    e.preventDefault();
    const at = Math.max(0, CLASSES.findIndex((c) => c.id === pickedId));
    const next = CLASSES[(at + step + CLASSES.length) % CLASSES.length];
    choose(next.id);
    tileRefs.current[next.id]?.focus();
  };

  const confirm = async () => {
    if (!picked || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailed(false);
    const ok = await commitClass(picked.id);
    inFlight.current = false;
    if (!alive.current) return;
    setBusy(false);
    if (!ok) setFailed(true);
  };

  return (
    <div className="flex w-full max-w-lg flex-col items-stretch gap-4">
      <div className="text-center">
        <p className="text-sm">You have entered Nomoz.</p>
        <h2 className="text-base tracking-widest">CHOOSE YOUR CLASS</h2>
      </div>

      <div role="radiogroup" aria-label="Class" onKeyDown={onKeyDown} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {CLASSES.map((c, i) => {
          const on = c.id === pickedId;
          return (
            <button
              key={c.id}
              ref={(el) => {
                tileRefs.current[c.id] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on || (!pickedId && i === 0) ? 0 : -1}
              disabled={busy}
              onClick={() => choose(c.id)}
              className={`min-h-[44px] border px-1 text-xs uppercase tracking-wide disabled:opacity-60 ${
                on ? 'border-white bg-white text-black' : 'border-gray-600 text-white hover:border-white'
              }`}
            >
              {c.name}
            </button>
          );
        })}
      </div>

      <div aria-live="polite" className="min-h-[9rem] border border-gray-700 p-3 text-sm">
        {picked ? (
          <div className="flex flex-col gap-1">
            <h3 className="tracking-widest">{picked.name.toUpperCase()}</h3>
            <p className="text-gray-300">{picked.role}</p>
            <p>{picked.blurb}</p>
            <p className="text-gray-300">{picked.cost}</p>
            <p className="text-gray-300">Starts with: {STARTING_KIT}</p>
          </div>
        ) : (
          <p className="text-gray-400">Select a class to read about it. Nothing is chosen until you confirm.</p>
        )}
      </div>

      {failed && (
        <p role="alert" className="text-center text-sm">
          Your choice could not be saved. Nothing has changed.
        </p>
      )}

      <button
        type="button"
        disabled={!picked || busy}
        onClick={confirm}
        className="min-h-[44px] border border-white px-4 disabled:opacity-40"
      >
        {busy ? 'Saving…' : failed ? `Retry: confirm ${picked?.name}` : picked ? `Confirm ${picked.name}` : 'Confirm'}
      </button>
    </div>
  );
}
