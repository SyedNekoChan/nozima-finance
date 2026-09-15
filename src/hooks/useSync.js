import { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebrtcProvider } from 'y-webrtc';
import useFinanceStore from './useFinanceStore.js';

const ROOM_NAME = 'nozima-finance-room';
const ROOM_PASSWORD = 'nozima-finance-room';

// IMPORTANT:
// Keep Yjs IndexedDB persistence separate from the application's Dexie database.
// src/lib/db.js uses "nozima-finance".
const YJS_DB_NAME = 'nozima-finance-yjs';

export default function useSync() {
  const [status, setStatus] = useState('OFF'); // OFF | WAITING | ACTIVE | ERROR
  const [connected, setConnected] = useState(false);
  const [peerCount, setPeerCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [error, setError] = useState(null);

  const ydocRef = useRef(null);
  const persistenceRef = useRef(null);
  const providerRef = useRef(null);
  const yMapsRef = useRef({});
  const reconciledRef = useRef(false); // guards zustand->yjs push until initial merge is done
  const applyingRemoteRef = useRef(false); // guards against yjs->zustand->yjs echo

  const pushRecordToYMap = useCallback((mapName, record) => {
    if (applyingRemoteRef.current) return;

    const yMap = yMapsRef.current[mapName];

    if (!yMap || !record || !record.id) return;

    yMap.set(record.id, record);
  }, []);

  const removeRecordFromYMap = useCallback((mapName, id) => {
    if (applyingRemoteRef.current) return;

    const yMap = yMapsRef.current[mapName];

    if (!yMap) return;

    yMap.delete(id);
  }, []);

  // Reconcile a Y.Map of transactions/accounts into the store via its real actions,
  // since there is no bulk setter on useFinanceStore.
  const reconcileCollection = useCallback((mapName, remoteMap) => {
    applyingRemoteRef.current = true;

    try {
      const store = useFinanceStore.getState();
      const remoteRecords = Array.from(remoteMap.values());
      const remoteIds = new Set(remoteRecords.map((r) => r.id));

      if (mapName === 'transactions') {
        const localById = new Map(
          store.transactions.map((t) => [t.id, t])
        );

        remoteRecords.forEach((remote) => {
          const local = localById.get(remote.id);

          if (!local) {
            store.addTransaction(remote);
          } else if (JSON.stringify(local) !== JSON.stringify(remote)) {
            store.updateTransaction(remote);
          }
        });

        store.transactions.forEach((local) => {
          if (!remoteIds.has(local.id)) {
            store.deleteTransaction(local.id);
          }
        });
      }

      if (mapName === 'accounts') {
        const localById = new Map(
          store.accounts.map((a) => [a.id, a])
        );

        remoteRecords.forEach((remote) => {
          const local = localById.get(remote.id);

          if (!local) {
            store.addAccount(remote);
          } else if (JSON.stringify(local) !== JSON.stringify(remote)) {
            store.updateAccount(remote);
          }
        });

        store.accounts.forEach((local) => {
          if (!remoteIds.has(local.id)) {
            store.deleteAccount(local.id);
          }
        });
      }
    } finally {
      applyingRemoteRef.current = false;
    }
  }, []);

  // Budgets/exchangeRates are plain keyed objects, not id-keyed arrays;
  // merge key-by-key.
  const reconcileKeyedMap = useCallback((mapName, remoteMap) => {
    applyingRemoteRef.current = true;

    try {
      const store = useFinanceStore.getState();

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
    } finally {
      applyingRemoteRef.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    setStatus('WAITING');
    setError(null);

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const yTransactions = ydoc.getMap('transactions');
    const yAccounts = ydoc.getMap('accounts');
    const yBudgets = ydoc.getMap('budgets');
    const yExchangeRates = ydoc.getMap('exchangeRates');

    yMapsRef.current = {
      transactions: yTransactions,
      accounts: yAccounts,
      budgets: yBudgets,
      exchangeRates: yExchangeRates,
    };

    // IMPORTANT:
    // Yjs persistence MUST use a different IndexedDB database name
    // from the application's Dexie database.
    const persistence = new IndexeddbPersistence(YJS_DB_NAME, ydoc);
    persistenceRef.current = persistence;

    let provider;

    persistence.once('synced', () => {
      if (cancelled) return;

      // Local IndexedDB Yjs copy is loaded;
      // now bring up WebRTC for peer sync.
      try {
        provider = new WebrtcProvider(ROOM_NAME, ydoc, {
          signaling: ['wss://signaling.yjs.dev'],
          password: ROOM_PASSWORD,
        });

        providerRef.current = provider;

        provider.on('status', ({ connected: isConnected }) => {
          if (cancelled) return;

          setConnected(isConnected);
          setStatus(isConnected ? 'ACTIVE' : 'WAITING');
        });

        provider.on('peers', ({ webrtcPeers }) => {
          if (cancelled) return;

          setPeerCount(
            webrtcPeers ? webrtcPeers.length : 0
          );
        });

        provider.on('synced', () => {
          if (cancelled) return;

          setLastSyncedAt(new Date());
        });
      } catch (err) {
        console.error('Failed to initialize WebRTC provider:', err);

        setError(err);
        setStatus('ERROR');
      }

      // One-time reconcile:
      // merge whatever Yjs already has into Zustand/Dexie via real store actions.
      reconcileCollection(
        'transactions',
        yTransactions
      );

      reconcileCollection(
        'accounts',
        yAccounts
      );

      reconcileKeyedMap(
        'budgets',
        yBudgets
      );

      reconcileKeyedMap(
        'exchangeRates',
        yExchangeRates
      );

      reconciledRef.current = true;
    });

    // Observe remote Yjs changes and fold them into Zustand.
    const makeObserver = (
      mapName,
      reconcileFn,
      yMap
    ) => () => {
      if (!reconciledRef.current) return;

      // This change was caused by our own reconcile write.
      if (applyingRemoteRef.current) return;

      reconcileFn(mapName, yMap);
    };

    const obsTransactions = makeObserver(
      'transactions',
      reconcileCollection,
      yTransactions
    );

    const obsAccounts = makeObserver(
      'accounts',
      reconcileCollection,
      yAccounts
    );

    const obsBudgets = makeObserver(
      'budgets',
      reconcileKeyedMap,
      yBudgets
    );

    const obsExchangeRates = makeObserver(
      'exchangeRates',
      reconcileKeyedMap,
      yExchangeRates
    );

    yTransactions.observe(obsTransactions);
    yAccounts.observe(obsAccounts);
    yBudgets.observe(obsBudgets);
    yExchangeRates.observe(obsExchangeRates);

    // Push local Zustand changes into Yjs,
    // once initial reconcile is complete.
    const unsubscribe = useFinanceStore.subscribe(
      (state, prevState) => {
        if (
          !reconciledRef.current ||
          applyingRemoteRef.current
        ) {
          return;
        }

        if (state.transactions !== prevState.transactions) {
          const nextIds = new Set(
            state.transactions.map((t) => t.id)
          );

          state.transactions.forEach((t) => {
            pushRecordToYMap(
              'transactions',
              t
            );
          });

          prevState.transactions.forEach((t) => {
            if (!nextIds.has(t.id)) {
              removeRecordFromYMap(
                'transactions',
                t.id
              );
            }
          });
        }

        if (state.accounts !== prevState.accounts) {
          const nextIds = new Set(
            state.accounts.map((a) => a.id)
          );

          state.accounts.forEach((a) => {
            pushRecordToYMap(
              'accounts',
              a
            );
          });

          prevState.accounts.forEach((a) => {
            if (!nextIds.has(a.id)) {
              removeRecordFromYMap(
                'accounts',
                a.id
              );
            }
          });
        }

        if (state.budgets !== prevState.budgets) {
          const yMap =
            yMapsRef.current.budgets;

          if (yMap) {
            Object.entries(state.budgets).forEach(
              ([month, amount]) => {
                if (yMap.get(month) !== amount) {
                  yMap.set(month, amount);
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
            yMapsRef.current.exchangeRates;

          if (yMap) {
            Object.entries(
              state.exchangeRates
            ).forEach(([code, rate]) => {
              if (yMap.get(code) !== rate) {
                yMap.set(code, rate);
              }
            });
          }
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

      ydocRef.current?.destroy();

      providerRef.current = null;
      persistenceRef.current = null;
      ydocRef.current = null;
      yMapsRef.current = {};
      reconciledRef.current = false;
      applyingRemoteRef.current = false;
    };
  }, [
    pushRecordToYMap,
    removeRecordFromYMap,
    reconcileCollection,
    reconcileKeyedMap,
  ]);

  // y-webrtc has no literal "force sync" API;
  // the safest real equivalent is destroying and recreating the provider,
  // which re-runs signaling + room handshake.
  const forceSync = useCallback(() => {
    if (!ydocRef.current) return;

    try {
      providerRef.current?.destroy();

      const provider = new WebrtcProvider(
        ROOM_NAME,
        ydocRef.current,
        {
          signaling: ['wss://signaling.yjs.dev'],
          password: ROOM_PASSWORD,
        }
      );

      providerRef.current = provider;

      setStatus('WAITING');
      setError(null);

      provider.on(
        'status',
        ({ connected: isConnected }) => {
          setConnected(isConnected);
          setStatus(
            isConnected
              ? 'ACTIVE'
              : 'WAITING'
          );
        }
      );

      provider.on(
        'peers',
        ({ webrtcPeers }) => {
          setPeerCount(
            webrtcPeers
              ? webrtcPeers.length
              : 0
          );
        }
      );

      provider.on('synced', () => {
        setLastSyncedAt(new Date());
      });
    } catch (err) {
      console.error(
        'Failed to force sync:',
        err
      );

      setError(err);
      setStatus('ERROR');
    }
  }, []);

  const disconnect = useCallback(() => {
    try {
      providerRef.current?.destroy();
    } catch (err) {
      // Best-effort cleanup.
    }

    providerRef.current = null;

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
