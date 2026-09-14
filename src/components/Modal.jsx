import Button from './Button.jsx';

export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  if (!isOpen) return null;

  const sizeCls =
    size === 'sm' ? 'md:max-w-md' : size === 'lg' ? 'md:max-w-4xl' : 'md:max-w-2xl';

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
      <div
        className={`bg-black border-2 border-white flex flex-col w-full h-full md:w-auto md:h-auto md:max-h-[90vh] ${sizeCls}`}
      >
        <div className="flex justify-between items-center border-b border-white p-4">
          <span className="font-mono uppercase tracking-widest text-sm">
            [ &gt; {title} ]
          </span>
          <Button onClick={onClose}>X CLOSE</Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 md:p-6 font-mono text-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
