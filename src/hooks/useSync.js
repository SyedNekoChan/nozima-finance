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
import { PAIRING_TTL_MS, PAIRING_MAX_ATTEMPTS, SYNC_STAGE } from '../lib/constants.js';
import {
  PeerMesh,
  SignalChannel,
  MSG_SV,
  MSG_UPDATE,
  syncLog,
  resolveIceServers,
} from '../lib/p2p.js';
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
  createPairingKeyPair,
  derivePairingSessionKey,
  encryptJson,
  decryptJson,
} from '../lib/pairing.js';

const ERR_SIGNALING = 'SIGNALING UNAVAILABLE';
const ERR_NO_PEER = 'NO PAIRED DEVICE ONLINE';
const ERR_LINK = 'PEER LINK FAILED';
const ERR_PROTOCOL = 'SIGNALING PROTOCOL ERROR';
const ERR_RELAY = 'RELAY UNAVAILABLE';
const JOIN_EVERY_MS = 3000;
const HOST_STALE_MS = 25000;
const AWAIT_IDLE_MS = 10 * 60 * 1000;
const SIGNALING_GIVEUP_MS = 45000;
const PAIR_FIND_TIMEOUT_MS = 30000;
const PAIR_SIGNALING_TIMEOUT_MS = 8000;
const NO_PEER_AFTER_MS = 30000;
const FORCE_SYNC_TIMEOUT_MS = 12000;
const FORCE_SYNC_MAX_MS = 60000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isTransientError = (e) =>
  e === ERR_SIGNALING ||
  e === ERR_NO_PEER ||
  e === ERR_LINK ||
  e === ERR_PROTOCOL ||
  e === ERR_RELAY;

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
  const [joinUi, setJoinUi] = useState({ stage: SYNC_STAGE.SIGNALING_CONNECTING, left: null });
  const [transportStage, setTransportStage] = useState(SYNC_STAGE.SIGNALING_CONNECTING);

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
  const mnemonicRef = useRef(null);
  mnemonicRef.current = recoveryMnemonic;

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

    let lastStage = null;

    const refresh = () => {
      if (cancelled || !mesh) return;

      const open = mesh.openPeers.length;
      const signaling = mesh.signaling;
      const failure = mesh.signalingFailure;

      peersRef.current = open;
      setPeerCount(open);

      if (open === 0) {
        syncedPeers.clear();
        syncedRef.current = false;
      }

      let stage;

      if (signaling === 'connecting') stage = SYNC_STAGE.SIGNALING_CONNECTING;
      else if (signaling === 'unavailable') stage = SYNC_STAGE.SIGNALING_FAILURE;
      else if (open > 0) {
        stage = syncedPeers.size > 0 ? SYNC_STAGE.SYNC_COMPLETE : SYNC_STAGE.WEBRTC_CONNECTED;
      } else if (mesh.connectingCount > 0) stage = SYNC_STAGE.WEBRTC_CONNECTING;
      else if (Date.now() - startedAt > NO_PEER_AFTER_MS) stage = SYNC_STAGE.NO_PEER;
      else stage = SYNC_STAGE.PEER_DISCOVERY;

      if (stage !== lastStage) {
        lastStage = stage;
        syncLog('transport stage', stage, mesh.sig.diagnostics());
      }

      setTransportStage(stage);

      if (open > 0) {
        clearTransient();
      } else if (signaling === 'unavailable') {
        setTransient(failure === 'protocol' ? ERR_PROTOCOL : ERR_SIGNALING);
      } else if (mesh.linkFailed) {
        setTransient(mesh.relayUnavailable ? ERR_RELAY : ERR_LINK);
      } else if (stage === SYNC_STAGE.NO_PEER) {
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
   * PAIRING HOST (generator device). The whole handshake runs over
   * the encrypted signaling relay (no WebRTC needed). The sync secret
   * is released ONLY after the confirmation code is verified here, and
   * only encrypted to the one joining session that proved it.
   * ---------------------------------------------------------------
   */

  useEffect(() => {
    if (!secretBytes || !hostCode || paused) return undefined;

    let cancelled = false;
    let chan = null;
    let expiry = null;
    let queue = Promise.resolve();
    const sessions = new Map();
    const code = normalizePairingCode(hostCode);

    const hideCodes = () => {
      if (cancelled) return;
      setConfirmationCode(null);
      setQrPayload(null);
    };

    const consume = async () => {
      pairSessionRef.current = null;
      await clearPairSession();

      if (!cancelled) {
        setHostCode(null);
        hideCodes();
      }
    };

    const expire = async () => {
      const session = pairSessionRef.current;

      if (!session) return;

      const next = { ...session, status: 'expired' };
      pairSessionRef.current = next;
      await setPairSession(next);
      hideCodes();
    };

    const persist = async (next) => {
      pairSessionRef.current = next;
      await setPairSession(next);
    };

    // null when the session can still accept this device.
    const unavailable = (session, dev) => {
      if (!session) return 'PAIRING CODE ALREADY USED';

      if (
        session.status === 'expired' ||
        Date.now() - session.createdAt > PAIRING_TTL_MS
      ) {
        return 'PAIRING CODE EXPIRED';
      }

      if (session.claimedBy && session.claimedBy !== dev) {
        return 'PAIRING CODE ALREADY USED';
      }

      if (session.attempts >= PAIRING_MAX_ATTEMPTS) return 'TOO MANY ATTEMPTS';

      return null;
    };

    const handle = async (msg) => {
      if (typeof msg.sid !== 'string' || msg.sid.length > 32) return;

      if (msg.k === 'join') {
        if (typeof msg.pub !== 'string' || typeof msg.dev !== 'string') return;

        const session = pairSessionRef.current;
        const bad = unavailable(session, msg.dev);

        if (bad) {
          syncLog('host: join rejected', bad);
          chan.publish({ k: 'reject', sid: msg.sid, t: msg.f, r: bad });
          return;
        }

        let rec = sessions.get(msg.sid);

        if (!rec) {
          try {
            const pair = await createPairingKeyPair();
            const key = await derivePairingSessionKey(
              pair.privateKey,
              msg.pub,
              msg.sid,
              code
            );

            rec = {
              f: msg.f,
              dev: msg.dev,
              peerPub: msg.pub,
              hostPub: pair.pub,
              key,
              lastN: 0,
              resp: null,
            };
          } catch {
            chan.publish({
              k: 'reject',
              sid: msg.sid,
              t: msg.f,
              r: 'MALFORMED JOIN REQUEST',
            });
            return;
          }

          sessions.set(msg.sid, rec);

          if (sessions.size > 20) sessions.delete(sessions.keys().next().value);
        } else if (rec.peerPub !== msg.pub || rec.f !== msg.f) {
          return;
        }

        syncLog('host: challenge sent', msg.sid);

        chan.publish({
          k: 'challenge',
          sid: msg.sid,
          t: msg.f,
          pub: rec.hostPub,
          left: PAIRING_MAX_ATTEMPTS - session.attempts,
        });
        return;
      }

      const rec = sessions.get(msg.sid);

      if (!rec || rec.f !== msg.f) return;

      let body;

      try {
        body = await decryptJson(rec.key, msg.c);
      } catch {
        return;
      }

      if (msg.k === 'ack') {
        const session = pairSessionRef.current;

        if (body.a === 'ack' && session && session.claimedBy === rec.dev) {
          syncLog('host: pairing acknowledged, session consumed');
          await consume();
        }
        return;
      }

      if (msg.k !== 'confirm') return;
      if (typeof body.n !== 'number' || typeof body.code !== 'string') return;

      if (body.n === rec.lastN && rec.resp) {
        chan.publish({ k: 'resp', sid: msg.sid, t: rec.f, c: rec.resp });
        return;
      }

      if (body.n <= rec.lastN) return;

      rec.lastN = body.n;

      const session = pairSessionRef.current;
      const bad = unavailable(session, rec.dev);
      let out;

      if (bad) {
        out = { a: 'reject', r: bad, n: body.n };
      } else {
        let ok = false;

        try {
          const given = normalizeConfirmationCode(body.code);
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

          if (next.attempts >= PAIRING_MAX_ATTEMPTS) {
            hideCodes();
            out = { a: 'reject', r: 'TOO MANY ATTEMPTS', n: body.n };
          } else {
            out = { a: 'fail', left: PAIRING_MAX_ATTEMPTS - next.attempts, n: body.n };
          }

          syncLog('host: confirmation rejected', next.attempts);
        } else {
          await persist({ ...session, claimedBy: rec.dev });
          out = { a: 'ok', k: secretToBase64Url(secretBytes), n: body.n };
          syncLog('host: confirmation accepted, secret released');
        }
      }

      rec.resp = await encryptJson(rec.key, out);
      chan.publish({ k: 'resp', sid: msg.sid, t: rec.f, c: rec.resp });
    };

    (async () => {
      try {
        const room = await derivePairingRoom(code);

        if (cancelled) return;

        chan = new SignalChannel({
          ...room,
          onMessage: (msg) => {
            queue = queue
              .then(() => handle(msg))
              .catch((e) => console.error('[SYNC] Pairing host error:', e?.message || e));
          },
          onChange: () => {},
        });

        await chan.start();

        if (cancelled) return;

        const session = pairSessionRef.current;
        const remaining = session
          ? PAIRING_TTL_MS - (Date.now() - session.createdAt)
          : 0;

        expiry = setTimeout(() => {
          expire().catch(() => {});
        }, Math.max(0, Math.min(remaining, 2 ** 31 - 1)));
      } catch (hostError) {
        console.error('[SYNC] Pairing host failed:', hostError?.message || hostError);
      }
    })();

    return () => {
      cancelled = true;
      if (expiry) clearTimeout(expiry);
      if (chan) chan.stop();
    };
  }, [secretBytes, hostCode, paused, linkEpoch]);

  /*
   * ---------------------------------------------------------------
   * PAIRING JOINER. PENDING (never paired) until the generator has
   * verified the confirmation code and released the sync secret over
   * the signaling relay. Every wait has a deterministic timeout.
   * ---------------------------------------------------------------
   */

  useEffect(() => {
    if (!pendingCode || secretBytes) return undefined;

    let cancelled = false;
    let chan = null;
    let keyPair = null;
    let key = null;
    let hostF = null;
    let hostPub = null;
    let watchdog = null;
    let joinTimer = null;
    let verifyTimers = [];
    let completing = false;
    let lastN = 0;
    let readyOnce = false;
    let sigDownSince = Date.now();
    let discoverySince = Date.now();
    let hostSeen = 0;
    let awaitingSince = 0;

    const deviceId = pendingDeviceRef.current;
    const sid = generateDeviceId();

    const setStage = (stage, left) => {
      syncLog('join stage', stage);
      setJoinUi((ui) => ({ stage, left: left === undefined ? ui.left : left }));
    };

    const clearVerify = () => {
      verifyTimers.forEach(clearTimeout);
      verifyTimers = [];
    };

    const abort = async (reason) => {
      if (cancelled) return;

      cancelled = true;
      syncLog('join aborted', reason);
      await clearPendingJoin().catch(() => {});
      pendingDeviceRef.current = null;
      joinApiRef.current = null;
      setPendingCode(null);
      setJoinUi({ stage: SYNC_STAGE.SIGNALING_CONNECTING, left: null });
      setError(reason);
    };

    const sendJoin = () => {
      if (cancelled || completing || !chan || !keyPair) return;
      if (joinUiRef.current.stage === SYNC_STAGE.CONFIRM_VERIFYING) return;

      chan.publish({ k: 'join', sid, pub: keyPair.pub, dev: deviceId });
    };

    const complete = async (encodedSecret) => {
      if (completing || cancelled) return;
      completing = true;

      try {
        setStage(SYNC_STAGE.CONFIRM_ACCEPTED);

        const bytes = base64UrlToSecret(String(encodedSecret));

        if (bytes.length !== 16) throw new Error('INVALID PAIRING RESPONSE');

        setStage(SYNC_STAGE.SECRET_RELEASED);

        await commitJoin(bytes);

        // Let the generator retire the session (repeated: relay is lossy).
        const ack = await encryptJson(key, { a: 'ack', n: lastN });

        for (let i = 0; i < 3; i += 1) {
          chan.publish({ k: 'ack', sid, t: hostF, c: ack });
          await sleep(500);
        }

        await clearPendingJoin();
        pendingDeviceRef.current = null;
        joinApiRef.current = null;

        cancelled = true;
        await activateJoin(bytes);
        setPendingCode(null);
        setJoinUi({ stage: SYNC_STAGE.SIGNALING_CONNECTING, left: null });
      } catch (err) {
        completing = false;
        await rollbackJoin();
        await abort(err?.message || 'PAIRING FAILED');
      }
    };

    const onMessage = async (msg) => {
      if (cancelled || msg.sid !== sid) return;

      if (msg.k === 'reject') {
        abort(String(msg.r || 'PAIRING REJECTED'));
        return;
      }

      if (msg.k === 'challenge') {
        if (typeof msg.pub !== 'string') return;

        // First challenge, or the generator restarted (new ephemeral key):
        // rebind to it; the generator re-verifies everything anyway.
        if (!key || msg.pub !== hostPub || msg.f !== hostF) {
          let next;

          try {
            next = await derivePairingSessionKey(
              keyPair.privateKey,
              msg.pub,
              sid,
              pendingCode
            );
          } catch {
            return;
          }

          const restarted = key !== null;

          key = next;
          hostF = msg.f;
          hostPub = msg.pub;

          if (restarted) {
            clearVerify();
            awaitingSince = Date.now();
            syncLog('join: generator restarted, rebound');

            if (joinUiRef.current.stage === SYNC_STAGE.CONFIRM_VERIFYING) {
              setStage(SYNC_STAGE.CHALLENGE_SENT, msg.left);
              setError('GENERATING DEVICE RESTARTED. ENTER THE CODE AGAIN');
            }
          }
        }

        hostSeen = Date.now();

        const stage = joinUiRef.current.stage;

        if (
          stage === SYNC_STAGE.SIGNALING_CONNECTING ||
          stage === SYNC_STAGE.SIGNALING_READY ||
          stage === SYNC_STAGE.PEER_DISCOVERY ||
          stage === SYNC_STAGE.SIGNALING_FAILURE
        ) {
          awaitingSince = Date.now();
          setStage(SYNC_STAGE.CHALLENGE_SENT, msg.left);
        } else {
          setJoinUi((ui) => ({ ...ui, left: msg.left }));
        }
        return;
      }

      if (msg.k === 'resp') {
        if (!key || msg.f !== hostF) return;

        let body;

        try {
          body = await decryptJson(key, msg.c);
        } catch {
          return;
        }

        if (body.n !== lastN || cancelled) return;

        clearVerify();

        if (body.a === 'fail') {
          awaitingSince = Date.now();
          setStage(SYNC_STAGE.CHALLENGE_SENT, body.left);
          setError(`WRONG CONFIRMATION CODE. ${body.left} ATTEMPTS LEFT`);
        } else if (body.a === 'reject') {
          abort(String(body.r || 'PAIRING REJECTED'));
        } else if (body.a === 'ok') {
          complete(body.k);
        }
      }
    };

    joinApiRef.current = {
      confirm: async (code) => {
        if (!key || joinUiRef.current.stage !== SYNC_STAGE.CHALLENGE_SENT) return false;

        lastN += 1;

        const n = lastN;
        const payload = await encryptJson(key, { n, code });
        const send = () =>
          chan.publish({ k: 'confirm', sid, t: hostF, c: payload });

        setStage(SYNC_STAGE.CONFIRM_VERIFYING);
        send();

        clearVerify();

        // The relay is lossy: repeat the (idempotent, n-tagged) confirm
        // until the generator's answer arrives, then give up cleanly.
        verifyTimers = [
          ...[2000, 4000, 6000, 8000, 11000, 14000].map((ms) => setTimeout(send, ms)),
          setTimeout(() => {
            if (
              cancelled ||
              lastN !== n ||
              joinUiRef.current.stage !== SYNC_STAGE.CONFIRM_VERIFYING
            ) {
              return;
            }

            setStage(SYNC_STAGE.CHALLENGE_SENT);
            setError('NO RESPONSE FROM GENERATING DEVICE');
          }, 18000),
        ];

        return true;
      },
    };

    (async () => {
      try {
        const room = await derivePairingRoom(pendingCode);

        keyPair = await createPairingKeyPair();

        if (cancelled) return;

        chan = new SignalChannel({
          ...room,
          onMessage: (msg) => {
            onMessage(msg).catch((e) =>
              console.error('[SYNC] Pairing join error:', e?.message || e)
            );
          },
          onChange: () => {
            if (cancelled || readyOnce || chan.state.signaling !== 'ready') return;

            readyOnce = true;
            sigDownSince = null;
            discoverySince = Date.now();
            setStage(SYNC_STAGE.PEER_DISCOVERY);
            sendJoin();
          },
        });

        await chan.start();

        if (cancelled) return;

        joinTimer = setInterval(sendJoin, JOIN_EVERY_MS);

        watchdog = setInterval(() => {
          if (cancelled || completing) return;

          const now = Date.now();
          const state = chan.state;
          const stage = joinUiRef.current.stage;

          if (state.signaling !== 'ready') {
            if (!sigDownSince) sigDownSince = now;

            if (state.signaling === 'unavailable') {
              if (stage !== SYNC_STAGE.SIGNALING_FAILURE) {
                setStage(SYNC_STAGE.SIGNALING_FAILURE);
              }

              if (now - sigDownSince > 8000) {
                abort(state.failure === 'protocol' ? ERR_PROTOCOL : ERR_SIGNALING);
                return;
              }
            }

            if (now - sigDownSince > SIGNALING_GIVEUP_MS) abort(ERR_SIGNALING);
            return;
          }

          sigDownSince = null;

          if (stage === SYNC_STAGE.SIGNALING_FAILURE) {
            discoverySince = now;
            setStage(SYNC_STAGE.PEER_DISCOVERY);
            return;
          }

          if (stage === SYNC_STAGE.CHALLENGE_SENT) {
            if (now - awaitingSince > AWAIT_IDLE_MS) {
              abort('PAIRING TIMED OUT');
            } else if (now - hostSeen > HOST_STALE_MS) {
              discoverySince = now;
              setStage(SYNC_STAGE.PEER_DISCOVERY);
            }
          } else if (
            stage === SYNC_STAGE.PEER_DISCOVERY &&
            now - discoverySince > 30000
          ) {
            abort('PAIRING CODE NOT FOUND OR DEVICE OFFLINE');
          }
        }, 1000);
      } catch (joinError) {
        abort(joinError?.message || 'PAIRING FAILED');
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(watchdog);
      clearInterval(joinTimer);
      clearVerify();

      if (chan) chan.stop();

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

          if (
            session &&
            (session.status === 'expired' ||
              Date.now() - session.createdAt > PAIRING_TTL_MS)
          ) {
            await clearPairSession();
            session = null;
          }

          if (cancelled) return;

          if (!isJoiner) {
            setRecoveryMnemonic(secretToMnemonic(bytes));
          }

          if (session) {
            pairSessionRef.current = session;
            setHostCode(session.pairingCode);

            if (session.attempts < PAIRING_MAX_ATTEMPTS) {
              setQrPayload(session.pairingCode);
              setConfirmationCode(session.confirmationCode);
            }
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
        setJoinUi({ stage: SYNC_STAGE.SIGNALING_CONNECTING, left: null });
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

  // Generator only: replace the pairing session with a fresh code pair.
  const regeneratePairing = useCallback(async () => {
    if (!secretRef.current || !mnemonicRef.current) return false;

    try {
      const session = {
        pairingCode: generatePairingCode(),
        confirmationCode: generateConfirmationCode(),
        createdAt: Date.now(),
        attempts: 0,
        claimedBy: null,
      };

      await setPairSession(session);
      pairSessionRef.current = session;

      setError(null);
      setQrPayload(session.pairingCode);
      setConfirmationCode(session.confirmationCode);
      setHostCode(session.pairingCode);

      return true;
    } catch (err) {
      setError(err?.message || 'FAILED TO GENERATE PAIRING');
      return false;
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
      setJoinUi({ stage: SYNC_STAGE.SIGNALING_CONNECTING, left: null });
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
    if (
      joinUiRef.current.stage !== SYNC_STAGE.CHALLENGE_SENT ||
      !joinApiRef.current
    ) {
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
    setJoinUi({ stage: SYNC_STAGE.SIGNALING_CONNECTING, left: null });
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

    // Fresh short-lived TURN credentials before the new transport starts.
    await resolveIceServers({ force: true }).catch(() => {});

    setLinkEpoch((e) => e + 1);

    try {
      await reconcileAll();

      const startedAt = Date.now();

      // Keep waiting while ICE/TURN negotiation is genuinely in progress.
      for (;;) {
        if (peersRef.current > 0 && syncedRef.current) break;

        const elapsed = Date.now() - startedAt;
        const connecting = (meshRef.current?.connectingCount || 0) > 0;

        if (elapsed > FORCE_SYNC_TIMEOUT_MS && !(connecting && elapsed < FORCE_SYNC_MAX_MS)) break;

        await sleep(250);
      }

      if (peersRef.current > 0 && syncedRef.current) {
        await reconcileAll();
        setLastSyncedAt(new Date());
        return;
      }

      const mesh = meshRef.current;

      if (mesh && (mesh.openPeers.length > 0 || mesh.connectingCount > 0)) return;

      if (mesh && mesh.signaling === 'ready') {
        setError(
          mesh.linkFailed
            ? mesh.relayUnavailable
              ? ERR_RELAY
              : ERR_LINK
            : ERR_NO_PEER
        );
      } else if (mesh && mesh.signaling === 'connecting') {
        setError(null);
      } else {
        setError(mesh?.signalingFailure === 'protocol' ? ERR_PROTOCOL : ERR_SIGNALING);
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
    canRegenerate: Boolean(secretBytes && recoveryMnemonic && !qrPayload),
    createPairing,
    joinPairingWithMnemonic,
    joinPairingWithCode,
    submitConfirmation,
    cancelPendingJoin,
    regeneratePairing,
    stage: secretBytes
      ? paused
        ? null
        : transportStage
      : pendingCode
        ? joinUi.stage
        : null,
    pendingJoin: pendingCode
      ? { stage: joinUi.stage, attemptsLeft: joinUi.left }
      : null,
    forceSync,
    disconnect,
    reconnect,
    unpair,
  };
}
