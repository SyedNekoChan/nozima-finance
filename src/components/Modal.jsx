import Button from './Button.jsx';
import { useFooterHeight } from '../hooks/useViewportChrome.jsx';

export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  const footerHeight = useFooterHeight();

  if (!isOpen) return null;

  const sizeCls =
    size === 'sm' ? 'md:max-w-md' : size === 'lg' ? 'md:max-w-4xl' : 'md:max-w-2xl';

  return (
    <div className="fixed inset-0 [height:100dvh] z-50 bg-black/80 flex items-center justify-center">
      <div
        className={`bg-black border-2 border-white flex flex-col w-full [height:auto] md:h-auto md:[height:auto] md:w-auto md:max-h-[90vh] ${sizeCls}`}
        style={{
          // Mobile: never let the modal shell extend under the fixed
          // Footer. Uses Footer's REAL measured height (see
          // useViewportChrome) rather than a guessed breakpoint value,
          // so this stays correct if Footer's own responsive sizing
          // ever changes. The md: classes above take over the sizing
          // at desktop breakpoints, leaving that behavior untouched.
          maxHeight: `calc(100dvh - ${footerHeight}px)`,
        }}
      >
        <div className="flex-shrink-0 flex justify-between items-center border-b border-white p-4">
          <span className="font-mono uppercase tracking-widest text-sm text-white leading-none">
            [ &gt; {title} ]
          </span>
          <Button onClick={onClose}>X CLOSE</Button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 font-mono text-sm text-white">
          {children}
        </div>
      </div>
    </div>
  );
}
