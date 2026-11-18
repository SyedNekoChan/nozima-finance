import Modal from './Modal.jsx';
import useNote from '../hooks/useNote.js';
import { SYSTEM_MESSAGE, HER_NAME_CYRILLIC } from '../lib/constants.js';
import { getDistanceBetweenUs, formatDistance } from '../lib/distance.js';

const NAME = HER_NAME_CYRILLIC.replace(/_$/, '');
const titleCase = (s) => s.charAt(0) + s.slice(1).toLowerCase();

/*
 * The note, shown exactly as SYSTEM_MESSAGE is written: every line, every
 * "> ", in the monospace it was typed in. The distance (the haversine between
 * Karachi and Tashkent, lib/distance.js) signs it off.
 */
export default function Note() {
  const open = useNote((s) => s.open);
  const setOpen = useNote((s) => s.setOpen);
  return (
    <Modal isOpen={open} onClose={() => setOpen(false)} title={`For ${titleCase(NAME)}`} size="sm">
      <p data-note="" className="whitespace-pre-wrap font-mono text-[14px] leading-[1.75] text-ink">
        {SYSTEM_MESSAGE}
      </p>
      <p className="mt-6 pt-4 border-t border-line flex items-center justify-between gap-3 font-mono text-2xs text-ink-3">
        <span>KARACHI → TASHKENT</span>
        <span data-distance="" className="tnum">{formatDistance(getDistanceBetweenUs())}</span>
      </p>
    </Modal>
  );
}
