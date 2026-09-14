import useFinanceStore from '../../hooks/useFinanceStore.js';
import { HER_NAME_CYRILLIC } from '../../lib/constants.js';
import { formatAmount } from '../../lib/currency.js';

export default function HeroStats() {
  const totalBalance = useFinanceStore((s) => s.getTotalBalanceInUZS());

  return (
    <div className="flex flex-col items-start">
      <h1 className="font-mono uppercase tracking-tighter text-5xl md:text-8xl text-white">
        {HER_NAME_CYRILLIC}
      </h1>
      <div className="mt-4 md:mt-6">
        <p className="font-mono font-bold tracking-tight text-4xl md:text-7xl text-white">
          {formatAmount(totalBalance, 'UZS')}
        </p>
      </div>
    </div>
  );
}
