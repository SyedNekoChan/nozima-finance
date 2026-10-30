import { useCallback, useEffect, useRef, useState } from 'react';
import { REACTIONS } from '../lib/nomoz.js';
import { AMBIENT, SCHEDULER } from './config.js';
import { startAmbientBlink } from './core/ambient.js';
import { startAttention } from './core/attention.js';
import { planLookBefore } from './core/lookahead.js';
import { watchWorld } from './core/worldwatch.js';
import { attachInteractions } from './core/interactions.js';
import { createRng, pick, rnd, runtimeSeed } from './core/rng.js';
import { FinancialDirector } from './finance/director.js';
import { PetScheduler } from './core/scheduler.js';

const INITIAL_VIEW = {
  sx: null,
  sy: null,
  z: 0,
  facing: 1,
  view: 'front', // which side of the cat shows (see travel)
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
  crownLift: 0,
  coin: null,
  droop: 0,
  glitch: 0,
  fade: 1,
  // rig details: raised forepaws, ears, tail, the pupils' focus / size,
  // the reading paw and book position, sprite-space overlay effects
  pawL: null,
  pawR: null,
  ears: null,
  tail: null,
  focus: null,
  pupils: null,
  bookPaw: null,
  bookShift: 0,
  fx: {},
  props: {},
  offscreen: false,
  transitionMs: 0,
  ease: 'out',
};

// Posture reset when the financial mood (or breakpoint) changes, or a
// behavior is cancelled. Position and depth are never part of it.
const RESET = {
  view: 'front',
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
  crownLift: 0,
  coin: null,
  droop: 0,
  glitch: 0,
  fade: 1,
  pawL: null,
  pawR: null,
  ears: null,
  tail: null,
  focus: null,
  pupils: null,
  bookPaw: null,
  bookShift: 0,
  fx: {}, // overlay effects and
  props: {}, // temporary environmental objects never outlive a cancelled behavior
};

// Applies keyed create / update / remove operations ([[id, spec | null]]).
function mergeOps(base, ops) {
  const out = { ...base };
  for (const [id, spec] of ops) {
    if (spec === null) delete out[id];
    else out[id] = { ...out[id], ...spec };
  }
  return out;
}

/*
 * Owns the active pet's state. A runtime seed (new every page load) drives
 * the initial placement, orientation, pose and the first behavior, so
 * startup is never scripted. After that ONE PetScheduler per pet picks
 * behaviors dynamically; this hook mirrors its patches into React state
 * and only tells it when mood / breakpoint / reduced-motion change. It
 * stops everything on unmount.
 *
 * Nothing here knows about tabs or foreground content: the pet's world
 * position, seed, scheduler and animation progress persist while the UI
 * above it changes. Only a physical viewport resize may clamp the position
 * back into range.
 *
 * Financial context: `mood` is the persistent appearance; `approaching`
 * (visual-only budget proximity) becomes a scheduler flag that adjusts
 * eligibility and weights without cancelling anything; `armed` (data
 * loaded) arms transition detection. Successful-operation events enter via
 * the returned `notifyEvent`; the FinancialDirector queues, coalesces and
 * rate-limits them, and the scheduler takes the next one only at a
 * behavior boundary, so financial reactions share the one scheduler and
 * never add a loop, timer or position change of their own.
 *
 *   pet : a registered pet definition (see pets/registry.js)
 *   geo : pet.world.makeGeo(...) once the layer is measured, else null
 */
