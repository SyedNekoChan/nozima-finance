/*
 * Currencies in the real app, Chromium: a manually entered currency code
 * gets a real rate from the rate service, is saved, survives a reload and is
 * converted with that one rate on every screen; a missing rate is never
 * guessed (amounts wait, and every screen with a UZS total says so); a code
 * the service does not know, or that is not a code at all, is refused.
 *
 *   npm run test:browser
 *
 * The rate service is replaced by a route that answers like open.er-api.com
 * (units of each currency per 1 UZS), so the test needs no network and can
 * take the service down and bring it back. With CI=true a missing browser is
 * an error.
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

// the service's answer: units of each currency per 1 UZS
const SERVICE = { result: 'success', base_code: 'UZS', rates: { UZS: 1, USD: 1 / 12650, EUR: 1 / 13800, GBP: 1 / 16000, CHF: 1 / 14500 } };

/*
 * A fresh app on its own origin storage, with the rate service under the
 * test's control (`net.up`), the requests to it counted, and the given data
 * written to the app's own database before it loads it.
 */
async function openApp({ up = true, seed = null, viewport = { width: 1440, height: 900 } } = {}) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const net = { up, calls: 0 };
  await ctx.route(/open\.er-api\.com/, (r) => {
    net.calls++;
    return net.up ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SERVICE) }) : r.abort('internetdisconnected');
  });
  const page = await ctx.newPage();
  const log = { errors: [] };
  page.on('pageerror', (e) => log.errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(m.text()) && log.errors.push(m.text()));
  await page.goto(dev.url);
  await page.waitForFunction(() => document.querySelector('[data-tab]'));
  if (seed) {
    await page.evaluate(async (seed) => {
      const { default: db } = await import('/nozima-finance/src/lib/db.js');
      await db.accounts.bulkPut(seed.accounts || []);
      await db.transactions.bulkPut(seed.transactions || []);
      if (seed.rates) await db.settings.put({ key: 'exchangeRates', value: seed.rates });
    }, seed);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[data-tab]'));
  }
  await page.waitForTimeout(400);
  return { ctx, page, net, log };
}

const store = (page) =>
  page.evaluate(async () => {
    const { default: s } = await import('/nozima-finance/src/hooks/useFinanceStore.js');
    const st = s.getState();
    return {
      rates: st.exchangeRates,
      total: st.getTotalBalanceInUZS(),
      spent: st.getSpentThisMonthInUZS(),
      ledger: st.getLedgerTotalsInUZS(),
      accounts: Object.fromEntries(st.accounts.map((a) => [a.name, a])),
    };
  });

const tab = (page, key) => page.locator(`[data-tab="${key}"]:visible`).click();
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const text = (page) => page.evaluate(() => document.querySelector('main').innerText.replace(/\s+/g, ' '));
const notice = (page) => page.locator('[data-rate-notice]:visible').count();
const settle = (page) => page.waitForTimeout(500); // figures ease in (0 ms under reduced motion) and React settles

const pad = (n) => String(n).padStart(2, '0');
const today = () => {
  const d = new Date();
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
};
const MAIN = { id: 'main', name: 'MAIN', type: 'BANK', currency: 'UZS', balance: 1000000, createdAt: '2026-01-01T00:00:00Z' };

async function newAccount(page, name, code) {
  await tab(page, 'ACCOUNTS');
  await page.locator('[data-action="new-account"]:visible').click();
  await page.locator('#account-name').fill(name);
  await page.getByRole('button', { name: 'Other' }).click();
  await page.locator('#account-code').fill(code);
  await page.locator('[data-action="save-account"]').click();
}

