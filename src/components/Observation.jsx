import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import useVisualMode from '../hooks/useVisualMode.js';
import { ModeToggle } from './Header.jsx';
import { IconClose } from './icons.jsx';

/*
 * Observation mode (see design.md, "Observation mode").
 *
 * <Hideable>: wraps a part of the finance interface. While observing it is
 * not painted (visibility: hidden, inherited), cannot be reached (inert) and
 * is hidden from assistive technology, but it keeps its box: the layout does
 * not change, so neither environment is resized, re-laid out or recreated.
 * The wrapper itself generates no box (display: contents).
 *
 * <ObservationControls>: what is left while observing: the mode toggle
 * (observation stays on across Pet / City) and the way out, standing exactly
 * where the header's own controls stand: Exit takes Observe's place, the mode
 * toggle keeps its own. The hidden header keeps its layout, so its buttons are
 * measured (again on every resize and mode change) and the two controls are
 * placed on their boxes. Escape also leaves. Focus goes to the way out on
 * entering and back to where it was on leaving.
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

// the header's visible Observe and mode buttons (the hidden header still has boxes)
function headerSlots() {
  const shown = (el) => el.getClientRects().length > 0;
  const observe = [...document.querySelectorAll('header [data-observe-toggle]')].find(shown);
  const mode = [...document.querySelectorAll('header [data-mode-toggle]')].find(shown);
  if (!observe || !mode) return null;
  const o = observe.getBoundingClientRect();
  const m = mode.getBoundingClientRect();
  return {
    top: o.top,
    right: document.documentElement.clientWidth - m.right,
    exitW: o.width,
    modeW: m.width,
    h: o.height,
    labelled: o.width > 60, // wide screens show "Observe" / the scene's name
  };
}

export function ObservationControls() {
  const observing = useVisualMode((s) => s.observing);
  const mode = useVisualMode((s) => s.mode);
  const setObserving = useVisualMode((s) => s.setObserving);
  const exitRef = useRef(null);
  const returnTo = useRef(null);
  const [slots, setSlots] = useState(null);

  // measure the header's controls now, after the scene switches, and on every resize
  useLayoutEffect(() => {
    if (!observing) return undefined;
    const measure = () => setSlots(headerSlots());
    measure();
    const raf = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
    };
  }, [observing, mode]);

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
  const labelled = slots ? slots.labelled : false;
  return (
    <div
      data-observe-controls=""
      className="on-scene fixed z-[60] flex items-stretch opacity-60 hover:opacity-100 focus-within:opacity-100 motion-fade"
      style={{
        top: `max(${slots ? slots.top : 12}px, env(safe-area-inset-top))`,
        right: `max(${slots ? slots.right : 12}px, env(safe-area-inset-right))`,
      }}
    >
      <button
        ref={exitRef}
        type="button"
        onClick={() => setObserving(false)}
        data-observe-exit=""
        aria-label="Leave observation and show the interface (Escape)"
        title="Show the interface (Esc)"
        style={slots ? { width: slots.exitW, height: slots.h } : undefined}
        className="inline-flex items-center justify-center gap-2 h-11 min-w-11 rounded text-ink bg-ground/50 hover:bg-white/[0.1] motion-btn cursor-pointer select-none"
      >
        <IconClose className="w-5 h-5 flex-shrink-0" />
        {labelled && <span className="text-sm">Exit</span>}
      </button>
      <ModeToggle
        compact={!labelled}
        className={`bg-ground/50 !text-ink ${labelled ? 'justify-center' : ''}`}
        style={slots ? { width: slots.modeW, height: slots.h } : undefined}
      />
    </div>
  );
}
