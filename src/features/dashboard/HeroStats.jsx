import useFinanceStore from '../../hooks/useFinanceStore.js';
import useNote from '../../hooks/useNote.js';
import { HER_NAME_CYRILLIC } from '../../lib/constants.js';
import { getDistanceBetweenUs, formatDistance } from '../../lib/distance.js';
import AnimatedAmount, { Amount } from '../../components/AnimatedAmount.jsx';
import { IconNote } from '../../components/icons.jsx';
import RateNotice from '../../components/RateNotice.jsx';

const greeting = (h) => (h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
const titleCase = (s) => s.charAt(0) + s.slice(1).toLowerCase();

/*
 * The top of the Dashboard: the greeting by name, the distance between the
 * two cities (which opens the note), then the balance.
 */
export default function HeroStats() {
  const totalBalance = useFinanceStore((s) => s.getTotalBalanceInUZS());
  const liability = useFinanceStore((s) => s.getTotalLiabilityInUZS());
  const accountCount = useFinanceStore((s) => s.accounts.filter((a) => a.type !== 'DEBT').length);
  const openNote = useNote((s) => s.setOpen);
  const name = titleCase(HER_NAME_CYRILLIC.replace(/_$/, ''));
  const distance = formatDistance(getDistanceBetweenUs());

  return (
    <div className="on-scene min-w-0">
      <p className="text-xl sm:text-2xl font-medium tracking-[-0.02em] text-ink-2">
        {greeting(new Date().getHours())}, <span className="text-ink" data-name="">{name}</span>
      </p>
      <button
        type="button"
        onClick={() => openNote(true)}
        data-action="open-note"
        aria-label={`A note from Karachi, ${distance} away`}
        className="group mt-2 -ml-2 inline-flex items-center gap-2 h-11 px-2 rounded font-mono text-2xs text-ink-3 hover:text-ink-2 hover:bg-white/[0.05] motion-btn cursor-pointer"
      >
        <IconNote className="w-4 h-4" />
        <span>
          KARACHI → TASHKENT · <span className="tnum" data-distance="">{distance}</span>
        </span>
      </button>

      <h1 className="eyebrow mt-6 sm:mt-8 short:mt-4">Total balance</h1>
      <p className="mt-1.5 font-medium tracking-[-0.045em] leading-[0.95] text-ink text-[clamp(2.375rem,12vw,3.5rem)] sm:text-[clamp(3.5rem,7vw,5.5rem)]">
        <AnimatedAmount
          value={totalBalance}
          currency="UZS"
          split
          codeClassName="ml-[0.3em] text-[max(13px,0.26em)] font-mono font-normal tracking-normal text-ink-3 align-[0.95em]"
        />
      </p>
      <p className="mt-4 short:mt-3 text-sm text-ink-2">
        Across {accountCount} {accountCount === 1 ? 'account' : 'accounts'}
        {liability > 0 && (
          <>
            {' · '}
            <Amount value={liability} currency="UZS" className="text-negative" codeClassName="ml-1 font-mono text-[max(12px,0.85em)] text-negative" /> owed
          </>
        )}
      </p>
      <RateNotice className="mt-4 max-w-xl" />
    </div>
  );
}
