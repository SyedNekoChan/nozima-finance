import { useRef } from 'react';

/*
 * Returns `value` while `isOpen` is true and freezes the last open value
 * once it closes. Modals use this so their content (selected account,
 * entry being deleted, ...) stays intact while the exit animation plays,
 * instead of blanking out the moment the parent clears its state.
 */
export default function useHeldValue(value, isOpen) {
  const ref = useRef(value);
  if (isOpen) ref.current = value;
  return ref.current;
}
