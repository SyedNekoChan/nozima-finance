import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DUR, EASE, SHIFT } from '../lib/motion.js';
import { IconCheck, IconChevronDown } from './icons.jsx';

/*
 * Compact single-value selector: shows the current value as a trigger and
 * opens a list of options. Options are objects: { value, label, meta? }.
 *
 * searchable: when true (or when options.length exceeds SEARCH_THRESHOLD
 * and searchable isn't explicitly false), a filter field heads the list, so
 * the account picker stays practical with many accounts.
 *
 * Keyboard: Enter / Space / ArrowDown open; ArrowUp / ArrowDown move;
 * Enter picks; Escape closes and returns focus to the trigger.
 */
const SEARCH_THRESHOLD = 6;

export default function SelectorField({
  id,
  value,
  options,
  onChange,
  placeholder = 'Select',
  emptyLabel = 'No options',
  searchable,
  size = 'md',
  label,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();

  const shouldSearch = searchable !== undefined ? searchable : options.length > SEARCH_THRESHOLD;
  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    if (!shouldSearch || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => String(o.label).toLowerCase().includes(q));
  }, [options, query, shouldSearch]);

  // close on an outside press
  useEffect(() => {
    if (!isOpen) return undefined;
    const onDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [isOpen]);

  // on open: reset the filter, start on the selected option, focus the list or the filter
  useEffect(() => {
    if (!isOpen) return undefined;
    setQuery('');
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    const raf = requestAnimationFrame(() => (shouldSearch ? searchRef.current : listRef.current)?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    listRef.current.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, isOpen]);

  const pick = (v) => {
    onChange(v);
    setIsOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  const onListKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(filtered.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[active]) pick(filtered[active].value);
    } else if (e.key === 'Escape') {
      // keep the Escape for this list; the dialog under it stays open
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation?.();
      setIsOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    } else if (e.key === 'Tab') {
      setIsOpen(false);
    }
  };

  const h = size === 'sm' ? 'h-11 sm:h-10 text-sm' : 'h-12 text-base';

  return (
    <div className="relative" ref={containerRef}>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((p) => !p)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !isOpen) {
            e.preventDefault();
            setIsOpen(true);
          }
        }}
        disabled={options.length === 0}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        aria-label={label ? `${label}: ${selected ? selected.label : placeholder}` : undefined}
        className={`w-full flex items-center justify-between gap-2 rounded bg-white/[0.03] border px-3.5 text-left motion-btn select-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${h} ${
          isOpen ? 'border-accent bg-white/[0.05]' : 'border-line-strong hover:border-white/25'
        }`}
      >
        <span className={`truncate ${selected ? 'text-ink' : 'text-ink-3'}`}>
          {selected ? selected.label : options.length === 0 ? emptyLabel : placeholder}
        </span>
        <IconChevronDown
          className={`w-[18px] h-[18px] flex-shrink-0 text-ink-3 transition-transform duration-[var(--motion-state)] ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="options"
            className="absolute left-0 right-0 mt-2 z-20 flex flex-col max-h-72 rounded bg-raised border border-line-strong shadow-[0_16px_48px_-8px_rgb(0_0_0/0.65)] overflow-hidden"
            initial={{ opacity: 0, y: -SHIFT.popover }}
            animate={{ opacity: 1, y: 0, transition: { duration: DUR.state, ease: EASE } }}
            exit={{ opacity: 0, y: -SHIFT.popover, transition: { duration: DUR.micro, ease: EASE } }}
          >
            {shouldSearch && (
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onListKey}
                placeholder="Search"
                aria-label="Search options"
                aria-controls={listId}
                className="flex-shrink-0 w-full h-11 bg-transparent border-b border-line px-3.5 text-sm text-ink placeholder:text-ink-3 focus:outline-none"
              />
            )}
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              tabIndex={shouldSearch ? -1 : 0}
              onKeyDown={onListKey}
              aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
              className="overflow-y-auto py-1 focus:outline-none"
            >
              {filtered.length === 0 ? (
                <li className="px-3.5 py-3 text-sm text-ink-3">No matches</li>
              ) : (
                filtered.map((o, i) => {
                  const isSel = o.value === value;
                  return (
                    <li
                      key={o.value}
                      id={`${listId}-${i}`}
                      data-index={i}
                      role="option"
                      aria-selected={isSel}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => pick(o.value)}
                      className={`flex items-center justify-between gap-3 min-h-11 px-3.5 text-sm cursor-pointer motion-btn ${
                        i === active ? 'bg-white/[0.07] text-ink' : 'text-ink-2'
                      } ${isSel ? 'font-medium text-ink' : ''}`}
                    >
                      <span className="truncate">{o.label}</span>
                      <span className="flex items-center gap-2 flex-shrink-0">
                        {o.meta && <span className="font-mono text-2xs text-ink-3">{o.meta}</span>}
                        {isSel && <IconCheck className="w-4 h-4 text-accent" />}
                      </span>
                    </li>
                  );
                })
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
