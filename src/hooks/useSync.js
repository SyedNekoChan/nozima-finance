import { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
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
  getPairSession,
  setPairSession,
  clearPairSession,
  getPendingJoin,
  setPendingJoin,
  clearPendingJoin,
} from '../lib/db.js';
import { PAIRING_TTL_MS, PAIRING_MAX_ATTEMPTS } from '../lib/constants.js';
import { PeerMesh, MSG_SV, MSG_UPDATE, MSG_CTL } from '../lib/p2p.js';
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
  generatePairingCode,
  generateConfirmationCode,
  normalizePairingCode,
  normalizeConfirmationCode,
  generateDeviceId,
  derivePairingRoom,
} from '../lib/pairing.js';

const ERR_SIGNALING = 'SIGNALING UNAVAILABLE';
const ERR_NO_PEER = 'NO PAIRED DEVICE ONLINE';
const ERR_LINK = 'PEER LINK FAILED';
const PAIR_FIND_TIMEOUT_MS = 30000;
const PAIR_SIGNALING_TIMEOUT_MS = 8000;
const CONFIRM_TIMEOUT_MS = 10000;
const NO_PEER_AFTER_MS = 30000;
const FORCE_SYNC_TIMEOUT_MS = 12000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isTransientError = (e) =>
  e === ERR_SIGNALING || e === ERR_NO_PEER || e === ERR_LINK;
