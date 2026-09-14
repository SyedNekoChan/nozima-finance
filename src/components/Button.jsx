export default function Button({
  children,
  onClick,
  active = false,
  disabled = false,
  type = 'button',
  className = '',
}) {
  const base =
    'font-mono uppercase tracking-widest text-xs md:text-sm px-3 py-1 border-2 transition-none select-none cursor-pointer active:translate-y-[1px]';
  const state = active
    ? 'bg-white text-black border-white font-bold'
    : 'bg-black text-white border-transparent hover:border-white';
  const disabledCls = disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : '';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${state} ${disabledCls} ${className}`}
    >
      [ {children} ]
    </button>
  );
}