guard('a manually entered code is fetched once, saved, survives a reload, and every screen converts with that rate', async () => {
  const { ctx, page, net, log } = await openApp({ seed: { accounts: [MAIN] } });
  try {
    await newAccount(page, 'abroad', 'gbp'); // typed in lower case: the field upper-cases it
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    let s = await store(page);
    assert.equal(s.accounts.ABROAD.currency, 'GBP');
    assert.ok(Math.abs(s.rates.GBP - 16000) < 1e-6, `GBP rate ${s.rates.GBP}`);
    assert.equal(net.calls, 1, 'one request for the new code');

    // money in (Edit > Add money: an income entry in GBP) and money out (an expense in GBP, today)
    await page.locator('article[aria-label="ABROAD"] [data-action="edit-account"]').click();
    await page.locator('#adjust-amount').fill('100');
    await page.locator('[data-action="save-account"]').click();
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    await tab(page, 'LEDGER');
    await page.locator('[data-action="new-entry"]:visible').click();
    await page.locator('#entry-account').click();
    await page.getByRole('option', { name: /ABROAD/ }).click();
    await page.locator('#entry-amount').fill('10');
    await page.locator('[data-action="save-entry"]').click();
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    await settle(page);

    s = await store(page);
    // 1,000,000 UZS + (100 - 10) GBP at 16,000
    assert.equal(Math.round(s.total), 1000000 + 90 * 16000);
    assert.equal(Math.round(s.spent), 160000);
    assert.equal(Math.round(s.ledger.totalIn), 1600000);
    assert.equal(Math.round(s.ledger.totalOut), 160000);

    // every screen shows those same converted figures, and none of them says a rate is missing
    let t = await text(page);
    assert.ok(t.includes(fmt(1600000)) && t.includes(fmt(160000)), 'Ledger totals');
    await tab(page, 'DASHBOARD');
    await settle(page);
    t = await text(page);
    assert.ok(t.includes(fmt(1000000 + 90 * 16000)), 'Dashboard balance');
    assert.ok(t.includes(fmt(160000)), 'Dashboard month spending');
    await tab(page, 'ACCOUNTS');
    await settle(page);
    t = await text(page);
    assert.ok(t.includes(`≈ ${fmt(90 * 16000)}`), 'Accounts: the UZS equivalent of 90 GBP');
    await tab(page, 'CALENDAR');
    await settle(page);
    const label = await page.locator(`[data-day="${today()}"]`).getAttribute('aria-label');
    assert.ok(label.includes(`${fmt(160000)} UZS spent`), label);
    assert.equal(await notice(page), 0);

    // reload: the rate is the saved one, the service is not asked again, the figures are the same
    const before = net.calls;
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[data-tab]'));
    await page.waitForTimeout(800);
    const r = await store(page);
    assert.ok(Math.abs(r.rates.GBP - 16000) < 1e-6);
    assert.equal(net.calls, before, 'the saved rate is used after a reload');
    assert.equal(Math.round(r.total), Math.round(s.total));
    assert.equal(Math.round(r.spent), Math.round(s.spent));
    assert.deepEqual(log.errors, []);
  } finally {
    await ctx.close();
  }
});

guard('with the rate service down nothing is guessed: every screen says so, and the rate arrives when it is back, without a reload', async () => {
  const abroad = { id: 'gb', name: 'ABROAD', type: 'BANK', currency: 'GBP', balance: 100, createdAt: '2026-01-01T00:00:00Z' };
  const spend = { id: 't1', date: today(), type: 'EXPENSE', amount: 10, currency: 'GBP', accountId: 'gb', toAccountId: null, category: 'OTHER', note: 'tea', imageData: null, createdAt: new Date().toISOString(), exchangeRate: null };
  const { ctx, page, net, log } = await openApp({ up: false, seed: { accounts: [MAIN, abroad], transactions: [spend] } });
  try {
    await page.waitForFunction(() => document.querySelector('[data-rate-notice]'), null, { timeout: 8000 });
    let s = await store(page);
    assert.equal(s.rates.GBP, undefined, 'no rate was invented');
    assert.equal(Math.round(s.total), 1000000, 'GBP is left out of the UZS total, not converted at a made-up rate');
    for (const key of ['DASHBOARD', 'LEDGER', 'CALENDAR', 'ACCOUNTS']) {
      await tab(page, key);
      await settle(page);
      const n = await page.locator('[data-rate-notice]:visible').innerText();
      assert.ok(/No exchange rate for GBP yet/.test(n) && /left out of UZS totals/.test(n), `${key}: ${n}`);
    }
    assert.ok(await page.locator('article[aria-label="ABROAD"] [data-no-rate]').isVisible(), 'the account says it has no UZS rate (not "≈ 0")');

    // the service comes back and the device says it is online again: the rate arrives, everything updates
    net.up = true;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForFunction(() => !document.querySelector('[data-rate-notice]'), null, { timeout: 8000 });
    await settle(page);
    s = await store(page);
    assert.ok(Math.abs(s.rates.GBP - 16000) < 1e-6);
    assert.equal(Math.round(s.total), 1000000 + 100 * 16000);
    assert.equal(Math.round(s.spent), 160000);
    assert.ok((await text(page)).includes(`≈ ${fmt(100 * 16000)}`));
    assert.ok(net.calls >= 2);
    assert.deepEqual(log.errors, []);
  } finally {
    await ctx.close();
  }
});

