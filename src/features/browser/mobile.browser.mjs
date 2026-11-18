/*
 * Phones in the real app, Chromium: the month fits the first screen; money of
 * any size stays on screen with every digit; sheets are swiped away (or
 * dismissed by a tap outside) and spring back from a half-hearted swipe;
 * touch screens show no scrollbars while mouse screens keep theirs.
 *
 *   npm run test:browser
 *
 * Touches are real ones (CDP Input.dispatchTouchEvent), so native scrolling
 * and the sheet's own gesture handling are both exercised. With CI=true a
 * missing browser is an error.
 */
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED, loadPlaywright, startVite } from '../../pets/nomoz/spritesheet/browser/support.mjs';

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

const guard = (name, fn) =>
  test(name, async (t) => {
    if (skipReason) return t.skip(skipReason);
    await fn(t);
  });

const pad = (n) => String(n).padStart(2, '0');
const dayString = (d) => `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;

async function openApp({ viewport, phone = true, accounts = [], transactions = [], budget = null }) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'no-preference', ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  await ctx.route(/open\.er-api\.com/, (r) => r.abort('internetdisconnected'));
  const page = await ctx.newPage();
  const log = { errors: [] };
  page.on('pageerror', (e) => log.errors.push(String(e)));
  await page.goto(dev.url);
  await page.waitForFunction(() => document.querySelector('[data-tab]'));
  await page.evaluate(async ({ accounts, transactions, budget }) => {
    const { default: db } = await import('/nozima-finance/src/lib/db.js');
    const { getCurrentMonthKey } = await import('/nozima-finance/src/lib/date.js');
    await db.accounts.bulkPut(accounts);
    await db.transactions.bulkPut(transactions);
    await db.settings.put({ key: 'exchangeRates', value: { UZS: 1, USD: 12650, EUR: 13800, RUB: 140, KZT: 25, TRY: 390 } });
    if (budget) await db.settings.put({ key: 'budgets', value: { [getCurrentMonthKey()]: budget } });
  }, { accounts, transactions, budget });
  await page.reload();
  await page.waitForFunction(() => document.querySelector('[data-tab]'));
  await page.waitForTimeout(700);
  return { ctx, page, log };
}

const tab = async (page, key) => {
  await page.locator(`[data-tab="${key}"]:visible`).click();
  await page.waitForTimeout(600);
};

const ACCOUNT = { id: 'a', name: 'MAIN', type: 'BANK', currency: 'UZS', balance: 1000000, createdAt: '2026-01-01T00:00:00Z' };

guard('phones: the whole month, last week included, is on the first screen, with cells about as tall as they are wide', async () => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    const { ctx, page, log } = await openApp({ viewport, accounts: [ACCOUNT] });
    try {
      await tab(page, 'CALENDAR');
      const r = await page.evaluate(() => {
        const days = [...document.querySelectorAll('[data-day]')];
        const first = days[0].getBoundingClientRect();
        const last = days[days.length - 1].getBoundingClientRect();
        const main = document.querySelector('main').getBoundingClientRect();
        return { w: first.width, h: first.height, lastBottom: last.bottom, mainBottom: main.bottom, count: days.length };
      });
      assert.ok(r.count >= 28, 'every date is there');
      assert.ok(r.lastBottom <= r.mainBottom, `${viewport.width}x${viewport.height}: last week ends at ${r.lastBottom}, screen at ${r.mainBottom}`);
      assert.ok(r.h <= r.w * 1.1 + 1, `${viewport.width}: cells stretched ${r.w}x${r.h}`);
      assert.ok(r.h >= 36, `${viewport.width}: cells too small ${r.h}`);
      assert.deepEqual(log.errors, []);
    } finally {
      await ctx.close();
    }
  }
});

guard('money of any size stays on screen with every digit, never split between digits', async () => {
  const today = dayString(new Date());
  const accounts = [
    { id: 'a', name: 'MAIN_BANK_OF_UZBEKISTAN_SAVINGS', type: 'BANK', currency: 'UZS', balance: 123456789012345, createdAt: 'x' },
    { id: 'u', name: 'USD', type: 'BANK', currency: 'USD', balance: 9876543210.99, createdAt: 'x' },
    { id: 'd', name: 'CARD', type: 'DEBT', currency: 'UZS', balance: -987654321000, liabilityV2: true, createdAt: 'x' },
  ];
  const tx = (id, type, amount, currency, accountId) => ({ id, date: today, type, amount, currency, accountId, toAccountId: null, category: 'OTHER', note: 'big', imageData: null, createdAt: new Date().toISOString(), exchangeRate: null });
  const transactions = [tx('t1', 'EXPENSE', 45678901234567, 'UZS', 'a'), tx('t2', 'INCOME', 99999999999999, 'UZS', 'a'), tx('t3', 'EXPENSE', 1234567890.12, 'USD', 'u')];
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
    const { ctx, page, log } = await openApp({ viewport, accounts, transactions, budget: 50000000000000 });
    try {
      for (const key of ['DASHBOARD', 'LEDGER', 'CALENDAR', 'ACCOUNTS']) {
        await tab(page, key);
        const bad = await page.evaluate(() => {
          const vw = document.documentElement.clientWidth;
          const issues = [];
          for (const el of document.querySelectorAll('main span[title]')) {
            if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') continue;
            const r = el.getBoundingClientRect();
            if (r.right > vw + 0.5 || r.left < -0.5) issues.push(`off screen: ${el.title}`);
            if (el.scrollWidth > el.clientWidth + 1) issues.push(`runs out of its box: ${el.title}`);
            // all the digits of the exact amount are shown, in order
            const shown = el.textContent.replace(/[^\d]/g, '');
            if (shown !== el.title.replace(/[^\d]/g, '')) issues.push(`digits missing: ${el.title} shows ${el.textContent}`);
            // a line may only break after a comma (a digit group) or before the code, never between two digits
            const node = el.firstElementChild?.firstChild;
            if (node && node.nodeType === 3) {
              const t = node.textContent;
              const range = document.createRange();
              let lastTop = null;
              for (let i = 0; i < t.length; i++) {
                range.setStart(node, i);
                range.setEnd(node, i + 1);
                const rr = range.getClientRects()[0];
                if (!rr || !/\d/.test(t[i])) continue;
                if (lastTop !== null && rr.top > lastTop + 2 && /\d/.test(t[i - 1] || '')) issues.push(`split between digits: ${el.title}`);
                lastTop = rr.top;
              }
            }
          }
          if (document.documentElement.scrollWidth > vw) issues.push('page scrolls sideways');
          return issues;
        });
        assert.deepEqual(bad, [], `${viewport.width} ${key}`);
      }
      assert.deepEqual(log.errors, []);
    } finally {
      await ctx.close();
    }
  }
});

guard('phone sheets: no close button; a swipe down dismisses, a short one springs back and keeps the input, a tap outside dismisses', async () => {
  const { ctx, page, log } = await openApp({ viewport: { width: 390, height: 844 }, accounts: [ACCOUNT], budget: 6000000 });
  const cdp = await ctx.newCDPSession(page);
  const swipe = async (dy, { steps = 12, delay = 16 } = {}) => {
    const y0 = (await page.locator('[data-sheet]').boundingBox()).y + 12;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: y0 }] });
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: y0 + (dy * i) / steps }] });
      await page.waitForTimeout(delay);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  try {
    await page.locator('[data-action="edit-budget"]:visible').click();
    await page.waitForSelector('[role="dialog"]');
    assert.equal(await page.locator('[role="dialog"] [data-action="close"]').isVisible(), false, 'no close button on a touch phone');
    await page.locator('#budget-amount').fill('4242');
    await swipe(40, { steps: 8, delay: 40 });
    await page.waitForTimeout(500);
    assert.equal(await page.locator('[role="dialog"]').count(), 1, 'a short swipe springs back');
    assert.equal(await page.locator('#budget-amount').inputValue(), '4242', 'and keeps what was typed');
    await swipe(320);
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), null, { timeout: 3000 });
    const budget = await page.evaluate(async () => (await import('/nozima-finance/src/hooks/useFinanceStore.js')).default.getState().getMonthlyBudgetUZS());
    assert.equal(budget, 6000000, 'dismissing saves nothing');

    await page.locator('[data-action="edit-budget"]:visible').click();
    await page.waitForSelector('[role="dialog"]');
    await page.waitForTimeout(300);
    await page.touchscreen.tap(195, 60);
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), null, { timeout: 3000 });
    assert.deepEqual(log.errors, []);
  } finally {
    await ctx.close();
  }
});

guard('desktop keeps the close button; touch screens hide scrollbars, mouse screens keep them', async () => {
  const d = await openApp({ viewport: { width: 1440, height: 900 }, phone: false, accounts: [ACCOUNT], budget: 6000000 });
  try {
    await d.page.locator('[data-action="edit-budget"]:visible').click();
    await d.page.waitForSelector('[role="dialog"]');
    assert.equal(await d.page.locator('[role="dialog"] [data-action="close"]').isVisible(), true);
    await d.page.locator('[role="dialog"] [data-action="close"]').click();
    await d.page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    assert.equal(await d.page.evaluate(() => getComputedStyle(document.querySelector('main div.overflow-y-auto')).scrollbarWidth), 'auto');
  } finally {
    await d.ctx.close();
  }
  const p = await openApp({ viewport: { width: 390, height: 844 }, accounts: [ACCOUNT] });
  try {
    const r = await p.page.evaluate(() => {
      const el = document.querySelector('main div.overflow-y-auto');
      el.scrollTop = 200;
      return { width: getComputedStyle(el).scrollbarWidth, scrolled: el.scrollTop > 0 };
    });
    assert.equal(r.width, 'none', 'no scrollbar on a touch screen');
    assert.ok(r.scrolled, 'and it still scrolls');
  } finally {
    await p.ctx.close();
  }
});
