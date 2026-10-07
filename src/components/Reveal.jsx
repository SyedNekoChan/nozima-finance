import { useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DUR, EASE, SHIFT } from '../lib/motion.js';

/*
 * Height + opacity presence for blocks that appear/disappear inside a
 * stable container (modal fields, error lines, empty states), so the
 * surrounding layout eases instead of jumping.
 *
 * Overflow is clipped only for the duration of a height animation. A block
 * that mounts without animating (AnimatePresence initial={false}) must stay
 * overflow-visible, or it would clip popovers such as SelectorField forever.
 *
 * `nudge` adds the single tiny horizontal settle used for validation
 * messages; it re-fires when `nudgeKey` (the message text) changes.
 */
export default function Reveal({ show, children, className = '', nudge = false, nudgeKey }) {
  const ref = useRef(null);

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          ref={ref}
          key="reveal"
          className={`flow-root ${className}`}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0, transition: { duration: DUR.exit, ease: EASE } }}
          transition={{ duration: DUR.state, ease: EASE }}
          onAnimationStart={() => {
            // clip only while the height is actually animating
            if (ref.current) ref.current.style.overflow = 'hidden';
          }}
          onAnimationComplete={(def) => {
            // once open, release clipping so absolutely positioned children
            // (dropdowns) and focus outlines are never cut off
            if (ref.current && def && def.height === 'auto') ref.current.style.overflow = '';
          }}
        >
          {nudge ? (
            <motion.div
              key={nudgeKey}
              initial={{ x: SHIFT.error }}
              animate={{ x: 0 }}
              transition={{ duration: DUR.state, ease: EASE }}
            >
              {children}
            </motion.div>
          ) : (
            children
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
