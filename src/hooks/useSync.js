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

  const [lastSyncedAt, setLastSyncedAt] =
    useState(null);

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

  const applyingRemoteRef =
    useRef(false);

  const pushRecordToYMap =
    useCallback(
      (mapName, record) => {
        if (
          applyingRemoteRef.current
        ) {
          return;
        }

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

  const removeRecordFromYMap =
    useCallback(
      (mapName, id) => {
        if (
          applyingRemoteRef.current
        ) {
          return;
        }

        const yMap =
          yMapsRef.current[
            mapName
          ];

        if (!yMap) {
          return;
        }

        yMap.delete(id);
      },
      []
    );

  /*
   * Record an intentional deletion in a Yjs tombstone map.
   *
   * This prevents an account/transaction that exists in another
   * synchronized copy from being resurrected after deletion.
   */
  const markDeletedInYMap =
    useCallback(
      (mapName, id) => {
        if (
          applyingRemoteRef.current
        ) {
          return;
        }

        const deletedMap =
          yMapsRef.current[
            `${mapName}Deleted`
          ];

        if (!deletedMap || !id) {
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
   * Merge a Y.Map into Zustand/Dexie.
   *
   * IMPORTANT:
   * - Remote records are upserted locally.
   * - Local records missing remotely are pushed to Yjs.
   * - Deleted IDs are protected by tombstones.
   */
  const reconcileCollection =
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

          const deletedMap =
            yMapsRef.current[
              `${mapName}Deleted`
            ];

          /*
           * First remove any remote records that have an
           * established deletion tombstone.
           */
          if (deletedMap) {
            const deletedIds =
              new Set(
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

          const remoteRecords =
            Array.from(
              remoteMap.values()
            );

          const remoteIds =
            new Set(
              remoteRecords.map(
                (record) =>
                  record.id
              )
            );

          if (
            mapName ===
            'transactions'
          ) {
            for (
              const remote of remoteRecords
            ) {
              const local =
                useFinanceStore
                  .getState()
                  .transactions.find(
                    (t) =>
                      t.id ===
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

            /*
             * Local transactions missing remotely are not deleted.
             * They are pushed into Yjs.
             */
            const localTransactions =
              useFinanceStore
                .getState()
                .transactions;

            for (
              const local of localTransactions
            ) {
              if (
                !remoteIds.has(
                  local.id
                ) &&
                !deletedMap?.has(
                  local.id
                )
              ) {
                remoteMap.set(
                  local.id,
                  local
                );
              }
            }
          }

          if (
            mapName === 'accounts'
          ) {
            for (
              const remote of remoteRecords
            ) {
              /*
               * Never resurrect a tombstoned account.
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
                    (a) =>
                      a.id ===
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

            /*
             * Local accounts missing remotely are pushed into Yjs.
             *
             * HOWEVER, accounts with a deletion tombstone are never
             * pushed back into Yjs.
             */
            const localAccounts =
              useFinanceStore
                .getState()
                .accounts;

            for (
              const local of localAccounts
            ) {
              if (
                !remoteIds.has(
                  local.id
                ) &&
                !deletedMap?.has(
                  local.id
                )
              ) {
                remoteMap.set(
                  local.id,
                  local
                );
              }
            }
          }
        } finally {
          applyingRemoteRef.current =
            false;
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

          remoteMap.forEach(
            (value, key) => {
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
                ] !== value
              ) {
                store.setExchangeRate(
                  key,
                  value
                );
              }
            }
          );

          if (
            mapName === 'budgets'
          ) {
            const localBudgets =
              useFinanceStore
                .getState()
                .budgets;

            Object.entries(
              localBudgets
            ).forEach(
              ([key, value]) => {
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
              ([key, value]) => {
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
     * Do not start Yjs synchronization until Dexie has
     * completely loaded the local application state.
     */
    if (!isLoaded) {
      return undefined;
    }

    let cancelled = false;

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
     * Main synchronized collections.
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
     * Tombstones.
     *
     * Once an ID appears here, synchronization knows that
     * the record was intentionally deleted.
     */
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
     * Yjs persistence uses a separate IndexedDB database
     * from the application's Dexie database.
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
     * Collection observers.
     */
    const makeCollectionObserver =
      (
        mapName,
        reconcileFn,
        yMap
      ) =>
      async () => {
        if (
          !reconciledRef.current ||
          applyingRemoteRef.current
        ) {
          return;
        }

        await reconcileFn(
          mapName,
          yMap
        );
      };

    const obsTransactions =
      makeCollectionObserver(
        'transactions',
        reconcileCollection,
        yTransactions
      );

    const obsAccounts =
      makeCollectionObserver(
        'accounts',
        reconcileCollection,
        yAccounts
      );

    /*
     * Tombstone observers.
     *
     * When a remote device creates a deletion tombstone,
     * immediately remove that record from the local store.
     */
    const handleTransactionDeletion =
      () => {
        if (
          !reconciledRef.current ||
          applyingRemoteRef.current
        ) {
          return;
        }

        applyingRemoteRef.current =
          true;

        try {
          const store =
            useFinanceStore.getState();

          yTransactionsDeleted.forEach(
            (_timestamp, id) => {
              if (
                store.transactions.some(
                  (t) =>
                    t.id === id
                )
              ) {
                store.deleteTransaction(
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

    const handleAccountDeletion =
      () => {
        if (
          !reconciledRef.current ||
          applyingRemoteRef.current
        ) {
          return;
        }

        applyingRemoteRef.current =
          true;

        try {
          const store =
            useFinanceStore.getState();

          yAccountsDeleted.forEach(
            (_timestamp, id) => {
              if (
                store.accounts.some(
                  (a) =>
                    a.id === id
                )
              ) {
                store.deleteAccount(
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

    yTransactions.observe(
      obsTransactions
    );

    yAccounts.observe(
      obsAccounts
    );

    yTransactionsDeleted.observe(
      handleTransactionDeletion
    );

    yAccountsDeleted.observe(
      handleAccountDeletion
    );

    yBudgets.observe(
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
      }
    );

    yExchangeRates.observe(
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
      }
    );

    /*
     * Push local Zustand changes into Yjs.
     */
    const unsubscribe =
      useFinanceStore.subscribe(
        (
          state,
          prevState
        ) => {
          if (
            !reconciledRef.current ||
            applyingRemoteRef.current
          ) {
            return;
          }

          /*
           * TRANSACTIONS
           */
          if (
            state.transactions !==
            prevState.transactions
          ) {
            const nextIds =
              new Set(
                state.transactions.map(
                  (t) => t.id
                )
              );

            /*
             * Add/update current records.
             */
            state.transactions.forEach(
              (transaction) => {
                /*
                 * A newly existing record should not be
                 * blocked unless its ID has explicitly been
                 * tombstoned.
                 */
                const deletedMap =
                  yMapsRef.current
                    .transactionsDeleted;

                if (
                  deletedMap?.has(
                    transaction.id
                  )
                ) {
                  return;
                }

                pushRecordToYMap(
                  'transactions',
                  transaction
                );
              }
            );

            /*
             * Record local deletions as tombstones.
             */
            prevState.transactions.forEach(
              (transaction) => {
                if (
                  !nextIds.has(
                    transaction.id
                  )
                ) {
                  markDeletedInYMap(
                    'transactions',
                    transaction.id
                  );

                  removeRecordFromYMap(
                    'transactions',
                    transaction.id
                  );
                }
              }
            );
          }

          /*
           * ACCOUNTS
           */
          if (
            state.accounts !==
            prevState.accounts
          ) {
            const nextIds =
              new Set(
                state.accounts.map(
                  (a) => a.id
                )
              );

            const deletedMap =
              yMapsRef.current
                .accountsDeleted;

            /*
             * Add/update current accounts.
             */
            state.accounts.forEach(
              (account) => {
                /*
                 * Never re-create an account that has
                 * an intentional deletion tombstone.
                 */
                if (
                  deletedMap?.has(
                    account.id
                  )
                ) {
                  return;
                }

                pushRecordToYMap(
                  'accounts',
                  account
                );
              }
            );

            /*
             * Record local deletions as tombstones.
             */
            prevState.accounts.forEach(
              (account) => {
                if (
                  !nextIds.has(
                    account.id
                  )
                ) {
                  markDeletedInYMap(
                    'accounts',
                    account.id
                  );

                  removeRecordFromYMap(
                    'accounts',
                    account.id
                  );
                }
              }
            );
          }

          /*
           * BUDGETS
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
                ([month, amount]) => {
                  if (
                    yMap.get(month) !==
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
           * EXCHANGE RATES
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
                ([code, rate]) => {
                  if (
                    yMap.get(code) !==
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
     * Wait for Yjs IndexedDB persistence to load,
     * then reconcile.
     */
    persistence.once(
      'synced',
      async () => {
        if (cancelled) {
          return;
        }

        /*
         * Reconcile in a controlled order.
         */
        await reconcileCollection(
          'transactions',
          yTransactions
        );

        if (cancelled) {
          return;
        }

        await reconcileCollection(
          'accounts',
          yAccounts
        );

        if (cancelled) {
          return;
        }

        await reconcileKeyedMap(
          'budgets',
          yBudgets
        );

        if (cancelled) {
          return;
        }

        await reconcileKeyedMap(
          'exchangeRates',
          yExchangeRates
        );

        if (cancelled) {
          return;
        }

        /*
         * Synchronization is now ready.
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
              if (cancelled) {
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
              if (cancelled) {
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
              if (cancelled) {
                return;
              }

              setLastSyncedAt(
                new Date()
              );
            }
          );
        } catch (err) {
          console.error(
            'Failed to initialize WebRTC provider:',
            err
          );

          setError(err);
          setStatus('ERROR');
        }
      }
    );

    return () => {
      cancelled = true;

      unsubscribe();

      yTransactions.unobserve(
        obsTransactions
      );

      yAccounts.unobserve(
        obsAccounts
      );

      yTransactionsDeleted.unobserve(
        handleTransactionDeletion
      );

      yAccountsDeleted.unobserve(
        handleAccountDeletion
      );

      try {
        providerRef.current?.destroy();
      } catch (err) {
        // Best-effort cleanup.
      }

      try {
        persistenceRef.current?.destroy();
      } catch (err) {
        // Best-effort cleanup.
      }

      try {
        ydocRef.current?.destroy();
      } catch (err) {
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
    };
  }, [
    isLoaded,
    pushRecordToYMap,
    removeRecordFromYMap,
    markDeletedInYMap,
    reconcileCollection,
    reconcileKeyedMap,
  ]);

  const forceSync =
    useCallback(() => {
      if (!ydocRef.current) {
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

        setStatus('WAITING');
        setError(null);

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
      } catch (err) {
        console.error(
          'Failed to force sync:',
          err
        );

        setError(err);
        setStatus('ERROR');
      }
    }, []);

  const disconnect =
    useCallback(() => {
      try {
        providerRef.current?.destroy();
      } catch (err) {
        // Best-effort cleanup.
      }

      providerRef.current =
        null;

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
