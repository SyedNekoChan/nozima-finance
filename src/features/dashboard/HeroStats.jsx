import useFinanceStore from '../../hooks/useFinanceStore.js';
import { HER_NAME_CYRILLIC } from '../../lib/constants.js';
import { formatAmount } from '../../lib/currency.js';

export default function HeroStats() {
  const totalBalance = useFinanceStore((s) => s.getTotalBalanceInUZS());
  const nameWithoutCursor = HER_NAME_CYRILLIC.replace(/_$/, '');

  return (
    <div className="flex flex-col items-start min-w-0 w-full">
      {/* mobile: balance first, name beneath; sm+ keeps name above balance */}
      <h1 className="order-2 sm:order-1 mt-1 sm:mt-0 font-mono uppercase tracking-tighter text-[length:clamp(1.5rem,8.5vw,2.25rem)] sm:text-5xl md:text-8xl text-white break-words leading-none sm:leading-normal">
        {nameWithoutCursor}
        <span className="brutalist-cursor-blink">_</span>
      </h1>
      <div className="order-1 sm:order-2 mt-0 sm:mt-4 md:mt-6 w-full min-w-0">
        <p className="font-mono font-bold tracking-tight text-[length:clamp(1.25rem,7.5vw,1.875rem)] sm:text-4xl md:text-7xl text-white break-words">
          {formatAmount(totalBalance, 'UZS')}
        </p>
      </div>
    </div>
  );
}
