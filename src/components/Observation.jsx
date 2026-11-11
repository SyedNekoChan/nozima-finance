import { useEffect, useRef } from 'react';
import useVisualMode from '../hooks/useVisualMode.js';
import { ModeToggle } from './Header.jsx';

/*
 * Observation mode (see design.md, "Observation mode").
 *
 * <Hideable>: wraps a part of the finance interface. While observing it is
 * not painted (visibility: hidden, inherited), cannot be reached (inert) and
 * is hidden from assistive technology, but it keeps its box: the layout does
 * not change, so neither environment is resized, re-laid out or recreated.
 * The wrapper itself generates no box (display: contents).
 *
 * <ObservationControls>: what is left while observing: a discreet corner with
 * the mode toggle (observation stays on across Pet / City) and the way out.
 * Escape also leaves. Focus goes to the way out on entering and back to
 * where it was on leaving.
 */
export function Hideable({ children, name }) {
  const observing = useVisualMode((s) => s.observing);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (observing) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  }, [observing]);
  return (
    <div
      ref={ref}
      data-observe-part={name}
      aria-hidden={observing || undefined}
      style={{ display: 'contents', visibility: observing ? 'hidden' : undefined }}
    >
      {children}
    </div>
  );
}

export function ObservationControls() {
  const observing = useVisualMode((s) => s.observing);
  const setObserving = useVisualMode((s) => s.setObserving);
  const exitRef = useRef(null);
  const returnTo = useRef(null);

  useEffect(() => {
    if (!observing) return undefined;
    returnTo.current = document.activeElement;
    exitRef.current?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setObserving(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const back = returnTo.current;
      // the control that opened it is visible again once the interface is back
      if (back && back.isConnected && typeof back.focus === 'function') requestAnimationFrame(() => back.focus({ preventScroll: true }));
    };
  }, [observing, setObserving]);

  if (!observing) return null;
  return (
    <div
      data-observe-controls=""
      className="fixed z-[60] flex items-center gap-3 font-mono uppercase text-[10px] md:text-xs leading-none tracking-wider text-gray-400 opacity-60 hover:opacity-100 focus-within:opacity-100 motion-fade"
      style={{
        top: 'max(0.5rem, env(safe-area-inset-top))',
        right: 'max(0.75rem, env(safe-area-inset-right))',
      }}
    >
      <ModeToggle className="py-2" />
      <button
        ref={exitRef}
        type="button"
        onClick={() => setObserving(false)}
        data-observe-exit=""
        aria-label="Leave observation mode and show the interface (Escape)"
        title="Show the interface (Esc)"
        className="py-2 font-mono uppercase whitespace-nowrap cursor-pointer select-none motion-btn hover:text-white focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
      >
        [ EXIT ]
      </button>
    </div>
  );
}
