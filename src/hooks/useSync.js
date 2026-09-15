import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebrtcProvider } from 'y-webrtc';
import useFinanceStore from './useFinanceStore.js';

const ROOM_NAME = 'nozima-finance-room';
const ROOM_PASSWORD = 'nozima-finance-room';

// IMPORTANT:
// This must stay different from the Dexie database name used by the app.
const YJS_DB_NAME = 'nozima-finance-yjs';

export default function useSync() {
  const isLoaded = useFinanceStore((s) => s.isLoaded);

  const [status, setStatus] = useState('OFF');
  const [connected, setConnected] = useState(false);
  const [peerCount, setPeerCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [error, setError] = useState(null);

  const ydocRef = useRef(null);
  const persistenceRef = useRef(null);
  const providerRef = useRef(null);

  const yMapsRef = useRef({});

  const reconciledRef = useRef(false);
  const applyingRemoteRef = useRef(false);

  /*
   * Prevent overlapping async reconciliation passes.
   */
  const reconciliationRunningRef = useRef(false);
  const reconciliationQueuedRef = useRef(false);

  /*
   * -----------------------------------------------------------------------
   * YJS HELPERS
   * -----------------------------------------------------------------------
   */

  const getMap = useCallback((mapName) => {
    return yMapsRef.current[mapName] || null;
  }, []);

  /*
   * IMPORTANT:
   * A deletion is performed as ONE atomic Yjs transaction:
   *
   *   1. Create tombstone
   *   2. Delete record from the live map
   *
   * This prevents observers from ever seeing the deleted account as
   * "missing remotely but still alive locally".
   */
  const deleteFromYjs = useCallback((mapName, id) => {
    if (!id) return;

    const yMap = getMap(mapName);
    const deletedMap = getMap(`${mapName}Deleted`);

    if (!yMap || !deletedMap) {
      return;
    }

    const ydoc = ydocRef.current;

    if (!ydoc) {
      return;
    }

    ydoc.transact(() => {
      deletedMap.set(id, Date.now());
      yMap.delete(id);
    });
  }, [getMap]);

  /*
   * Push an active record into Yjs.
   *
   * NEVER push an object whose ID already has a deletion tombstone.
   */
  const pushRecordToYjs = useCallback((mapName, record) => {
    if (!record?.id) {
      return;
    }

    const yMap = getMap(mapName);
    const deletedMap = getMap(`${mapName}Deleted`);

    if (!yMap || !deletedMap) {
      return;
    }

    if (deletedMap.has(record.id)) {
      return;
    }

    yMap.set(record.id, record);
  }, [getMap]);

  /*
   * -----------------------------------------------------------------------
   * COLLECTION RECONCILIATION
   * -----------------------------------------------------------------------
   */

  const reconcileCollection = useCallback(
    async (mapName, remoteMap) => {
      if (!remoteMap) {
        return;
      }

      /*
       * If another change arrives while we are reconciling, queue one more
       * pass instead of starting overlapping async passes.
       */
      if (reconciliationRunningRef.current) {
        reconciliationQueuedRef.current = true;
        return;
      }

      reconciliationRunningRef.current = true;
      applyingRemoteRef.current = true;

      try {
        const store = useFinanceStore.getState();
        const deletedMap = getMap(`${mapName}Deleted`);

        /*
         * STEP 1
         * Deletion tombstones ALWAYS win.
         *
         * Remove anything from the live Yjs map that has already been
         * explicitly deleted.
         */
        if (deletedMap) {
          const deletedIds = Array.from(deletedMap.keys());

          for (const id of deletedIds) {
            if (remoteMap.has(id)) {
              remoteMap.delete(id);
            }
          }
        }

        /*
         * STEP 2
         * Read the surviving remote records.
         */
        const remoteRecords = Array.from(remoteMap.values());

        /*
         * STEP 3
         * Apply remote records locally.
         *
         * A record with a tombstone is NEVER allowed back into the store.
         */
        if (mapName === 'accounts') {
          for (const remote of remoteRecords) {
            if (!remote?.id) {
              continue;
            }

            if (deletedMap?.has(remote.id)) {
              continue;
            }

            const local = useFinanceStore
              .getState()
              .accounts
              .find((account) => account.id === remote.id);

            if (!local) {
              await store.addAccount(remote);
              continue;
            }

            if (
              JSON.stringify(local) !==
              JSON.stringify(remote)
            ) {
              await store.updateAccount(remote);
            }
          }
        }

        if (mapName === 'transactions') {
          for (const remote of remoteRecords) {
            if (!remote?.id) {
              continue;
            }

            if (deletedMap?.has(remote.id)) {
              continue;
            }

            const local = useFinanceStore
              .getState()
              .transactions
              .find(
                (transaction) =>
                  transaction.id === remote.id
              );

            if (!local) {
              await store.addTransaction(remote);
              continue;
            }

            if (
              JSON.stringify(local) !==
              JSON.stringify(remote)
            ) {
              await store.updateTransaction(remote);
            }
          }
        }

        /*
         * STEP 4
         * Push local records which are genuinely local and do not have
         * deletion tombstones.
         *
         * IMPORTANT:
         * We DO NOT delete local records simply because they are missing
         * remotely. This prevents startup races from destroying local data.
         */
        if (mapName === 'accounts') {
          const localAccounts =
            useFinanceStore.getState().accounts;

          const remoteIds = new Set(remoteMap.keys());

          for (const account of localAccounts) {
            if (
              !remoteIds.has(account.id) &&
              !deletedMap?.has(account.id)
            ) {
              remoteMap.set(account.id, account);
            }
          }
        }

        if (mapName === 'transactions') {
          const localTransactions =
            useFinanceStore.getState().transactions;

          const remoteIds = new Set(remoteMap.keys());

          for (const transaction of localTransactions) {
            if (
              !remoteIds.has(transaction.id) &&
              !deletedMap?.has(transaction.id)
            ) {
              remoteMap.set(
                transaction.id,
                transaction
              );
            }
          }
        }
      } finally {
        applyingRemoteRef.current = false;
        reconciliationRunningRef.current = false;
      }

      /*
       * One additional pass if a Yjs event arrived while the previous pass
       * was still running.
       */
      if (reconciliationQueuedRef.current) {
        reconciliationQueuedRef.current = false;

        await reconcileCollection(
          mapName,
          remoteMap
        );
      }
    },
    [getMap]
  );

  /*
   * -----------------------------------------------------------------------
   * KEY/VALUE RECONCILIATION
   * -----------------------------------------------------------------------
   */

  const reconcileKeyedMap = useCallback(
    async (mapName, remoteMap) => {
      if (!remoteMap) {
        return;
      }

      applyingRemoteRef.current = true;

      try {
        const store = useFinanceStore.getState();

        /*
         * Remote values win for keys already present remotely.
         */
        remoteMap.forEach((value, key) => {
          if (
            mapName === 'budgets' &&
            store.budgets[key] !== value
          ) {
            store.setMonthlyBudget(key, value);
          }

          if (
            mapName === 'exchangeRates' &&
            store.exchangeRates[key] !== value
          ) {
            store.setExchangeRate(key, value);
          }
        });

        /*
         * Push local-only budget values.
         */
        if (mapName === 'budgets') {
          const localBudgets =
            useFinanceStore.getState().budgets;

          Object.entries(localBudgets).forEach(
            ([key, value]) => {
              if (!remoteMap.has(key)) {
                remoteMap.set(key, value);
              }
            }
          );
        }

        /*
         * Push local-only exchange rates.
         */
        if (mapName === 'exchangeRates') {
          const localRates =
            useFinanceStore.getState().exchangeRates;

          Object.entries(localRates).forEach(
            ([key, value]) => {
              if (!remoteMap.has(key)) {
                remoteMap.set(key, value);
              }
            }
          );
        }
      } finally {
        applyingRemoteRef.current = false;
      }
    },
    []
  );

  /*
   * -----------------------------------------------------------------------
   * MAIN EFFECT
   * -----------------------------------------------------------------------
   */

  useEffect(() => {
    /*
     * Do not initialize Yjs until Dexie/local application data has loaded.
     */
    if (!isLoaded) {
      return undefined;
    }

    let cancelled = false;

    setStatus('WAITING');
    setConnected(false);
    setPeerCount(0);
    setError(null);
    setLastSyncedAt(null);

    reconciledRef.current = false;
    reconciliationRunningRef.current = false;
    reconciliationQueuedRef.current = false;

    /*
     * ---------------------------------------------------------------------
     * YJS DOCUMENT
     * ---------------------------------------------------------------------
     */

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const yTransactions = ydoc.getMap('transactions');
    const yAccounts = ydoc.getMap('accounts');

    const yTransactionsDeleted =
      ydoc.getMap('transactionsDeleted');

    const yAccountsDeleted =
      ydoc.getMap('accountsDeleted');

    const yBudgets = ydoc.getMap('budgets');
    const yExchangeRates =
      ydoc.getMap('exchangeRates');

    yMapsRef.current = {
      transactions: yTransactions,
      accounts: yAccounts,

      transactionsDeleted:
        yTransactionsDeleted,

      accountsDeleted:
        yAccountsDeleted,

      budgets: yBudgets,
      exchangeRates: yExchangeRates,
    };

    /*
     * ---------------------------------------------------------------------
     * INDEXEDDB PERSISTENCE
     * ---------------------------------------------------------------------
     */

    const persistence = new IndexeddbPersistence(
      YJS_DB_NAME,
      ydoc
    );

    persistenceRef.current = persistence;

    let provider = null;

    /*
     * ---------------------------------------------------------------------
     * YJS OBSERVERS
     * ---------------------------------------------------------------------
     */

    const onTransactionsChanged = async () => {
      if (!reconciledRef.current) {
        return;
      }

      await reconcileCollection(
        'transactions',
        yTransactions
      );

      if (!cancelled) {
        setLastSyncedAt(new Date());
      }
    };

    const onAccountsChanged = async () => {
      if (!reconciledRef.current) {
        return;
      }

      await reconcileCollection(
        'accounts',
        yAccounts
      );

      if (!cancelled) {
        setLastSyncedAt(new Date());
      }
    };

    /*
     * When a transaction deletion tombstone changes, reconcile the
     * collection. The tombstone is checked before any record can be
     * restored.
     */
    const onTransactionsDeletedChanged = async () => {
      if (!reconciledRef.current) {
        return;
      }

      await reconcileCollection(
        'transactions',
        yTransactions
      );

      if (!cancelled) {
        setLastSyncedAt(new Date());
      }
    };

    /*
     * Same logic for accounts.
     *
     * NOTE:
     * We deliberately do not call store.deleteAccount() here.
     * The local deletion state is already the authoritative result of the
     * synchronization event, and running the full local delete path again
     * would create another synchronization cycle.
     */
    const onAccountsDeletedChanged = async () => {
      if (!reconciledRef.current) {
        return;
      }

      const store =
        useFinanceStore.getState();

      const deletedIds =
        Array.from(
          yAccountsDeleted.keys()
        );

      /*
       * Remove deleted accounts locally.
       *
       * We update the local store directly through Zustand's setState API
       * rather than invoking deleteAccount(), because deleteAccount()
       * itself is the LOCAL deletion action.
       */

      /*
       * The store's public API does not expose a raw remove operation, so
       * use the existing deleteAccount action only for records that still
       * exist locally.
       *
       * The Yjs tombstone already exists, therefore the follow-up sync pass
       * cannot resurrect the record.
       */
      for (const id of deletedIds) {
        const exists =
          useFinanceStore
            .getState()
            .accounts
            .some(
              (account) =>
                account.id === id
            );

        if (exists) {
          await useFinanceStore
            .getState()
            .deleteAccount(id);
        }
      }

      /*
       * Ensure the live Yjs map cannot retain the deleted record.
       */
      ydoc.transact(() => {
        for (const id of deletedIds) {
          yAccounts.delete(id);
        }
      });

      if (!cancelled) {
        setLastSyncedAt(new Date());
      }
    };

    const onBudgetsChanged = async () => {
      if (!reconciledRef.current) {
        return;
      }

      await reconcileKeyedMap(
        'budgets',
        yBudgets
      );

      if (!cancelled) {
        setLastSyncedAt(new Date());
      }
    };

    const onExchangeRatesChanged = async () => {
      if (!reconciledRef.current) {
        return;
      }

      await reconcileKeyedMap(
        'exchangeRates',
        yExchangeRates
      );

      if (!cancelled) {
        setLastSyncedAt(new Date());
      }
    };

    yTransactions.observe(onTransactionsChanged);
    yAccounts.observe(onAccountsChanged);

    yTransactionsDeleted.observe(
      onTransactionsDeletedChanged
    );

    yAccountsDeleted.observe(
      onAccountsDeletedChanged
    );

    yBudgets.observe(onBudgetsChanged);
    yExchangeRates.observe(
      onExchangeRatesChanged
    );

    /*
     * ---------------------------------------------------------------------
     * LOCAL ZUSTAND -> YJS
     * ---------------------------------------------------------------------
     *
     * THIS IS THE IMPORTANT FIX.
     *
     * Deletions are synchronized BEFORE active records are pushed.
     *
     * Previously, a state change containing:
     *
     *   accounts = [remaining accounts]
     *   deletedAccountIds = [deleted ID]
     *
     * could be processed in an order where the missing account was pushed
     * back into Yjs before the deletion tombstone was written.
     *
     * With multiple cards this produced:
     *
     *   delete -> account disappears -> account returns at END
     *
     * and the second click finally removed it.
     */

    let previousDeletedAccounts = [];
    let previousDeletedTransactions = [];

    const unsubscribe =
      useFinanceStore.subscribe(
        (state, previousState) => {
          if (!reconciledRef.current) {
            return;
          }

          if (applyingRemoteRef.current) {
            return;
          }

          /*
           * ===============================================================
           * 1. PROCESS DELETIONS FIRST
           * ===============================================================
           */

          const previousAccountDeletes =
            new Set(
              previousDeletedAccounts.length > 0
                ? previousDeletedAccounts
                : previousState.deletedAccountIds
            );

          const previousTransactionDeletes =
            new Set(
              previousDeletedTransactions.length > 0
                ? previousDeletedTransactions
                : previousState.deletedTransactionIds
            );

          const newAccountDeletes =
            state.deletedAccountIds.filter(
              (id) =>
                !previousAccountDeletes.has(id)
            );

          const newTransactionDeletes =
            state.deletedTransactionIds.filter(
              (id) =>
                !previousTransactionDeletes.has(id)
            );

          /*
           * Account deletion.
           *
           * Tombstone + live-map deletion happen atomically.
           */
          if (newAccountDeletes.length > 0) {
            const ydoc = ydocRef.current;

            if (ydoc) {
              ydoc.transact(() => {
                newAccountDeletes.forEach(
                  (id) => {
                    yAccountsDeleted.set(
                      id,
                      Date.now()
                    );

                    yAccounts.delete(id);
                  }
                );
              });
            }
          }

          /*
           * Transaction deletion.
           */
          if (newTransactionDeletes.length > 0) {
            const ydoc = ydocRef.current;

            if (ydoc) {
              ydoc.transact(() => {
                newTransactionDeletes.forEach(
                  (id) => {
                    yTransactionsDeleted.set(
                      id,
                      Date.now()
                    );

                    yTransactions.delete(id);
                  }
                );
              });
            }
          }

          /*
           * Remember deletion arrays for the next subscription callback.
           */
          previousDeletedAccounts = [
            ...state.deletedAccountIds,
          ];

          previousDeletedTransactions = [
            ...state.deletedTransactionIds,
          ];

          /*
           * ===============================================================
           * 2. PUSH LIVE ACCOUNTS
           * ===============================================================
           *
           * Deleted IDs have already been written to the tombstone maps,
           * so they are explicitly excluded here.
           */

          const deletedAccountSet =
            new Set(
              state.deletedAccountIds
            );

          for (const account of state.accounts) {
            if (
              deletedAccountSet.has(
                account.id
              )
            ) {
              continue;
            }

            pushRecordToYjs(
              'accounts',
              account
            );
          }

          /*
           * ===============================================================
           * 3. PUSH LIVE TRANSACTIONS
           * ===============================================================
           */

          const deletedTransactionSet =
            new Set(
              state.deletedTransactionIds
            );

          for (
            const transaction of
              state.transactions
          ) {
            if (
              deletedTransactionSet.has(
                transaction.id
              )
            ) {
              continue;
            }

            pushRecordToYjs(
              'transactions',
              transaction
            );
          }

          /*
           * ===============================================================
           * 4. PUSH BUDGETS
           * ===============================================================
           */

          Object.entries(
            state.budgets
          ).forEach(
            ([key, value]) => {
              yBudgets.set(
                key,
                value
              );
            }
          );

          /*
           * ===============================================================
           * 5. PUSH EXCHANGE RATES
           * ===============================================================
           */

          Object.entries(
            state.exchangeRates
          ).forEach(
            ([key, value]) => {
              yExchangeRates.set(
                key,
                value
              );
            }
          );

          if (!cancelled) {
            setLastSyncedAt(
              new Date()
            );
          }
        }
      );

    /*
     * ---------------------------------------------------------------------
     * INITIAL LOCAL -> YJS STATE
     * ---------------------------------------------------------------------
     */

    const initialize = async () => {
      try {
        /*
         * Wait for Yjs IndexedDB persistence to finish loading.
         */
        await persistence.whenSynced;

        if (cancelled) {
          return;
        }

        /*
         * Reconcile accounts first.
         */
        await reconcileCollection(
          'accounts',
          yAccounts
        );

        if (cancelled) {
          return;
        }

        /*
         * Then transactions.
         */
        await reconcileCollection(
          'transactions',
          yTransactions
        );

        if (cancelled) {
          return;
        }

        /*
         * Key/value state.
         */
        await reconcileKeyedMap(
          'budgets',
          yBudgets
        );

        await reconcileKeyedMap(
          'exchangeRates',
          yExchangeRates
        );

        if (cancelled) {
          return;
        }

        /*
         * Mark reconciliation complete BEFORE starting WebRTC.
         *
         * This ensures remote observers can safely reconcile immediately
         * after WebRTC synchronizes the document.
         */
        reconciledRef.current = true;

        /*
         * ===============================================================
         * IMPORTANT CLEANUP OF STALE TOMBSTONED RECORDS
         * ===============================================================
         *
         * Existing tombstones are authoritative.
         */
        ydoc.transact(() => {
          for (
            const id of
              yAccountsDeleted.keys()
          ) {
            yAccounts.delete(id);
          }

          for (
            const id of
              yTransactionsDeleted.keys()
          ) {
            yTransactions.delete(id);
          }
        });

        /*
         * ===============================================================
         * START WEBRTC
         * ===============================================================
         */

        provider =
          new WebrtcProvider(
            ROOM_NAME,
            ydoc,
            {
              password:
                ROOM_PASSWORD,
              signaling: [
                'wss://signaling.yjs.dev',
              ],
            }
          );

        providerRef.current =
          provider;

        /*
         * WebRTC connection status.
         */
        provider.on(
          'status',
          ({ status: connectionStatus }) => {
            if (cancelled) {
              return;
            }

            if (
              connectionStatus ===
              'connected'
            ) {
              setConnected(true);
              setStatus('ACTIVE');
            }

            if (
              connectionStatus ===
              'disconnected'
            ) {
              setConnected(false);

              /*
               * Keep synchronization available even if the signaling
               * server temporarily cannot connect.
               */
              setStatus('WAITING');
            }
          }
        );

        /*
         * Peer count.
         */
        provider.on(
          'peers',
          ({
            added = [],
            removed = [],
          }) => {
            if (cancelled) {
              return;
            }

            setPeerCount((current) =>
              Math.max(
                0,
                current +
                  added.length -
                  removed.length
              )
            );
          }
        );

        if (!cancelled) {
          setStatus('ACTIVE');
          setLastSyncedAt(
            new Date()
          );
        }
      } catch (syncError) {
        console.error(
          '[SYNC] Initialization failed:',
          syncError
        );

        if (!cancelled) {
          setError(
            syncError?.message ||
              String(syncError)
          );

          setStatus('ERROR');
        }
      }
    };

    initialize();

    /*
     * ---------------------------------------------------------------------
     * CLEANUP
     * ---------------------------------------------------------------------
     */

    return () => {
      cancelled = true;

      reconciledRef.current = false;
      applyingRemoteRef.current = false;
      reconciliationRunningRef.current = false;
      reconciliationQueuedRef.current = false;

      unsubscribe();

      yTransactions.unobserve(
        onTransactionsChanged
      );

      yAccounts.unobserve(
        onAccountsChanged
      );

      yTransactionsDeleted.unobserve(
        onTransactionsDeletedChanged
      );

      yAccountsDeleted.unobserve(
        onAccountsDeletedChanged
      );

      yBudgets.unobserve(
        onBudgetsChanged
      );

      yExchangeRates.unobserve(
        onExchangeRatesChanged
      );

      if (providerRef.current) {
        try {
          providerRef.current.destroy();
        } catch (destroyError) {
          console.error(
            '[SYNC] Provider cleanup failed:',
            destroyError
          );
        }

        providerRef.current = null;
      }

      if (persistenceRef.current) {
        try {
          persistenceRef.current.destroy();
        } catch (destroyError) {
          console.error(
            '[SYNC] Persistence cleanup failed:',
            destroyError
          );
        }

        persistenceRef.current = null;
      }

      if (ydocRef.current) {
        try {
          ydocRef.current.destroy();
        } catch (destroyError) {
          console.error(
            '[SYNC] Y.Doc cleanup failed:',
            destroyError
          );
        }

        ydocRef.current = null;
      }

      yMapsRef.current = {};

      setConnected(false);
      setPeerCount(0);
      setStatus('OFF');
    };
  }, [
    isLoaded,
    reconcileCollection,
    reconcileKeyedMap,
    pushRecordToYjs,
  ]);

  /*
   * -----------------------------------------------------------------------
   * FORCE SYNC
   * -----------------------------------------------------------------------
   */

  const forceSync = useCallback(
    async () => {
      if (
        !ydocRef.current ||
        !reconciledRef.current
      ) {
        return;
      }

      try {
        setStatus('WAITING');

        const {
          transactions,
          accounts,
          budgets,
          exchangeRates,
        } =
          yMapsRef.current;

        await reconcileCollection(
          'accounts',
          accounts
        );

        await reconcileCollection(
          'transactions',
          transactions
        );

        await reconcileKeyedMap(
          'budgets',
          budgets
        );

        await reconcileKeyedMap(
          'exchangeRates',
          exchangeRates
        );

        setLastSyncedAt(
          new Date()
        );

        setStatus(
          connected
            ? 'ACTIVE'
            : 'WAITING'
        );
      } catch (syncError) {
        console.error(
          '[SYNC] Force sync failed:',
          syncError
        );

        setError(
          syncError?.message ||
            String(syncError)
        );

        setStatus('ERROR');
      }
    },
    [
      connected,
      reconcileCollection,
      reconcileKeyedMap,
    ]
  );

  /*
   * -----------------------------------------------------------------------
   * DISCONNECT
   * -----------------------------------------------------------------------
   */

  const disconnect = useCallback(() => {
    if (providerRef.current) {
      try {
        providerRef.current.disconnect();
      } catch (disconnectError) {
        console.error(
          '[SYNC] Disconnect failed:',
          disconnectError
        );
      }
    }

    setConnected(false);
    setPeerCount(0);
    setStatus('OFF');
  }, []);

  return {
    status,
    connected,
    peerCount,
    lastSyncedAt,
    error,
    forceSync,
    disconnect,
  };
}
