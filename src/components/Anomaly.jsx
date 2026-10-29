import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import useFinanceStore from '../hooks/useFinanceStore.js';
import useCurrentMonth from '../hooks/useCurrentMonth.js';
import usePet from '../pets/usePet.js';
import usePrefersReducedMotion from '../pets/usePrefersReducedMotion.js';
import PetErrorBoundary from '../pets/PetErrorBoundary.jsx';
import EnvProp from '../pets/EnvProp.jsx';
import { SCHEDULER } from '../pets/config.js';
import { easeCss } from '../pets/motion.js';
import { getActivePet } from '../pets/registry.js';
import { isSpecialDate } from '../lib/date.js';
import { DUR, EASE } from '../lib/motion.js';
import { deriveBudgetProximity, deriveNomozMood } from '../lib/nomoz.js';

/*
 * View fields handed to the pet's sprite renderer. A pet's rig reads the
 * ones it understands and ignores the rest; adding a rig detail is adding
 * its name here (and a default in usePet).
 */
const SPRITE_FIELDS = [
  'gaze',
  'eyes',
  'mouth',
  'legs',
  'pose',
  'lean',
  'facing',
  'cue',
  'item',
  'book',
  'crown',
  'crownLift',
  'coin',
  'droop',
  'glitch',
  'pawL',
  'pawR',
  'ears',
  'tail',
  'focus',
  'pupils',
  'bookPaw',
  'bookShift',
  'fx',
  'view',
];

/*
 * The backdrop pet (NOMOZ.EXE by default; see design.md and src/pets).
 * This component is the pet-agnostic shell: it measures the layer, mounts
 * the active pet's sprite on a canvas and moves it. The pet itself
 * (art, animations, behaviors, vanity items) comes from the registry.
 *
 * It lives in the application shell's global backdrop layer, mounted
 * once beside (never inside) the tab content, so switching tabs does not
 * remount it, re-seed it, restart its scheduler or move it. This
 * component deliberately does not read the active tab or look at the
 * foreground UI at all; tab content may cover it and it keeps living
 * behind it.
 *
 * The layer carries a CSS perspective and the entity is one translate3d
 * child, so moving in depth scales it. The sprite is a small canvas
 * drawn from pixel grids and scaled with image-rendering: pixelated.
 * Nothing here can scroll the page: the layer is overflow-hidden and
 * sits beneath the z-10 tab content, header, footer and modals.
 */
