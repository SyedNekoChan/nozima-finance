import { forwardRef } from 'react';

/*
 * The app's one button family.
 *
 *   primary    brass fill: the single main action of a view or a dialog
 *   secondary  hairline outline: every other action
 *   quiet      text only: tertiary actions inside rows and cards
 *   danger     the confirmed destructive action
 *
 * Every button is at least 44px tall (40px for size="sm" on a pointer
 * device), steps lighter on hover and presses 1px on click.
 */
const VARIANTS = {
  primary:
    'bg-accent text-on-accent hover:bg-white active:bg-[rgb(212_212_210)] font-medium',
  secondary:
    'border border-line-strong text-ink hover:border-white/30 hover:bg-white/[0.04] active:bg-white/[0.07]',
  quiet: 'text-ink-2 hover:text-ink hover:bg-white/[0.05] active:bg-white/[0.08]',
  danger:
    'bg-negative text-[rgb(32_12_8)] hover:bg-[rgb(244_156_136)] active:bg-[rgb(224_124_102)] font-medium',
};

const SIZES = {
  md: 'h-11 px-4 text-sm gap-2',
  sm: 'h-11 sm:h-10 px-3 text-sm gap-1.5',
};

const Button = forwardRef(function Button(
  {
    children,
    onClick,
    variant = 'secondary',
    size = 'md',
    disabled = false,
    type = 'button',
    className = '',
    icon = null,
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center whitespace-nowrap rounded font-sans select-none cursor-pointer motion-btn active:translate-y-px disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

export default Button;

/* A square 44px icon control; `label` is required and names it. */
export const IconButton = forwardRef(function IconButton(
  { label, onClick, children, className = '', tone = 'quiet', type = 'button', ...rest },
  ref
) {
  const tones = {
    quiet: 'text-ink-2 hover:text-ink hover:bg-white/[0.06] active:bg-white/[0.1]',
    outline: 'text-ink border border-line-strong hover:bg-white/[0.05] hover:border-white/30',
    primary: 'bg-accent text-on-accent hover:bg-white',
  };
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`inline-flex items-center justify-center w-11 h-11 rounded flex-shrink-0 select-none cursor-pointer motion-btn active:translate-y-px ${tones[tone]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});
