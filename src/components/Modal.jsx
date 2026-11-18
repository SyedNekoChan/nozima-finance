import { useEffect, useId, useRef, useState } from 'react';
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
 * - phones (touch): no close button; swipe the sheet down or tap outside it
 *   to dismiss (useSwipeToDismiss). Wider screens and mouse users keep the
 *   close button, and Escape works everywhere.
 */
const stack = [];

/*
 * Swipe a phone sheet down to dismiss it.
 *
 * A drag may start anywhere on the sheet except on a form control or an open
 * list, and from the scrolling body only while that body is at its top and
 * the finger moves down: every other gesture is left to native scrolling.
 * The sheet follows the finger (the shade fades with it); released past
 * max(80px, 22% of its height), or flicked down fast, it slides away and the
 * dialog closes; otherwise, or if the touch is cancelled, it springs back.
 */
const PHONE = 640;
function useSwipeToDismiss({ sheetRef, bodyRef, shadeRef, onDismiss, active }) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!active || !sheet) return undefined;
    let start = null;
    let dragging = false;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;
    let timer = 0;
    const duration = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion-content')) || 0;
    const place = (dy, animated) => {
      const t = animated ? 'transform var(--motion-content) var(--motion-ease), opacity var(--motion-content) var(--motion-ease)' : 'none';
      sheet.style.transition = t;
      sheet.style.transform = dy ? `translate3d(0, ${dy}px, 0)` : '';
      const shade = shadeRef.current;
      if (shade) {
        shade.style.transition = t;
        shade.style.opacity = dy ? String(1 - Math.min(1, dy / Math.max(1, sheet.offsetHeight)) * 0.85) : '';
      }
    };
    const onStart = (e) => {
      if (e.touches.length !== 1 || window.innerWidth >= PHONE) return;
      const target = e.target;
      if (target.closest('input, textarea, select, [contenteditable="true"], [role="listbox"]')) return;
      const body = bodyRef.current;
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY, inBody: !!body && body.contains(target) };
      dragging = false;
    };
    const onMove = (e) => {
      if (!start) return;
      const t = e.touches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (!dragging) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        const scrolled = start.inBody && bodyRef.current && bodyRef.current.scrollTop > 0;
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || scrolled) {
          start = null; // a scroll or a sideways gesture: not ours
          return;
        }
        dragging = true;
        start.y += 8; // the sheet follows the finger, less the slop that told a drag from a tap
        lastY = t.clientY;
        lastT = e.timeStamp;
      }
      if (e.cancelable) e.preventDefault();
      const dt = Math.max(1, e.timeStamp - lastT);
      velocity = (t.clientY - lastY) / dt;
      lastY = t.clientY;
      lastT = e.timeStamp;
      place(Math.max(0, t.clientY - start.y), false);
    };
    const onEnd = (e) => {
      if (!start) return;
      const was = dragging;
      const d = Math.max(0, lastY - start.y);
      start = null;
      dragging = false;
      if (!was) return;
      const h = sheet.offsetHeight;
      if (e.type === 'touchend' && (d > Math.max(80, h * 0.22) || (velocity > 0.6 && d > 32))) {
        place(h + 40, true);
        timer = setTimeout(() => dismissRef.current?.(), duration());
      } else {
        place(0, true);
      }
    };
    sheet.addEventListener('touchstart', onStart, { passive: true });
    sheet.addEventListener('touchmove', onMove, { passive: false });
    sheet.addEventListener('touchend', onEnd);
    sheet.addEventListener('touchcancel', onEnd);
    return () => {
      clearTimeout(timer);
      sheet.removeEventListener('touchstart', onStart);
      sheet.removeEventListener('touchmove', onMove);
      sheet.removeEventListener('touchend', onEnd);
      sheet.removeEventListener('touchcancel', onEnd);
    };
  }, [active, sheetRef, bodyRef, shadeRef]);
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ isOpen, onClose, title, description, children, footer, size = 'md' }) {
  const sizeCls = size === 'sm' ? 'sm:max-w-[440px]' : size === 'lg' ? 'sm:max-w-[960px]' : 'sm:max-w-[560px]';
  const id = useId();
  const panelRef = useRef(null);
  const sheetRef = useRef(null);
  const bodyRef = useRef(null);
  const shadeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // the sheet mounts with the dialog; a state flag re-runs the gesture effect once it exists
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(isOpen), [isOpen]);
  useSwipeToDismiss({ sheetRef, bodyRef, shadeRef, onDismiss: () => onCloseRef.current?.(), active: isOpen && mounted });

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
          {/* the shade: tapping it dismisses; it fades with a swipe */}
          <div ref={shadeRef} className="absolute inset-0">
            <motion.div
              data-modal-shade=""
              className="absolute inset-0 bg-[rgb(4_4_5/0.62)]"
              onClick={onClose}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: DUR.content, ease: EASE } }}
              exit={{ opacity: 0, transition: { duration: DUR.exit, ease: EASE } }}
            />
          </div>
          <div ref={sheetRef} data-sheet="" className={`relative w-full ${sizeCls}`}>
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-title`}
            aria-describedby={description ? `${id}-desc` : undefined}
            tabIndex={-1}
            className={`relative flex flex-col w-full max-h-[92dvh] sm:max-h-[min(88dvh,820px)] bg-raised border border-line-strong rounded-t-xl sm:rounded-xl shadow-[0_24px_80px_-12px_rgb(0_0_0/0.7)] focus:outline-none`}
            initial={{ opacity: 0, y: SHIFT.modal * 2 }}
            animate={{ opacity: 1, y: 0, transition: { duration: DUR.content, ease: EASE } }}
            exit={{ opacity: 0, y: SHIFT.modal, transition: { duration: DUR.exit, ease: EASE } }}
          >
            {/* the sheet's grab handle on phones: swipe down to dismiss */}
            <div className="sm:hidden flex justify-center pt-2.5 pb-1" aria-hidden="true">
              <span className="block w-10 h-1 rounded-full bg-white/25" />
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
              {/* touch phones dismiss by swiping or tapping outside; everywhere else keeps the button */}
              <IconButton label="Close" onClick={onClose} data-action="close" className="-mt-0.5 [@media(max-width:639px)_and_(pointer:coarse)]:hidden">
                <IconClose />
              </IconButton>
            </div>
            <div ref={bodyRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 pb-5 text-sm text-ink">{children}</div>
            {footer && (
              <div className="flex-shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-5 sm:px-6 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-5 border-t border-line">
                {footer}
              </div>
            )}
          </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