function Pet({ pet }) {
  // Mood and proximity depend on "this month", which no store change signals at
  // a rollover; a selector whose identity follows the month is re-run then
  // (zustand reuses its last result while the store and the selector are unchanged).
  const month = useCurrentMonth();
  const selectMood = useCallback((s) => deriveNomozMood(s), [month]); // eslint-disable-line react-hooks/exhaustive-deps
  const selectProximity = useCallback((s) => deriveBudgetProximity(s), [month]); // eslint-disable-line react-hooks/exhaustive-deps
  const mood = useFinanceStore(selectMood);
  // visual-only budget proximity and "data loaded" (arms transition detection)
  const approaching = useFinanceStore(selectProximity);
  const armed = useFinanceStore((s) => s.isLoaded);
  const anomalyEvent = useFinanceStore((s) => s.anomalyEvent);
  const clearAnomalyEvent = useFinanceStore((s) => s.clearAnomalyEvent);
  const reduced = usePrefersReducedMotion();

  const layerRef = useRef(null);
  const actorRef = useRef(null);
  const [metrics, setMetrics] = useState(null);
  const [canvasEl, setCanvasEl] = useState(null);

  const { world } = pet;
  const SPRITE_W = pet.sprite.width;
  const SPRITE_H = pet.sprite.height;
  const scale = world.pixelScale(metrics ? metrics.width : 0);
  const boxW = SPRITE_W * scale;
  const boxH = SPRITE_H * scale;

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

  const compact = metrics !== null && world.isCompact(metrics.width);

  const geo = useMemo(
    () => (metrics && metrics.spriteW > 0 ? world.makeGeo(metrics, compact) : null),
    [world, metrics, compact]
  );

  const { view, frame, react, notifyEvent, placed } = usePet({
    pet,
    mood,
    compact,
    reduced,
    geo,
    approaching,
    armed,
  });

  // rim-light strength follows depth (quantised so it redraws rarely)
  const light = world.depthLevel(view.z, compact);

  // One-shot reactions keep the existing event semantics: the store raises
  // the event only after a genuinely successful operation, the pet reacts
  // briefly (the cue), the event is cleared. The same event is also handed
  // to the financial director, which dedupes, coalesces and rate-limits it
  // into at most one behavior reaction at a safe boundary.
  useEffect(() => {
    if (!anomalyEvent) return;
    react(anomalyEvent.type);
    notifyEvent(anomalyEvent);
    clearAnomalyEvent();
  }, [anomalyEvent, clearAnomalyEvent, react, notifyEvent]);

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

  // Draw the current frame. An exiting canvas (mood cross-fade) keeps
  // the art of the mood it was drawn for. A sprite error only stops the
  // drawing; it never reaches the rest of the application.
  const drawFailed = useRef(false);
  const spriteValues = SPRITE_FIELDS.map((k) => view[k]);

  useEffect(() => {
    if (!canvasEl || canvasEl.dataset.mood !== mood || drawFailed.current) return;
    const ctx = canvasEl.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const params = { mood, frame, light };
    SPRITE_FIELDS.forEach((k, i) => {
      params[k] = spriteValues[i];
    });
    try {
      pet.sprite.render(ctx, params, pet.vanity);
    } catch (err) {
      drawFailed.current = true;
      console.warn('[pets] sprite drawing stopped:', err);
    }
    // the field list is fixed, so the dependency list keeps its length
  }, [pet, canvasEl, mood, frame, light, ...spriteValues]);

  const visible = placed && geo !== null;

  // Temporary environmental props live in the same perspective layer. Props
  // deeper than the pet are drawn before it, nearer ones after it, so the
  // pet passes in front of or behind them like any object in the space.
  const propEntries =
    visible && view.props
      ? Object.entries(view.props)
          .filter(([, spec]) => pet.props?.[spec.kind])
          .sort((a, b) => a[1].z - b[1].z)
      : [];
  const renderProp = ([id, spec]) => (
    <EnvProp
      key={id}
      spec={spec}
      def={pet.props[spec.kind]}
      world={world}
      geo={geo}
      scale={scale}
      frame={frame}
      reduced={reduced}
    />
  );
  // Moods that differ only in worn items share one canvas, so the crown and
  // coin simply appear or go on the next frame; any other mood change
  // cross-fades the sprite art.
  const look = SCHEDULER.continuousMoods.includes(mood) ? 'calm' : mood;
  const moveMs = reduced ? 0 : view.transitionMs;
  const ease = easeCss(view.ease);
  const opacity = visible
    ? Math.min(
        world.config.alpha.ceiling,
        pet.appearances[mood].alpha * world.alphaAt(view.z, compact)
      ) * view.fade
    : 0;

  return (
    <div
      ref={layerRef}
      aria-hidden="true"
      className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none"
      style={{ perspective: `${world.perspective}px`, perspectiveOrigin: '50% 50%' }}
    >
      {propEntries.filter(([, spec]) => spec.z <= view.z).map(renderProp)}
      <div
        ref={actorRef}
        className="nomoz-actor"
        style={{
          width: boxW,
          height: boxH,
          transform: visible ? world.toTransform(view, geo) : 'translate3d(0, 0, 0)',
          opacity,
          transition: visible
            ? `transform ${moveMs}ms ${ease}, opacity var(--motion-ambient) var(--motion-ease)`
            : 'none',
        }}
      >
        <AnimatePresence mode="wait" initial>
          {visible && (
            <motion.div
              key={look}
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
              <canvas
                ref={setCanvasEl}
                data-mood={mood}
                width={SPRITE_W}
                height={SPRITE_H}
                className="nomoz-canvas"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {propEntries.filter(([, spec]) => spec.z > view.z).map(renderProp)}
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
  // The registered pet shown in the backdrop (NOMOZ.EXE unless configured).
  const pet = getActivePet();

  return (
    <>
      {/*
        NOMOZ.EXE stays at z-0 (behind every tab's z-10 content), a
        background presence that picks open backdrop space rather than
        sitting on top of anything.
      */}
      {pet && (
        <PetErrorBoundary key={pet.id}>
          <Pet pet={pet} />
        </PetErrorBoundary>
      )}

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
