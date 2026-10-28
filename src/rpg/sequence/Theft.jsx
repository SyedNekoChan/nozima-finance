import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import useRpgStore from '../state/store.js';
import { commitTheft, commitEntered } from '../state/story.js';
import { OPENING_STEPS } from '../data/content.js';
import SceneCanvas from './SceneCanvas.jsx';
import { STEPS, sceneAt } from './scene.js';

const GONE = STEPS.findIndex((s) => s.id === 'gone');
const GRAB = STEPS.findIndex((s) => s.id === 'grab');
const HOLD_MS = 350;
const FRAME_STEPS = 12; // redraw granularity: keeps the art at a pixel-art cadence

/*
 * The portal / cat-theft opening. Progress is driven by the persisted save:
 *  - 'portal'  nothing has happened yet: play from the start;
 *  - 'stolen'  the theft was already committed: never replay it, only the
 *              final "enter Nomoz" choice remains.
 * The theft is committed to the RPG database when the sorcerer reaches the
 * cat, and the scene only moves on once that write has succeeded.
 */
export default function Theft() {
  const openingStep = useRpgStore((s) => s.save?.story?.openingStep);
  const reduced = useReducedMotion() ?? false;
  // fixed at mount: committing the theft mid-sequence must not look like a resume
  const [resumed] = useState(openingStep === OPENING_STEPS.STOLEN);

  const [idx, setIdx] = useState(resumed ? GONE : 0);
  const [p, setP] = useState(resumed || reduced ? 1 : 0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);
  const committing = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const step = STEPS[idx];
  const atEnd = p >= 1;
  const isLast = idx === GONE;

  // Step animation: one rAF loop only while a step is still playing.
  useEffect(() => {
    if (reduced || (resumed && idx === GONE)) {
      setP(1);
      return undefined;
    }
    setP(0);
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const next = Math.min(1, (now - start) / step.ms);
      setP(next);
      if (next < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [idx, reduced, resumed, step.ms]);

  const advance = useCallback(async () => {
    if (committing.current || isLast) return;
    if (idx === GRAB) {
      committing.current = true;
      setBusy(true);
      setFailed(false);
      const ok = await commitTheft();
      committing.current = false;
      if (!alive.current) return;
      setBusy(false);
      if (!ok) {
        setFailed(true);
        return;
      }
    }
    setIdx((i) => Math.min(GONE, i + 1));
  }, [idx, isLast]);

  // Auto-advance after a short hold unless reduced motion asks for manual steps.
  useEffect(() => {
    if (reduced || !atEnd || isLast || failed || busy) return undefined;
    const id = setTimeout(advance, HOLD_MS);
    return () => clearTimeout(id);
  }, [reduced, atEnd, isLast, failed, busy, advance]);

  const enter = useCallback(async () => {
    if (committing.current) return;
    committing.current = true;
    setBusy(true);
    setFailed(false);
    const ok = await commitEntered();
    committing.current = false;
    if (!alive.current) return;
    setBusy(false);
    if (!ok) setFailed(true);
  }, []);

  const scene = useMemo(() => sceneAt(step.id, Math.round(p * FRAME_STEPS) / FRAME_STEPS), [step.id, p]);
  const frame = reduced ? 0 : Math.floor(p * FRAME_STEPS) % 2;
  const caption = isLast && atEnd ? 'Follow the sorcerer into Nomoz.' : step.caption;

  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-4">
      <SceneCanvas scene={scene} frame={frame} label={step.caption} />

      <p role="status" className="min-h-[3rem] text-center text-sm">
        {caption}
      </p>

      {failed && (
        <p role="alert" className="text-center text-sm">
          Progress could not be saved. Nothing has changed.
        </p>
      )}

      {isLast ? (
        <button type="button" disabled={!atEnd || busy} onClick={enter} className="min-h-[44px] border border-white px-4 disabled:opacity-40">
          {failed ? 'Retry' : 'Enter Nomoz'}
        </button>
      ) : (
        (reduced || failed) && (
          <button type="button" disabled={!atEnd || busy} onClick={advance} className="min-h-[44px] border border-white px-4 disabled:opacity-40">
            {failed ? 'Retry' : 'Next'}
          </button>
        )
      )}
    </div>
  );
}
