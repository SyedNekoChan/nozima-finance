import { useCallback, useEffect, useRef, useState } from 'react';
import { AMBIENT_MS, REACTIONS, createRng, runtimeSeed } from '../lib/nomoz.js';
import { NomozScheduler } from '../lib/nomozBehaviors.js';
import { pickSpot } from '../lib/nomozSpace.js';

const INITIAL_VIEW = {
  sx: null,
  sy: null,
  z: 0,
  facing: 1,
  pose: 'sit',
  gaze: 'c',
  eyes: 'open',
  mouth: 'idle',
  legs: 0,
  lean: 0,
  cue: null,
  item: null,
  book: null,
  crown: 0,
  glitch: 0,
  fade: 1,
  offscreen: false,
  transitionMs: 0,
  ease: 'out',
};

// Posture reset when the financial mood (or breakpoint) changes.
const RESET = {
  pose: 'sit',
  gaze: 'c',
  eyes: 'open',
  mouth: 'idle',
  legs: 0,
  lean: 0,
  cue: null,
  item: null,
  book: null,
  crown: 0,
  glitch: 0,
  fade: 1,
};

const FRAME_MS = 1000;
const FAST_FRAME_MS = 300;

const rnd = (r, a, b) => a + r() * (b - a);
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

/*
 * Owns NOMOZ.EXE's state. A runtime seed (new every page load) drives
 * the initial placement, orientation, pose and the first behavior, so
 * startup is never scripted. After that a single NomozScheduler picks
 * behaviors dynamically; this hook only mirrors its patches into React
 * state and restarts it when mood / breakpoint / reduced-motion change.
 * Everything is torn down on unmount.
 *
 * Nothing here knows about tabs or foreground content: the entity's
 * world position, seed, scheduler and animation progress simply
 * persist while the UI above it changes. Only a physical viewport
 * resize may clamp the position back into range.
 *
 *   geo : makeGeo(...) once the layer is measured, else null
 */
export default function useNomoz({ mood, compact, reduced, geo }) {
  const [view, setView] = useState(INITIAL_VIEW);
  const [reaction, setReaction] = useState(null);
  const [frame, setFrame] = useState(0);

  const rngRef = useRef(null);
  if (rngRef.current === null) rngRef.current = createRng(runtimeSeed());

  // curRef is the source of truth; `view` mirrors it for rendering.
  const curRef = useRef(INITIAL_VIEW);
  const geoRef = useRef(geo);
  const schedRef = useRef(null);
  const firstRun = useRef(true);
  const reactionTimers = useRef([]);

  geoRef.current = geo;

  const commit = useCallback((patch) => {
    curRef.current = { ...curRef.current, ...patch };
    setView(curRef.current);
  }, []);

  const ready = geo !== null;
  const placed = view.sx !== null;

  // Random first placement: where, how deep, which way, what pose.
  useEffect(() => {
    if (!ready || curRef.current.sx !== null) return;
    const rng = rngRef.current;
    const spot = pickSpot(geoRef.current, rng, {});

    commit({
      ...spot,
      facing: rng() < 0.5 ? -1 : 1,
      pose: pick(rng, ['sit', 'sit', 'sit', 'stand']),
      gaze: pick(rng, ['c', 'l', 'r']),
      transitionMs: 0,
    });
  }, [ready, commit]);

  // Keep the entity inside the usable range after a resize.
  useEffect(() => {
    if (!geo) return;
    const cur = curRef.current;
    if (cur.sx === null || cur.offscreen) return;

    const c = geo.clamp(cur);
    if (c.sx !== cur.sx || c.sy !== cur.sy) {
      commit({ ...c, transitionMs: reduced ? 0 : AMBIENT_MS, ease: 'out' });
    }
  }, [geo, reduced, commit]);

  // The one behavior scheduler for this entity.
  useEffect(() => {
    if (!placed) return undefined;

    const rng = rngRef.current;

    const getCtx = () => {
      const g = geoRef.current;
      if (!g) return null;
      return {
        rng,
        mood,
        compact,
        reduced,
        cur: curRef.current,
        geo: g,
        pickSpot: (o) => pickSpot(g, rng, o),
      };
    };

    const sch = new NomozScheduler({ rng, mood, reduced, getCtx, apply: commit });
    schedRef.current = sch;

    if (!firstRun.current) commit(RESET);
    sch.start(firstRun.current ? rnd(rng, 200, 3200) : rnd(rng, 300, 1100));
    firstRun.current = false;

    return () => {
      sch.stop();
      if (schedRef.current === sch) schedRef.current = null;
    };
  }, [mood, compact, reduced, placed, commit]);

  // Slow animation clock for breathing, tail flicks and the stressed
  // frame flip. One interval; absent under reduced motion.
  const fast = mood === 'stressed' && reaction && REACTIONS[reaction.kind]?.fast;

  useEffect(() => {
    if (reduced) {
      setFrame(0);
      return undefined;
    }
    const id = setInterval(() => setFrame((f) => f + 1), fast ? FAST_FRAME_MS : FRAME_MS);
    return () => clearInterval(id);
  }, [reduced, fast]);

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

  useEffect(() => () => reactionTimers.current.forEach(clearTimeout), []);

  const cfg = reaction ? REACTIONS[reaction.kind] : null;

  const merged = {
    ...view,
    eyes: cfg?.eyes ?? view.eyes,
    cue: cfg?.cue ?? view.cue,
    gaze: reaction?.gaze ?? view.gaze,
  };

  return { view: merged, frame, react, placed };
}
