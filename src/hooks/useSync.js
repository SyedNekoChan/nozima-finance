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

// Must remain different from the Dexie database name.
const YJS_DB_NAME = 'nozima-finance-yjs';

export default function useSync() {
  const isLoaded = useFinanceStore(
    (s) => s.isLoaded
  );

  const [status, setStatus] =
    useState('OFF');

  const [connected, setConnected] =
    useState(false);

  const [peerCount, setPeerCount] =
    useState(0);

  const [
    lastSyncedAt,
    setLastSyncedAt,
  ] = useState(null);

  const [error, setError] =
    useState(null);

  const ydocRef =
    useRef(null);

  const persistenceRef =
    useRef(null);

  const providerRef =
    useRef(null);

  const yMapsRef =
    useRef({});

  const reconciledRef =
    useRef(false);

  /*
   * Prevent synchronization callbacks from recursively processing
   * their own local state mutations.
   */
  const applyingRemoteRef =
    useRef(false);

  /*
   * Prevent overlapping reconciliation passes.
   */
  const reconciliationRunningRef =
    useRef(false);

  const reconciliationQueuedRef =
    useRef(false);

  /*
   * -----------------------------------------------------------------------
   * YJS HELPERS
   * -----------------------------------------------------------------------
   */

  const getMap = useCallback(
    (mapName) => {
      return (
        yMapsRef.current[mapName] ||
        null
      );
    },
    []
  );

  /*
   * Atomically create a deletion tombstone and remove the live record.
   */
  const deleteFromYjs = useCallback(
    (mapName, id) => {
      if (!id) {
        return;
      }

      const yMap =
        getMap(mapName);

      const deletedMap =
        getMap(
          `${mapName}Deleted`
        );

      const ydoc =
        ydocRef.current;

      if (
        !yMap ||
        !deletedMap ||
        !ydoc
      ) {
        return;
      }

      ydoc.transact(() => {
        deletedMap.set(
          id,
          Date.now()
        );

        yMap.delete(id);
      });
    },
    [getMap]
  );

  /*
   * Push a live record into Yjs.
   *
   * A tombstoned record can never be re-created.
   */
  const pushRecordToYjs =
    useCallback(
      (
        mapName,
        record
      ) => {
        if (!record?.id) {
          return;
        }

        const yMap =
          getMap(mapName);

        const deletedMap =
          getMap(
            `${mapName}Deleted`
          );

        if (
          !yMap ||
          !deletedMap
        ) {
          return;
        }

        if (
          deletedMap.has(
            record.id
          )
        ) {
          return;
        }

        yMap.set(
          record.id,
          record
        );
      },
      [getMap]
    );

  /*
   * -----------------------------------------------------------------------
   * COLLECTION RECONCILIATION
   * -----------------------------------------------------------------------
   */

  const reconcileCollection =
    useCallback(
      async (
        mapName,
        remoteMap
      ) => {
        if (!remoteMap) {
          return;
        }

        /*
         * Serialize reconciliation passes.
         */
        if (
          reconciliationRunningRef.current
        ) {
          reconciliationQueuedRef.current =
            true;

          return;
        }

        reconciliationRunningRef.current =
          true;

        applyingRemoteRef.current =
          true;

        try {
          const store =
            useFinanceStore.getState();

          const deletedMap =
            getMap(
              `${mapName}Deleted`
            );

          /*
           * ===============================================================
           * STEP 1
           * Tombstones always win.
           * ===============================================================
           */

          if (deletedMap) {
            const deletedIds =
              Array.from(
                deletedMap.keys()
              );

            for (
              const id of deletedIds
            ) {
              if (
                remoteMap.has(id)
              ) {
                remoteMap.delete(
                  id
                );
              }
            }
          }

          /*
           * ===============================================================
           * STEP 2
           * Read surviving remote records.
           * ===============================================================
           */

          const remoteRecords =
            Array.from(
              remoteMap.values()
            );

          /*
           * ===============================================================
           * STEP 3
           * Apply remote accounts locally.
           * ===============================================================
           */

          if (
            mapName ===
            'accounts'
          ) {
            for (
              const remote of remoteRecords
            ) {
              if (!remote?.id) {
                continue;
              }

              if (
                deletedMap?.has(
                  remote.id
                )
              ) {
                continue;
              }

              const local =
                useFinanceStore
                  .getState()
                  .accounts.find(
                    (account) =>
                      account.id ===
                      remote.id
                  );

              if (!local) {
                await store.addAccount(
                  remote
                );

                continue;
              }

              if (
                JSON.stringify(
                  local
                ) !==
                JSON.stringify(
                  remote
                )
              ) {
                await store.updateAccount(
                  remote
                );
              }
            }
          }

          /*
           * ===============================================================
           * STEP 4
           * Apply remote transactions locally.
           *
           * IMPORTANT:
           *
           * The second argument is FALSE.
           *
           * This tells useFinanceStore that this transaction came from
           * synchronization and therefore MUST NOT modify the account
           * balance again.
           * ===============================================================
           */

          if (
            mapName ===
            'transactions'
          ) {
            for (
              const remote of remoteRecords
            ) {
              if (!remote?.id) {
                continue;
              }

              if (
                deletedMap?.has(
                  remote.id
                )
              ) {
                continue;
              }

              const local =
                useFinanceStore
                  .getState()
                  .transactions.find(
                    (transaction) =>
                      transaction.id ===
                      remote.id
                  );

              if (!local) {
                /*
                 * REMOTE ADD:
                 *
                 * false = do not apply balance effect.
                 */
                await store.addTransaction(
                  remote,
                  false
                );

                continue;
              }

              if (
                JSON.stringify(
                  local
                ) !==
                JSON.stringify(
                  remote
                )
              ) {
                /*
                 * REMOTE UPDATE:
                 *
                 * false = do not apply balance effect.
                 */
                await store.updateTransaction(
                  remote,
                  false
                );
              }
            }
          }

          /*
           * ===============================================================
           * STEP 5
           * Push local-only accounts.
           * ===============================================================
           */

          if (
            mapName ===
            'accounts'
          ) {
            const localAccounts =
              useFinanceStore
                .getState()
                .accounts;

            const remoteIds =
              new Set(
                remoteMap.keys()
              );

            const deletedIds =
              new Set(
                deletedMap
                  ? Array.from(
                      deletedMap.keys()
                    )
                  : []
              );

            for (
              const account of localAccounts
            ) {
              if (
                !remoteIds.has(
                  account.id
                ) &&
                !deletedIds.has(
                  account.id
                )
              ) {
                remoteMap.set(
                  account.id,
                  account
                );
              }
            }
          }

          /*
           * ===============================================================
           * STEP 6
           * Push local-only transactions.
           * ===============================================================
           */

          if (
            mapName ===
            'transactions'
          ) {
            const localTransactions =
              useFinanceStore
                .getState()
                .transactions;

            const remoteIds =
              new Set(
                remoteMap.keys()
              );

            const deletedIds =
              new Set(
                deletedMap
                  ? Array.from(
                      deletedMap.keys()
                    )
                  : []
              );

            for (
              const transaction of
                localTransactions
            ) {
              if (
                !remoteIds.has(
                  transaction.id
                ) &&
                !deletedIds.has(
                  transaction.id
                )
              ) {
                remoteMap.set(
                  transaction.id,
                  transaction
                );
              }
            }
          }
        } finally {
          applyingRemoteRef.current =
            false;

          reconciliationRunningRef.current =
            false;
        }

        /*
         * Run one queued pass after the current pass finishes.
         */
        if (
          reconciliationQueuedRef.current
        ) {
          reconciliationQueuedRef.current =
            false;

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

  const reconcileKeyedMap =
    useCallback(
      async (
        mapName,
        remoteMap
      ) => {
        if (!remoteMap) {
          return;
        }

        applyingRemoteRef.current =
          true;

        try {
          const store =
            useFinanceStore.getState();

          /*
           * Remote values win for keys already present remotely.
           */
          remoteMap.forEach(
            (
              value,
              key
            ) => {
              if (
                mapName ===
                  'budgets' &&
                store.budgets[
                  key
                ] !== value
              ) {
                store.setMonthlyBudget(
                  key,
                  value
                );
              }

              if (
                mapName ===
                  'exchangeRates' &&
                store.exchangeRates[
                  key
                ] !== value
              ) {
                store.setExchangeRate(
                  key,
                  value
                );
              }
            }
          );

          /*
           * Push local-only budgets.
           */
          if (
            mapName ===
            'budgets'
          ) {
            const localBudgets =
              useFinanceStore
                .getState()
                .budgets;

            Object.entries(
              localBudgets
            ).forEach(
              ([
                key,
                value,
              ]) => {
                if (
                  !remoteMap.has(
                    key
                  )
                ) {
                  remoteMap.set(
                    key,
                    value
                  );
                }
              }
            );
          }

          /*
           * Push local-only exchange rates.
           */
          if (
            mapName ===
            'exchangeRates'
          ) {
            const localRates =
              useFinanceStore
                .getState()
                .exchangeRates;

            Object.entries(
              localRates
            ).forEach(
              ([
                key,
                value,
              ]) => {
                if (
                  !remoteMap.has(
                    key
                  )
                ) {
                  remoteMap.set(
                    key,
                    value
                  );
                }
              }
            );
          }
        } finally {
          applyingRemoteRef.current =
            false;
        }
      },
      []
    );

  /*
   * -----------------------------------------------------------------------
   * MAIN SYNC EFFECT
   * -----------------------------------------------------------------------
   */

  useEffect(() => {
    if (!isLoaded) {
      return undefined;
    }

    let cancelled = false;

    setStatus('WAITING');
    setConnected(false);
    setPeerCount(0);
    setError(null);
    setLastSyncedAt(null);

    reconciledRef.current =
      false;

    reconciliationRunningRef.current =
      false;

    reconciliationQueuedRef.current =
      false;

    /*
     * ===============================================================
     * YJS DOCUMENT
     * ===============================================================
     */

    const ydoc =
      new Y.Doc();

    ydocRef.current =
      ydoc;

    const yTransactions =
      ydoc.getMap(
        'transactions'
      );

    const yAccounts =
      ydoc.getMap(
        'accounts'
      );

    const yTransactionsDeleted =
      ydoc.getMap(
        'transactionsDeleted'
      );

    const yAccountsDeleted =
      ydoc.getMap(
        'accountsDeleted'
      );

    const yBudgets =
      ydoc.getMap(
        'budgets'
      );

    const yExchangeRates =
      ydoc.getMap(
        'exchangeRates'
      );

    yMapsRef.current = {
      transactions:
        yTransactions,

      accounts:
        yAccounts,

      transactionsDeleted:
        yTransactionsDeleted,

      accountsDeleted:
        yAccountsDeleted,

      budgets:
        yBudgets,

      exchangeRates:
        yExchangeRates,
    };

    /*
     * ===============================================================
     * INDEXEDDB PERSISTENCE
     * ===============================================================
     */

    const persistence =
      new IndexeddbPersistence(
        YJS_DB_NAME,
        ydoc
      );

    persistenceRef.current =
      persistence;

    let provider = null;

    /*
     * ===============================================================
     * YJS OBSERVERS
     * ===============================================================
     */

    const onTransactionsChanged =
      async () => {
        if (
          !reconciledRef.current
        ) {
          return;
        }

        await reconcileCollection(
          'transactions',
          yTransactions
        );

        if (!cancelled) {
          setLastSyncedAt(
            new Date()
          );
        }
      };

    const onAccountsChanged =
      async () => {
        if (
          !reconciledRef.current
        ) {
          return;
        }

        await reconcileCollection(
          'accounts',
          yAccounts
        );

        if (!cancelled) {
          setLastSyncedAt(
            new Date()
          );
        }
      };

    /*
     * Remote transaction deletion.
     *
     * FALSE prevents the deletion from modifying the account balance.
     */
    const onTransactionsDeletedChanged =
      async () => {
        if (
          !reconciledRef.current
        ) {
          return;
        }

        const deletedIds =
          Array.from(
            yTransactionsDeleted.keys()
          );

        /*
         * Make sure deleted transactions are absent from the live Yjs map.
         */
        ydoc.transact(() => {
          deletedIds.forEach(
            (id) => {
              yTransactions.delete(
                id
              );
            }
          );
        });

        /*
         * Remove the transactions locally.
         *
         * false = do not reverse the account balance.
         */
        for (
          const id of deletedIds
        ) {
          const transaction =
            useFinanceStore
              .getState()
              .transactions.find(
                (t) =>
                  t.id === id
              );

          if (
            transaction
          ) {
            await useFinanceStore
              .getState()
              .deleteTransaction(
                id,
                false
              );
          }
        }

        if (!cancelled) {
          setLastSyncedAt(
            new Date()
          );
        }
      };

    /*
     * Remote account deletion.
     */
    const onAccountsDeletedChanged =
      async () => {
        if (
          !reconciledRef.current
        ) {
          return;
        }

        const deletedIds =
          Array.from(
            yAccountsDeleted.keys()
          );

        /*
         * Remove deleted accounts locally.
         */
        for (
          const id of deletedIds
        ) {
          const exists =
            useFinanceStore
              .getState()
              .accounts.some(
                (account) =>
                  account.id === id
              );

          if (
            exists
          ) {
            await useFinanceStore
              .getState()
              .deleteAccount(
                id
              );
          }
        }

        /*
         * Make sure deleted accounts do not remain in the live map.
         */
        ydoc.transact(() => {
          deletedIds.forEach(
            (id) => {
              yAccounts.delete(
                id
              );
            }
          );
        });

        if (!cancelled) {
          setLastSyncedAt(
            new Date()
          );
        }
      };

    const onBudgetsChanged =
      async () => {
        if (
          !reconciledRef.current
        ) {
          return;
        }

        await reconcileKeyedMap(
          'budgets',
          yBudgets
        );

        if (!cancelled) {
          setLastSyncedAt(
            new Date()
          );
        }
      };

    const onExchangeRatesChanged =
      async () => {
        if (
          !reconciledRef.current
        ) {
          return;
        }

        await reconcileKeyedMap(
          'exchangeRates',
          yExchangeRates
        );

        if (!cancelled) {
          setLastSyncedAt(
            new Date()
          );
        }
      };

    yTransactions.observe(
      onTransactionsChanged
    );

    yAccounts.observe(
      onAccountsChanged
    );

    yTransactionsDeleted.observe(
      onTransactionsDeletedChanged
    );

    yAccountsDeleted.observe(
      onAccountsDeletedChanged
    );

    yBudgets.observe(
      onBudgetsChanged
    );

    yExchangeRates.observe(
      onExchangeRatesChanged
    );

    /*
     * ===============================================================
     * LOCAL ZUSTAND -> YJS
     * ===============================================================
     *
     * Deletions are processed FIRST.
     */

    let previousDeletedAccounts =
      [];

    let previousDeletedTransactions =
      [];

    const unsubscribe =
      useFinanceStore.subscribe(
        (
          state,
          previousState
        ) => {
          if (
            !reconciledRef.current
          ) {
            return;
          }

          if (
            applyingRemoteRef.current
          ) {
            return;
          }

          /*
           * -----------------------------------------------------------
           * ACCOUNT DELETIONS FIRST
           * -----------------------------------------------------------
           */

          const previousAccountDeleteSet =
            new Set(
              previousDeletedAccounts.length
                ? previousDeletedAccounts
                : previousState.deletedAccountIds
            );

          const newAccountDeletes =
            state.deletedAccountIds.filter(
              (id) =>
                !previousAccountDeleteSet.has(
                  id
                )
            );

          if (
            newAccountDeletes.length
          ) {
            const ydoc =
              ydocRef.current;

            if (ydoc) {
              ydoc.transact(
                () => {
                  newAccountDeletes.forEach(
                    (id) => {
                      yAccountsDeleted.set(
                        id,
                        Date.now()
                      );

                      yAccounts.delete(
                        id
                      );
                    }
                  );
                }
              );
            }
          }

          /*
           * -----------------------------------------------------------
           * TRANSACTION DELETIONS FIRST
           * -----------------------------------------------------------
           */

          const previousTransactionDeleteSet =
            new Set(
              previousDeletedTransactions.length
                ? previousDeletedTransactions
                : previousState.deletedTransactionIds
            );

          const newTransactionDeletes =
            state.deletedTransactionIds.filter(
              (id) =>
                !previousTransactionDeleteSet.has(
                  id
                )
            );

          if (
            newTransactionDeletes.length
          ) {
            const ydoc =
              ydocRef.current;

            if (ydoc) {
              ydoc.transact(
                () => {
                  newTransactionDeletes.forEach(
                    (id) => {
                      yTransactionsDeleted.set(
                        id,
                        Date.now()
                      );

                      yTransactions.delete(
                        id
                      );
                    }
                  );
                }
              );
            }
          }

          previousDeletedAccounts =
            [
              ...state.deletedAccountIds,
            ];

          previousDeletedTransactions =
            [
              ...state.deletedTransactionIds,
            ];

          /*
           * -----------------------------------------------------------
           * LIVE ACCOUNTS
           * -----------------------------------------------------------
           */

          const deletedAccountSet =
            new Set(
              state.deletedAccountIds
            );

          state.accounts.forEach(
            (account) => {
              if (
                deletedAccountSet.has(
                  account.id
                )
              ) {
                return;
              }

              pushRecordToYjs(
                'accounts',
                account
              );
            }
          );

          /*
           * -----------------------------------------------------------
           * LIVE TRANSACTIONS
           * -----------------------------------------------------------
           */

          const deletedTransactionSet =
            new Set(
              state.deletedTransactionIds
            );

          state.transactions.forEach(
            (transaction) => {
              if (
                deletedTransactionSet.has(
                  transaction.id
                )
              ) {
                return;
              }

              pushRecordToYjs(
                'transactions',
                transaction
              );
            }
          );

          /*
           * -----------------------------------------------------------
           * BUDGETS
           * -----------------------------------------------------------
           */

          Object.entries(
            state.budgets
          ).forEach(
            ([
              key,
              value,
            ]) => {
              yBudgets.set(
                key,
                value
              );
            }
          );

          /*
           * -----------------------------------------------------------
           * EXCHANGE RATES
           * -----------------------------------------------------------
           */

          Object.entries(
            state.exchangeRates
          ).forEach(
            ([
              key,
              value,
            ]) => {
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
     * ===============================================================
     * INITIAL RECONCILIATION
     * ===============================================================
     */

    const initialize =
      async () => {
        try {
          /*
           * Wait for local Yjs IndexedDB persistence.
           */
          await persistence.whenSynced;

          if (cancelled) {
            return;
          }

          /*
           * Accounts first.
           */
          await reconcileCollection(
            'accounts',
            yAccounts
          );

          if (cancelled) {
            return;
          }

          /*
           * Transactions second.
           *
           * Remote transactions use updateBalance=false.
           */
          await reconcileCollection(
            'transactions',
            yTransactions
          );

          if (cancelled) {
            return;
          }

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
           * From this point forward remote Yjs events are live.
           */
          reconciledRef.current =
            true;

          /*
           * Clean stale tombstoned records.
           */
          ydoc.transact(() => {
            for (
              const id of
                yAccountsDeleted.keys()
            ) {
              yAccounts.delete(
                id
              );
            }

            for (
              const id of
                yTransactionsDeleted.keys()
            ) {
              yTransactions.delete(
                id
              );
            }
          });

          /*
           * ===========================================================
           * WEBRTC
           * ===========================================================
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

          provider.on(
            'status',
            ({
              status:
                connectionStatus,
            }) => {
              if (cancelled) {
                return;
              }

              if (
                connectionStatus ===
                'connected'
              ) {
                setConnected(
                  true
                );

                setStatus(
                  'ACTIVE'
                );
              }

              if (
                connectionStatus ===
                'disconnected'
              ) {
                setConnected(
                  false
                );

                setStatus(
                  'WAITING'
                );
              }
            }
          );

          provider.on(
            'peers',
            ({
              added = [],
              removed = [],
            }) => {
              if (
                cancelled
              ) {
                return;
              }

              setPeerCount(
                (current) =>
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
            setStatus(
              'ACTIVE'
            );

            setLastSyncedAt(
              new Date()
            );
          }
        } catch (
          syncError
        ) {
          console.error(
            '[SYNC] Initialization failed:',
            syncError
          );

          if (!cancelled) {
            setError(
              syncError?.message ||
                String(
                  syncError
                )
            );

            setStatus(
              'ERROR'
            );
          }
        }
      };

    initialize();

    /*
     * ===============================================================
     * CLEANUP
     * ===============================================================
     */

    return () => {
      cancelled = true;

      reconciledRef.current =
        false;

      applyingRemoteRef.current =
        false;

      reconciliationRunningRef.current =
        false;

      reconciliationQueuedRef.current =
        false;

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

      if (
        providerRef.current
      ) {
        try {
          providerRef.current.destroy();
        } catch (
          destroyError
        ) {
          console.error(
            '[SYNC] Provider cleanup failed:',
            destroyError
          );
        }

        providerRef.current =
          null;
      }

      if (
        persistenceRef.current
      ) {
        try {
          persistenceRef.current.destroy();
        } catch (
          destroyError
        ) {
          console.error(
            '[SYNC] Persistence cleanup failed:',
            destroyError
          );
        }

        persistenceRef.current =
          null;
      }

      if (
        ydocRef.current
      ) {
        try {
          ydocRef.current.destroy();
        } catch (
          destroyError
        ) {
          console.error(
            '[SYNC] Y.Doc cleanup failed:',
            destroyError
          );
        }

        ydocRef.current =
          null;
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

  const forceSync =
    useCallback(
      async () => {
        if (
          !ydocRef.current ||
          !reconciledRef.current
        ) {
          return;
        }

        try {
          setStatus(
            'WAITING'
          );

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
        } catch (
          syncError
        ) {
          console.error(
            '[SYNC] Force sync failed:',
            syncError
          );

          setError(
            syncError?.message ||
              String(
                syncError
              )
          );

          setStatus(
            'ERROR'
          );
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

  const disconnect =
    useCallback(
      () => {
        if (
          providerRef.current
        ) {
          try {
            providerRef.current.disconnect();
          } catch (
            disconnectError
          ) {
            console.error(
              '[SYNC] Disconnect failed:',
              disconnectError
            );
          }
        }

        setConnected(false);
        setPeerCount(0);
        setStatus('OFF');
      },
      []
    );

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
