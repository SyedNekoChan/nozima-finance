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
import {
  getCurrentMonthKey,
  getDaysInCurrentMonth,
} from '../lib/date.js';

// DD-MM-YYYY -> comparable timestamp
function parseDateToTimestamp(dateStr) {
  const [d, m, y] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

// Remove duplicate records by ID while preserving first occurrence.
function uniqueById(records) {
  const seen = new Set();

  return records.filter((record) => {
    if (!record?.id || seen.has(record.id)) {
      return false;
    }

    seen.add(record.id);
    return true;
  });
}

/*
 * Returns the balance effect of an INCOME or EXPENSE transaction.
 *
 * INCOME  = positive
 * EXPENSE = negative
 * TRANSFER = 0
 *
 * Transfers are intentionally handled by TransferModal because they
 * affect two separate accounts.
 */
function getTransactionBalanceDelta(tx) {
  if (!tx) {
    return 0;
  }

  if (tx.type === 'INCOME') {
    return Number(tx.amount) || 0;
  }

  if (tx.type === 'EXPENSE') {
    return -(Number(tx.amount) || 0);
  }

  return 0;
}

const useFinanceStore = create((set, get) => ({
  transactions: [],
  accounts: [],
  budgets: {},
  exchangeRates: {},

  activeTab: 'DASHBOARD',

  anomalyEvent: null,

  isLoaded: false,

  /*
   * Explicit deletion state used by useSync.
   */
  deletedAccountIds: [],
  deletedTransactionIds: [],

  pendingLedgerDate: null,
  pendingEditTx: null,

  loadInitialData: async () => {
    const [
      transactions,
      accounts,
      budgets,
      exchangeRates,
    ] = await Promise.all([
      getAllTransactions(),
      getAllAccounts(),
      getSetting('budgets'),
      getSetting('exchangeRates'),
    ]);

    set({
      transactions: uniqueById(transactions),
      accounts: uniqueById(accounts),
      budgets: budgets || {},
      exchangeRates:
        exchangeRates ||
        DEFAULT_EXCHANGE_RATES,
      isLoaded: true,
    });
  },

  setActiveTab: (tab) =>
    set({
      activeTab: tab,
    }),

  setPendingLedgerDate: (dateString) =>
    set({
      pendingLedgerDate: dateString,
    }),

  clearPendingLedgerDate: () =>
    set({
      pendingLedgerDate: null,
    }),

  setPendingEditTx: (tx) =>
    set({
      pendingEditTx: tx,
    }),

  clearPendingEditTx: () =>
    set({
      pendingEditTx: null,
    }),

  /*
   * ================================================================
   * TRANSACTION CREATION
   * ================================================================
   *
   * updateBalance defaults to true for LOCAL transactions.
   *
   * useSync passes false when applying a remote transaction so the
   * remote transaction does not modify the account balance a second time.
   */
  addTransaction: async (
    tx,
    updateBalance = true
  ) => {
    const record = {
      ...tx,
      id: tx.id || generateId(),
    };

    await saveTransaction(record);

    /*
     * Add/upsert the transaction locally.
     */
    set((state) => {
      const existingIndex =
        state.transactions.findIndex(
          (t) => t.id === record.id
        );

      if (existingIndex !== -1) {
        const transactions = [
          ...state.transactions,
        ];

        transactions[existingIndex] =
          record;

        transactions.sort(
          (a, b) =>
            parseDateToTimestamp(b.date) -
            parseDateToTimestamp(a.date)
        );

        return {
          transactions,
        };
      }

      const transactions = [
        ...state.transactions,
        record,
      ];

      transactions.sort(
        (a, b) =>
          parseDateToTimestamp(b.date) -
          parseDateToTimestamp(a.date)
      );

      return {
        transactions,
      };
    });

    /*
     * Only locally-created transactions change the account balance.
     *
     * Transfers remain excluded here because TransferModal explicitly
     * updates both accounts.
     */
    if (
      updateBalance &&
      (
        record.type === 'INCOME' ||
        record.type === 'EXPENSE'
      )
    ) {
      const account =
        useFinanceStore
          .getState()
          .accounts
          .find(
            (a) =>
              a.id ===
              record.accountId
          );

      if (account) {
        const delta =
          getTransactionBalanceDelta(
            record
          );

        if (delta !== 0) {
          await get().updateAccount({
            ...account,
            balance:
              account.balance +
              delta,
          });
        }
      }
    }

    /*
     * Generate anomaly information.
     */
    let anomalyEvent = null;

    if (record.type === 'INCOME') {
      anomalyEvent = {
        type: 'INCOME',
        id: record.id,
        accountId:
          record.accountId,
      };
    } else if (
      record.type === 'EXPENSE'
    ) {
      anomalyEvent = {
        type: 'EXPENSE',
        id: record.id,
        accountId:
          record.accountId,
      };
    } else if (
      record.type === 'TRANSFER'
    ) {
      anomalyEvent = {
        type: 'TRANSFER',
        id: record.id,
        accountId:
          record.accountId,
        toAccountId:
          record.toAccountId,
      };
    }

    const budget =
      get().getMonthlyBudgetUZS();

    if (
      budget !== null &&
      get().getSpentThisMonthInUZS() >
        budget
    ) {
      anomalyEvent = {
        type: 'OVERSPEND',
        id: record.id,
        accountId:
          record.accountId,
      };
    }

    set({
      anomalyEvent,
    });
  },

  /*
   * ================================================================
   * TRANSACTION UPDATE
   * ================================================================
   *
   * For local edits:
   *
   * 1. Reverse the old transaction's effect.
   * 2. Apply the new transaction's effect.
   *
   * This correctly handles:
   *
   *   amount change
   *   type change
   *   account change
   *
   * For remote updates, updateBalance=false prevents any account
   * balance mutation because the account object itself is synchronized
   * separately.
   */
  updateTransaction: async (
    tx,
    updateBalance = true
  ) => {
    const oldTransaction =
      useFinanceStore
        .getState()
        .transactions.find(
          (t) => t.id === tx.id
        );

    await saveTransaction(tx);

    /*
     * Update transaction state.
     */
    set((state) => ({
      transactions:
        state.transactions
          .map((t) =>
            t.id === tx.id
              ? tx
              : t
          )
          .sort(
            (a, b) =>
              parseDateToTimestamp(
                b.date
              ) -
              parseDateToTimestamp(
                a.date
              )
          ),
    }));

    /*
     * Adjust balances only for LOCAL transaction edits.
     */
    if (
      updateBalance &&
      oldTransaction
    ) {
      const oldDelta =
        getTransactionBalanceDelta(
          oldTransaction
        );

      const newDelta =
        getTransactionBalanceDelta(
          tx
        );

      const oldAccount =
        useFinanceStore
          .getState()
          .accounts
          .find(
            (a) =>
              a.id ===
              oldTransaction.accountId
          );

      const newAccount =
        useFinanceStore
          .getState()
          .accounts
          .find(
            (a) =>
              a.id ===
              tx.accountId
          );

      /*
       * Same account.
       */
      if (
        oldAccount &&
        newAccount &&
        oldAccount.id ===
          newAccount.id
      ) {
        const netDelta =
          newDelta -
          oldDelta;

        if (netDelta !== 0) {
          await get().updateAccount({
            ...newAccount,
            balance:
              newAccount.balance +
              netDelta,
          });
        }
      } else {
        /*
         * Reverse old account effect.
         */
        if (
          oldAccount &&
          oldDelta !== 0
        ) {
          await get().updateAccount({
            ...oldAccount,
            balance:
              oldAccount.balance -
              oldDelta,
          });
        }

        /*
         * Apply new account effect.
         */
        if (
          newAccount &&
          newDelta !== 0
        ) {
          await get().updateAccount({
            ...newAccount,
            balance:
              newAccount.balance +
              newDelta,
          });
        }
      }
    }

    /*
     * Anomaly event.
     */
    let anomalyEvent = null;

    if (tx.type === 'INCOME') {
      anomalyEvent = {
        type: 'INCOME',
        id: tx.id,
        accountId:
          tx.accountId,
      };
    } else if (
      tx.type === 'EXPENSE'
    ) {
      anomalyEvent = {
        type: 'EXPENSE',
        id: tx.id,
        accountId:
          tx.accountId,
      };
    } else if (
      tx.type === 'TRANSFER'
    ) {
      anomalyEvent = {
        type: 'TRANSFER',
        id: tx.id,
        accountId:
          tx.accountId,
        toAccountId:
          tx.toAccountId,
      };
    }

    const budget =
      get().getMonthlyBudgetUZS();

    if (
      budget !== null &&
      get().getSpentThisMonthInUZS() >
        budget
    ) {
      anomalyEvent = {
        type: 'OVERSPEND',
        id: tx.id,
        accountId:
          tx.accountId,
      };
    }

    set({
      anomalyEvent,
    });
  },

  /*
   * ================================================================
   * TRANSACTION DELETION
   * ================================================================
   *
   * Local deletion reverses the transaction's balance effect.
   *
   * Remote deletion passes updateBalance=false because the synchronized
   * account object carries the authoritative balance.
   */
  deleteTransaction: async (
    id,
    updateBalance = true
  ) => {
    const transaction =
      useFinanceStore
        .getState()
        .transactions.find(
          (t) => t.id === id
        );

    if (!transaction) {
      return;
    }

    await deleteTransaction(id);

    /*
     * Remove transaction locally and record tombstone.
     */
    set((state) => ({
      transactions:
        state.transactions.filter(
          (t) => t.id !== id
        ),

      deletedTransactionIds:
        state.deletedTransactionIds.includes(
          id
        )
          ? state.deletedTransactionIds
          : [
              ...state.deletedTransactionIds,
              id,
            ],
    }));

    /*
     * Reverse local balance effect.
     */
    if (updateBalance) {
      const delta =
        getTransactionBalanceDelta(
          transaction
        );

      if (delta !== 0) {
        const account =
          useFinanceStore
            .getState()
            .accounts
            .find(
              (a) =>
                a.id ===
                transaction.accountId
            );

        if (account) {
          await get().updateAccount({
            ...account,
            balance:
              account.balance -
              delta,
          });
        }
      }
    }
  },

  /*
   * ================================================================
   * ACCOUNT CREATION
   * ================================================================
   */

  addAccount: async (account) => {
    const record = {
      ...account,
      id:
        account.id ||
        generateId(),
    };

    await saveAccount(record);

    set((state) => {
      const existingIndex =
        state.accounts.findIndex(
          (a) => a.id === record.id
        );

      if (existingIndex !== -1) {
        const accounts = [
          ...state.accounts,
        ];

        accounts[existingIndex] =
          record;

        return {
          accounts,
        };
      }

      return {
        accounts: [
          ...state.accounts,
          record,
        ],
      };
    });
  },

  /*
   * ================================================================
   * ACCOUNT UPDATE
   * ================================================================
   */

  updateAccount: async (
    account
  ) => {
    await saveAccount(account);

    set((state) => ({
      accounts:
        state.accounts.map(
          (a) =>
            a.id === account.id
              ? account
              : a
        ),
    }));
  },

  /*
   * ================================================================
   * ACCOUNT DELETION
   * ================================================================
   */

  deleteAccount: async (
    id
  ) => {
    await deleteAccount(id);

    set((state) => ({
      accounts:
        state.accounts.filter(
          (a) => a.id !== id
        ),

      deletedAccountIds:
        state.deletedAccountIds.includes(
          id
        )
          ? state.deletedAccountIds
          : [
              ...state.deletedAccountIds,
              id,
            ],
    }));
  },

  clearDeletedAccountId: (
    id
  ) =>
    set((state) => ({
      deletedAccountIds:
        state.deletedAccountIds.filter(
          (existingId) =>
            existingId !== id
        ),
    })),

  clearDeletedTransactionId: (
    id
  ) =>
    set((state) => ({
      deletedTransactionIds:
        state.deletedTransactionIds.filter(
          (existingId) =>
            existingId !== id
        ),
    })),

  /*
   * ================================================================
   * BUDGETS / EXCHANGE RATES
   * ================================================================
   */

  setMonthlyBudget: async (
    month,
    amountInUZS
  ) => {
    const budgets = {
      ...get().budgets,
      [month]:
        amountInUZS,
    };

    await setSetting(
      'budgets',
      budgets
    );

    set({
      budgets,
    });
  },

  setExchangeRate: async (
    code,
    rate
  ) => {
    const exchangeRates = {
      ...get().exchangeRates,
      [code]: rate,
    };

    await setSetting(
      'exchangeRates',
      exchangeRates
    );

    set({
      exchangeRates,
    });
  },

  clearAnomalyEvent: () =>
    set({
      anomalyEvent: null,
    }),

  /*
   * ================================================================
   * CALCULATIONS
   * ================================================================
   */

  getTotalBalanceInUZS: () => {
    const {
      accounts,
      exchangeRates,
    } = get();

    return accounts.reduce(
      (
        sum,
        acc
      ) =>
        sum +
        convertToBase(
          acc.balance,
          acc.currency,
          exchangeRates
        ),
      0
    );
  },

  getSpentThisMonthInUZS: () => {
    const {
      transactions,
      exchangeRates,
    } = get();

    const now =
      new Date();

    const year =
      now.getFullYear();

    const month =
      now.getMonth() + 1;

    return transactions
      .filter((t) => {
        const [
          ,
          mm,
          yyyy,
        ] = t.date
          .split('-')
          .map(Number);

        return (
          yyyy === year &&
          mm === month &&
          t.type === 'EXPENSE'
        );
      })
      .reduce(
        (
          sum,
          t
        ) =>
          sum +
          convertToBase(
            t.amount,
            t.currency,
            exchangeRates
          ),
        0
      );
  },

  getMonthlyBudgetUZS: () => {
    const {
      budgets,
    } = get();

    const monthKey =
      getCurrentMonthKey();

    return monthKey in budgets
      ? budgets[monthKey]
      : null;
  },

  getDailyAllowanceUZS: () => {
    const budget =
      get().getMonthlyBudgetUZS();

    if (
      budget === null
    ) {
      return null;
    }

    return (
      budget /
      getDaysInCurrentMonth()
    );
  },
}));

export default useFinanceStore;
