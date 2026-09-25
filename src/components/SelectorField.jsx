import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/*
 * Compact single-value selector: shows only the current value as a
 * trigger, opens a dropdown of options on click instead of always
 * rendering every option inline (the old horizontal-scrolling button
 * rows). Options are objects: { value, label }.
 *
 * searchable: when true (or when options.length exceeds
 * SEARCH_THRESHOLD and searchable isn't explicitly false), a text
 * input is shown at the top of the dropdown to filter options by
 * label — this is what keeps the ACCOUNT selector practical once a
 * user has many accounts.
 */
const SEARCH_THRESHOLD = 6;

export default function SelectorField({
  value,
  options,
  onChange,
  placeholder = 'SELECT',
  emptyLabel = 'NO OPTIONS',
  searchable,
}) {
  const [isOpen, setIsOpen] =
    useState(false);

  const [query, setQuery] =
    useState('');

  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  const shouldSearch =
    searchable !== undefined
      ? searchable
      : options.length >
        SEARCH_THRESHOLD;

  const selected = options.find(
    (o) => o.value === value
  );

  const filteredOptions = useMemo(
    () => {
      if (
        !shouldSearch ||
        !query.trim()
      ) {
        return options;
      }

      const q =
        query.trim().toLowerCase();

      return options.filter((o) =>
        o.label
          .toLowerCase()
          .includes(q)
      );
    },
    [options, query, shouldSearch]
  );

  // Close on outside click.
  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (
      e
    ) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(
          e.target
        )
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener(
      'mousedown',
      handlePointerDown
    );

    return () =>
      document.removeEventListener(
        'mousedown',
        handlePointerDown
      );
  }, [isOpen]);

  // Reset search + focus it whenever the dropdown opens.
  useEffect(() => {
    if (isOpen) {
      setQuery('');

      if (shouldSearch) {
        // Defer to after the input actually mounts.
        const id = requestAnimationFrame(
          () =>
            searchInputRef.current?.focus()
        );

        return () =>
          cancelAnimationFrame(id);
      }
    }

    return undefined;
  }, [isOpen, shouldSearch]);

  const handleSelect = (
    optionValue
  ) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div
      className="relative"
      ref={containerRef}
    >
      <button
        type="button"
        onClick={() =>
          setIsOpen((prev) => !prev)
        }
        disabled={
          options.length === 0
        }
        className="w-full flex items-center justify-between gap-2 bg-black text-white font-mono text-sm border-2 border-gray-800 hover:border-white focus:border-white focus:outline-none px-3 py-2 leading-none disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span className="truncate leading-none">
          {selected
            ? selected.label
            : options.length === 0
              ? emptyLabel
              : placeholder}
        </span>
        <span className="text-gray-500 leading-none flex-shrink-0">
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 z-10 bg-black border-2 border-white max-h-64 flex flex-col">
          {shouldSearch && (
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) =>
                setQuery(
                  e.target.value
                )
              }
              placeholder="SEARCH..."
              className="flex-shrink-0 w-full bg-black text-white font-mono text-xs uppercase tracking-widest border-b-2 border-gray-800 focus:border-white focus:outline-none px-3 py-2 leading-none"
            />
          )}

          <div className="overflow-y-auto">
            {filteredOptions.length ===
            0 ? (
              <div className="font-mono text-xs text-gray-500 px-3 py-3 leading-normal">
                NO MATCHES
              </div>
            ) : (
              filteredOptions.map(
                (option) => (
                  <button
                    key={
                      option.value
                    }
                    type="button"
                    onClick={() =>
                      handleSelect(
                        option.value
                      )
                    }
                    className={`w-full text-left font-mono text-sm px-3 py-2 leading-none border-b border-gray-900 last:border-b-0 ${
                      option.value ===
                      value
                        ? 'bg-white text-black font-bold'
                        : 'text-white hover:bg-white hover:text-black'
                    }`}
                  >
                    {option.label}
                  </button>
                )
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
