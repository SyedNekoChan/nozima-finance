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
   * Merge a Y.Map into Zustand/Dexie.
   *
   * IMPORTANT:
   * We DO NOT delete local records merely because they are absent
   * from the remote map. During startup that used to cause legitimate
   * local accounts to disappear.
   *
   * Instead:
   * 1. Remote records are upserted locally.
   * 2. Local records missing remotely are pushed to Yjs.
   *
   * This makes initial synchronization additive and safe.
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
             * Anything local that Yjs does not know about gets pushed
             * into Yjs instead of being deleted.
             */
            const localTransactions =
              useFinanceStore.getState()
                .transactions;

            for (
              const local of localTransactions
            ) {
              if (
                !remoteIds.has(
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
             * Never delete a local account just because the remote
             * Yjs map has not received it yet.
             *
             * Push missing local accounts into Yjs instead.
             */
            const localAccounts =
              useFinanceStore.getState()
                .accounts;

            for (
              const local of localAccounts
            ) {
              if (
                !remoteIds.has(
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

          /*
           * Push local keys that aren't remotely present.
           */
          if (
            mapName === 'budgets'
          ) {
            const localBudgets =
              useFinanceStore.getState()
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
              useFinanceStore.getState()
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
     * IMPORTANT:
     * Do not start Yjs synchronization until Dexie has completely
     * loaded the local application state.
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

    const yTransactions =
      ydoc.getMap(
        'transactions'
      );

    const yAccounts =
      ydoc.getMap(
        'accounts'
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
      budgets:
        yBudgets,
      exchangeRates:
        yExchangeRates,
    };

    /*
     * IMPORTANT:
     * Yjs has its own IndexedDB database.
     * Dexie uses "nozima-finance".
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
     * Register observers BEFORE reconciliation so changes generated
     * during synchronization are safely ignored while the remote merge
     * is in progress.
     */
    const makeObserver = (
      mapName,
      reconcileFn,
      yMap
    ) => async () => {
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
      makeObserver(
        'transactions',
        reconcileCollection,
        yTransactions
      );

    const obsAccounts =
      makeObserver(
        'accounts',
        reconcileCollection,
        yAccounts
      );

    const obsBudgets =
      makeObserver(
        'budgets',
        reconcileKeyedMap,
        yBudgets
      );

    const obsExchangeRates =
      makeObserver(
        'exchangeRates',
        reconcileKeyedMap,
        yExchangeRates
      );

    yTransactions.observe(
      obsTransactions
    );

    yAccounts.observe(
      obsAccounts
    );

    yBudgets.observe(
      obsBudgets
    );

    yExchangeRates.observe(
      obsExchangeRates
    );

    /*
     * Push local Zustand changes into Yjs after initial reconciliation.
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

            state.transactions.forEach(
              (t) => {
                pushRecordToYMap(
                  'transactions',
                  t
                );
              }
            );

            prevState.transactions.forEach(
              (t) => {
                if (
                  !nextIds.has(
                    t.id
                  )
                ) {
                  removeRecordFromYMap(
                    'transactions',
                    t.id
                  );
                }
              }
            );
          }

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

            state.accounts.forEach(
              (account) => {
                pushRecordToYMap(
                  'accounts',
                  account
                );
              }
            );

            prevState.accounts.forEach(
              (account) => {
                if (
                  !nextIds.has(
                    account.id
                  )
                ) {
                  removeRecordFromYMap(
                    'accounts',
                    account.id
                  );
                }
              }
            );
          }

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
     * Wait until Yjs IndexedDB has loaded.
     */
    persistence.once(
      'synced',
      async () => {
        if (cancelled) {
          return;
        }

        /*
         * Reconcile local Dexie state with persisted Yjs state.
         *
         * This is intentionally awaited so the guard remains active
         * throughout the entire merge.
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
         * Only now should Zustand changes begin flowing normally into Yjs.
         */
        reconciledRef.current =
          true;

        /*
         * Bring up WebRTC signalling.
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

      yBudgets.unobserve(
        obsBudgets
      );

      yExchangeRates.unobserve(
        obsExchangeRates
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
