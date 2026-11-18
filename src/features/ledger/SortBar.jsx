import SelectorField from '../../components/SelectorField.jsx';
import { Segmented } from '../../components/Field.jsx';
import { IconButton } from '../../components/Button.jsx';
import { IconSortAsc, IconSortDesc } from '../../components/icons.jsx';

const SORT_FIELDS = [
  { value: 'DATE', label: 'Date' },
  { value: 'AMOUNT', label: 'Amount' },
  { value: 'CATEGORY', label: 'Category' },
  { value: 'ACCOUNT', label: 'Account' },
];

const DIR_LABEL = {
  DATE: { DESC: 'Newest first', ASC: 'Oldest first' },
  AMOUNT: { DESC: 'Largest first', ASC: 'Smallest first' },
  CATEGORY: { DESC: 'A to Z', ASC: 'Z to A' },
  ACCOUNT: { DESC: 'A to Z', ASC: 'Z to A' },
};

/*
 * Sort by one field, in one direction. Choosing a field starts at its
 * natural order (newest, largest, A–Z); the arrow flips it.
 */
export default function SortBar({ sortBy, sortDirection, onSortChange, stacked = false }) {
  const setField = (field) => onSortChange({ sortBy: field, sortDirection: field === sortBy ? sortDirection : 'DESC' });
  const flip = () => onSortChange({ sortBy, sortDirection: sortDirection === 'DESC' ? 'ASC' : 'DESC' });
  const dirLabel = DIR_LABEL[sortBy]?.[sortDirection] || '';

  // the side column on wide screens: the fields full width, the direction under them
  if (stacked) {
    return (
      <div className="space-y-3">
        <Segmented value={sortBy} options={SORT_FIELDS} onChange={setField} label="Sort by" size="sm" className="w-full" />
        <button
          type="button"
          onClick={flip}
          data-action="sort-direction"
          aria-label={`${dirLabel}. Reverse the order.`}
          className="inline-flex items-center gap-2 h-10 -ml-2 px-2 rounded text-sm text-ink-2 hover:text-ink hover:bg-white/[0.05] motion-btn cursor-pointer"
        >
          {sortDirection === 'DESC' ? <IconSortDesc className="w-[18px] h-[18px]" /> : <IconSortAsc className="w-[18px] h-[18px]" />}
          {dirLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <span className="hidden sm:inline text-sm text-ink-3">Sort</span>
      <div className="sm:hidden flex-1 min-w-0">
        <SelectorField value={sortBy} options={SORT_FIELDS} onChange={setField} searchable={false} size="sm" label="Sort by" />
      </div>
      <Segmented value={sortBy} options={SORT_FIELDS} onChange={setField} label="Sort by" size="sm" className="hidden sm:inline-flex" />
      <IconButton
        label={`${dirLabel}. Reverse the order.`}
        onClick={flip}
        tone="outline"
        data-action="sort-direction"
        className="sm:!h-10 sm:!w-10"
      >
        {sortDirection === 'DESC' ? <IconSortDesc /> : <IconSortAsc />}
      </IconButton>
      <span className="hidden md:inline text-xs text-ink-3 whitespace-nowrap">{dirLabel}</span>
    </div>
  );
}
