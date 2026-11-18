import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { DUR, EASE, SHIFT } from '../lib/motion.js';
import { IconButton } from './Button.jsx';
import { IconClose } from './icons.jsx';

/*
 * Dialogs. A centred panel on wide screens, a bottom sheet on phones.
 *
 * - role="dialog", aria-modal, labelled by its title
 * - Escape closes the top-most dialog only (dialogs can stack: a delete
 *   confirmation over the day's log)
 * - focus moves into the dialog on open, Tab stays inside it, and focus
 *   returns to whatever opened it on close
 * - `footer` is the action row, kept in view at the bottom of a long form
 */
const stack = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ isOpen, onClose, title, description, children, footer, size = 'md' }) {
  const sizeCls = size === 'sm' ? 'sm:max-w-[440px]' : size === 'lg' ? 'sm:max-w-[960px]' : 'sm:max-w-[560px]';
  const id = useId();
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return undefined;
    const returnTo = document.activeElement;
    stack.push(id);
    // move focus into the dialog, unless something inside it already has it (a field the user has started on)
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    });

    const onKey = (e) => {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const items = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      const i = stack.lastIndexOf(id);
      if (i >= 0) stack.splice(i, 1);
      if (returnTo && returnTo.isConnected && typeof returnTo.focus === 'function') {
        requestAnimationFrame(() => returnTo.focus({ preventScroll: true }));
      }
    };
  }, [isOpen, id]);

  // portal to body so no tab wrapper's stacking context can put the navigation above the overlay
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          key="modal"
          className="fixed inset-0 [height:100dvh] z-[100] flex items-end sm:items-center justify-center sm:p-6"
        >
          <motion.div
            className="absolute inset-0 bg-[rgb(4_4_5/0.62)]"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: DUR.content, ease: EASE } }}
            exit={{ opacity: 0, transition: { duration: DUR.exit, ease: EASE } }}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-title`}
            aria-describedby={description ? `${id}-desc` : undefined}
            tabIndex={-1}
            className={`relative flex flex-col w-full max-h-[92dvh] sm:max-h-[min(88dvh,820px)] ${sizeCls} bg-raised border border-line-strong rounded-t-xl sm:rounded-xl shadow-[0_24px_80px_-12px_rgb(0_0_0/0.7)] focus:outline-none`}
            initial={{ opacity: 0, y: SHIFT.modal * 2 }}
            animate={{ opacity: 1, y: 0, transition: { duration: DUR.content, ease: EASE } }}
            exit={{ opacity: 0, y: SHIFT.modal, transition: { duration: DUR.exit, ease: EASE } }}
          >
            {/* the sheet's grab handle on phones: a visual cue only */}
            <div className="sm:hidden flex justify-center pt-2" aria-hidden="true">
              <span className="block w-9 h-1 rounded-full bg-white/15" />
            </div>
            <div className="flex-shrink-0 flex items-start justify-between gap-3 pl-5 pr-3 pt-3 sm:pt-5 pb-3 sm:pl-6 sm:pr-4">
              <div className="min-w-0 pt-2">
                <h2 id={`${id}-title`} className="text-lg font-medium text-ink leading-6 break-words">
                  {title}
                </h2>
                {description && (
                  <p id={`${id}-desc`} className="mt-1 text-sm text-ink-2">
                    {description}
                  </p>
                )}
              </div>
              <IconButton label="Close" onClick={onClose} data-action="close" className="-mt-0.5">
                <IconClose />
              </IconButton>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 pb-5 text-sm text-ink">{children}</div>
            {footer && (
              <div className="flex-shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-5 sm:px-6 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-5 border-t border-line">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
