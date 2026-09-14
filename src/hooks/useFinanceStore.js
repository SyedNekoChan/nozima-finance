import { create } from 'zustand';
import {
  generateId,
  saveTransaction,
  deleteTransaction,
  getAllTransactions,
  saveAccount,
  deleteAccount,
  getAllAccounts,
  getSetting,
  setSetting,
} from '../lib/db.js';
import { DEFAULT_EXCHANGE_RATES } from '../lib/constants.js';
import { convertToBase } from '../lib/currency.js';
import { getCurrentMonthKey, getDaysInCurrentMonth } from '../lib/date.js';

// DD-MM-YYYY -> comparable timestamp (matches the parsing pattern already used in Ledger.jsx)
function parseDateToTimestamp(dateStr) {
  const [d, m, y] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

const useFinanceStore = create((set, get) => ({
  transactions: [],
  accounts: [],
  budgets: {},
  exchangeRates: {},
  activeTab: 'DASHBOARD',
  anomalyEvent: null,
  isLoaded: false,
  // set by DailyLogModal's "+ ADD ENTRY FOR THIS DAY"; Ledger reads it once on
  // mount to prefill PunchCard, then clears it so it doesn't stick around
  pendingLedgerDate: null,
  // set by DailyLogModal's row-level EDIT; Ledger reads it once to open
  // PunchCard in true edit mode for that transaction, then clears it
  pendingEditTx: null,

  loadInitialData: async () => {
    const [transactions, accounts, budgets, exchangeRates] = await Promise.all([
      getAllTransactions(),
      getAllAccounts(),
      getSetting('budgets'),
      getSetting('exchangeRates'),
    ]);
    set({
      transactions, // getAllTransactions already returns date-descending
      accounts,
      budgets: budgets || {},
      exchangeRates: exchangeRates || DEFAULT_EXCHANGE_RATES,
      isLoaded: true,
    });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  setPendingLedgerDate: (dateString) => set({ pendingLedgerDate: dateString }),
  clearPendingLedgerDate: () => set({ pendingLedgerDate: null }),

  setPendingEditTx: (tx) => set({ pendingEditTx: tx }),
  clearPendingEditTx: () => set({ pendingEditTx: null }),

  addTransaction: async (tx) => {
    const record = { ...tx, id: tx.id || generateId() };
    await saveTransaction(record);
    const transactions = [record, ...get().transactions].sort(
      (a, b) => parseDateToTimestamp(b.date) - parseDateToTimestamp(a.date)
    );
    set({ transactions });

    let anomalyEvent = null;
    if (record.type === 'INCOME') anomalyEvent = { type: 'INCOME', id: record.id, accountId: record.accountId };
    else if (record.type === 'EXPENSE') anomalyEvent = { type: 'EXPENSE', id: record.id, accountId: record.accountId };
    else if (record.type === 'TRANSFER') anomalyEvent = { type: 'TRANSFER', id: record.id, accountId: record.accountId, toAccountId: record.toAccountId };

    // overspend check wins over the base event
    const budget = get().getMonthlyBudgetUZS();
    if (budget !== null && get().getSpentThisMonthInUZS() > budget) {
      anomalyEvent = { type: 'OVERSPEND', id: record.id, accountId: record.accountId };
    }
    set({ anomalyEvent });
  },

  updateTransaction: async (tx) => {
    await saveTransaction(tx);
    const transactions = get()
      .transactions.map((t) => (t.id === tx.id ? tx : t))
      .sort((a, b) => parseDateToTimestamp(b.date) - parseDateToTimestamp(a.date));
    set({ transactions });

    let anomalyEvent = null;
    if (tx.type === 'INCOME') anomalyEvent = { type: 'INCOME', id: tx.id, accountId: tx.accountId };
    else if (tx.type === 'EXPENSE') anomalyEvent = { type: 'EXPENSE', id: tx.id, accountId: tx.accountId };
    else if (tx.type === 'TRANSFER') anomalyEvent = { type: 'TRANSFER', id: tx.id, accountId: tx.accountId, toAccountId: tx.toAccountId };

    const budget = get().getMonthlyBudgetUZS();
    if (budget !== null && get().getSpentThisMonthInUZS() > budget) {
      anomalyEvent = { type: 'OVERSPEND', id: tx.id, accountId: tx.accountId };
    }
    set({ anomalyEvent });
  },

  deleteTransaction: async (id) => {
    await deleteTransaction(id);
    set({ transactions: get().transactions.filter((t) => t.id !== id) });
  },

  addAccount: async (account) => {
    const record = { ...account, id: account.id || generateId() };
    await saveAccount(record);
    set({ accounts: [...get().accounts, record] });
  },

  updateAccount: async (account) => {
    await saveAccount(account);
    set({ accounts: get().accounts.map((a) => (a.id === account.id ? account : a)) });
  },

  deleteAccount: async (id) => {
    await deleteAccount(id);
    set({ accounts: get().accounts.filter((a) => a.id !== id) });
  },

  setMonthlyBudget: async (month, amountInUZS) => {
    const budgets = { ...get().budgets, [month]: amountInUZS };
    await setSetting('budgets', budgets);
    set({ budgets });
  },

  setExchangeRate: async (code, rate) => {
    const exchangeRates = { ...get().exchangeRates, [code]: rate };
    await setSetting('exchangeRates', exchangeRates);
    set({ exchangeRates });
  },

  clearAnomalyEvent: () => set({ anomalyEvent: null }),

  getTotalBalanceInUZS: () => {
    const { accounts, exchangeRates } = get();
    return accounts.reduce(
      (sum, acc) => sum + convertToBase(acc.balance, acc.currency, exchangeRates),
      0
    );
  },

  getSpentThisMonthInUZS: () => {
    const { transactions, exchangeRates } = get();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-indexed, matches date.js formatting
    return transactions
      .filter((t) => {
        const [, mm, yyyy] = t.date.split('-').map(Number);
        return yyyy === year && mm === month && t.type === 'EXPENSE';
      })
      .reduce((sum, t) => sum + convertToBase(t.amount, t.currency, exchangeRates), 0);
  },

  getMonthlyBudgetUZS: () => {
    const { budgets } = get();
    const monthKey = getCurrentMonthKey();
    return monthKey in budgets ? budgets[monthKey] : null;
  },

  getDailyAllowanceUZS: () => {
    const budget = get().getMonthlyBudgetUZS();
    if (budget === null) return null;
    return budget / getDaysInCurrentMonth();
  },
}));

export default useFinanceStore;
