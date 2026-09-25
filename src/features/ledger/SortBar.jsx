import SelectorField from '../../components/SelectorField.jsx';

const SORT_FIELDS = ['DATE', 'AMOUNT', 'CATEGORY', 'ACCOUNT'];

export default function SortBar({ sortBy, sortDirection, onSortChange }) {
  const arrow = sortDirection === 'DESC' ? '↓' : '↑';

  const options = SORT_FIELDS.flatMap((field) => [
    { value: `${field}_DESC`, label: `${field} ↓` },
    { value: `${field}_ASC`, label: `${field} ↑` },
  ]);

  const handleChange = (compositeValue) => {
    const [field, direction] = compositeValue.split('_');
    onSortChange({ sortBy: field, sortDirection: direction });
  };

  return (
    <div className="flex-shrink-0 w-full bg-black border-b border-gray-800 px-3 sm:px-4 md:px-6 py-2 md:py-3">
      <div className="flex items-center gap-2 md:gap-3">
        <span className="font-mono text-xs tracking-widest text-gray-500 leading-none whitespace-nowrap">
          SORT:
        </span>
        <div className="w-40">
          <SelectorField
            value={`${sortBy}_${sortDirection}`}
            options={options}
            onChange={handleChange}
            searchable={false}
            placeholder={`${sortBy} ${arrow}`}
          />
        </div>
      </div>
    </div>
  );
}
