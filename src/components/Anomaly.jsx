import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import useFinanceStore from '../hooks/useFinanceStore.js';
import useNomoz from '../hooks/useNomoz.js';
import { isSpecialDate } from '../lib/date.js';
import { DUR, EASE } from '../lib/motion.js';
import {
  MOOD_ALPHA,
  buildSprite,
  deriveNomozMood,
  getDepth,
} from '../lib/nomoz.js';

// Below this layer width NOMOZ.EXE uses the constrained mobile range.
const COMPACT_MAX_WIDTH = 640;

/*
 * NOMOZ.EXE — ASCII backdrop entity (see design.md). Rendered as plain
 * monospace text in a non-interactive layer behind every tab. The
 * sprite grid is a fixed size, so no state or pose ever changes layout,
 * and all movement is a transform/opacity change on an absolutely
 * positioned actor inside an overflow-hidden layer.
 */
function Nomoz() {
  const mood = useFinanceStore(deriveNomozMood);
  const anomalyEvent = useFinanceStore((s) => s.anomalyEvent);
  const clearAnomalyEvent = useFinanceStore((s) => s.clearAnomalyEvent);
  const reduced = useReducedMotion() ?? false;

  const layerRef = useRef(null);
  const actorRef = useRef(null);
  const [metrics, setMetrics] = useState(null);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    const actor = actorRef.current;
    if (!layer || !actor) return undefined;

    const measure = () => {
      const width = layer.clientWidth;
      const spriteW = actor.offsetWidth;
      setMetrics((m) =>
        m && m.width === width && m.spriteW === spriteW ? m : { width, spriteW }
      );
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(layer);
    ro.observe(actor);
    return () => ro.disconnect();
  }, []);

  const compact = metrics !== null && metrics.width < COMPACT_MAX_WIDTH;

  const { view, frame, react } = useNomoz({ mood, compact, reduced, metrics });

  // One-shot reactions keep the existing event semantics: the store
  // raises the event, the pet reacts briefly, the event is cleared.
  useEffect(() => {
    if (!anomalyEvent) return;
    react(anomalyEvent.type);
    clearAnomalyEvent();
  }, [anomalyEvent, clearAnomalyEvent, react]);

  // Special calendar days: a heart cue, at most once per day.
  const heartDay = useRef(null);
  useEffect(() => {
    const check = () => {
      const today = new Date();
      if (isSpecialDate(today) && heartDay.current !== today.toDateString()) {
        heartDay.current = today.toDateString();
        react('HEART');
      }
    };
    check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, [react]);

  const sprite = useMemo(
    () =>
      buildSprite({
        mood,
        gaze: view.gaze,
        eyes: view.eyes,
        mouth: view.mouth,
        legs: view.legs,
        pose: view.pose,
        lean: view.lean,
        cue: view.cue,
        frame,
      }),
    [
      mood,
      view.gaze,
      view.eyes,
      view.mouth,
      view.legs,
      view.pose,
      view.lean,
      view.cue,
      frame,
    ]
  );

  const placed = view.x !== null;
  const depth = getDepth(compact, view.depth);
  const opacity = Math.min(0.85, MOOD_ALPHA[mood] * depth.alpha) * view.fade;
  const moveMs = reduced ? 0 : view.transitionMs;

  return (
    <div
      ref={layerRef}
      aria-hidden="true"
      className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none"
    >
      <div
        ref={actorRef}
        className="nomoz-actor"
        style={{
          transform: `translate3d(${placed ? view.x : 0}px, ${depth.y}px, 0) scale(${depth.scale})`,
          opacity: placed ? opacity : 0,
          transition: placed
            ? `transform ${moveMs}ms var(--motion-ease), opacity var(--motion-ambient) var(--motion-ease)`
            : 'none',
        }}
      >
        <AnimatePresence mode="wait" initial>
          {placed && (
            <motion.pre
              key={mood}
              className="nomoz-sprite"
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                transition: { duration: reduced ? 0 : DUR.content, ease: EASE },
              }}
              exit={{
                opacity: 0,
                transition: { duration: reduced ? 0 : DUR.exit, ease: EASE },
              }}
            >
              {sprite}
            </motion.pre>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/*
 * Persistent status readout. Purely level-based (re-reads store state
 * on every render) — completely separate from anomalyEvent, so it
 * can never repeat-fire and needs no dismiss/clear. It is the
 * design.md "[ ! OVER BUDGET ! ]" indicator, surfaced once at the
 * app shell so it stays visible across Dashboard/Ledger/Calendar/
 * Accounts without duplicating the anomaly component per page.
 * AsciiProgressBar (Dashboard's budget bar) intentionally no longer
 * renders this same string, so this is the single authoritative
 * OVER BUDGET indicator on every screen including Dashboard.
 *
 * Positioned as a small fixed terminal readout rather than a toast:
 * top-anchored, inset from the edges by viewport-relative spacing
 * plus safe-area insets on all three sides so it never touches the
 * screen edge (or sits under a notch/rounded corner) on any phone,
 * sized with clamp-style responsive text so it stays legible without
 * becoming either a tiny effect or an oversized banner, and sits at
 * z-20 — above ordinary tab content (z-10) but below Header (z-30),
 * Footer (z-50) and Modal (z-50), so it never covers navigation or
 * dialogs.
 */
function OverBudgetIndicator({ isOverBudget }) {
  if (!isOverBudget) return null;

  return (
    <div
      className="absolute z-20 pointer-events-none flex justify-center"
      style={{
        top: 'max(0.375rem, env(safe-area-inset-top))',
        left: 'max(0.5rem, env(safe-area-inset-left))',
        right: 'max(0.5rem, env(safe-area-inset-right))',
      }}
    >
      <span
        className="font-mono font-bold uppercase tracking-widest text-white bg-black border border-white px-1.5 py-px whitespace-nowrap brutalist-overbudget-pulse"
        style={{
          fontSize: 'clamp(0.5rem, 2.2vw, 0.65rem)',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        [ ! OVER BUDGET ! ]
      </span>
    </div>
  );
}

export default function Anomaly() {
  const isOverBudget = useFinanceStore((s) => s.getIsOverBudgetThisMonth());

  return (
    <>
      {/*
        NOMOZ.EXE stays at z-0 (behind every tab's z-10 content), a
        background presence, not a foreground one.
      */}
      <Nomoz />

      {/*
        The status readout is a SEPARATE top-level layer (its own
        stacking context, z-20) rather than nested inside the z-0
        layer above — nesting it there would cap its effective
        stacking order at z-0, hiding it behind every tab's z-10
        content on Dashboard/Ledger/Calendar/Accounts alike.
      */}
      <OverBudgetIndicator isOverBudget={isOverBudget} />
    </>
  );
}
