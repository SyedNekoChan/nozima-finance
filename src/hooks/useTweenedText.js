import { useLayoutEffect, useRef } from 'react';
import { animate, useReducedMotion } from 'framer-motion';
import { DUR, EASE } from '../lib/motion.js';

/*
 * Tweens a numeric value and writes the formatted result straight into the
 * returned ref's text content, so a 320ms count costs zero React renders.
 * `resetKey` (e.g. the currency code) snaps instead of tweening when it
 * changes, since a figure in a different unit is not a continuation.
 */
export default function useTweenedText(target, format, resetKey) {
  const ref = useRef(null);
  const shown = useRef(target);
  const lastKey = useRef(resetKey);
  const formatRef = useRef(format);
  const reduce = useReducedMotion();
  formatRef.current = format;

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const to = Number.isFinite(Number(target)) ? Number(target) : 0;
    const from = Number.isFinite(Number(shown.current)) ? Number(shown.current) : 0;
    const write = (v) => {
      node.textContent = formatRef.current(v);
    };

    if (lastKey.current !== resetKey || reduce || from === to) {
      lastKey.current = resetKey;
      shown.current = to;
      write(to);
      return undefined;
    }

    const controls = animate(from, to, {
      duration: DUR.data,
      ease: EASE,
      onUpdate: (v) => {
        shown.current = v;
        write(v);
      },
      onComplete: () => {
        shown.current = to;
        write(to);
      },
    });
    return () => controls.stop();
  }, [target, resetKey, reduce]);

  return ref;
}
