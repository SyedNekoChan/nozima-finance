import { useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DUR, EASE, SHIFT } from '../lib/motion.js';

/*
 * Height + opacity presence for blocks that appear/disappear inside a
 * stable container (modal fields, error lines, empty states), so the
 * surrounding layout eases instead of jumping.
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
          style={{ overflow: 'hidden' }}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0, transition: { duration: DUR.exit, ease: EASE } }}
          transition={{ duration: DUR.state, ease: EASE }}
          onAnimationStart={() => {
            if (ref.current) ref.current.style.overflow = 'hidden';
          }}
          onAnimationComplete={(def) => {
            // release clipping once open so focus outlines are never cut off
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
