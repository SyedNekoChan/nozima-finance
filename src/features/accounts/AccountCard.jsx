import { formatAmount } from '../../lib/currency.js';
import { FUTURE_FUND_NAME } from '../../lib/constants.js';
import Button from '../../components/Button.jsx';

export default function AccountCard({ account, onEdit, onTransfer }) {
  const isFutureFund = account.name.toUpperCase() === FUTURE_FUND_NAME;
  const isNegative = account.balance < 0;

  return (
    <div className="border-2 border-white bg-black p-4 flex flex-col justify-between min-h-[160px] relative">
      <div>
        <div className="flex justify-between items-start">
          <h3 className="font-mono uppercase tracking-widest text-sm text-white">
            [ {account.name} ]
          </h3>
          {isFutureFund && (
            <span className="font-mono text-white text-lg">♥</span>
          )}
        </div>
        <span className="font-mono text-xs tracking-widest text-gray-500 mt-1 block">
          {account.currency}
        </span>
      </div>

      <div className="my-4">
        {/* opacity subordinates negative balances instead of color */}
        <span className={`font-mono font-bold text-2xl md:text-3xl text-white ${isNegative ? 'opacity-70' : ''}`}>
          {formatAmount(account.balance, account.currency)}
        </span>
      </div>

      <div className="flex justify-between gap-3 pt-3 border-t border-gray-800">
        <Button onClick={() => onEdit(account)} className="text-xs px-3 py-1">
          EDIT
        </Button>
        <Button onClick={() => onTransfer(account)} className="text-xs px-3 py-1">
          TRANSFER
        </Button>
      </div>
    </div>
  );
}
