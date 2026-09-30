import { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebrtcProvider } from 'y-webrtc';
import useFinanceStore from './useFinanceStore.js';
import {
  getSyncSecret,
  setSyncSecret,
  clearSyncSecret,
  getFirstJoinPending,
  setFirstJoinPending,
  clearFirstJoinPending,
  getPrePairLocalIds,
  setPrePairLocalIds,
  clearPrePairLocalIds,
} from '../lib/db.js';
import { SIGNALING_URLS } from '../lib/constants.js';
import {
  generateSecretBytes,
  secretToBase64Url,
  base64UrlToSecret,
  secretToMnemonic,
  mnemonicToSecret,
  isValidMnemonic,
  deriveRoomId,
  deriveRoomPassword,
  deriveYjsDbName,
  deriveConfirmationCode,
  buildQrPayload,
  parseQrPayload,
} from '../lib/pairing.js';

const ERR_SIGNALING = 'SIGNALING UNAVAILABLE';
const ERR_NO_PEER = 'NO PAIRED DEVICE ONLINE';
const SIGNALING_GRACE_MS = 15000;
const NO_PEER_AFTER_MS = 30000;
const FORCE_SYNC_TIMEOUT_MS = 12000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isTransientError = (e) => e === ERR_SIGNALING || e === ERR_NO_PEER;

