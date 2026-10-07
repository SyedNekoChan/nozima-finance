import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import useFinanceStore from '../hooks/useFinanceStore.js';
import useNomoz from '../hooks/useNomoz.js';
import { isSpecialDate } from '../lib/date.js';
import { DUR, EASE } from '../lib/motion.js';
import { MOOD_ALPHA, buildSprite, deriveNomozMood } from '../lib/nomoz.js';
import {
  PERSPECTIVE,
  alphaAt,
  makeGeo,
  scanBusy,
  toTransform,
} from '../lib/nomozSpace.js';

// Below this layer width NOMOZ.EXE uses the constrained mobile range.
const COMPACT_MAX_WIDTH = 640;

/*
 * NOMOZ.EXE — ASCII backdrop entity (see design.md). Rendered as plain
 * monospace text in a non-interactive layer behind every tab. The layer
 * carries a CSS perspective and the entity is a single translate3d
 * child, so moving in depth simply scales it. The sprite grid is a
 * fixed size, so no state or pose ever changes layout, and nothing
 * here can scroll the page: the layer is overflow-hidden and sits
 * beneath the z-10 tab content, header, footer and modals.
 */
function Nomoz() {
  const mood = useFinanceStore(deriveNomozMood);
  const anomalyEvent = useFinanceStore((s) => s.anomalyEvent);
  const clearAnomalyEvent = useFinanceStore((s) => s.clearAnomalyEvent);
  const isLoaded = useFinanceStore((s) => s.isLoaded);
  const activeTab = useFinanceStore((s) => s.activeTab);
  const reduced = useReducedMotion() ?? false;

  const layerRef = useRef(null);
  const actorRef = useRef(null);
  const [metrics, setMetrics] = useState(null);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    const actor = actorRef.current;
    if (!layer || !actor) return undefined;

    const measure = () => {
      const next = {
        width: layer.clientWidth,
        height: layer.clientHeight,
        spriteW: actor.offsetWidth,
        spriteH: actor.offsetHeight,
      };
      setMetrics((m) =>
        m &&
        m.width === next.width &&
        m.height === next.height &&
        m.spriteW === next.spriteW &&
        m.spriteH === next.spriteH
          ? m
          : next
      );
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(layer);
    ro.observe(actor);
    return () => ro.disconnect();
  }, []);

  const compact = metrics !== null && metrics.width < COMPACT_MAX_WIDTH;

  // Placement waits for the app content so it can pick open backdrop.
  const geo = useMemo(
    () => (metrics && metrics.spriteW > 0 && isLoaded ? makeGeo(metrics, compact) : null),
    [metrics, compact, isLoaded]
  );

  const getBusy = useCallback(() => scanBusy(layerRef.current), []);

  const layoutKey = `${activeTab}|${metrics ? `${metrics.width}x${metrics.height}` : ''}`;

  const { view, frame, react, placed } = useNomoz({
    mood,
    compact,
    reduced,
    geo,
    getBusy,
    layoutKey,
  });

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
        facing: view.facing,
        cue: view.cue,
        item: view.item,
        book: view.book,
        crown: view.crown,
        glitch: view.glitch,
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
      view.facing,
      view.cue,
      view.item,
      view.book,
      view.crown,
      view.glitch,
      frame,
    ]
  );

  const visible = placed && geo !== null;
  const moveMs = reduced ? 0 : view.transitionMs;
  const ease = view.ease === 'linear' ? 'linear' : 'var(--motion-ease)';
  const opacity = visible
    ? Math.min(0.9, MOOD_ALPHA[mood] * alphaAt(view.z, compact)) * view.fade
    : 0;

  return (
    <div
      ref={layerRef}
      aria-hidden="true"
      className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none"
      style={{ perspective: `${PERSPECTIVE}px`, perspectiveOrigin: '50% 50%' }}
    >
      <div
        ref={actorRef}
        className="nomoz-actor"
        style={{
          transform: visible ? toTransform(view, geo) : 'translate3d(0, 0, 0)',
          opacity,
          transition: visible
            ? `transform ${moveMs}ms ${ease}, opacity var(--motion-ambient) var(--motion-ease)`
            : 'none',
        }}
      >
        <AnimatePresence mode="wait" initial>
          {visible && (
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
        background presence that picks open backdrop space rather than
        sitting on top of anything.
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
