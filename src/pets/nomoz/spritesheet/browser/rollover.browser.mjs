/*
 * Nomoz's mood across a calendar-month boundary, in real Chromium with a
 * controllable clock (Playwright's page.clock), in normal and reduced motion.
 *
 *   npm run test:browser
 *
 * Nothing mutates the finance store at the boundary: the mood must change
 * because "this month" changed. With CI=true a missing browser is an error.
 */
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED, loadPlaywright, startVite } from './support.mjs';

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
  dev = await startVite(false);
});

after(async () => {
  await browser?.close();
  await dev?.server.close();
});

async function open({ reduced }) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.clock.install({ time: new Date('2026-01-31T23:58:00') });
  await page.goto(dev.url);
  await page.clock.resume();
  await page.waitForSelector('canvas.nomoz-canvas[data-mood]', { state: 'attached', timeout: 45000 });
  const run = (src, arg) =>
    page.evaluate(
      async ([src, arg]) => {
        const m = await import('/nozima-finance/src/hooks/useFinanceStore.js');
        return new Function('S', 'arg', `return (async () => { ${src} })()`)(m.default, arg);
      },
      [src, arg]
    );
  const moods = () => page.evaluate(() => [...document.querySelectorAll('canvas.nomoz-canvas[data-mood]')].map((c) => c.dataset.mood).join('+'));
  const settleOn = async (want, tries = 40) => {
    let m;
    for (let i = 0; i < tries; i++) {
      m = await moods();
      if (m === want) return m;
      await page.waitForTimeout(250);
    }
    return m;
  };
  const tx = (id, type, amount) => ({ id, date: '31-01-2026', type, amount, currency: 'UZS', accountId: 'acc1', toAccountId: null, category: type === 'INCOME' ? 'SALARY' : 'FOOD', note: '', imageData: null, createdAt: new Date().toISOString(), exchangeRate: null });
  await run("await S.getState().addAccount({ id: 'acc1', name: 'MAIN', type: 'BANK', currency: 'UZS', balance: 0, createdAt: new Date().toISOString() })");
  await run('await S.getState().addTransaction(arg, true)', tx('i1', 'INCOME', 10000000));
  return { ctx, page, errors, run, settleOn, tx, moods };
}

for (const reduced of [false, true]) {
  const label = reduced ? 'reduced motion' : 'normal motion';

  test(`${label}: January's content mood becomes idle in February without any store change (timer path)`, async (t) => {
    if (skipReason) return t.skip(skipReason);
    const s = await open({ reduced });
    assert.equal(await s.settleOn('content'), 'content');
    // within the month nothing changes
    await s.page.clock.fastForward('00:01:00'); // 23:59:xx, still January
    assert.equal(await s.settleOn('content', 8), 'content', 'mood changed before the month did');
    await s.page.clock.fastForward('00:02:00'); // past midnight: only the month timer can notice
    assert.equal(await s.settleOn('idle'), 'idle', 'mood is stale after the month rolled over');
    assert.deepEqual(s.errors, []);
    await s.ctx.close();
  });

  test(`${label}: a stressed January becomes idle in February (no February budget), via a clock jump and wake`, async (t) => {
    if (skipReason) return t.skip(skipReason);
    const s = await open({ reduced });
    await s.run('await S.getState().setMonthlyBudget(arg, 1000000)', '2026-01');
    await s.run('await S.getState().addTransaction(arg, true)', s.tx('e1', 'EXPENSE', 1500000));
    assert.equal(await s.settleOn('stressed'), 'stressed');
    // the machine slept through midnight: the clock jumps, no timer fires, the page is woken
    await s.page.clock.setSystemTime(new Date('2026-02-01T08:00:00'));
    await s.page.evaluate(() => window.dispatchEvent(new Event('focus')));
    assert.equal(await s.settleOn('idle'), 'idle', 'mood is stale after the clock jumped into February');
    assert.deepEqual(s.errors, []);
    await s.ctx.close();
  });
}