export default function useSync() {
  const isLoaded = useFinanceStore((s) => s.isLoaded);

  const [secretBytes, setSecretBytes] = useState(null);
  const [syncDoc, setSyncDoc] = useState(null);
  const [busy, setBusy] = useState(false);
  const [initFailed, setInitFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [linkEpoch, setLinkEpoch] = useState(0);
  const [initEpoch, setInitEpoch] = useState(0);
  const [peerCount, setPeerCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [error, setError] = useState(null);
  const [confirmationCode, setConfirmationCode] = useState(null);
  const [recoveryMnemonic, setRecoveryMnemonic] = useState(null);
  const [qrPayload, setQrPayload] = useState(null);

  const secretRef = useRef(null);
  secretRef.current = secretBytes;

  const ydocRef = useRef(null);
  const persistenceRef = useRef(null);
  const providerRef = useRef(null);
  const yMapsRef = useRef({});
  const reconciledRef = useRef(false);
  const joiningRef = useRef(false);

  const peersRef = useRef(0);
  const syncedRef = useRef(false);

  // Serialized reconcile queue: one pass at a time, deduped per key.
  const queueRef = useRef(Promise.resolve());
  const scheduledRef = useRef({});
  const applyingRemoteRef = useRef(false);
  const missedLocalRef = useRef(false);
  const flushLocalRef = useRef(null);

  // True until a joiner's first reconcile pass completes; persisted in Dexie.
  const firstJoinPendingRef = useRef(false);
  // Permanent per-pair exclusion of records that pre-date joining this pair.
  const prePairAccountIdsRef = useRef(new Set());
  const prePairTransactionIdsRef = useRef(new Set());

  const getMap = useCallback((name) => yMapsRef.current[name] || null, []);

  const schedule = useCallback((key, fn) => {
    if (scheduledRef.current[key]) {
      return queueRef.current;
    }

    scheduledRef.current[key] = true;

    queueRef.current = queueRef.current
      .catch(() => {})
      .then(async () => {
        scheduledRef.current[key] = false;
        applyingRemoteRef.current = true;

        try {
          await fn();
        } finally {
          applyingRemoteRef.current = false;
        }

        if (missedLocalRef.current) {
          missedLocalRef.current = false;
          flushLocalRef.current?.();
        }
      });

    return queueRef.current;
  }, []);

  const pushRecordToYjs = useCallback(
    (mapName, record) => {
      if (!record?.id) return;

      const yMap = getMap(mapName);
      const deletedMap = getMap(`${mapName}Deleted`);

      if (!yMap || !deletedMap || deletedMap.has(record.id)) return;

      // Skip no-op writes so unchanged records never generate sync traffic.
      if (sameJson(yMap.get(record.id), record)) return;

      yMap.set(record.id, record);
    },
    [getMap]
  );

  const reconcileAccounts = useCallback(async () => {
    const remoteMap = getMap('accounts');
    const deletedMap = getMap('accountsDeleted');

    if (!remoteMap) return;

    if (deletedMap) {
      Array.from(deletedMap.keys()).forEach((id) => {
        if (remoteMap.has(id)) remoteMap.delete(id);
      });
    }

    for (const remote of Array.from(remoteMap.values())) {
      if (!remote?.id || deletedMap?.has(remote.id)) continue;

      const store = useFinanceStore.getState();
      const local = store.accounts.find((a) => a.id === remote.id);

      if (!local) {
        await store.addAccount(remote);
      } else if (!sameJson(local, remote)) {
        await store.updateAccount(remote);
      }
    }

    if (firstJoinPendingRef.current) return;

    for (const account of useFinanceStore.getState().accounts) {
      if (
        prePairAccountIdsRef.current.has(account.id) ||
        remoteMap.has(account.id) ||
        deletedMap?.has(account.id)
      ) {
        continue;
      }

      remoteMap.set(account.id, account);
    }
  }, [getMap]);

  const reconcileTransactions = useCallback(async () => {
    const remoteMap = getMap('transactions');
    const deletedMap = getMap('transactionsDeleted');

    if (!remoteMap) return;

    if (deletedMap) {
      Array.from(deletedMap.keys()).forEach((id) => {
        if (remoteMap.has(id)) remoteMap.delete(id);
      });
    }

    for (const remote of Array.from(remoteMap.values())) {
      if (!remote?.id || deletedMap?.has(remote.id)) continue;

      const store = useFinanceStore.getState();
      const local = store.transactions.find((t) => t.id === remote.id);

      // false = synced record must not re-apply its balance effect.
      if (!local) {
        await store.addTransaction(remote, false);
      } else if (!sameJson(local, remote)) {
        await store.updateTransaction(remote, false);
      }
    }

    if (firstJoinPendingRef.current) return;

    for (const transaction of useFinanceStore.getState().transactions) {
      if (
        prePairTransactionIdsRef.current.has(transaction.id) ||
        remoteMap.has(transaction.id) ||
        deletedMap?.has(transaction.id)
      ) {
        continue;
      }

      remoteMap.set(transaction.id, transaction);
    }
  }, [getMap]);

  const reconcileKeyed = useCallback(
    async (mapName) => {
      const remoteMap = getMap(mapName);

      if (!remoteMap) return;

      const isBudgets = mapName === 'budgets';
      const localOf = () => {
        const s = useFinanceStore.getState();
        return isBudgets ? s.budgets : s.exchangeRates;
      };

      // Remote wins for keys present remotely.
      for (const [key, value] of Array.from(remoteMap.entries())) {
        if (localOf()[key] === value) continue;

        const s = useFinanceStore.getState();

        if (isBudgets) {
          await s.setMonthlyBudget(key, value);
        } else {
          await s.setExchangeRate(key, value);
        }
      }

      if (firstJoinPendingRef.current) return;

      Object.entries(localOf()).forEach(([key, value]) => {
        if (!remoteMap.has(key)) remoteMap.set(key, value);
      });
    },
    [getMap]
  );

  // Tombstones always win: remove locally without touching balances.
  const applyDeletions = useCallback(async () => {
    const yTx = getMap('transactions');
    const yTxDel = getMap('transactionsDeleted');
    const yAcc = getMap('accounts');
    const yAccDel = getMap('accountsDeleted');

    if (!yTx || !yTxDel || !yAcc || !yAccDel) return;

    for (const id of Array.from(yTxDel.keys())) {
      const store = useFinanceStore.getState();

      if (store.transactions.some((t) => t.id === id)) {
        await store.deleteTransaction(id, false);
      }
    }

    for (const id of Array.from(yAccDel.keys())) {
      const store = useFinanceStore.getState();

      if (store.accounts.some((a) => a.id === id)) {
        await store.deleteAccount(id, false);
      }
    }

    Array.from(yTxDel.keys()).forEach((id) => yTx.delete(id));
    Array.from(yAccDel.keys()).forEach((id) => yAcc.delete(id));
  }, [getMap]);

  const reconcileAll = useCallback(async () => {
    schedule('accounts', reconcileAccounts);
    schedule('transactions', reconcileTransactions);
    schedule('budgets', () => reconcileKeyed('budgets'));
    schedule('exchangeRates', () => reconcileKeyed('exchangeRates'));
    schedule('deletions', applyDeletions);

    await queueRef.current;
  }, [
    schedule,
    reconcileAccounts,
    reconcileTransactions,
    reconcileKeyed,
    applyDeletions,
  ]);

  /*
   * ---------------------------------------------------------------
   * TRANSPORT (WebRTC provider) — real peer/signaling state only
   * ---------------------------------------------------------------
   */

  useEffect(() => {
    peersRef.current = 0;
    syncedRef.current = false;
    setPeerCount(0);

    if (!syncDoc || !secretBytes || paused) {
      return undefined;
    }

    let cancelled = false;
    let provider = null;
    let timer = null;
    const startedAt = Date.now();

    const setTransient = (message) =>
      setError((current) =>
        current && !isTransientError(current) ? current : message
      );

    const clearTransient = () =>
      setError((current) => (isTransientError(current) ? null : current));

    const checkLink = () => {
      if (cancelled || !provider) return;

      if (peersRef.current > 0) {
        clearTransient();
        return;
      }

      const signalingUp = (provider.signalingConns || []).some(
        (conn) => conn.connected
      );

      // Connecting is not failure: only report after a grace period.
      if (!signalingUp) {
        if (Date.now() - startedAt > SIGNALING_GRACE_MS) {
          setTransient(ERR_SIGNALING);
        } else {
          clearTransient();
        }
      } else if (Date.now() - startedAt > NO_PEER_AFTER_MS) {
        setTransient(ERR_NO_PEER);
      } else {
        clearTransient();
      }
    };

    (async () => {
      try {
        const roomId = await deriveRoomId(secretBytes);
        const roomPassword = await deriveRoomPassword(secretBytes);

        // Let a destroyed provider release its room before re-opening it.
        await new Promise((resolve) => setTimeout(resolve, 0));

        if (cancelled) return;

        provider = new WebrtcProvider(roomId, syncDoc, {
          password: roomPassword,
          signaling: SIGNALING_URLS,
        });

        providerRef.current = provider;

        provider.on('peers', ({ webrtcPeers = [] }) => {
          if (cancelled) return;

          peersRef.current = webrtcPeers.length;
          setPeerCount(webrtcPeers.length);

          if (webrtcPeers.length === 0) {
            syncedRef.current = false;
          } else {
            clearTransient();
          }
        });

        provider.on('synced', ({ synced }) => {
          if (cancelled) return;

          syncedRef.current = Boolean(synced);

          if (synced && peersRef.current > 0) {
            setLastSyncedAt(new Date());
          }
        });

        timer = setInterval(checkLink, 2000);
      } catch (transportError) {
        console.error('[SYNC] Transport failed:', transportError?.message || transportError);

        if (!cancelled) {
          setError(transportError?.message || String(transportError));
        }
      }
    })();

    return () => {
      cancelled = true;

      if (timer) clearInterval(timer);

      if (provider) {
        try {
          provider.destroy();
        } catch (destroyError) {
          console.error('[SYNC] Provider cleanup failed:', destroyError);
        }
      }

      if (providerRef.current === provider) {
        providerRef.current = null;
      }

      peersRef.current = 0;
      syncedRef.current = false;
    };
  }, [syncDoc, secretBytes, paused, linkEpoch]);

  /*
   * ---------------------------------------------------------------
   * DATA LAYER (Y.Doc + secret-scoped IndexedDB + reconcile)
   * ---------------------------------------------------------------
   */

  useEffect(() => {
    if (!isLoaded || !secretBytes) {
      setInitFailed(false);
      return undefined;
    }

    let cancelled = false;
    let unsubscribe = null;
    let unobserveAll = [];

    setInitFailed(false);
    setLastSyncedAt(null);
    reconciledRef.current = false;
    scheduledRef.current = {};
    missedLocalRef.current = false;

    const initialize = async () => {
      try {
        const yjsDbName = await deriveYjsDbName(secretBytes);
        const currentSecretB64 = secretToBase64Url(secretBytes);

        const persistedPending = await getFirstJoinPending();

        firstJoinPendingRef.current = Boolean(
          persistedPending &&
            persistedPending.secret === currentSecretB64 &&
            persistedPending.pending
        );

        const persistedPre = await getPrePairLocalIds();
        const preMatches = persistedPre && persistedPre.secret === currentSecretB64;

        prePairAccountIdsRef.current = new Set(
          preMatches ? persistedPre.accountIds || [] : []
        );
        prePairTransactionIdsRef.current = new Set(
          preMatches ? persistedPre.transactionIds || [] : []
        );

        if (cancelled) return;

        const ydoc = new Y.Doc();
        ydocRef.current = ydoc;

        const maps = {
          transactions: ydoc.getMap('transactions'),
          accounts: ydoc.getMap('accounts'),
          transactionsDeleted: ydoc.getMap('transactionsDeleted'),
          accountsDeleted: ydoc.getMap('accountsDeleted'),
          budgets: ydoc.getMap('budgets'),
          exchangeRates: ydoc.getMap('exchangeRates'),
        };

        yMapsRef.current = maps;

        const persistence = new IndexeddbPersistence(yjsDbName, ydoc);
        persistenceRef.current = persistence;

        const onRemote = (run) => (event, transaction) => {
          if (!reconciledRef.current || transaction?.local) return;

          run()
            .then(() => {
              if (!cancelled) setLastSyncedAt(new Date());
            })
            .catch((e) => console.error('[SYNC] Remote apply failed:', e?.message || e));
        };

        const observe = (name, handler) => {
          maps[name].observe(handler);
          unobserveAll.push(() => maps[name].unobserve(handler));
        };

        // Accounts always precede transactions.
        observe(
          'accounts',
          onRemote(() => schedule('accounts', reconcileAccounts))
        );
        observe(
          'transactions',
          onRemote(() => {
            schedule('accounts', reconcileAccounts);
            return schedule('transactions', reconcileTransactions);
          })
        );
        observe(
          'transactionsDeleted',
          onRemote(() => schedule('deletions', applyDeletions))
        );
        observe(
          'accountsDeleted',
          onRemote(() => schedule('deletions', applyDeletions))
        );
        observe(
          'budgets',
          onRemote(() => schedule('budgets', () => reconcileKeyed('budgets')))
        );
        observe(
          'exchangeRates',
          onRemote(() =>
            schedule('exchangeRates', () => reconcileKeyed('exchangeRates'))
          )
        );

        // LOCAL ZUSTAND -> YJS
        const initialStore = useFinanceStore.getState();
        let seenDeletedAccounts = new Set(initialStore.deletedAccountIds);
        let seenDeletedTransactions = new Set(initialStore.deletedTransactionIds);

        const pushState = (state) => {
          const currentDoc = ydocRef.current;

          if (!currentDoc) return;

          const newAccountDeletes = state.deletedAccountIds.filter(
            (id) =>
              !seenDeletedAccounts.has(id) &&
              !prePairAccountIdsRef.current.has(id)
          );
          const newTransactionDeletes = state.deletedTransactionIds.filter(
            (id) =>
              !seenDeletedTransactions.has(id) &&
              !prePairTransactionIdsRef.current.has(id)
          );

          seenDeletedAccounts = new Set(state.deletedAccountIds);
          seenDeletedTransactions = new Set(state.deletedTransactionIds);

          currentDoc.transact(() => {
            newAccountDeletes.forEach((id) => {
              maps.accountsDeleted.set(id, Date.now());
              maps.accounts.delete(id);
            });

            newTransactionDeletes.forEach((id) => {
              maps.transactionsDeleted.set(id, Date.now());
              maps.transactions.delete(id);
            });

            state.accounts.forEach((account) => {
              if (
                seenDeletedAccounts.has(account.id) ||
                prePairAccountIdsRef.current.has(account.id)
              ) {
                return;
              }

              pushRecordToYjs('accounts', account);
            });

            state.transactions.forEach((transaction) => {
              if (
                seenDeletedTransactions.has(transaction.id) ||
                prePairTransactionIdsRef.current.has(transaction.id)
              ) {
                return;
              }

              pushRecordToYjs('transactions', transaction);
            });

            Object.entries(state.budgets).forEach(([key, value]) => {
              if (maps.budgets.get(key) !== value) maps.budgets.set(key, value);
            });

            Object.entries(state.exchangeRates).forEach(([key, value]) => {
              if (maps.exchangeRates.get(key) !== value) {
                maps.exchangeRates.set(key, value);
              }
            });
          });
        };

        unsubscribe = useFinanceStore.subscribe((state) => {
          if (!reconciledRef.current) return;

          // Remember local edits made mid-apply; flushed when the pass ends.
          if (applyingRemoteRef.current) {
            missedLocalRef.current = true;
            return;
          }

          if (firstJoinPendingRef.current) return;

          pushState(state);
        });

        flushLocalRef.current = () => {
          if (reconciledRef.current && !firstJoinPendingRef.current) {
            pushState(useFinanceStore.getState());
          }
        };

        await persistence.whenSynced;

        if (cancelled) return;

        await schedule('accounts', reconcileAccounts);
        await schedule('transactions', reconcileTransactions);
        await schedule('budgets', () => reconcileKeyed('budgets'));
        await schedule('exchangeRates', () => reconcileKeyed('exchangeRates'));
        await schedule('deletions', applyDeletions);

        if (cancelled) return;

        if (firstJoinPendingRef.current) {
          await clearFirstJoinPending();
        }

        firstJoinPendingRef.current = false;
        reconciledRef.current = true;

        // Publish the ready doc so the transport effect can connect.
        setSyncDoc(ydoc);
      } catch (syncError) {
        console.error('[SYNC] Initialization failed:', syncError?.message || syncError);

        if (!cancelled) {
          setError(syncError?.message || String(syncError));
          setInitFailed(true);
        }
      }
    };

    initialize();

    return () => {
      cancelled = true;
      reconciledRef.current = false;
      applyingRemoteRef.current = false;
      flushLocalRef.current = null;

      if (unsubscribe) unsubscribe();
      unobserveAll.forEach((fn) => fn());
      unobserveAll = [];

      if (persistenceRef.current) {
        try {
          persistenceRef.current.destroy();
        } catch (e) {
          console.error('[SYNC] Persistence cleanup failed:', e);
        }

        persistenceRef.current = null;
      }

      if (ydocRef.current) {
        try {
          ydocRef.current.destroy();
        } catch (e) {
          console.error('[SYNC] Y.Doc cleanup failed:', e);
        }

        ydocRef.current = null;
      }

      yMapsRef.current = {};
      setSyncDoc(null);
    };
  }, [
    isLoaded,
    secretBytes,
    initEpoch,
    schedule,
    reconcileAccounts,
    reconcileTransactions,
    reconcileKeyed,
    applyDeletions,
    pushRecordToYjs,
  ]);

  /*
   * Restore an existing pairing on mount. The originating device also
   * restores its pairing code and recovery key; joiners never had them.
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stored = await getSyncSecret();

        if (cancelled || !stored) return;

        const bytes = base64UrlToSecret(stored);

        if (bytes.length !== 16) {
          await clearSyncSecret();
          return;
        }

        const pre = await getPrePairLocalIds();
        const isJoiner = Boolean(pre && pre.secret === stored);
        const code = await deriveConfirmationCode(bytes);

        if (cancelled) return;

        if (!isJoiner) {
          setRecoveryMnemonic(secretToMnemonic(bytes));
          setQrPayload(buildQrPayload(bytes));
        }

        setConfirmationCode(code);
        setSecretBytes(bytes);
      } catch (restoreError) {
        console.error('[SYNC] Restore failed:', restoreError?.message || restoreError);

        if (!cancelled) {
          setError('FAILED TO RESTORE PAIRING');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * ---------------------------------------------------------------
   * PAIRING ACTIONS
   * ---------------------------------------------------------------
   */

  const createPairing = useCallback(async () => {
    if (secretRef.current || joiningRef.current) {
      setError('ALREADY PAIRED. UNPAIR FIRST');
      return;
    }

    joiningRef.current = true;
    setBusy(true);
    setError(null);

    try {
      const bytes = generateSecretBytes();
      const b64 = secretToBase64Url(bytes);

      // Originator: its local dataset is the baseline, no exclusions.
      firstJoinPendingRef.current = false;
      prePairAccountIdsRef.current = new Set();
      prePairTransactionIdsRef.current = new Set();

      await clearPrePairLocalIds();
      await clearFirstJoinPending();
      await setSyncSecret(b64);

      const code = await deriveConfirmationCode(bytes);

      setRecoveryMnemonic(secretToMnemonic(bytes));
      setQrPayload(buildQrPayload(bytes));
      setConfirmationCode(code);
      setSecretBytes(bytes);
    } catch (err) {
      await clearSyncSecret().catch(() => {});
      setError(err?.message || 'FAILED TO GENERATE PAIRING');
    } finally {
      joiningRef.current = false;
      setBusy(false);
    }
  }, []);

  const joinPairingWithSecret = useCallback(async (bytes) => {
    if (joiningRef.current) return false;

    if (!bytes || bytes.length !== 16) {
      setError('MALFORMED PAIRING CODE');
      return false;
    }

    const current = secretRef.current;

    if (current) {
      setError(
        secretToBase64Url(current) === secretToBase64Url(bytes)
          ? 'ALREADY PAIRED WITH THIS CODE'
          : 'ALREADY PAIRED. UNPAIR FIRST'
      );
      return false;
    }

    joiningRef.current = true;
    setBusy(true);
    setError(null);

    const secretB64 = secretToBase64Url(bytes);

    try {
      // Snapshot pre-existing local IDs BEFORE anything else: they never enter the pair.
      const existing = useFinanceStore.getState();
      const accountIds = existing.accounts.map((a) => a.id);
      const transactionIds = existing.transactions.map((t) => t.id);

      prePairAccountIdsRef.current = new Set(accountIds);
      prePairTransactionIdsRef.current = new Set(transactionIds);
      firstJoinPendingRef.current = true;

      await setPrePairLocalIds(secretB64, accountIds, transactionIds);
      await setFirstJoinPending(secretB64);
      await setSyncSecret(secretB64);

      const code = await deriveConfirmationCode(bytes);

      setConfirmationCode(code);
      setRecoveryMnemonic(null);
      setQrPayload(null);
      setSecretBytes(bytes);

      return true;
    } catch (err) {
      // Roll back so a failed join never leaves a half-paired device.
      firstJoinPendingRef.current = false;
      prePairAccountIdsRef.current = new Set();
      prePairTransactionIdsRef.current = new Set();

      await clearSyncSecret().catch(() => {});
      await clearFirstJoinPending().catch(() => {});
      await clearPrePairLocalIds().catch(() => {});

      setError(err?.message || 'PAIRING FAILED');

      return false;
    } finally {
      joiningRef.current = false;
      setBusy(false);
    }
  }, []);

  const joinPairingWithMnemonic = useCallback(
    async (mnemonic) => {
      setError(null);

      if (!isValidMnemonic(mnemonic)) {
        setError('INVALID RECOVERY KEY');
        return false;
      }

      return joinPairingWithSecret(mnemonicToSecret(mnemonic));
    },
    [joinPairingWithSecret]
  );

  const joinPairingWithQrPayload = useCallback(
    async (payload) => {
      setError(null);

      let bytes;

      try {
        bytes = parseQrPayload(payload);
      } catch (parseError) {
        setError(parseError?.message || 'INVALID PAIRING CODE');
        return false;
      }

      return joinPairingWithSecret(bytes);
    },
    [joinPairingWithSecret]
  );

  /*
   * FORCE SYNC: rebuilds the transport (fresh signaling + peer
   * handshake), reconciles local <-> Yjs, then waits for a real peer
   * sync. Status is never set here; it derives from actual link state.
   */
  const forceSync = useCallback(async () => {
    if (!secretRef.current) return;

    setError(null);

    if (!syncDoc) {
      setInitEpoch((e) => e + 1);
      return;
    }

    peersRef.current = 0;
    syncedRef.current = false;
    setPeerCount(0);
    setPaused(false);
    setLinkEpoch((e) => e + 1);

    try {
      await reconcileAll();

      const deadline = Date.now() + FORCE_SYNC_TIMEOUT_MS;

      while (Date.now() < deadline) {
        if (peersRef.current > 0 && syncedRef.current) break;
        await sleep(250);
      }

      if (peersRef.current > 0 && syncedRef.current) {
        await reconcileAll();
        setLastSyncedAt(new Date());
        return;
      }

      const signalingUp = (providerRef.current?.signalingConns || []).some(
        (conn) => conn.connected
      );

      setError(signalingUp ? ERR_NO_PEER : ERR_SIGNALING);
    } catch (syncError) {
      console.error('[SYNC] Force sync failed:', syncError?.message || syncError);
      setError(syncError?.message || String(syncError));
    }
  }, [syncDoc, reconcileAll]);

  const disconnect = useCallback(() => {
    setPaused(true);
    setError(null);
  }, []);

  const reconnect = useCallback(() => {
    setError(null);
    setPaused(false);
    setLinkEpoch((e) => e + 1);
  }, []);

  // Removes pairing + secret-scoped Yjs DB only; finance data is untouched.
  const unpair = useCallback(async () => {
    if (persistenceRef.current) {
      try {
        await persistenceRef.current.clearData();
      } catch (e) {
        console.error('[SYNC] Yjs data clear failed during unpair:', e);
      }
    }

    firstJoinPendingRef.current = false;
    prePairAccountIdsRef.current = new Set();
    prePairTransactionIdsRef.current = new Set();

    await clearFirstJoinPending();
    await clearPrePairLocalIds();
    await clearSyncSecret();

    setSecretBytes(null);
    setConfirmationCode(null);
    setRecoveryMnemonic(null);
    setQrPayload(null);
    setPaused(false);
    setPeerCount(0);
    setError(null);
  }, []);

  // Status is derived from real state, never set directly.
  let status;

  if (!secretBytes) {
    status = busy ? 'PAIRING' : 'UNPAIRED';
  } else if (initFailed) {
    status = 'ERROR';
  } else if (paused) {
    status = 'DISCONNECTED';
  } else if (syncDoc && peerCount > 0) {
    status = 'ACTIVE';
  } else {
    status = 'WAITING';
  }

  return {
    status,
    connected: status === 'ACTIVE',
    peerCount,
    lastSyncedAt,
    error,
    confirmationCode,
    recoveryMnemonic,
    qrPayload,
    createPairing,
    joinPairingWithMnemonic,
    joinPairingWithQrPayload,
    forceSync,
    disconnect,
    reconnect,
    unpair,
  };
}