export default function usePet({ pet, mood, compact, reduced, geo, approaching = false, armed = false }) {
  const [view, setView] = useState(INITIAL_VIEW);
  const [reaction, setReaction] = useState(null);
  const [frame, setFrame] = useState(0);

  const rngRef = useRef(null);
  if (rngRef.current === null) rngRef.current = createRng(runtimeSeed());

  // curRef is the source of truth; `view` mirrors it for rendering.
  const curRef = useRef(INITIAL_VIEW);
  const geoRef = useRef(geo);
  const modeRef = useRef({ mood, compact, reduced });
  const schedRef = useRef(null);
  const directorRef = useRef(null);
  const flagsRef = useRef([]);
  const reactionTimers = useRef([]);

  if (directorRef.current === null) {
    directorRef.current = new FinancialDirector({ reactions: pet.financialReactions, rng: rngRef.current });
  }

  geoRef.current = geo;
  flagsRef.current = approaching ? ['approaching'] : [];
  modeRef.current = { mood, compact, reduced };

  // Patches merge into the view. `propOps` ([[id, spec | null], ...]) creates,
  // updates or removes world-anchored environmental props by id; `fxOps`
  // does the same for sprite-space overlay effects.
  const commit = useCallback((patch) => {
    let next = patch;
    if (patch.propOps || patch.fxOps) {
      const { propOps, fxOps, ...rest } = patch;
      next = rest;
      if (propOps) next.props = mergeOps(rest.props ?? curRef.current.props, propOps);
      if (fxOps) next.fx = mergeOps(rest.fx ?? curRef.current.fx, fxOps);
    }
    curRef.current = { ...curRef.current, ...next };
    setView(curRef.current);
  }, []);

  const ready = geo !== null;
  const placed = view.sx !== null;

  // Random first placement: where, how deep, which way, what pose.
  useEffect(() => {
    if (!ready || curRef.current.sx !== null) return;
    const rng = rngRef.current;
    const spot = pet.world.pickSpot(geoRef.current, rng, {});

    commit({
      ...spot,
      facing: rng() < 0.5 ? -1 : 1,
      pose: pick(rng, pet.initial.poses),
      gaze: pick(rng, ['c', 'l', 'r']),
      transitionMs: 0,
    });
  }, [ready, pet, commit]);

  // Keep the pet inside the usable range after a resize.
  useEffect(() => {
    if (!geo) return;
    const cur = curRef.current;
    if (cur.sx === null || cur.offscreen) return;

    const c = geo.clamp(cur);
    if (c.sx !== cur.sx || c.sy !== cur.sy) {
      commit({ ...c, transitionMs: reduced ? 0 : SCHEDULER.ambientMs, ease: 'out' });
    }

    // environmental props stay inside the layer after a resize too
    const ops = [];
    for (const [id, spec] of Object.entries(cur.props || {})) {
      const p = geo.clamp(spec);
      if (p.sx !== spec.sx || p.sy !== spec.sy) ops.push([id, { sx: p.sx, sy: p.sy }]);
    }
    if (ops.length) commit({ propOps: ops });
  }, [geo, reduced, commit]);

  // The one behavior scheduler for this pet. Created once it is placed and
  // kept for the life of the mount: tabs, modals and ordinary UI updates do
  // not touch it.
  useEffect(() => {
    if (!placed) return undefined;

    const rng = rngRef.current;

    const getCtx = () => {
      const g = geoRef.current;
      if (!g) return null;
      return {
        rng,
        pet,
        mood: sch.mood,
        compact: sch.compact,
        reduced: sch.reduced,
        cur: curRef.current,
        geo: g,
        pickSpot: (o) => pet.world.pickSpot(g, rng, o),
        apply: commit,
        has: pet.hasCapability,
      };
    };

    const sch = new PetScheduler({
      key: pet.id,
      rng,
      ...modeRef.current,
      behaviors: pet.behaviors,
      animations: pet.animations,
      getCtx,
      apply: commit,
      resetPatch: RESET,
      flags: flagsRef.current,
      reactionSource: { take: (o) => directorRef.current.take(o) },
      lookBefore: (o) => planLookBefore({ ...o, rng }),
    });
    schedRef.current = sch;
    sch.start(rnd(rng, ...SCHEDULER.firstDelay));

    // Isolated extension point; nothing is attached while none is enabled.
    const detach = attachInteractions({
      pet,
      request: (id, opts) => sch.request(id, opts),
      getSnapshot: () => {
        const c = curRef.current;
        return Object.freeze({
          petId: pet.id,
          mood: sch.mood,
          reduced: sch.reduced,
          sx: c.sx,
          sy: c.sy,
          z: c.z,
          facing: c.facing,
        });
      },
    });

    return () => {
      detach();
      sch.stop();
      if (schedRef.current === sch) schedRef.current = null;
    };
  }, [pet, placed, commit]);

  // Ambient blinking between and during behaviors. Not under reduced motion,
  // and not in the stressed look (its eyes are drawn pale and fixed).
  const blinks = placed && !reduced && mood !== 'stressed';
  useEffect(() => {
    if (!blinks) return undefined;
    return startAmbientBlink({
      rng: createRng(runtimeSeed()),
      getView: () => curRef.current,
      apply: commit,
      timing: AMBIENT.blink,
    });
  }, [blinks, commit]);

  // Ambient attention: glances, ear flicks, head tilts, squints, a stirring tail, and turning toward things that appear.
  // The same rules as the blinker (never under reduced motion or the stressed look) and it never overrides a behavior.
  useEffect(() => {
    if (!blinks) return undefined;
    // the world it can notice: the mouse near it (only the mouse, and only its position) and the tab coming back
    const world = watchWorld({ getRect: () => document.querySelector('canvas[data-mood]')?.getBoundingClientRect() ?? null });
    const stop = startAttention({
      rng: createRng(runtimeSeed()),
      getView: () => curRef.current,
      apply: commit,
      timing: AMBIENT.attention,
      mood,
      world,
      // any behavior but the quiet sitting ones owns the face while it runs (even in a pause between its own beats)
      busy: () => {
        const cur = schedRef.current && schedRef.current.current;
        return !!cur && !AMBIENT.attention.idleBehaviors.includes(cur);
      },
    });
    return () => {
      stop();
      world.stop();
    };
  }, [blinks, commit, mood]);

  // Financial mood / breakpoint / motion preference changed: the same
  // scheduler abandons its current behavior and carries on.
  useEffect(() => {
    const sch = schedRef.current;
    if (!sch) return;
    if (sch.mood !== mood || sch.compact !== compact || sch.reduced !== reduced) {
      sch.setMode({ mood, compact, reduced }, rnd(rngRef.current, ...SCHEDULER.restartDelay));
    }
  }, [mood, compact, reduced]);

  // Persistent financial context: edge-detect transitions for the director
  // and keep the scheduler's context flags current (neither restarts it).
  useEffect(() => {
    directorRef.current.setContext({ mood, armed });
    schedRef.current?.setFlags(flagsRef.current);
  }, [mood, armed, approaching]);

  useEffect(() => {
    const director = directorRef.current;
    return () => director.clear();
  }, []);

  // A genuine success event raised by the store (deduplicated by the director).
  const notifyEvent = useCallback((event) => directorRef.current.noteEvent(event), []);

  // Slow animation clock for breathing, tail flicks and the stressed
  // frame flip. One interval; absent under reduced motion.
  const fast = mood === 'stressed' && reaction && REACTIONS[reaction.kind]?.fast;

  useEffect(() => {
    if (reduced) {
      setFrame(0);
      return undefined;
    }
    const id = setInterval(
      () => setFrame((f) => f + 1),
      fast ? SCHEDULER.fastFrameMs : SCHEDULER.frameMs
    );
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

  return { view: merged, frame, react, notifyEvent, placed };
}
