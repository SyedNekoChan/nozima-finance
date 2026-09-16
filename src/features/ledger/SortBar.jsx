import Button from '../../components/Button.jsx';

const SORT_OPTIONS = ['DATE', 'AMOUNT', 'CATEGORY', 'ACCOUNT'];

export default function SortBar({ sortBy, sortDirection, onSortChange }) {
  const handleSort = (option) => {
    if (option === sortBy) {
      // same column clicked — flip direction
      const flipped = sortDirection === 'DESC' ? 'ASC' : 'DESC';
      onSortChange({ sortBy: option, sortDirection: flipped });
    } else {
      onSortChange({ sortBy: option, sortDirection: 'DESC' });
    }
  };

  return (
    <div className="flex-shrink-0 w-full bg-black border-b border-gray-800 px-3 sm:px-4 md:px-6 py-2 md:py-3">
      <span className="block sm:hidden font-mono text-[10px] tracking-widest text-gray-500 mb-2">SORT:</span>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 md:gap-6">
        <span className="hidden sm:inline font-mono text-xs tracking-widest text-gray-500">SORT:</span>
        <div className="grid grid-cols-2 sm:flex sm:flex-nowrap gap-2 md:gap-3">
          {SORT_OPTIONS.map((option) => {
            const active = sortBy === option;
            const label = active ? `${sortBy} ${sortDirection === 'DESC' ? '↓' : '↑'}` : option;
            return (
              <Button
                key={option}
                active={active}
                className="!text-[11px] sm:!text-xs md:!text-sm !px-2 sm:!px-3 py-1 w-full sm:w-auto"
                onClick={() => handleSort(option)}
              >
                {label}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
