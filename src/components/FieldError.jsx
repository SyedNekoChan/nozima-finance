import Reveal from './Reveal.jsx';

/*
 * Modal validation/error line. Keeps the original look; only the
 * appearance is eased and gets a single 3px settle.
 */
export default function FieldError({ message, className = 'mb-4' }) {
  return (
    <Reveal show={Boolean(message)} nudge nudgeKey={message}>
      <div className={`font-mono text-xs text-gray-400 border-l-2 border-white pl-3 ${className}`}>
        {message}
      </div>
    </Reveal>
  );
}
