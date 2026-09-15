import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import * as Y from 'yjs';
import {
  IndexeddbPersistence,
} from 'y-indexeddb';
import {
  WebrtcProvider,
} from 'y-webrtc';
import useFinanceStore from './useFinanceStore.js';

const ROOM_NAME =
  'nozima-finance-room';

const ROOM_PASSWORD =
  'nozima-finance-room';

const YJS_DB_NAME =
  'nozima-finance-yjs';

export default function useSync() {
  const isLoaded =
    useFinanceStore(
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
   * Prevents a synchronization pass from reacting to
   * its own state mutations.
   */
  const applyingRemoteRef =
    useRef(false);

  /*
   * Prevents overlapping reconciliation passes.
   */
  const reconciliationRunningRef =
    useRef(false);

  /*
   * Queue a reconciliation if a previous one is still running.
   */
  const reconciliationQueuedRef =
    useRef(false);

  /*
   * Push an individual record into Yjs.
   */
  const pushRecordToYMap =
    useCallback(
      (
        mapName,
        record
      ) => {
        const yMap =
          yMapsRef.current[
            mapName
          ];

        if (
          !yMap ||
          !record ||
          !record.id
        ) {
          return;
        }

        yMap.set(
          record.id,
          record
        );
      },
      []
    );

  /*
   * Remove an individual record from Yjs.
   */
  const removeRecordFromYMap =
    useCallback(
      (
        mapName,
        id
      ) => {
        const yMap =
          yMapsRef.current[
            mapName
          ];

        if (
          !yMap ||
          !id
        ) {
          return;
        }

        yMap.delete(id);
      },
      []
    );

  /*
   * Record an explicit deletion in Yjs.
   *
   * This is deliberately NOT blocked by applyingRemoteRef.
   * A deletion is authoritative local state and must always
   * reach the synchronization layer.
   */
  const markDeletedInYMap =
    useCallback(
      (
        mapName,
        id
      ) => {
        const deletedMap =
          yMapsRef.current[
            `${mapName}Deleted`
          ];

        if (
          !deletedMap ||
          !id
        ) {
          return;
        }

        deletedMap.set(
          id,
          Date.now()
        );
      },
      []
    );

  /*
   * Reconcile transactions or accounts.
   *
   * Synchronization policy:
   *
   *   remote record exists
   *       -> upsert locally
   *
   *   local record exists but remote doesn't
   *       -> push locally-created record remotely
   *
   *   tombstone exists
   *       -> deletion wins; never resurrect
   */
  const reconcileCollection =
    useCallback(
      async (
        mapName,
        remoteMap
      ) => {
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
            yMapsRef.current[
              `${mapName}Deleted`
            ];

          /*
           * First remove any stale remote records that have
           * explicit deletion tombstones.
           */
          if (
            deletedMap
          ) {
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

          let remoteRecords =
            Array.from(
              remoteMap.values()
            );

          /*
           * Apply remote records locally.
           */
          if (
            mapName ===
            'accounts'
          ) {
            for (
              const remote of remoteRecords
            ) {
              if (
                !remote?.id
              ) {
                continue;
              }

              /*
               * A tombstone always wins.
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
              } else if (
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
              if (
                !remote?.id
              ) {
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
                await store.addTransaction(
                  remote
                );
              } else if (
                JSON.stringify(
                  local
                ) !==
                JSON.stringify(
                  remote
                )
              ) {
                await store.updateTransaction(
                  remote
                );
              }
            }
          }

          /*
           * Refresh local state after remote upserts.
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

            /*
             * Any local account absent remotely is treated as
             * a locally-created record and pushed to Yjs.
             *
             * Deleted accounts are explicitly excluded.
             */
            for (
              const account of localAccounts
            ) {
              if (
                !remoteIds.has(
                  account.id
                ) &&
                !deletedMap?.has(
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

            for (
              const transaction of localTransactions
            ) {
              if (
                !remoteIds.has(
                  transaction.id
                ) &&
                !deletedMap?.has(
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

          /*
           * Refresh the remote record list in case local records
           * were pushed during this pass.
           */
          remoteRecords =
            Array.from(
              remoteMap.values()
            );
        } finally {
          applyingRemoteRef.current =
            false;

          reconciliationRunningRef.current =
            false;
        }

        /*
         * If another Yjs event arrived while reconciliation was
         * running, run one more pass after the current pass finishes.
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
      []
    );

  const reconcileKeyedMap =
    useCallback(
      async (
        mapName,
        remoteMap
      ) => {
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
                store.budgets[key] !==
                  value
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
                ] !==
                  value
              ) {
                store.setExchangeRate(
                  key,
                  value
                );
              }
            }
          );

          /*
           * Push local keys that don't exist remotely.
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
              (
                [
                  key,
                  value,
                ]
              ) => {
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
              (
                [
                  key,
                  value,
                ]
              ) => {
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

  useEffect(() => {
    /*
     * Never start Yjs until the local application database
     * has completely finished loading.
     */
    if (!isLoaded) {
      return undefined;
    }

    let cancelled =
      false;

    setStatus('WAITING');
    setError(null);
    setLastSyncedAt(null);

    reconciledRef.current =
      false;

    const ydoc =
      new Y.Doc();

    ydocRef.current =
      ydoc;

    /*
     * Main collections.
     */
    const yTransactions =
      ydoc.getMap(
        'transactions'
      );

    const yAccounts =
      ydoc.getMap(
        'accounts'
      );

    /*
     * Deletion tombstones.
     */
    const yTransactionsDeleted =
      ydoc.getMap(
        'transactionsDeleted'
      );

    const yAccountsDeleted =
      ydoc.getMap(
        'accountsDeleted'
      );

    /*
     * Key/value collections.
     */
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
     * Separate IndexedDB database for Yjs.
     */
    const persistence =
      new IndexeddbPersistence(
        YJS_DB_NAME,
        ydoc
      );

    persistenceRef.current =
      persistence;

    let provider =
      null;

    /*
     * Remote collection observers.
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
      };

    /*
     * Remote deletion observers.
     *
     * A tombstone is enough to remove a local record.
     * No second tombstone is generated here.
     */
    const onTransactionsDeleted =
      async () => {
        if (
          !reconciledRef.current
        ) {
          return;
        }

        const store =
          useFinanceStore.getState();

        const deletedIds =
          Array.from(
            yTransactionsDeleted.keys()
          );

        for (
          const id of deletedIds
        ) {
          const exists =
            useFinanceStore
              .getState()
              .transactions.some(
                (transaction) =>
                  transaction.id ===
                  id
              );

          if (exists) {
            /*
             * Delete locally.
             *
             * This records the same deletion ID in Zustand,
             * but does not resurrect the record because the Yjs
             * tombstone already exists.
             */
            await store.deleteTransaction(
              id
            );
          }
        }

        /*
         * Remove deleted records from the main Yjs map.
         */
        applyingRemoteRef.current =
          true;

        try {
          deletedIds.forEach(
            (id) => {
              if (
                yTransactions.has(id)
              ) {
                yTransactions.delete(
                  id
                );
              }
            }
          );
        } finally {
          applyingRemoteRef.current =
            false;
        }
      };

    const onAccountsDeleted =
      async () => {
        if (
          !reconciledRef.current
        ) {
          return;
        }

        const store =
          useFinanceStore.getState();

        const deletedIds =
          Array.from(
            yAccountsDeleted.keys()
          );

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

          if (exists) {
            await store.deleteAccount(
              id
            );
          }
        }

        /*
         * Remove deleted records from the main Yjs map.
         */
        applyingRemoteRef.current =
          true;

        try {
          deletedIds.forEach(
            (id) => {
              if (
                yAccounts.has(id)
              ) {
                yAccounts.delete(
                  id
                );
              }
            }
          );
        } finally {
          applyingRemoteRef.current =
            false;
        }
      };

    const onBudgetsChanged =
      async () => {
        if (
          !reconciledRef.current ||
          applyingRemoteRef.current
        ) {
          return;
        }

        await reconcileKeyedMap(
          'budgets',
          yBudgets
        );
      };

    const onExchangeRatesChanged =
      async () => {
        if (
          !reconciledRef.current ||
          applyingRemoteRef.current
        ) {
          return;
        }

        await reconcileKeyedMap(
          'exchangeRates',
          yExchangeRates
        );
      };

    yTransactions.observe(
      onTransactionsChanged
    );

    yAccounts.observe(
      onAccountsChanged
    );

    yTransactionsDeleted.observe(
      onTransactionsDeleted
    );

    yAccountsDeleted.observe(
      onAccountsDeleted
    );

    yBudgets.observe(
      onBudgetsChanged
    );

    yExchangeRates.observe(
      onExchangeRatesChanged
    );

    /*
     * Local Zustand -> Yjs synchronization.
     */
    const unsubscribe =
      useFinanceStore.subscribe(
        (
          state,
          prevState
        ) => {
          if (
            !reconciledRef.current
          ) {
            return;
          }

          /*
           * Existing transactions/accounts.
           */
          if (
            state.transactions !==
            prevState.transactions
          ) {
            const deletedMap =
              yMapsRef.current
                .transactionsDeleted;

            state.transactions.forEach(
              (transaction) => {
                if (
                  !deletedMap?.has(
                    transaction.id
                  )
                ) {
                  pushRecordToYMap(
                    'transactions',
                    transaction
                  );
                }
              }
            );
          }

          if (
            state.accounts !==
            prevState.accounts
          ) {
            const deletedMap =
              yMapsRef.current
                .accountsDeleted;

            state.accounts.forEach(
              (account) => {
                if (
                  !deletedMap?.has(
                    account.id
                  )
                ) {
                  pushRecordToYMap(
                    'accounts',
                    account
                  );
                }
              }
            );
          }

          /*
           * Explicit transaction deletions.
           */
          if (
            state.deletedTransactionIds !==
            prevState.deletedTransactionIds
          ) {
            state.deletedTransactionIds.forEach(
              (id) => {
                markDeletedInYMap(
                  'transactions',
                  id
                );

                removeRecordFromYMap(
                  'transactions',
                  id
                );
              }
            );
          }

          /*
           * Explicit account deletions.
           */
          if (
            state.deletedAccountIds !==
            prevState.deletedAccountIds
          ) {
            state.deletedAccountIds.forEach(
              (id) => {
                markDeletedInYMap(
                  'accounts',
                  id
                );

                removeRecordFromYMap(
                  'accounts',
                  id
                );
              }
            );
          }

          /*
           * Budgets.
           */
          if (
            state.budgets !==
            prevState.budgets
          ) {
            const yMap =
              yMapsRef.current
                .budgets;

            if (yMap) {
              Object.entries(
                state.budgets
              ).forEach(
                (
                  [
                    month,
                    amount,
                  ]
                ) => {
                  if (
                    yMap.get(
                      month
                    ) !==
                    amount
                  ) {
                    yMap.set(
                      month,
                      amount
                    );
                  }
                }
              );
            }
          }

          /*
           * Exchange rates.
           */
          if (
            state.exchangeRates !==
            prevState.exchangeRates
          ) {
            const yMap =
              yMapsRef.current
                .exchangeRates;

            if (yMap) {
              Object.entries(
                state.exchangeRates
              ).forEach(
                (
                  [
                    code,
                    rate,
                  ]
                ) => {
                  if (
                    yMap.get(
                      code
                    ) !==
                    rate
                  ) {
                    yMap.set(
                      code,
                      rate
                    );
                  }
                }
              );
            }
          }
        }
      );

    /*
     * Wait until the Yjs IndexedDB cache is loaded.
     */
    persistence.once(
      'synced',
      async () => {
        if (
          cancelled
        ) {
          return;
        }

        /*
         * Initial local/remote reconciliation.
         */
        await reconcileCollection(
          'transactions',
          yTransactions
        );

        if (
          cancelled
        ) {
          return;
        }

        await reconcileCollection(
          'accounts',
          yAccounts
        );

        if (
          cancelled
        ) {
          return;
        }

        await reconcileKeyedMap(
          'budgets',
          yBudgets
        );

        if (
          cancelled
        ) {
          return;
        }

        await reconcileKeyedMap(
          'exchangeRates',
          yExchangeRates
        );

        if (
          cancelled
        ) {
          return;
        }

        /*
         * Initial state has now been reconciled.
         */
        reconciledRef.current =
          true;

        /*
         * Start WebRTC.
         */
        try {
          provider =
            new WebrtcProvider(
              ROOM_NAME,
              ydoc,
              {
                signaling: [
                  'wss://signaling.yjs.dev',
                ],
                password:
                  ROOM_PASSWORD,
              }
            );

          providerRef.current =
            provider;

          provider.on(
            'status',
            ({
              connected:
                isConnected,
            }) => {
              if (
                cancelled
              ) {
                return;
              }

              setConnected(
                isConnected
              );

              setStatus(
                isConnected
                  ? 'ACTIVE'
                  : 'WAITING'
              );
            }
          );

          provider.on(
            'peers',
            ({
              webrtcPeers,
            }) => {
              if (
                cancelled
              ) {
                return;
              }

              setPeerCount(
                webrtcPeers
                  ? webrtcPeers.length
                  : 0
              );
            }
          );

          provider.on(
            'synced',
            () => {
              if (
                cancelled
              ) {
                return;
              }

              setLastSyncedAt(
                new Date()
              );
            }
          );
        } catch (
          err
        ) {
          console.error(
            'Failed to initialize WebRTC provider:',
            err
          );

          setError(err);
          setStatus(
            'ERROR'
          );
        }
      }
    );

    /*
     * Cleanup.
     */
    return () => {
      cancelled = true;

      unsubscribe();

      yTransactions.unobserve(
        onTransactionsChanged
      );

      yAccounts.unobserve(
        onAccountsChanged
      );

      yTransactionsDeleted.unobserve(
        onTransactionsDeleted
      );

      yAccountsDeleted.unobserve(
        onAccountsDeleted
      );

      yBudgets.unobserve(
        onBudgetsChanged
      );

      yExchangeRates.unobserve(
        onExchangeRatesChanged
      );

      try {
        providerRef.current?.destroy();
      } catch (
        err
      ) {
        // Best-effort cleanup.
      }

      try {
        persistenceRef.current?.destroy();
      } catch (
        err
      ) {
        // Best-effort cleanup.
      }

      try {
        ydocRef.current?.destroy();
      } catch (
        err
      ) {
        // Best-effort cleanup.
      }

      providerRef.current =
        null;

      persistenceRef.current =
        null;

      ydocRef.current =
        null;

      yMapsRef.current = {};

      reconciledRef.current =
        false;

      applyingRemoteRef.current =
        false;

      reconciliationRunningRef.current =
        false;

      reconciliationQueuedRef.current =
        false;
    };
  }, [
    isLoaded,
    pushRecordToYMap,
    removeRecordFromYMap,
    markDeletedInYMap,
    reconcileCollection,
    reconcileKeyedMap,
  ]);

  /*
   * Force-sync.
   */
  const forceSync =
    useCallback(() => {
      if (
        !ydocRef.current
      ) {
        return;
      }

      try {
        providerRef.current?.destroy();

        const provider =
          new WebrtcProvider(
            ROOM_NAME,
            ydocRef.current,
            {
              signaling: [
                'wss://signaling.yjs.dev',
              ],
              password:
                ROOM_PASSWORD,
            }
          );

        providerRef.current =
          provider;

        setStatus(
          'WAITING'
        );

        setError(
          null
        );

        provider.on(
          'status',
          ({
            connected:
              isConnected,
          }) => {
            setConnected(
              isConnected
            );

            setStatus(
              isConnected
                ? 'ACTIVE'
                : 'WAITING'
            );
          }
        );

        provider.on(
          'peers',
          ({
            webrtcPeers,
          }) => {
            setPeerCount(
              webrtcPeers
                ? webrtcPeers.length
                : 0
            );
          }
        );

        provider.on(
          'synced',
          () => {
            setLastSyncedAt(
              new Date()
            );
          }
        );
      } catch (
        err
      ) {
        console.error(
          'Failed to force sync:',
          err
        );

        setError(
          err
        );

        setStatus(
          'ERROR'
        );
      }
    }, []);

  const disconnect =
    useCallback(
      () => {
        try {
          providerRef.current?.destroy();
        } catch (
          err
        ) {
          // Best-effort cleanup.
        }

        providerRef.current =
          null;

        setConnected(
          false
        );

        setPeerCount(
          0
        );

        setStatus(
          'OFF'
        );
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
