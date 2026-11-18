import { forwardRef, useId } from 'react';

/*
 * Form building blocks: a visible label over every control, a hint under
 * it, and the error (FieldError) under the form. Inputs are 48px tall,
 * hairline-bordered, brass on focus.
 */
export function Field({ label, hint, htmlFor, children, className = '', as = 'div' }) {
  const Tag = as;
  return (
    <Tag className={`block ${className}`}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-2 mb-2">
          {label}
        </label>
      )}
      {children}
      {hint && <p className="mt-1.5 text-xs text-ink-3">{hint}</p>}
    </Tag>
  );
}

/* a group of buttons named by a label (radio-like choices) */
export function FieldGroup({ label, children, className = '' }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className={className}>
      <span id={id} className="block text-sm font-medium text-ink-2 mb-2">
        {label}
      </span>
      {children}
    </div>
  );
}

const inputBase =
  'w-full min-w-0 h-12 rounded bg-white/[0.03] border border-line-strong px-3.5 text-base text-ink placeholder:text-ink-3 hover:border-white/25 focus:outline-none focus:border-accent focus:bg-white/[0.05] focus:shadow-[0_0_0_3px_rgb(var(--accent)/0.18)] disabled:opacity-40';

export const TextInput = forwardRef(function TextInput({ className = '', ...props }, ref) {
  return <input ref={ref} type="text" className={`${inputBase} ${className}`} {...props} />;
});

/*
 * A money input: large tabular figures with the currency code set inside
 * the field on the right. `prefix` (e.g. "−" for a debt) sits on the left.
 */
export const AmountInput = forwardRef(function AmountInput(
  { currency, prefix, className = '', size = 'lg', ...props },
  ref
) {
  return (
    <div
      className={`flex items-center w-full min-w-0 rounded bg-white/[0.03] border border-line-strong hover:border-white/25 focus-within:border-accent focus-within:bg-white/[0.05] focus-within:shadow-[0_0_0_3px_rgb(var(--accent)/0.18)] motion-btn ${
        size === 'lg' ? 'h-14' : 'h-12'
      } ${className}`}
    >
      {prefix && <span className="pl-3.5 text-xl text-ink-2 select-none tnum">{prefix}</span>}
      <input
        ref={ref}
        type="text"
        className={`flex-1 min-w-0 h-full bg-transparent px-3.5 tnum text-ink placeholder:text-ink-3 focus:outline-none disabled:opacity-40 ${
          size === 'lg' ? 'text-2xl font-medium tracking-[-0.02em]' : 'text-base'
        }`}
        {...props}
      />
      {currency && (
        <span className="pr-3.5 font-mono text-sm text-ink-3 select-none flex-shrink-0">{currency}</span>
      )}
    </div>
  );
});

/*
 * Segmented control: one choice from a few. Each option is a radio button;
 * `optionAttr` adds a data attribute per option (stable hooks for tests).
 */
export function Segmented({ value, options, onChange, label, className = '', size = 'md', optionAttr, disabled }) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`inline-flex p-1 gap-1 rounded bg-white/[0.04] border border-line ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        const attrs = optionAttr ? { [optionAttr]: o.value } : {};
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              e.preventDefault();
              const i = options.findIndex((x) => x.value === value);
              const next = options[(i + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length];
              onChange(next.value);
              const btns = e.currentTarget.parentElement.querySelectorAll('[role="radio"]');
              btns[options.indexOf(next)]?.focus();
            }}
            tabIndex={active ? 0 : -1}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-sm whitespace-nowrap select-none cursor-pointer motion-btn motion-state disabled:opacity-40 ${
              size === 'sm' ? 'h-11 sm:h-9 px-3 text-xs' : 'h-11 sm:h-10 px-3.5 text-sm'
            } ${
              active
                ? 'bg-white/[0.1] text-ink font-medium shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]'
                : 'text-ink-2 hover:text-ink hover:bg-white/[0.04]'
            }`}
            {...attrs}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* A set of choice chips that may wrap (account type, currency, destination). */
export function ChoiceChips({ value, options, onChange, disabled, className = '' }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center gap-2 h-11 sm:h-10 px-3.5 rounded border text-sm select-none cursor-pointer motion-btn active:translate-y-px disabled:opacity-40 ${
              active
                ? 'border-white/60 bg-white/[0.1] text-ink font-medium'
                : 'border-line-strong text-ink-2 hover:text-ink hover:border-white/30'
            }`}
          >
            {o.label}
            {o.meta && <span className={`font-mono text-2xs ${active ? 'text-ink-2' : 'text-ink-3'}`}>{o.meta}</span>}
          </button>
        );
      })}
    </div>
  );
}
