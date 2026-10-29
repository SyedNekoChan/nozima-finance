/*
 * Nomoz's mood follows the live application state, in real Chromium.
 *
 *   npm run test:browser
 *
 * Drives the real finance store (its own actions: addAccount, addTransaction,
 * setMonthlyBudget, deleteTransaction, the same ones the UI calls) in a
 * running session and watches the pet canvas's data-mood. No reload and no
 * mood override. With CI=true a missing browser is an error.
 */
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED, loadPlaywright, openAt, sampleCanvas, startVite } from './support.mjs';

let skipReason = null;
let browser = null;
let dev = null;
const unavailable = (why) => {
  if (REQUIRED) throw new Error(`browser tests are required but cannot run: ${why}`);
  skipReason = why;
};

before(async () => {
  const pw = loadPlaywright();
  if (!pw) return void unavailable('playwright is not installed');
  try {
    browser = await pw.chromium.launch();
  } catch (err) {
    return void unavailable(`Chromium could not launch: ${String(err.message).split('\n')[0]}`);
  }
  dev = await startVite();
});

after(async () => {
  await browser?.close();
  await dev?.server.close();
});

test('mood follows live store changes: idle, content, stressed, back, without a reload', async (t) => {
  if (skipReason) return t.skip(skipReason);
  const { ctx, page, log } = await openAt(browser, dev.url, { viewport: { width: 1280, height: 800 } });
  const run = (src, arg) =>
    page.evaluate(
      async ([src, arg]) => {
        const m = await import('/nozima-finance/src/hooks/useFinanceStore.js');
        return new Function('S', 'arg', `return (async () => { ${src} })()`)(m.default, arg);
      },
      [src, arg]
    );
  const moods = () => page.evaluate(() => [...document.querySelectorAll('canvas.nomoz-canvas[data-mood]')].map((c) => c.dataset.mood));
  // the canvas swaps with a cross-fade when the look changes, so wait for it to settle on the expected mood
  const settleOn = async (want) => {
    for (let i = 0; i < 40; i++) {
      const m = await moods();
      if (m.length >= 1 && m.every((x) => x === want)) return m;
      await page.waitForTimeout(250);
    }
    return moods();
  };

  const now = new Date();
  const today = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const tx = (id, type, amount) => ({ id, date: today, type, amount, currency: 'UZS', accountId: 'acc1', toAccountId: null, category: type === 'INCOME' ? 'SALARY' : 'FOOD', note: '', imageData: null, createdAt: new Date().toISOString(), exchangeRate: null });
  const add = (id, type, amount) => run('await S.getState().addTransaction(arg, true)', tx(id, type, amount));
  const loadedBefore = await page.evaluate(() => performance.timeOrigin);

  assert.deepEqual(await settleOn('idle'), ['idle'], 'an empty store is idle');

  await run("await S.getState().addAccount({ id: 'acc1', name: 'MAIN', type: 'BANK', currency: 'UZS', balance: 0, createdAt: new Date().toISOString() })");
  await add('t1', 'INCOME', 10000000);
  assert.deepEqual(await settleOn('content'), ['content'], 'strong savings this month is content');

  await run('await S.getState().setMonthlyBudget(arg, 1000000)', month);
  await add('t2', 'EXPENSE', 1500000);
  assert.deepEqual(await settleOn('stressed'), ['stressed'], 'spending past the budget is stressed');



  await run('await S.getState().setMonthlyBudget(arg, 90000000)', month);
  assert.deepEqual(await settleOn('content'), ['content'], 'raising the budget recovers to content');

  await add('t3', 'EXPENSE', 6500000);
  assert.deepEqual(await settleOn('idle'), ['idle'], 'saving less than 30% of income is idle');

  await run("await S.getState().deleteTransaction('t3')");
  assert.deepEqual(await settleOn('content'), ['content'], 'deleting the expense restores content');

  // the same page the whole time, the pet still drawing, nothing thrown
  assert.equal(await page.evaluate(() => performance.timeOrigin), loadedBefore, 'the page did not reload');
  let last = await sampleCanvas(page);
  for (let i = 0; i < 40 && !(last && last.n > 100); i++) {
    await page.waitForTimeout(250);
    last = await sampleCanvas(page);
  }
  assert.ok(last && last.n > 100, 'the pet is drawn after the transitions');
  assert.deepEqual(log.errors, []);
  await ctx.close();
});
