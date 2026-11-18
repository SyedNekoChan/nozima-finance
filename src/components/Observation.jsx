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
      className="fixed z-[60] flex items-center gap-1 p-1 rounded-full bg-ground/70 border border-line opacity-60 hover:opacity-100 focus-within:opacity-100 motion-fade"
      style={{
        top: 'max(0.75rem, env(safe-area-inset-top))',
        right: 'max(0.75rem, env(safe-area-inset-right))',
      }}
    >
      <ModeToggle className="!rounded-full" />
      <button
        ref={exitRef}
        type="button"
        onClick={() => setObserving(false)}
        data-observe-exit=""
        aria-label="Leave observation and show the interface (Escape)"
        title="Show the interface (Esc)"
        className="inline-flex items-center gap-2 h-11 px-4 rounded-full text-sm text-ink hover:bg-white/[0.08] motion-btn cursor-pointer select-none"
      >
        Exit
        <kbd className="hidden md:inline font-mono text-2xs text-ink-3 border border-line-strong rounded-sm px-1.5 py-px">Esc</kbd>
      </button>
    </div>
  );
}
