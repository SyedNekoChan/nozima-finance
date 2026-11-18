import Reveal from './Reveal.jsx';
import { IconAlert } from './icons.jsx';

/*
 * A form's validation or save error: eased in, with a single 3px settle,
 * announced politely to assistive technology.
 */
// the store's errors are written in capitals; show them as sentences
const sentence = (m) => (m && m === m.toUpperCase() ? m.charAt(0) + m.slice(1).toLowerCase() : m);

export default function FieldError({ message, className = 'mb-4' }) {
  return (
    <Reveal show={Boolean(message)} nudge nudgeKey={message}>
      <div
        role="alert"
        className={`flex items-start gap-2 rounded bg-negative/[0.1] border border-negative/30 px-3 py-2.5 text-sm text-[rgb(246_176_160)] ${className}`}
      >
        <IconAlert className="w-[18px] h-[18px] flex-shrink-0 mt-px" />
        <span>{sentence(message)}</span>
      </div>
    </Reveal>
  );
}
