import useFinanceStore from '../../hooks/useFinanceStore.js';
import { HER_NAME_CYRILLIC } from '../../lib/constants.js';
import { formatAmount } from '../../lib/currency.js';

export default function HeroStats() {
  const totalBalance = useFinanceStore((s) => s.getTotalBalanceInUZS());
  const nameWithoutCursor = HER_NAME_CYRILLIC.replace(/_$/, '');

  return (
    <div className="flex flex-col items-start min-w-0 w-full">
      {/* name above balance at every breakpoint */}
      <h1 className="mt-0 font-mono uppercase tracking-tighter text-[length:clamp(1.5rem,8.5vw,2.25rem)] sm:text-5xl md:text-[length:clamp(3.5rem,10.5vw,6rem)] text-white break-words leading-none sm:leading-normal">
        {nameWithoutCursor}
        <span className="brutalist-cursor-blink">_</span>
      </h1>
      <div className="mt-2 sm:mt-4 md:mt-6 w-full min-w-0">
        <p className="font-mono font-bold tracking-tight text-[length:clamp(1.25rem,7.5vw,1.875rem)] sm:text-4xl md:text-[length:clamp(2rem,5vw,4.5rem)] text-white break-words">
          {formatAmount(totalBalance, 'UZS')}
        </p>
      </div>
    </div>
  );
}
