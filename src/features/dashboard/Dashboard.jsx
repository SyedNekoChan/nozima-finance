import { useState, useMemo } from 'react';
import useFinanceStore from '../../hooks/useFinanceStore.js';
import { convertToBase } from '../../lib/currency.js';
import { getDaysInMonth } from '../../lib/date.js';
import { compact, monthLong, monthShort } from '../../lib/format.js';
import AnimatedAmount, { Amount } from '../../components/AnimatedAmount.jsx';
import HeroStats from './HeroStats.jsx';
import BudgetMeter from '../../components/BudgetMeter.jsx';
import SpendingChart from '../../components/SpendingChart.jsx';
import Modal from '../../components/Modal.jsx';
import Button from '../../components/Button.jsx';
import FieldError from '../../components/FieldError.jsx';
import { Field, AmountInput, Segmented } from '../../components/Field.jsx';
import { IconEdit, IconPlus } from '../../components/icons.jsx';

const GRANULARITY = [
  { value: 'DAY', label: 'Days' },
  { value: 'MONTH', label: 'Months' },
  { value: 'YEAR', label: 'Years' },
];

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Dashboard() {
  const spentThisMonth = useFinanceStore((s) => s.getSpentThisMonthInUZS());
  const monthlyBudget = useFinanceStore((s) => s.getMonthlyBudgetUZS());
  const dailyAllowance = useFinanceStore((s) => s.getDailyAllowanceUZS());
  const setMonthlyBudget = useFinanceStore((s) => s.setMonthlyBudget);
  const transactions = useFinanceStore((s) => s.transactions);
  const exchangeRates = useFinanceStore((s) => s.exchangeRates);

  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [budgetError, setBudgetError] = useState('');
  const [granularity, setGranularity] = useState('DAY');

  const now = new Date();
  const day = now.getDate();
  const days = getDaysInMonth(now.getFullYear(), now.getMonth() + 1);

  // one bucket per period; a transaction counts in exactly the bucket of its date
  const chart = useMemo(() => {
    const today = new Date();
    const buckets = [];
    if (granularity === 'DAY') {
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
        buckets.push({
          key: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`,
          tick: i % 7 === 0 ? (d.getDate() === 1 || i === 29 ? `${d.getDate()} ${monthShort(d.getMonth())}` : String(d.getDate())) : '',
          tip: `${WD[d.getDay()]} ${d.getDate()} ${monthShort(d.getMonth())}`,
        });
      }
    } else if (granularity === 'YEAR') {
      for (let i = 5; i >= 0; i--) {
        const y = today.getFullYear() - i;
        buckets.push({ key: `${y}`, tick: `${y}`, tip: `${y}` });
      }
    } else {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        buckets.push({
          key: `${d.getFullYear()}-${d.getMonth() + 1}`,
          tick: monthShort(d.getMonth()),
          tip: `${monthLong(d.getMonth())} ${d.getFullYear()}`,
        });
      }
    }

    const totals = new Map(buckets.map((b) => [b.key, 0]));
    for (const tx of transactions) {
      if (tx.type !== 'EXPENSE') continue;
      const [d, m, y] = tx.date.split('-').map(Number);
      const key = granularity === 'DAY' ? `${y}-${m}-${d}` : granularity === 'YEAR' ? `${y}` : `${y}-${m}`;
      if (!totals.has(key)) continue;
      totals.set(key, totals.get(key) + convertToBase(tx.amount, tx.currency, exchangeRates));
    }

    const data = buckets.map((b) => totals.get(b.key));
    return { data, ticks: buckets.map((b) => b.tick), tips: buckets.map((b) => b.tip), total: data.reduce((a, b) => a + b, 0) };
  }, [transactions, exchangeRates, granularity]);

  const reference =
    granularity === 'DAY' && dailyAllowance
      ? { value: dailyAllowance, label: 'Allowance' }
      : granularity === 'MONTH' && monthlyBudget
        ? { value: monthlyBudget, label: 'Budget' }
        : null;

  const periodLabel = granularity === 'DAY' ? 'Last 30 days' : granularity === 'MONTH' ? 'Last 12 months' : 'Last 6 years';

  function openBudgetModal() {
    setBudgetInput(monthlyBudget ? String(monthlyBudget) : '');
    setBudgetError('');
    setShowBudgetModal(true);
  }

  function handleSaveBudget() {
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (budgetInput.trim() === '') {
      setMonthlyBudget(monthKey, null);
      setShowBudgetModal(false);
      setBudgetInput('');
      return;
    }
    const parsedAmount = parseFloat(budgetInput);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setBudgetError('Enter an amount above zero, or leave it empty to remove the budget.');
      return;
    }
    setMonthlyBudget(monthKey, parsedAmount);
    setShowBudgetModal(false);
    setBudgetInput('');
  }

  const remaining = monthlyBudget ? monthlyBudget - spentThisMonth : 0;
  const daysLeft = days - day + 1;
  const pace = day / days;
  const ratio = monthlyBudget ? spentThisMonth / monthlyBudget : 0;
  const status = !monthlyBudget
    ? null
    : ratio > 1
      ? { tone: 'text-negative', text: 'Over budget for the month.' }
      : ratio > pace + 0.05
        ? { tone: 'text-caution', text: 'Spending faster than the month is passing.' }
        : { tone: 'text-positive', text: 'On track: spending is behind the calendar.' };

  return (
    <div className="h-full overflow-y-auto overscroll-contain">
      {/* phones: one column. Tablets and tall desktops: greeting and month side by side, the
          chart under them. Short desktops: the greeting over the chart on the left, the month
          on the right. On desktop it all fits the screen: the chart takes the height left. */}
      <div className="frame py-6 sm:py-8 lg:py-10 short:py-6 flex flex-col gap-6 md:grid md:grid-cols-12 md:gap-x-8 md:items-start lg:gap-x-12 lg:gap-y-8 short:gap-y-6 min-h-full lg:h-full lg:min-h-[560px] lg:grid-rows-[auto_minmax(0,1fr)]">
          <div className="md:col-span-7 short:col-span-8 min-w-0">
            <HeroStats />
          </div>

          {/* this month */}
          <section aria-labelledby="month-title" className="md:col-span-5 short:col-span-4 short:row-span-2 lg:self-start veil p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="month-title" className="eyebrow">
                  {monthLong(now.getMonth())} spending
                </h2>
                <p className="mt-2 text-[32px] sm:text-[36px] leading-none font-medium tracking-[-0.035em] text-ink">
                  <AnimatedAmount value={spentThisMonth} currency="UZS" split />
                </p>
              </div>
              {monthlyBudget ? (
                <Button size="sm" variant="quiet" onClick={openBudgetModal} data-action="edit-budget" icon={<IconEdit className="w-4 h-4" />} className="-mr-2 -mt-1">
                  Budget
                </Button>
              ) : null}
            </div>

            {monthlyBudget ? (
              <>
                <div className="mt-6">
                  <BudgetMeter spent={spentThisMonth} budget={monthlyBudget} day={day} days={days} />
                </div>
                <dl className="mt-5 grid grid-cols-[repeat(2,minmax(0,1fr))] gap-4 pt-5 border-t border-line">
                  <div className="min-w-0">
                    <dt className="text-xs text-ink-3">{remaining >= 0 ? 'Left this month' : 'Over by'}</dt>
                    <dd className={`mt-1 text-base font-medium ${remaining >= 0 ? 'text-ink' : 'text-negative'}`}>
                      <Amount value={Math.abs(remaining)} currency="UZS" />
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-ink-3">Of a budget of</dt>
                    <dd className="mt-1 text-base font-medium text-ink">
                      <Amount value={monthlyBudget} currency="UZS" />
                    </dd>
                  </div>
                  {remaining > 0 && (
                    <div className="col-span-2 text-xs text-ink-3">
                      About <span className="text-ink-2 tnum">{compact(remaining / daysLeft)} UZS</span> a day for the {daysLeft} days left.
                    </div>
                  )}
                </dl>
                {status && <p className={`mt-4 text-sm ${status.tone}`}>{status.text}</p>}
              </>
            ) : (
              <div className="mt-6 pt-5 border-t border-line">
                <p className="text-sm text-ink-2">No budget for {monthLong(now.getMonth())} yet. Set one to see how the month is pacing.</p>
                <Button variant="primary" className="mt-4" onClick={openBudgetModal} data-action="edit-budget" icon={<IconPlus className="w-4 h-4" />}>
                  Set a budget
                </Button>
              </div>
            )}
          </section>

        {/* spending over time */}
        <section aria-labelledby="chart-title" className="md:col-span-12 short:col-span-8 lg:self-stretch veil p-5 sm:p-6 flex flex-col flex-1 min-h-[320px] sm:min-h-[360px] lg:min-h-0">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 mb-5">
            <div className="min-w-0">
              <h2 id="chart-title" className="eyebrow">Spending</h2>
              <p className="mt-2 text-sm text-ink-2">
                {periodLabel} · <Amount value={chart.total} currency="UZS" className="text-ink font-medium" />
              </p>
            </div>
            <Segmented value={granularity} options={GRANULARITY} onChange={setGranularity} label="Period" size="sm" className="w-full sm:w-auto" />
          </div>
          <div className="flex-1 min-h-[200px] lg:min-h-[160px] -mx-1">
            <SpendingChart
              data={chart.data}
              ticks={chart.ticks}
              tips={chart.tips}
              reference={reference}
              overTone={granularity === 'DAY' ? 'caution' : 'negative'}
              currency="UZS"
              label={`Spending, ${periodLabel.toLowerCase()}`}
            />
          </div>
          {reference && (
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-2xs text-ink-3" aria-label="Legend">
              <li className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm bg-ink" />{granularity === 'DAY' ? 'Today' : 'This month'}</li>
              {granularity === 'DAY' ? (
                <>
                  <li className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm bg-caution" />Over allowance</li>
                  <li className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm bg-negative" />Over twice the allowance</li>
                </>
              ) : (
                <li className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm bg-negative" />Over budget</li>
              )}
              <li className="inline-flex items-center gap-2"><span className="w-4 border-t border-dashed border-ink/60" />{reference.label}</li>
            </ul>
          )}
        </section>
      </div>

      <Modal
        isOpen={showBudgetModal}
        onClose={() => setShowBudgetModal(false)}
        title="Monthly budget"
        description={`${monthLong(now.getMonth())} ${now.getFullYear()}`}
        size="sm"
        footer={
          <>
            <Button onClick={() => setShowBudgetModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSaveBudget} data-action="save-budget">
              Save budget
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSaveBudget();
          }}
        >
          <Field label="Amount" htmlFor="budget-amount" hint="Leave empty to remove this month's budget.">
            <AmountInput
              id="budget-amount"
              type="number"
              inputMode="numeric"
              value={budgetInput}
              onChange={(e) => {
                setBudgetInput(e.target.value);
                setBudgetError('');
              }}
              placeholder="2000000"
              currency="UZS"
            />
          </Field>
          <FieldError message={budgetError} className="mt-4" />
        </form>
      </Modal>
    </div>
  );
}
