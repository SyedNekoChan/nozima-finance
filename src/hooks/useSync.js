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

  const ydocRef = useRef(null);

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
   * mutations that were themselves caused by synchronization.
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
   * Atomically delete a record from Yjs and create its tombstone.
   *
   * Tombstone + deletion happen in the same Yjs transaction so another
   * observer cannot see a half-completed deletion.
   */
  const deleteFromYjs = useCallback(
    (mapName, id) => {
      if (!id) {
        return;
      }

      const yMap = getMap(mapName);

      const deletedMap = getMap(
        `${mapName}Deleted`
      );

      const ydoc = ydocRef.current;

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
   * A tombstoned record can never be recreated by normal synchronization.
   */
  const pushRecordToYjs =
    useCallback(
      (mapName, record) => {
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
   *
   * Remote records update local records.
   *
   * Local records missing remotely are pushed remotely.
   *
   * Tombstones always win.
   *
   * IMPORTANT:
   *
   * Remote transactions call:
   *
   *   addTransaction(remote, false)
   *   updateTransaction(remote, false)
   *
   * This prevents a remote transaction from changing an account balance
   * a second time.
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
         * Do not allow overlapping async reconciliation passes.
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
           * STEP 1 — REMOVE TOMBSTONED RECORDS FROM LIVE YJS MAP
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
                remoteMap.delete(id);
              }
            }
          }

          /*
           * ===============================================================
           * STEP 2 — READ SURVIVING REMOTE RECORDS
           * ===============================================================
           */

          const remoteRecords =
            Array.from(
              remoteMap.values()
            );

          /*
           * ===============================================================
           * STEP 3 — APPLY REMOTE RECORDS LOCALLY
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

              /*
               * A deletion tombstone is authoritative.
               */
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

              /*
               * A deletion tombstone is authoritative.
               */
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
                 * FALSE is critical.
                 *
                 * The remote transaction is being imported. Its account
                 * balance is synchronized separately through the account
                 * object, so do not apply the transaction's balance effect
                 * again.
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
                 * FALSE is critical for the same reason during edits.
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
           * STEP 4 — PUSH LOCAL-ONLY RECORDS REMOTELY
           * ===============================================================
           *
           * We NEVER delete local records merely because they are absent
           * from Yjs. Absence can simply mean the remote side has not
           * received the record yet.
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
         * If Yjs changed during the reconciliation pass, run one more
         * serialized pass.
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
           * Remote values win for keys that already exist remotely.
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
    /*
     * Wait until the local Dexie-backed application state has loaded.
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
     * Transaction deletion observer.
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
         * Make absolutely sure tombstoned transactions cannot remain
         * in the live Yjs map.
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
         * Remove deleted records from the local transaction collection
         * WITHOUT changing account balances here.
         *
         * The account object is the synchronized balance authority.
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
     * Account deletion observer.
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
         * Delete locally.
         *
         * We use the existing action with a tombstone already present
         * remotely, so the synchronization layer cannot resurrect it.
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
              .deleteAccount(id);
          }
        }

        /*
         * Remove deleted accounts from the live Yjs collection.
         */
        ydoc.transact(() => {
          deletedIds.forEach(
            (id) => {
              yAccounts.delete(id);
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
     *
     * This preserves the previous fix where deleting one account from
     * multiple cards no longer causes it to reappear at the end.
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

          /*
           * Ignore state changes caused by incoming remote synchronization.
           */
          if (
            applyingRemoteRef.current
          ) {
            return;
          }

          /*
           * ===========================================================
           * 1. PROCESS ACCOUNT DELETIONS FIRST
           * ===========================================================
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
           * ===========================================================
           * 2. PROCESS TRANSACTION DELETIONS FIRST
           * ===========================================================
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
           * ===========================================================
           * 3. PUSH LIVE ACCOUNTS
           * ===========================================================
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
           * ===========================================================
           * 4. PUSH LIVE TRANSACTIONS
           * ===========================================================
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
           * ===========================================================
           * 5. PUSH BUDGETS
           * ===========================================================
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
           * ===========================================================
           * 6. PUSH EXCHANGE RATES
           * ===========================================================
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
           * Wait for Yjs IndexedDB state.
           */
          await persistence.whenSynced;

          if (cancelled) {
            return;
          }

          /*
           * Accounts first because account balances are displayed
           * throughout the application.
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
           *
           * Because remote transaction imports use updateBalance=false,
           * they cannot alter account balances twice.
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
           * From this point onwards Yjs observers are allowed to process
           * incoming remote changes.
           */
          reconciledRef.current =
            true;

          /*
           * Remove any stale live records that have tombstones.
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
           * =============================================================
           * WEBRTC
           * =============================================================
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