const enc = new TextEncoder();
const dec = new TextDecoder();
const encodeCtl = (obj) => enc.encode(JSON.stringify(obj));

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
  const [hostCode, setHostCode] = useState(null);
  const [pendingCode, setPendingCode] = useState(null);
  const [joinUi, setJoinUi] = useState({ stage: 'CONNECTING', left: null });

  const secretRef = useRef(null);
  secretRef.current = secretBytes;

  const ydocRef = useRef(null);
  const persistenceRef = useRef(null);
  const yMapsRef = useRef({});
  const reconciledRef = useRef(false);
  const joiningRef = useRef(false);
  const meshRef = useRef(null);
  const pairSessionRef = useRef(null);
  const pendingDeviceRef = useRef(null);
  const joinApiRef = useRef(null);
  const joinUiRef = useRef(joinUi);
  joinUiRef.current = joinUi;

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
   * TRANSPORT — encrypted signaling + WebRTC mesh + Yjs sync
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
    let mesh = null;
    let timer = null;
    let onDocUpdate = null;
    const startedAt = Date.now();
    const syncedPeers = new Set();
    const REMOTE = { remote: true };

    const setTransient = (message) =>
      setError((current) =>
        current && !isTransientError(current) ? current : message
      );

    const clearTransient = () =>
      setError((current) => (isTransientError(current) ? null : current));

    const refresh = () => {
      if (cancelled || !mesh) return;

      const open = mesh.openPeers.length;
      const signaling = mesh.signaling;

      peersRef.current = open;
      setPeerCount(open);

      if (open === 0) {
        syncedPeers.clear();
        syncedRef.current = false;
      }

      if (open > 0) {
        clearTransient();
      } else if (signaling === 'unavailable') {
        setTransient(ERR_SIGNALING);
      } else if (mesh.linkFailed) {
        setTransient(ERR_LINK);
      } else if (
        signaling === 'ready' &&
        Date.now() - startedAt > NO_PEER_AFTER_MS
      ) {
        setTransient(ERR_NO_PEER);
      } else {
        clearTransient();
      }
    };

    (async () => {
      try {
        const roomId = await deriveRoomId(secretBytes);
        const password = await deriveRoomPassword(secretBytes);

        if (cancelled) return;

        mesh = new PeerMesh({
          roomId,
          password,
          onPeerOpen: (peerId) => {
            // Exchange state vectors; each side answers with the diff.
            mesh.send(peerId, MSG_SV, Y.encodeStateVector(syncDoc));
            refresh();
          },
          onPeerClose: (peerId) => {
            syncedPeers.delete(peerId);
            refresh();
          },
          onMessage: (peerId, type, bytes) => {
            try {
              if (type === MSG_SV) {
                mesh.send(peerId, MSG_UPDATE, Y.encodeStateAsUpdate(syncDoc, bytes));
              } else if (type === MSG_UPDATE) {
                Y.applyUpdate(syncDoc, bytes, REMOTE);
                syncedPeers.add(peerId);
                syncedRef.current = true;
                setLastSyncedAt(new Date());
              }
            } catch (e) {
              console.error('[SYNC] Bad peer message:', e?.message || e);
            }
          },
          onChange: refresh,
        });

        meshRef.current = mesh;

        onDocUpdate = (update, origin) => {
          if (origin === REMOTE || origin === persistenceRef.current) return;
          mesh.broadcast(MSG_UPDATE, update);
        };

        syncDoc.on('update', onDocUpdate);

        await mesh.start();

        if (cancelled) return;

        timer = setInterval(refresh, 2000);
        refresh();
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
      if (onDocUpdate) syncDoc.off('update', onDocUpdate);

      if (mesh) mesh.stop();

      if (meshRef.current === mesh) meshRef.current = null;

      peersRef.current = 0;
      syncedRef.current = false;
    };
  }, [syncDoc, secretBytes, paused, linkEpoch]);

  /*
   * ---------------------------------------------------------------
   * PAIRING HOST (generator device): serves the pairing rendezvous
   * and releases the sync secret ONLY after the confirmation code
   * is verified here (rate-limited, persisted).
   * ---------------------------------------------------------------
   */

  useEffect(() => {
    if (!secretBytes || !hostCode || paused) return undefined;

    let cancelled = false;
    let mesh = null;
    let expiry = null;
    let queue = Promise.resolve();

    const consume = async () => {
      pairSessionRef.current = null;
      await clearPairSession();

      if (!cancelled) {
        setHostCode(null);
        setConfirmationCode(null);
        setQrPayload(null);
      }
    };

    const persist = async (next) => {
      pairSessionRef.current = next;
      await setPairSession(next);
    };

    const handle = async (peerId, msg) => {
      const reply = (obj) => mesh.send(peerId, MSG_CTL, encodeCtl(obj));
      const session = pairSessionRef.current;

      if (!session) return reply({ a: 'reject', r: 'PAIRING CODE ALREADY USED' });

      if (Date.now() - session.createdAt > PAIRING_TTL_MS) {
        return reply({ a: 'reject', r: 'PAIRING CODE EXPIRED' });
      }

      if (session.claimedBy && session.claimedBy !== msg.dev) {
        return reply({ a: 'reject', r: 'PAIRING CODE ALREADY USED' });
      }

      if (msg.a === 'ack') {
        if (session.claimedBy && session.claimedBy === msg.dev) await consume();
        return undefined;
      }

      if (session.attempts >= PAIRING_MAX_ATTEMPTS) {
        return reply({ a: 'reject', r: 'TOO MANY ATTEMPTS' });
      }

      if (msg.a === 'join') {
        return reply({ a: 'challenge', left: PAIRING_MAX_ATTEMPTS - session.attempts });
      }

      if (msg.a === 'confirm') {
        let ok = false;

        try {
          const given = normalizeConfirmationCode(msg.c);
          const expected = session.confirmationCode;
          let diff = given.length ^ expected.length;
          for (let i = 0; i < expected.length; i += 1) {
            diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
          }
          ok = diff === 0;
        } catch {
          ok = false;
        }

        if (!ok) {
          const next = { ...session, attempts: session.attempts + 1 };
          await persist(next);

          return next.attempts >= PAIRING_MAX_ATTEMPTS
            ? reply({ a: 'reject', r: 'TOO MANY ATTEMPTS' })
            : reply({ a: 'fail', left: PAIRING_MAX_ATTEMPTS - next.attempts });
        }

        await persist({ ...session, claimedBy: msg.dev });

        return reply({ a: 'ok', k: secretToBase64Url(secretBytes) });
      }

      return undefined;
    };

    (async () => {
      try {
        const room = await derivePairingRoom(normalizePairingCode(hostCode));

        if (cancelled) return;

        mesh = new PeerMesh({
          ...room,
          onMessage: (peerId, type, bytes) => {
            if (type !== MSG_CTL) return;

            let msg;

            try {
              msg = JSON.parse(dec.decode(bytes));
            } catch {
              return;
            }

            if (!msg || typeof msg.dev !== 'string') return;

            queue = queue
              .then(() => handle(peerId, msg))
              .catch((e) => console.error('[SYNC] Pairing host error:', e?.message || e));
          },
        });

        await mesh.start();

        if (cancelled) return;

        const session = pairSessionRef.current;
        const remaining = session
          ? PAIRING_TTL_MS - (Date.now() - session.createdAt)
          : 0;

        expiry = setTimeout(() => {
          consume().catch(() => {});
        }, Math.max(0, Math.min(remaining, 2 ** 31 - 1)));
      } catch (hostError) {
        console.error('[SYNC] Pairing host failed:', hostError?.message || hostError);
      }
    })();

    return () => {
      cancelled = true;
      if (expiry) clearTimeout(expiry);
      if (mesh) mesh.stop();
    };
  }, [secretBytes, hostCode, paused, linkEpoch]);

  /*
   * ---------------------------------------------------------------
   * PAIRING JOINER: pending (NOT paired) until the generator accepts
   * the confirmation code and releases the sync secret.
   * ---------------------------------------------------------------
   */

  useEffect(() => {
    if (!pendingCode || secretBytes) return undefined;

    let cancelled = false;
    let mesh = null;
    let host = null;
    let since = Date.now();
    let watchdog = null;
    let verifyTimer = null;
    let completing = false;

    const deviceId = pendingDeviceRef.current;

    const ctl = (peerId, obj) =>
      mesh.send(peerId, MSG_CTL, encodeCtl({ ...obj, dev: deviceId }));

    const abort = async (reason) => {
      if (cancelled) return;

      cancelled = true;
      await clearPendingJoin().catch(() => {});
      pendingDeviceRef.current = null;
      joinApiRef.current = null;
      setPendingCode(null);
      setJoinUi({ stage: 'CONNECTING', left: null });
      setError(reason);
    };

    const complete = async (encodedSecret, peerId) => {
      if (completing || cancelled) return;
      completing = true;

      try {
        const bytes = base64UrlToSecret(String(encodedSecret));

        if (bytes.length !== 16) throw new Error('INVALID PAIRING RESPONSE');

        await commitJoin(bytes);

        // Tell the generator it can retire the pairing code, then activate.
        await ctl(peerId, { a: 'ack' });
        await sleep(400);

        await clearPendingJoin();
        pendingDeviceRef.current = null;
        joinApiRef.current = null;

        cancelled = true;
        await activateJoin(bytes);
        setPendingCode(null);
        setJoinUi({ stage: 'CONNECTING', left: null });
      } catch (err) {
        completing = false;
        await rollbackJoin();
        await abort(err?.message || 'PAIRING FAILED');
      }
    };

    joinApiRef.current = {
      confirm: (code) => {
        if (!host) return false;

        setJoinUi((ui) => ({ ...ui, stage: 'VERIFYING' }));
        ctl(host, { a: 'confirm', c: code });

        clearTimeout(verifyTimer);
        verifyTimer = setTimeout(() => {
          if (cancelled || joinUiRef.current.stage !== 'VERIFYING') return;
          setJoinUi((ui) => ({ ...ui, stage: 'AWAITING' }));
          setError('NO RESPONSE FROM GENERATING DEVICE');
        }, CONFIRM_TIMEOUT_MS);

        return true;
      },
    };

    (async () => {
      try {
        const room = await derivePairingRoom(pendingCode);

        if (cancelled) return;

        mesh = new PeerMesh({
          ...room,
          onPeerOpen: (peerId) => {
            ctl(peerId, { a: 'join' });
          },
          onPeerClose: (peerId) => {
            if (peerId !== host || completing) return;
            host = null;
            since = Date.now();
            clearTimeout(verifyTimer);
            setJoinUi({ stage: 'CONNECTING', left: null });
          },
          onMessage: (peerId, type, bytes) => {
            if (type !== MSG_CTL || cancelled) return;

            let msg;

            try {
              msg = JSON.parse(dec.decode(bytes));
            } catch {
              return;
            }

            if (!msg) return;
            if (host !== null && peerId !== host) return;

            if (msg.a === 'reject') {
              abort(String(msg.r || 'PAIRING REJECTED'));
            } else if (msg.a === 'challenge') {
              host = peerId;
              setError(null);
              setJoinUi({ stage: 'AWAITING', left: msg.left });
            } else if (host === peerId && msg.a === 'fail') {
              clearTimeout(verifyTimer);
              setJoinUi({ stage: 'AWAITING', left: msg.left });
              setError(`WRONG CONFIRMATION CODE. ${msg.left} ATTEMPTS LEFT`);
            } else if (host === peerId && msg.a === 'ok') {
              clearTimeout(verifyTimer);
              complete(msg.k, peerId);
            }
          },
        });

        meshRef.current = mesh;

        await mesh.start();

        if (cancelled) return;

        watchdog = setInterval(() => {
          if (cancelled || host || completing) return;

          const elapsed = Date.now() - since;
          const signaling = mesh.signaling;

          if (signaling === 'unavailable' && elapsed > PAIR_SIGNALING_TIMEOUT_MS) {
            abort(ERR_SIGNALING);
          } else if (elapsed > PAIR_FIND_TIMEOUT_MS) {
            abort(
              signaling === 'ready'
                ? 'PAIRING CODE NOT FOUND OR DEVICE OFFLINE'
                : ERR_SIGNALING
            );
          }
        }, 1000);
      } catch (joinError) {
        abort(joinError?.message || 'PAIRING FAILED');
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(watchdog);
      clearTimeout(verifyTimer);

      if (mesh) mesh.stop();
      if (meshRef.current === mesh) meshRef.current = null;

      joinApiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCode, secretBytes]);

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
   * Restore on mount: an existing pairing (generator also restores its
   * pairing session), or a pending join awaiting confirmation.
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stored = await getSyncSecret();

        if (cancelled) return;

        if (stored) {
          const bytes = base64UrlToSecret(stored);

          if (bytes.length !== 16) {
            await clearSyncSecret();
            return;
          }

          await clearPendingJoin();

          const pre = await getPrePairLocalIds();
          const isJoiner = Boolean(pre && pre.secret === stored);
          let session = isJoiner ? null : await getPairSession();

          if (session && Date.now() - session.createdAt > PAIRING_TTL_MS) {
            await clearPairSession();
            session = null;
          }

          if (cancelled) return;

          if (!isJoiner) {
            setRecoveryMnemonic(secretToMnemonic(bytes));
          }

          if (session) {
            pairSessionRef.current = session;
            setQrPayload(session.pairingCode);
            setConfirmationCode(session.confirmationCode);
            setHostCode(session.pairingCode);
          }

          setSecretBytes(bytes);
          return;
        }

        const pending = await getPendingJoin();

        if (cancelled || !pending) return;

        try {
          normalizePairingCode(pending.pairingCode);
        } catch {
          await clearPendingJoin();
          return;
        }

        pendingDeviceRef.current = pending.deviceId;
        setJoinUi({ stage: 'CONNECTING', left: null });
        setPendingCode(normalizePairingCode(pending.pairingCode));
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

  // Generator: new sync secret + independent pairing code + confirmation code.
  const createPairing = useCallback(async () => {
    if (secretRef.current || joiningRef.current || pendingDeviceRef.current) {
      setError('ALREADY PAIRED. UNPAIR FIRST');
      return;
    }

    joiningRef.current = true;
    setBusy(true);
    setError(null);

    try {
      const bytes = generateSecretBytes();
      const session = {
        pairingCode: generatePairingCode(),
        confirmationCode: generateConfirmationCode(),
        createdAt: Date.now(),
        attempts: 0,
        claimedBy: null,
      };

      firstJoinPendingRef.current = false;
      prePairAccountIdsRef.current = new Set();
      prePairTransactionIdsRef.current = new Set();

      await clearPrePairLocalIds();
      await clearFirstJoinPending();
      await setPairSession(session);
      await setSyncSecret(secretToBase64Url(bytes));

      pairSessionRef.current = session;

      setRecoveryMnemonic(secretToMnemonic(bytes));
      setQrPayload(session.pairingCode);
      setConfirmationCode(session.confirmationCode);
      setHostCode(session.pairingCode);
      setSecretBytes(bytes);
    } catch (err) {
      await clearSyncSecret().catch(() => {});
      await clearPairSession().catch(() => {});
      pairSessionRef.current = null;
      setError(err?.message || 'FAILED TO GENERATE PAIRING');
    } finally {
      joiningRef.current = false;
      setBusy(false);
    }
  }, []);

  // Persist a joiner's pairing state (secret + pre-pair exclusions).
  const commitJoin = useCallback(async (bytes) => {
    const secretB64 = secretToBase64Url(bytes);
    const existing = useFinanceStore.getState();
    const accountIds = existing.accounts.map((a) => a.id);
    const transactionIds = existing.transactions.map((t) => t.id);

    prePairAccountIdsRef.current = new Set(accountIds);
    prePairTransactionIdsRef.current = new Set(transactionIds);
    firstJoinPendingRef.current = true;

    await setPrePairLocalIds(secretB64, accountIds, transactionIds);
    await setFirstJoinPending(secretB64);
    await setSyncSecret(secretB64);
  }, []);

  const rollbackJoin = useCallback(async () => {
    firstJoinPendingRef.current = false;
    prePairAccountIdsRef.current = new Set();
    prePairTransactionIdsRef.current = new Set();

    await clearSyncSecret().catch(() => {});
    await clearFirstJoinPending().catch(() => {});
    await clearPrePairLocalIds().catch(() => {});
  }, []);

  const activateJoin = useCallback(async (bytes) => {
    setConfirmationCode(null);
    setRecoveryMnemonic(null);
    setQrPayload(null);
    setHostCode(null);
    setSecretBytes(bytes);
  }, []);

  // Recovery-key join: possession of the secret itself is the credential.
  const joinPairingWithSecret = useCallback(
    async (bytes) => {
      if (joiningRef.current) return false;

      if (secretRef.current || pendingDeviceRef.current) {
        setError('ALREADY PAIRED. UNPAIR FIRST');
        return false;
      }

      joiningRef.current = true;
      setBusy(true);
      setError(null);

      try {
        await commitJoin(bytes);
        await activateJoin(bytes);
        return true;
      } catch (err) {
        await rollbackJoin();
        setError(err?.message || 'PAIRING FAILED');
        return false;
      } finally {
        joiningRef.current = false;
        setBusy(false);
      }
    },
    [commitJoin, activateJoin, rollbackJoin]
  );

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

  // Joiner step 1: enter pairing code -> PENDING (not paired).
  const joinPairingWithCode = useCallback(async (input) => {
    setError(null);

    if (secretRef.current || pendingDeviceRef.current || joiningRef.current) {
      setError('ALREADY PAIRED. UNPAIR FIRST');
      return false;
    }

    let code;

    try {
      code = normalizePairingCode(input);
    } catch (parseError) {
      setError(parseError.message);
      return false;
    }

    try {
      const deviceId = generateDeviceId();

      await setPendingJoin({ pairingCode: code, deviceId, createdAt: Date.now() });

      pendingDeviceRef.current = deviceId;
      setJoinUi({ stage: 'CONNECTING', left: null });
      setPendingCode(code);

      return true;
    } catch (err) {
      await clearPendingJoin().catch(() => {});
      pendingDeviceRef.current = null;
      setError(err?.message || 'PAIRING FAILED');
      return false;
    }
  }, []);

  // Joiner step 2: confirmation code, verified by the generating device.
  const submitConfirmation = useCallback((input) => {
    if (joinUiRef.current.stage !== 'AWAITING' || !joinApiRef.current) {
      setError('NOT CONNECTED TO GENERATING DEVICE');
      return false;
    }

    let code;

    try {
      code = normalizeConfirmationCode(input);
    } catch (parseError) {
      setError(parseError.message);
      return false;
    }

    setError(null);

    return joinApiRef.current.confirm(code);
  }, []);

  const cancelPendingJoin = useCallback(async () => {
    await clearPendingJoin().catch(() => {});
    pendingDeviceRef.current = null;
    joinApiRef.current = null;
    setError(null);
    setPendingCode(null);
    setJoinUi({ stage: 'CONNECTING', left: null });
  }, []);

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

      const mesh = meshRef.current;

      if (mesh && mesh.openPeers.length > 0) return;

      if (mesh && mesh.signaling === 'ready') {
        setError(mesh.linkFailed ? ERR_LINK : ERR_NO_PEER);
      } else {
        setError(ERR_SIGNALING);
      }
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
    await clearPairSession();
    await clearPendingJoin();
    await clearSyncSecret();

    pairSessionRef.current = null;
    pendingDeviceRef.current = null;

    setHostCode(null);
    setPendingCode(null);
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
    status = busy || pendingCode ? 'PAIRING' : 'UNPAIRED';
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
    joinPairingWithCode,
    submitConfirmation,
    cancelPendingJoin,
    pendingJoin: pendingCode
      ? { stage: joinUi.stage, attemptsLeft: joinUi.left }
      : null,
    forceSync,
    disconnect,
    reconnect,
    unpair,
  };
}