guard('a code the rate service does not know, or that is not a code, is refused with the reason', async () => {
  const { ctx, page, log } = await openApp({ seed: { accounts: [MAIN] } });
  try {
    await newAccount(page, 'odd', 'xyz');
    await page.waitForSelector('[role="alert"]');
    assert.match(await page.locator('[role="alert"]').innerText(), /doesn't recognise XYZ/);
    await page.locator('#account-code').fill('g8p');
    await page.locator('[data-action="save-account"]').click();
    await page.waitForFunction(() => /three letters/.test(document.querySelector('[role="alert"]')?.innerText || ''));
    const s = await store(page);
    assert.equal(s.accounts.ODD, undefined, 'nothing was created');

    // changing an existing account to an unknown code is refused too, and its balance is untouched
    await page.keyboard.press('Escape');
    await page.locator('article[aria-label="MAIN"] [data-action="edit-account"]').click();
    await page.locator('#edit-currency').fill('XYZ');
    await page.locator('[data-action="save-account"]').click();
    await page.waitForSelector('[role="alert"]');
    assert.match(await page.locator('[role="alert"]').innerText(), /doesn't recognise XYZ/);
    const after = await store(page);
    assert.equal(after.accounts.MAIN.currency, 'UZS');
    assert.equal(after.accounts.MAIN.balance, 1000000);
    assert.deepEqual(log.errors, []);
  } finally {
    await ctx.close();
  }
});

guard('a rate change reaches every total at once; presets need no request; transfer rates keep their precision', async () => {
  const abroad = { id: 'gb', name: 'ABROAD', type: 'BANK', currency: 'GBP', balance: 100, createdAt: '2026-01-01T00:00:00Z' };
  const dollars = { id: 'us', name: 'DOLLARS', type: 'BANK', currency: 'USD', balance: 10, createdAt: '2026-01-01T00:00:00Z' };
  const { ctx, page, net, log } = await openApp({ seed: { accounts: [MAIN, abroad, dollars], rates: { USD: 12650, EUR: 13800, RUB: 140, KZT: 25, TRY: 390, UZS: 1, GBP: 16000 } } });
  try {
    assert.equal(net.calls, 0, 'every currency already has a rate: no request');
    let s = await store(page);
    assert.equal(Math.round(s.total), 1000000 + 1600000 + 126500);

    // a new rate for GBP (as the rate service would store it): the totals follow without a reload
    await page.evaluate(async () => {
      const { default: st } = await import('/nozima-finance/src/hooks/useFinanceStore.js');
      await st.getState().setExchangeRate('GBP', 17000);
    });
    await tab(page, 'DASHBOARD');
    await settle(page);
    s = await store(page);
    assert.equal(Math.round(s.total), 1000000 + 1700000 + 126500);
    assert.ok((await text(page)).includes(fmt(1000000 + 1700000 + 126500)), 'Dashboard follows the new rate');
    await tab(page, 'ACCOUNTS');
    await settle(page);
    assert.ok((await text(page)).includes(`≈ ${fmt(1700000)}`), 'Accounts follows the new rate');

    // UZS -> USD: the suggested rate is 1/12650 to six significant digits, not 0.0001
    await page.locator('article[aria-label="MAIN"] [data-action="transfer-account"]').click();
    await page.locator('[role="dialog"]').getByRole('button', { name: /DOLLARS/ }).click();
    await page.waitForSelector('#transfer-rate');
    assert.equal(await page.locator('#transfer-rate').inputValue(), '0.0000790514');
    await page.locator('#transfer-amount').fill('1000000');
    await page.locator('[data-action="confirm-transfer"]').click();
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    s = await store(page);
    assert.ok(Math.abs(s.accounts.DOLLARS.balance - (10 + 79.0514)) < 0.001, `USD received: ${s.accounts.DOLLARS.balance}`);
    assert.equal(s.accounts.MAIN.balance, 0);
    assert.deepEqual(log.errors, []);
  } finally {
    await ctx.close();
  }
});
