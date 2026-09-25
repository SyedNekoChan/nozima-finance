import useFinanceStore from '../../hooks/useFinanceStore.js';
import { HER_NAME_CYRILLIC } from '../../lib/constants.js';
import { formatAmount } from '../../lib/currency.js';

export default function HeroStats() {
  const totalBalance = useFinanceStore((s) => s.getTotalBalanceInUZS());
  const nameWithoutCursor = HER_NAME_CYRILLIC.replace(/_$/, '');

  return (
    <div className="flex flex-col items-start min-w-0">
      <h1 className="font-mono uppercase tracking-tighter text-3xl sm:text-5xl md:text-8xl text-white break-words">
        {nameWithoutCursor}
        <span className="brutalist-cursor-blink">_</span>
      </h1>
      <div className="mt-4 md:mt-6 w-full min-w-0">
        <p className="font-mono font-bold tracking-tight text-2xl sm:text-4xl md:text-7xl text-white break-words">
          {formatAmount(totalBalance, 'UZS')}
        </p>
      </div>
    </div>
  );
}
