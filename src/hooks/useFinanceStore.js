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
 * Return the single-account balance effect of a transaction.
 *
 * INCOME  -> positive
 * EXPENSE -> negative
 * TRANSFER -> 0
 *
 * TRANSFER always touches TWO accounts (source + destination), so its
 * balance effect can never be expressed as one delta on one account.
 * Transfers are handled explicitly and centrally by the
 * applyTransferBalanceEffect() action below (sign +1 to apply, -1 to
 * reverse), never through this single-delta helper.
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

/*
 * The amount the DESTINATION account actually receives for a transfer.
 *
 * Same-currency transfer: destination receives exactly the source amount.
 * Cross-currency transfer: destination receives amount * exchangeRate,
 * where exchangeRate is "1 source unit = exchangeRate destination units"
 * (the same direction already established by TransferModal/PunchCard's
 * rate-suggestion logic: exchangeRates[source] / exchangeRates[dest]).
 *
 * Centralized here so creation, editing, and deletion-reversal can never
 * compute "what the destination got" differently from one another.
 */
function getReceivedAmount(tx) {
  const sourceAmount = Number(tx?.amount) || 0;

  if (tx?.exchangeRate) {
    return sourceAmount * (Number(tx.exchangeRate) || 0);
  }

  return sourceAmount;
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
   * TRANSFER BALANCE EFFECT (apply / reverse)
   * ================================================================
   *
   * The single, centralized place that moves money between two
   * accounts for a TRANSFER transaction. Used by addTransaction,
   * updateTransaction, and deleteTransaction alike so there is
   * exactly one implementation of "what a transfer does to balances"
   * — never a component-level (PunchCard/TransferModal) copy of this
   * logic.
   *
   * Always re-reads accounts fresh from the store immediately before
   * each write, rather than trusting a caller-supplied account
   * object, so two applications in sequence (e.g. reverse-old then
   * apply-new during an edit) never operate on stale balances.
   *
   * sign = +1  -> apply the transfer (source -amount, dest +received)
   * sign = -1  -> reverse the transfer (source +amount, dest -received)
   *
   * A transfer whose destination account no longer exists (e.g. it
   * was deleted) only reverses/applies the side that still exists —
   * this mirrors the tolerant behavior already relied upon by the
   * account-deletion cascade.
   */
  applyTransferBalanceEffect: async (
    tx,
    sign
  ) => {
    if (!tx || tx.type !== 'TRANSFER') {
      return;
    }

    const sourceAmount =
      Number(tx.amount) || 0;

    const receivedAmount =
      getReceivedAmount(tx);

    const sourceAccount =
      useFinanceStore
        .getState()
        .accounts.find(
          (a) => a.id === tx.accountId
        );

    if (
      sourceAccount &&
      sourceAmount !== 0
    ) {
      await get().updateAccount({
        ...sourceAccount,
        balance:
          sourceAccount.balance -
          sign * sourceAmount,
      });
    }

    const destinationAccount =
      useFinanceStore
        .getState()
        .accounts.find(
          (a) => a.id === tx.toAccountId
        );

    if (
      destinationAccount &&
      receivedAmount !== 0
    ) {
      await get().updateAccount({
        ...destinationAccount,
        balance:
          destinationAccount.balance +
          sign * receivedAmount,
      });
    }
  },

  /*
   * ================================================================
   * CREATE TRANSFER (single authoritative entry point)
   * ================================================================
   *
   * Both PunchCard and TransferModal call this instead of maintaining
   * their own balance-mutation logic. Validates inputs, persists the
   * transaction, and applies its balance effect atomically from the
   * store's perspective (sequenced awaits; no un-awaited fire-and-
   * forget writes).
   *
   * Throws on validation failure so the caller (UI) can catch it and
   * show an error, rather than silently doing nothing.
   */
  createTransfer: async ({
    sourceAccountId,
    destinationAccountId,
    amount,
    date,
    note,
    exchangeRate,
    imageData,
    id,
    createdAt,
  }) => {
    if (
      !sourceAccountId ||
      !destinationAccountId
    ) {
      throw new Error(
        'SELECT SOURCE AND DESTINATION'
      );
    }

    if (
      sourceAccountId ===
      destinationAccountId
    ) {
      throw new Error(
        'SOURCE AND DESTINATION MUST DIFFER'
      );
    }

    const numericAmount =
      Number(amount);

    if (
      !numericAmount ||
      Number.isNaN(
        numericAmount
      ) ||
      numericAmount <= 0
    ) {
      throw new Error(
        'INVALID AMOUNT'
      );
    }

    const sourceAccount =
      useFinanceStore
        .getState()
        .accounts.find(
          (a) =>
            a.id ===
            sourceAccountId
        );

    const destinationAccount =
      useFinanceStore
        .getState()
        .accounts.find(
          (a) =>
            a.id ===
            destinationAccountId
        );

    if (
      !sourceAccount ||
      !destinationAccount
    ) {
      throw new Error(
        'ACCOUNT NOT FOUND'
      );
    }

    const isCrossCurrency =
      sourceAccount.currency !==
      destinationAccount.currency;

    let numericRate = null;

    if (isCrossCurrency) {
      numericRate = Number(
        exchangeRate
      );

      if (
        !numericRate ||
        Number.isNaN(
          numericRate
        ) ||
        numericRate <= 0
      ) {
        throw new Error(
          'INVALID EXCHANGE RATE'
        );
      }
    }

    const tx = {
      id:
        id ||
        crypto.randomUUID(),
      date,
      type: 'TRANSFER',
      amount: numericAmount,
      currency:
        sourceAccount.currency,
      accountId:
        sourceAccountId,
      toAccountId:
        destinationAccountId,
      category: null,
      note:
        (note || '').trim() ||
        'Transfer',
      imageData:
        imageData || null,
      createdAt:
        createdAt ||
        new Date().toISOString(),
      exchangeRate: numericRate,
    };

    await get().addTransaction(
      tx,
      true
    );

    return tx;
  },

  /*
   * ================================================================
   * EDIT TRANSFER (single authoritative entry point)
   * ================================================================
   *
   * Reverses the OLD transfer's effect on the OLD source/destination
   * accounts, then applies the NEW transfer's effect on the (possibly
   * different) NEW source/destination accounts, before persisting the
   * updated transaction record. This correctly supports every
   * combination of change: amount only, source only, destination
   * only, both accounts, exchange rate, or date — because reversal
   * and application are always computed and executed as two fully
   * separate, sequenced steps, never merged into a single "net delta"
   * (which is only safe when both sides share the same two accounts).
   */
  editTransfer: async (
    existingTx,
    {
      sourceAccountId,
      destinationAccountId,
      amount,
      date,
      note,
      exchangeRate,
      imageData,
    }
  ) => {
    if (
      !existingTx ||
      existingTx.type !== 'TRANSFER'
    ) {
      throw new Error(
        'NOT A TRANSFER'
      );
    }

    if (
      !sourceAccountId ||
      !destinationAccountId
    ) {
      throw new Error(
        'SELECT SOURCE AND DESTINATION'
      );
    }

    if (
      sourceAccountId ===
      destinationAccountId
    ) {
      throw new Error(
        'SOURCE AND DESTINATION MUST DIFFER'
      );
    }

    const numericAmount =
      Number(amount);

    if (
      !numericAmount ||
      Number.isNaN(
        numericAmount
      ) ||
      numericAmount <= 0
    ) {
      throw new Error(
        'INVALID AMOUNT'
      );
    }

    const sourceAccount =
      useFinanceStore
        .getState()
        .accounts.find(
          (a) =>
            a.id ===
            sourceAccountId
        );

    const destinationAccount =
      useFinanceStore
        .getState()
        .accounts.find(
          (a) =>
            a.id ===
            destinationAccountId
        );

    if (
      !sourceAccount ||
      !destinationAccount
    ) {
      throw new Error(
        'ACCOUNT NOT FOUND'
      );
    }

    const isCrossCurrency =
      sourceAccount.currency !==
      destinationAccount.currency;

    let numericRate = null;

    if (isCrossCurrency) {
      numericRate = Number(
        exchangeRate
      );

      if (
        !numericRate ||
        Number.isNaN(
          numericRate
        ) ||
        numericRate <= 0
      ) {
        throw new Error(
          'INVALID EXCHANGE RATE'
        );
      }
    }

    const updatedTx = {
      ...existingTx,
      date:
        date || existingTx.date,
      amount: numericAmount,
      currency:
        sourceAccount.currency,
      accountId:
        sourceAccountId,
      toAccountId:
        destinationAccountId,
      category: null,
      note:
        note !== undefined
          ? note.trim() ||
            'Transfer'
          : existingTx.note,
      imageData:
        imageData !== undefined
          ? imageData
          : existingTx.imageData,
      exchangeRate: numericRate,
    };

    /*
     * STEP 1: reverse the OLD transfer's effect on the OLD accounts.
     * STEP 2: persist the updated record.
     * STEP 3: apply the NEW transfer's effect on the NEW accounts.
     *
     * Reversal always runs first and uses existingTx (the pre-edit
     * record) so it undoes exactly what was originally applied, even
     * if source/destination/amount/rate are all changing at once.
     */
    await get().applyTransferBalanceEffect(
      existingTx,
      -1
    );

    await saveTransaction(
      updatedTx
    );

    set((state) => ({
      transactions:
        state.transactions
          .map((t) =>
            t.id ===
            updatedTx.id
              ? updatedTx
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

    await get().applyTransferBalanceEffect(
      updatedTx,
      1
    );

    set({
      anomalyEvent: {
        type: 'TRANSFER',
        id: updatedTx.id,
        accountId:
          updatedTx.accountId,
        toAccountId:
          updatedTx.toAccountId,
      },
    });

    return updatedTx;
  },

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
     * Local INCOME/EXPENSE transactions modify a single account's
     * balance. Local TRANSFER transactions modify BOTH the source and
     * destination account balances, via the same centralized
     * applyTransferBalanceEffect() used by editTransfer and
     * deleteTransaction, so there is exactly one implementation of
     * "what a transfer does to balances" regardless of which UI
     * surface (PunchCard or TransferModal) created it.
     *
     * Remote/synced transactions (updateBalance=false) never touch
     * balances here — the account's own balance is synchronized
     * independently via its own Yjs map.
     */
    if (updateBalance) {
      if (
        record.type === 'INCOME' ||
        record.type === 'EXPENSE'
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
      } else if (
        record.type === 'TRANSFER'
      ) {
        await get().applyTransferBalanceEffect(
          record,
          1
        );
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
     *
     * TRANSFER transactions are handled via the same centralized
     * applyTransferBalanceEffect() helper used by createTransfer,
     * editTransfer, and deleteTransaction: the OLD record's effect is
     * always fully reversed first, then the NEW record's effect is
     * fully applied, as two separate sequenced steps. This correctly
     * handles every combination of change — amount, source,
     * destination, exchange rate, or a type change into/out of
     * TRANSFER — without ever computing a "net delta" that would only
     * be valid if both records shared the same two accounts.
     *
     * INCOME/EXPENSE-only edits keep the original single-account net-
     * delta path unchanged.
     */
    if (
      updateBalance &&
      oldTransaction
    ) {
      const oldIsTransfer =
        oldTransaction.type ===
        'TRANSFER';

      const newIsTransfer =
        tx.type === 'TRANSFER';

      if (
        oldIsTransfer ||
        newIsTransfer
      ) {
        if (oldIsTransfer) {
          await get().applyTransferBalanceEffect(
            oldTransaction,
            -1
          );
        } else {
          const oldDelta =
            getTransactionBalanceDelta(
              oldTransaction
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
        }

        if (newIsTransfer) {
          await get().applyTransferBalanceEffect(
            tx,
            1
          );
        } else {
          const newDelta =
            getTransactionBalanceDelta(
              tx
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
      } else {
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
         * because it moves two accounts, not one. Its balance
         * movement (creation, editing, and this deletion reversal
         * alike) is handled by the single centralized
         * applyTransferBalanceEffect() helper — sign -1 reverses
         * exactly what sign +1 originally applied:
         *
         * source += original source amount
         * destination -= original received amount
         *   (received = amount * exchangeRate for cross-currency,
         *    otherwise received = amount)
         */
        await get().applyTransferBalanceEffect(
          transaction,
          -1
        );
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
