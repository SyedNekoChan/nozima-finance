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

// Remove duplicate records by ID.
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
 * Return the balance effect of a transaction.
 *
 * INCOME  -> positive
 * EXPENSE -> negative
 * TRANSFER -> 0
 *
 * Transfers are handled separately by TransferModal because they affect
 * two accounts.
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
   * Synchronization tombstones.
   */
  deletedAccountIds: [],
  deletedTransactionIds: [],

  pendingLedgerDate: null,
  pendingEditTx: null,

  /*
   * ================================================================
   * INITIAL LOAD
   * ================================================================
   */

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
   * ADD TRANSACTION
   * ================================================================
   *
   * updateBalance=true:
   *   Local transaction. Update account balance.
   *
   * updateBalance=false:
   *   Remote synchronized transaction. Do NOT touch account balance,
   *   because the account itself is synchronized separately.
   */

  addTransaction: async (
    tx,
    updateBalance = true
  ) => {
    const record = {
      ...tx,
      id:
        tx.id ||
        generateId(),
    };

    await saveTransaction(record);

    /*
     * Upsert transaction into local state.
     */
    set((state) => {
      const existingIndex =
        state.transactions.findIndex(
          (t) =>
            t.id ===
            record.id
        );

      if (
        existingIndex !== -1
      ) {
        const transactions = [
          ...state.transactions,
        ];

        transactions[
          existingIndex
        ] = record;

        transactions.sort(
          (a, b) =>
            parseDateToTimestamp(
              b.date
            ) -
            parseDateToTimestamp(
              a.date
            )
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
          parseDateToTimestamp(
            b.date
          ) -
          parseDateToTimestamp(
            a.date
          )
      );

      return {
        transactions,
      };
    });

    /*
     * Only local INCOME/EXPENSE transactions modify balances.
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
     * Anomaly event.
     */
    let anomalyEvent = null;

    if (
      record.type ===
      'INCOME'
    ) {
      anomalyEvent = {
        type: 'INCOME',
        id: record.id,
        accountId:
          record.accountId,
      };
    } else if (
      record.type ===
      'EXPENSE'
    ) {
      anomalyEvent = {
        type: 'EXPENSE',
        id: record.id,
        accountId:
          record.accountId,
      };
    } else if (
      record.type ===
      'TRANSFER'
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
   * UPDATE TRANSACTION
   * ================================================================
   */

  updateTransaction: async (
    tx,
    updateBalance = true
  ) => {
    const oldTransaction =
      useFinanceStore
        .getState()
        .transactions
        .find(
          (t) =>
            t.id ===
            tx.id
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
     * Local edits modify balances.
     *
     * Remote edits do not.
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
       * Same account:
       *
       * new balance =
       * old balance
       * - old transaction effect
       * + new transaction effect
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

        if (
          netDelta !== 0
        ) {
          await get().updateAccount({
            ...newAccount,
            balance:
              newAccount.balance +
              netDelta,
          });
        }
      } else {
        /*
         * Reverse the old account.
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
         * Apply the new account.
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

    if (
      tx.type ===
      'INCOME'
    ) {
      anomalyEvent = {
        type: 'INCOME',
        id: tx.id,
        accountId:
          tx.accountId,
      };
    } else if (
      tx.type ===
      'EXPENSE'
    ) {
      anomalyEvent = {
        type: 'EXPENSE',
        id: tx.id,
        accountId:
          tx.accountId,
      };
    } else if (
      tx.type ===
      'TRANSFER'
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
   * DELETE TRANSACTION
   * ================================================================
   */

  deleteTransaction: async (
    id,
    updateBalance = true
  ) => {
    const transaction =
      useFinanceStore
        .getState()
        .transactions
        .find(
          (t) =>
            t.id === id
        );

    if (!transaction) {
      return;
    }

    await deleteTransaction(id);

    set((state) => ({
      transactions:
        state.transactions.filter(
          (t) =>
            t.id !== id
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
     * Reverse the balance effect only for local deletion.
     */
    if (
      updateBalance
    ) {
      if (
        transaction.type ===
        'TRANSFER'
      ) {
        /*
         * TRANSFER has a zero delta in getTransactionBalanceDelta()
         * because it moves two accounts, not one. Its creation/edit
         * balance movement is handled explicitly by PunchCard and
         * TransferModal, so its deletion reversal must be handled
         * explicitly here too.
         *
         * source += original source amount
         * destination -= original received amount
         *   (received = amount * exchangeRate for cross-currency,
         *    otherwise received = amount)
         */
        const sourceAccount =
          useFinanceStore
            .getState()
            .accounts
            .find(
              (a) =>
                a.id ===
                transaction.accountId
            );

        const destinationAccount =
          useFinanceStore
            .getState()
            .accounts
            .find(
              (a) =>
                a.id ===
                transaction.toAccountId
            );

        const sourceAmount =
          Number(
            transaction.amount
          ) || 0;

        const receivedAmount =
          transaction.exchangeRate
            ? sourceAmount *
              Number(
                transaction.exchangeRate
              )
            : sourceAmount;

        if (
          sourceAccount &&
          sourceAmount !== 0
        ) {
          await get().updateAccount({
            ...sourceAccount,
            balance:
              sourceAccount.balance +
              sourceAmount,
          });
        }

        if (
          destinationAccount &&
          receivedAmount !== 0
        ) {
          await get().updateAccount({
            ...destinationAccount,
            balance:
              destinationAccount.balance -
              receivedAmount,
          });
        }
      } else {
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
    }
  },

  /*
   * ================================================================
   * ACCOUNT CREATION
   * ================================================================
   */

  addAccount: async (
    account
  ) => {
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
          (a) =>
            a.id ===
            record.id
        );

      if (
        existingIndex !== -1
      ) {
        const accounts = [
          ...state.accounts,
        ];

        accounts[
          existingIndex
        ] = record;

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

  updateAccount:
    async (account) => {
      await saveAccount(
        account
      );

      set((state) => ({
        accounts:
          state.accounts.map(
            (a) =>
              a.id ===
              account.id
                ? account
                : a
          ),
      }));
    },

  /*
   * ================================================================
   * ACCOUNT DELETE
   * ================================================================
   */

  deleteAccount:
    async (
      id,
      updateBalance = true
    ) => {
      /*
       * Cascade-delete every transaction that references this
       * account, either as the primary account or (for TRANSFER)
       * as the destination account. Without this, transactions
       * referencing a deleted accountId/toAccountId remain in the
       * store and corrupt calculations that iterate transactions
       * without filtering by live account (e.g.
       * getSpentThisMonthInUZS, Calendar's monthly heatmap), and
       * render as broken/undefined-account rows in Ledger/DailyLog.
       *
       * updateBalance mirrors the same parameter on deleteTransaction
       * and addTransaction/updateTransaction: local account deletion
       * (Accounts.jsx) passes true so the OTHER side of any TRANSFER
       * (a still-existing account) gets correctly balance-reversed.
       * A REMOTE account deletion arriving via sync
       * (onAccountsDeletedChanged in useSync.js) passes false,
       * because that other account's balance is synced/reconciled
       * independently via its own Yjs map — applying a local reversal
       * on top of that would double-count exactly like remote
       * transaction deletions already avoid via their own
       * updateBalance=false.
       *
       * Each cascade delete goes through the existing
       * deleteTransaction(), reusing its already-correct,
       * already-guarded reversal logic: it safely no-ops for the
       * account being removed (its own balance update is moot, the
       * account is about to disappear) regardless of updateBalance.
       *
       * This must happen BEFORE the account is removed from state,
       * so any transaction whose *other* side is a different,
       * still-live account can still be found and reversed.
       */
      const dependentTransactionIds =
        useFinanceStore
          .getState()
          .transactions
          .filter(
            (t) =>
              t.accountId ===
                id ||
              t.toAccountId ===
                id
          )
          .map(
            (t) => t.id
          );

      for (
        const transactionId of dependentTransactionIds
      ) {
        await get().deleteTransaction(
          transactionId,
          updateBalance
        );
      }

      await deleteAccount(id);

      set((state) => ({
        accounts:
          state.accounts.filter(
            (a) =>
              a.id !== id
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

  clearDeletedAccountId:
    (id) =>
      set((state) => ({
        deletedAccountIds:
          state.deletedAccountIds.filter(
            (existingId) =>
              existingId !== id
          ),
      })),

  clearDeletedTransactionId:
    (id) =>
      set((state) => ({
        deletedTransactionIds:
          state.deletedTransactionIds.filter(
            (existingId) =>
              existingId !== id
          ),
      })),

  /*
   * ================================================================
   * BUDGETS / RATES
   * ================================================================
   */

  setMonthlyBudget:
    async (
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

  setExchangeRate:
    async (
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

  /*
   * ================================================================
   * ANOMALY
   * ================================================================
   */

  clearAnomalyEvent:
    () =>
      set({
        anomalyEvent: null,
      }),

  /*
   * ================================================================
   * CALCULATIONS
   * ================================================================
   */

  getTotalBalanceInUZS:
    () => {
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

  getSpentThisMonthInUZS:
    () => {
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
            t.type ===
              'EXPENSE'
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

  getMonthlyBudgetUZS:
    () => {
      const {
        budgets,
      } = get();

      const monthKey =
        getCurrentMonthKey();

      return monthKey in
        budgets
        ? budgets[
            monthKey
          ]
        : null;
    },

  getDailyAllowanceUZS:
    () => {
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
