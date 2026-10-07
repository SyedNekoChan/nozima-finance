import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AMBIENT_MS,
  REACTIONS,
  createRng,
  getRange,
  hashString,
  moodBaseDepth,
  planBehavior,
} from '../lib/nomoz.js';

const INITIAL_VIEW = {
  x: null,
  depth: 0,
  pose: 'stand',
  gaze: 'c',
  eyes: 'open',
  mouth: 'idle',
  legs: 0,
  lean: 0,
  cue: null,
  fade: 1,
  peeking: false,
  transitionMs: 0,
};

const FRAME_MS = 900;
const FAST_FRAME_MS = 300;

/*
 * Schedules NOMOZ.EXE's behavior. The planners in lib/nomoz.js decide
 * what happens; this hook only runs their timed patches against a
 * single `view` object, restarting cleanly when the financial mood,
 * breakpoint or reduced-motion preference changes. Timers are all
 * cleared on cleanup, so repeated tab/modal cycles leave nothing behind.
 *
 * metrics: { width, spriteW } in CSS px, or null until measured.
 */
export default function useNomoz({ mood, compact, reduced, metrics }) {
  const [view, setView] = useState(INITIAL_VIEW);
  const [reaction, setReaction] = useState(null);
  const [frame, setFrame] = useState(0);

  const metricsRef = useRef(metrics);
  const xRef = useRef(null);
  const depthRef = useRef(0);
  const peekingRef = useRef(false);
  const reactionTimers = useRef([]);

  // Same sequence for the whole day: varied, but not chaotic run to run.
  const rng = useMemo(() => createRng(hashString(new Date().toDateString())), []);

  useEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);

  useEffect(() => {
    xRef.current = view.x;
    depthRef.current = view.depth;
    peekingRef.current = view.peeking;
  }, [view.x, view.depth, view.peeking]);

  // First placement (instant, while still faded in under the mood fade),
  // and keeping the pet inside the range after a resize.
  const ready = metrics !== null;
  const width = metrics ? metrics.width : 0;
  const spriteW = metrics ? metrics.spriteW : 0;

  useEffect(() => {
    if (!ready) return;
    const { minX, maxX } = getRange({ width, spriteW }, compact);

    setView((v) => {
      if (v.x === null) {
        return { ...v, x: Math.round(minX + (maxX - minX) * 0.7), transitionMs: 0 };
      }
      if (v.peeking || (v.x >= minX && v.x <= maxX)) return v;
      return {
        ...v,
        x: Math.min(maxX, Math.max(minX, v.x)),
        transitionMs: AMBIENT_MS,
      };
    });
  }, [ready, width, spriteW, compact]);

  // Behavior runner.
  useEffect(() => {
    let alive = true;
    const timers = new Set();
    let last = null;

    const at = (ms, fn) => {
      const id = setTimeout(() => {
        timers.delete(id);
        if (alive) fn();
      }, ms);
      timers.add(id);
    };

    const apply = (patch) => setView((v) => ({ ...v, ...patch }));

    const next = () => {
      const m = metricsRef.current;
      if (!m || xRef.current === null) {
        at(150, next);
        return;
      }

      const { minX, maxX } = getRange(m, compact);
      const plan = planBehavior({
        mood,
        compact,
        reduced,
        rng,
        last,
        x: xRef.current,
        depth: depthRef.current,
        minX,
        maxX,
        width: m.width,
        spriteW: m.spriteW,
        cell: m.spriteW / 11,
      });

      last = plan.name;
      plan.beats.forEach(({ t, patch }) => at(t, () => apply(patch)));
      at(plan.end, next);
    };

    // Entering a mood resets posture; position is kept.
    apply({
      depth: reduced ? 0 : moodBaseDepth(mood, compact),
      pose: 'stand',
      gaze: 'c',
      eyes: 'open',
      mouth: 'idle',
      legs: 0,
      lean: 0,
      cue: null,
      fade: 1,
      transitionMs: reduced ? 0 : AMBIENT_MS,
    });
    next();

    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, [mood, compact, reduced, rng]);

  // Stressed fragments flip between two frames; content/idle are static.
  const fast = reaction && REACTIONS[reaction.kind]?.fast;

  useEffect(() => {
    setFrame(0);
    if (mood !== 'stressed' || reduced) return undefined;
    const id = setInterval(() => setFrame((f) => f + 1), fast ? FAST_FRAME_MS : FRAME_MS);
    return () => clearInterval(id);
  }, [mood, reduced, fast]);

  // One-shot reactions: timed overlays, never persistent state.
  const react = useCallback((kind) => {
    const cfg = REACTIONS[kind];
    if (!cfg) return;

    reactionTimers.current.forEach(clearTimeout);
    reactionTimers.current = [];

    setReaction({ kind, gaze: null });

    if (cfg.gazeSeq) {
      cfg.gazeSeq.forEach(([ms, gaze]) => {
        reactionTimers.current.push(
          setTimeout(() => setReaction((r) => (r ? { ...r, gaze } : r)), ms)
        );
      });
    }

    reactionTimers.current.push(setTimeout(() => setReaction(null), cfg.ms));
  }, []);

  useEffect(
    () => () => reactionTimers.current.forEach(clearTimeout),
    []
  );

  const cfg = reaction ? REACTIONS[reaction.kind] : null;

  const merged = {
    ...view,
    eyes: cfg?.eyes ?? view.eyes,
    cue: cfg?.cue ?? view.cue,
    gaze: reaction?.gaze ?? view.gaze,
    pose: cfg ? 'stand' : view.pose,
  };

  return { view: merged, frame, react };
}
