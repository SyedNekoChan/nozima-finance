import Button from './Button.jsx';

export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  if (!isOpen) return null;

  const sizeCls =
    size === 'sm' ? 'md:max-w-md' : size === 'lg' ? 'md:max-w-4xl' : 'md:max-w-2xl';

  return (
    <div className="fixed inset-0 [height:100dvh] z-[100] bg-black/80 flex items-center justify-center">
      <div
        className={`bg-black border-2 border-white flex flex-col w-full max-h-full md:h-auto md:max-h-[90vh] ${sizeCls}`}
      >
        <div className="flex-shrink-0 flex justify-between items-center border-b border-white p-4">
          <span className="font-mono uppercase tracking-widest text-sm text-white leading-none whitespace-nowrap">
            [ &gt; {title} ]
          </span>
          <button
            type="button"
            aria-label="CLOSE"
            title="CLOSE"
            onClick={onClose}
            className="sm:hidden flex items-center justify-center w-8 h-8 border-2 border-transparent hover:border-white text-white transition-none select-none cursor-pointer active:translate-y-[1px]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <Button className="hidden sm:inline-block" onClick={onClose}>X CLOSE</Button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 font-mono text-sm text-white">
          {children}
        </div>
      </div>
    </div>
  );
}
