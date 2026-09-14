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
    <div className="flex-shrink-0 w-full bg-black border-b border-gray-800 px-4 md:px-6 py-3 overflow-x-auto">
      <div className="flex items-center gap-3 md:gap-6 whitespace-nowrap">
        <span className="font-mono text-xs tracking-widest text-gray-500">SORT:</span>
        {SORT_OPTIONS.map((option) => {
          const active = sortBy === option;
          const label = active ? `${sortBy} ${sortDirection === 'DESC' ? '↓' : '↑'}` : option;
          return (
            <Button
              key={option}
              active={active}
              className="text-xs md:text-sm px-3 py-1"
              onClick={() => handleSort(option)}
            >
              [ {label} ]
            </Button>
          );
        })}
      </div>
    </div>
  );
}
