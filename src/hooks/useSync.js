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

export default function useSync() {
  const isLoaded = useFinanceStore(
    (s) => s.isLoaded
  );

  /*
   * 'UNPAIRED' | 'PAIRING' | 'WAITING' | 'ACTIVE' | 'ERROR' | 'DISCONNECTED'
   *
   * WAITING/ACTIVE only apply once paired (secret present).
   */
  const [status, setStatus] =
    useState('UNPAIRED');

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

  /*
   * Pairing/secret UI state.
   */
  const [secretBytes, setSecretBytes] =
    useState(null);

  const [
    confirmationCode,
    setConfirmationCode,
  ] = useState(null);

  const [
    recoveryMnemonic,
    setRecoveryMnemonic,
  ] = useState(null);

  const [
    qrPayload,
    setQrPayload,
  ] = useState(null);

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
   * True only while a device that JOINED an existing pair (as
   * opposed to the device that generated the pair) has not yet
   * completed its first reconciliation pass.
   *
   * While true, local-only records must be pulled from the remote
   * pair but never pushed, so a joiner's unrelated pre-existing
   * local data cannot silently enter the shared pair. Cleared to
   * false permanently after the first pass completes, at which
   * point normal bidirectional sync resumes for the rest of the
   * session and every future session.
   *
   * The in-memory ref is only a fast-path cache. The AUTHORITATIVE
   * value is persisted in Dexie (db.js: firstJoinPending, keyed to
   * the exact secret it was set for) so an interrupted first join —
   * reload, crash, disconnect, cancelled init — cannot silently lose
   * pending status. The main sync effect re-reads the persisted
   * value at the start of every initialize() call, before deciding
   * whether to suppress pushes, rather than trusting the ref's
   * post-remount default.
   */
  const firstJoinPendingRef =
    useRef(false);

  /*
   * Permanent, per-pair exclusion sets of record IDs that existed on
   * this device BEFORE it joined the current pair. Unlike
   * firstJoinPendingRef (a temporary catching-up window), these
   * never clear on their own — a record captured here is excluded
   * from every future push, reconciliation pass, and subscribe-driven
   * sync for as long as this pairing secret is active, even long
   * after the first join has completed. Loaded from Dexie
   * (prePairLocalIds, keyed to the exact secret) at the start of
   * every initialize() call, exactly like firstJoinPendingRef.
   */
  const prePairLocalAccountIdsRef =
    useRef(new Set());

  const prePairLocalTransactionIdsRef =
    useRef(new Set());

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
           *
           * Suppressed entirely while firstJoinPendingRef is true (a
           * device still catching up on its first join). Independently
           * of that, any account ID present in
           * prePairLocalAccountIdsRef is EXCLUDED PERMANENTLY: it
           * existed on this device before it joined this pair and must
           * never be pushed, even long after the first join finishes.
           * ===============================================================
           */

          if (
            mapName ===
              'accounts' &&
            !firstJoinPendingRef.current
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
                prePairLocalAccountIdsRef.current.has(
                  account.id
                )
              ) {
                continue;
              }

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
           *
           * Same first-join suppression as STEP 5, plus the same
           * permanent prePairLocalTransactionIdsRef exclusion.
           * ===============================================================
           */

          if (
            mapName ===
              'transactions' &&
            !firstJoinPendingRef.current
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
                prePairLocalTransactionIdsRef.current.has(
                  transaction.id
                )
              ) {
                continue;
              }

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
           *
           * Suppressed during a device's first-join pass, same reason
           * as reconcileCollection STEP 5/6.
           */
          if (
            mapName ===
              'budgets' &&
            !firstJoinPendingRef.current
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
           *
           * Same first-join suppression.
           */
          if (
            mapName ===
              'exchangeRates' &&
            !firstJoinPendingRef.current
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
   *
   * Runs whenever isLoaded or the paired secretBytes change. When
   * secretBytes is null, the app is UNPAIRED: no WebrtcProvider or
   * secret-scoped IndexeddbPersistence is created at all.
   * -----------------------------------------------------------------------
   */

  useEffect(() => {
    if (!isLoaded) {
      return undefined;
    }

    if (!secretBytes) {
      setStatus('UNPAIRED');
      setConnected(false);
      setPeerCount(0);
      setError(null);
      return undefined;
    }

    let cancelled = false;

    const cleanupRef = {
      current: null,
    };

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

    const initialize =
      async () => {
        try {
          const roomId =
            await deriveRoomId(
              secretBytes
            );

          const roomPassword =
            await deriveRoomPassword(
              secretBytes
            );

          const yjsDbName =
            await deriveYjsDbName(
              secretBytes
            );

          const currentSecretB64 =
            secretToBase64Url(
              secretBytes
            );

          /*
           * Re-read the AUTHORITATIVE persisted pending state rather
           * than trusting the ref's post-remount default. Only a
           * pending record whose stored secret matches the secret
           * this effect is initializing for counts — a leftover
           * record from a different (e.g. previously unpaired) pair
           * must never suppress pushes for this one.
           */
          const persistedPending =
            await getFirstJoinPending();

          firstJoinPendingRef.current =
            Boolean(
              persistedPending &&
                persistedPending.secret ===
                  currentSecretB64 &&
                persistedPending.pending
            );

          /*
           * Load the PERMANENT pre-pair local exclusion set for this
           * exact secret. Unlike firstJoinPendingRef above, this never
           * clears on its own — it stays loaded for the lifetime of
           * this pairing so STEP 5/6 and the subscribe callback can
           * keep excluding these specific records indefinitely, long
           * after the first join itself has finished.
           */
          const persistedPrePairIds =
            await getPrePairLocalIds();

          if (
            persistedPrePairIds &&
            persistedPrePairIds.secret ===
              currentSecretB64
          ) {
            prePairLocalAccountIdsRef.current =
              new Set(
                persistedPrePairIds.accountIds ||
                  []
              );

            prePairLocalTransactionIdsRef.current =
              new Set(
                persistedPrePairIds.transactionIds ||
                  []
              );
          } else {
            prePairLocalAccountIdsRef.current =
              new Set();

            prePairLocalTransactionIdsRef.current =
              new Set();
          }

          if (cancelled) {
            return;
          }

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
           * INDEXEDDB PERSISTENCE (secret-scoped)
           * ===============================================================
           */

          const persistence =
            new IndexeddbPersistence(
              yjsDbName,
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
                      id,
                      false
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
           *
           * Deletions are processed FIRST.
           *
           * All pushes in this subscriber are suppressed while
           * firstJoinPendingRef is true, for the same reason STEP 5/6
           * of reconcileCollection are suppressed: a joining device
           * must not push its unrelated pre-existing local data (or
           * its deletion tombstones, which are equally local-origin)
           * into a pair it has just joined.
           * ===============================================================
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

                if (
                  firstJoinPendingRef.current
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
                  const currentYdoc =
                    ydocRef.current;

                  if (currentYdoc) {
                    currentYdoc.transact(
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
                  const currentYdoc =
                    ydocRef.current;

                  if (currentYdoc) {
                    currentYdoc.transact(
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

                    /*
                     * Permanent exclusion: this account existed on
                     * this device before it joined the current pair.
                     */
                    if (
                      prePairLocalAccountIdsRef.current.has(
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

                    /*
                     * Permanent exclusion: this transaction existed
                     * on this device before it joined the current
                     * pair.
                     */
                    if (
                      prePairLocalTransactionIdsRef.current.has(
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

          /*
           * Wait for local Yjs IndexedDB persistence.
           */
          await persistence.whenSynced;

          if (cancelled) {
            unsubscribe();
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
            unsubscribe();
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
            unsubscribe();
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
            unsubscribe();
            return;
          }

          /*
           * The device's first reconciliation pass (if any) as a joiner
           * is now complete. From here forward this device behaves
           * exactly like the pair's originating device: bidirectional,
           * for the rest of this session and every future session.
           *
           * Clear the PERSISTED record first. If this device dies
           * between the persisted clear and the ref clear, the next
           * mount re-reads the (now absent) persisted record and
           * correctly resumes as non-pending — safe in either order,
           * but persisted-first means a crash here never leaves a
           * pending pair's data stuck unsynced longer than necessary.
           */
          if (
            firstJoinPendingRef.current
          ) {
            await clearFirstJoinPending();
          }

          firstJoinPendingRef.current =
            false;

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
              roomId,
              ydoc,
              {
                password:
                  roomPassword,

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

          cleanupRef.current =
            () => {
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
            };
        } catch (
          syncError
        ) {
          console.error(
            '[SYNC] Initialization failed:',
            syncError?.message ||
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

      if (
        cleanupRef.current
      ) {
        cleanupRef.current();
      }

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
    };
  }, [
    isLoaded,
    secretBytes,
    reconcileCollection,
    reconcileKeyedMap,
    pushRecordToYjs,
  ]);

  /*
   * -----------------------------------------------------------------------
   * LOAD ANY EXISTING PAIRING SECRET ON MOUNT
   *
   * Does NOT touch the previous hardcoded global room/password, which
   * has been removed entirely. A device with no stored secret starts
   * and stays UNPAIRED until it explicitly pairs.
   * -----------------------------------------------------------------------
   */

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const stored =
        await getSyncSecret();

      if (
        cancelled ||
        !stored
      ) {
        return;
      }

      const bytes =
        base64UrlToSecret(
          stored
        );

      setSecretBytes(
        bytes
      );

      const code =
        await deriveConfirmationCode(
          bytes
        );

      if (!cancelled) {
        setConfirmationCode(
          code
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * -----------------------------------------------------------------------
   * PAIRING ACTIONS
   * -----------------------------------------------------------------------
   */

  /*
   * Generate a brand-new pair. This device becomes the pair's
   * authoritative/originating device: its current local finance
   * dataset becomes the pair baseline (ordinary bidirectional push,
   * no first-join suppression).
   */
  const createPairing =
    useCallback(
      async () => {
        setStatus('PAIRING');
        setError(null);

        try {
          const bytes =
            generateSecretBytes();

          firstJoinPendingRef.current =
            false;

          /*
           * Initiator: no pre-pair exclusion set. Clear any stale
           * in-memory refs and the persisted record from a previous
           * pairing on this device.
           */
          prePairLocalAccountIdsRef.current =
            new Set();

          prePairLocalTransactionIdsRef.current =
            new Set();

          await clearPrePairLocalIds();

          await setSyncSecret(
            secretToBase64Url(
              bytes
            )
          );

          const mnemonic =
            secretToMnemonic(
              bytes
            );

          const code =
            await deriveConfirmationCode(
              bytes
            );

          setRecoveryMnemonic(
            mnemonic
          );

          setQrPayload(
            buildQrPayload(
              bytes
            )
          );

          setConfirmationCode(
            code
          );

          /*
           * Setting secretBytes LAST, after every other piece of
           * pairing data (mnemonic/code/qrPayload) is already in
           * state, triggers the main sync effect (which depends on
           * secretBytes) only once all of that data is already
           * available to render — so the ACTIVE/WAITING pairing UI
           * never has a frame where secretBytes exists but the
           * confirmation code/recovery key don't, and nothing here
           * requires a reload to become visible.
           */
          setSecretBytes(
            bytes
          );
        } catch (err) {
          /*
           * A thrown/rejected error here previously left `status`
           * stuck at 'PAIRING' forever with no pairing data ever
           * set, silently — none of createPairing's callers awaited
           * or caught it. Surfacing it through the existing `error`
           * state and resetting status back to UNPAIRED makes the
           * failure visible and retryable instead of appearing to
           * require a refresh.
           */
          setStatus('UNPAIRED');

          setError(
            err?.message ||
              'FAILED TO GENERATE PAIRING'
          );
        }
      },
      []
    );


  /*
   * Join an existing pair using a secret received via QR or mnemonic
   * from another device. This device's pre-existing local data is
   * preserved in Dexie but permanently excluded from the pair: its
   * current account/transaction IDs are snapshotted BEFORE anything
   * else happens, so they can never later be classified as
   * shared/new records once the first-join catching-up window ends.
   */
  const joinPairingWithSecret =
    useCallback(
      async (bytes) => {
        setStatus('PAIRING');

        firstJoinPendingRef.current =
          true;

        const secretB64 =
          secretToBase64Url(
            bytes
          );

        /*
         * Snapshot pre-existing local record IDs FIRST, before the
         * secret is even saved, and definitely before setSecretBytes
         * triggers the sync effect. Anything with an ID captured
         * here is excluded from shared sync permanently, not just
         * during the first-join window.
         */
        const existingState =
          useFinanceStore.getState();

        const prePairAccountIds =
          existingState.accounts.map(
            (account) => account.id
          );

        const prePairTransactionIds =
          existingState.transactions.map(
            (transaction) =>
              transaction.id
          );

        prePairLocalAccountIdsRef.current =
          new Set(
            prePairAccountIds
          );

        prePairLocalTransactionIdsRef.current =
          new Set(
            prePairTransactionIds
          );

        await setPrePairLocalIds(
          secretB64,
          prePairAccountIds,
          prePairTransactionIds
        );

        await setSyncSecret(
          secretB64
        );

        /*
         * Persist pending BEFORE sync starts (setSecretBytes below
         * is what triggers the main effect). This is what survives
         * a reload/crash/disconnect during the first join: the
         * effect re-reads this record on every initialize() call
         * and treats a matching pending record as authoritative,
         * regardless of what the in-memory ref happened to reset to.
         */
        await setFirstJoinPending(
          secretB64
        );

        const code =
          await deriveConfirmationCode(
            bytes
          );

        setConfirmationCode(
          code
        );

        setRecoveryMnemonic(
          null
        );

        setQrPayload(
          null
        );

        setSecretBytes(
          bytes
        );
      },
      []
    );

  const joinPairingWithMnemonic =
    useCallback(
      async (mnemonic) => {
        if (
          !isValidMnemonic(
            mnemonic
          )
        ) {
          setError(
            'INVALID RECOVERY KEY'
          );

          return false;
        }

        const bytes =
          mnemonicToSecret(
            mnemonic
          );

        await joinPairingWithSecret(
          bytes
        );

        return true;
      },
      [
        joinPairingWithSecret,
      ]
    );

  const joinPairingWithQrPayload =
    useCallback(
      async (payloadString) => {
        try {
          const bytes =
            parseQrPayload(
              payloadString
            );

          await joinPairingWithSecret(
            bytes
          );

          return true;
        } catch (
          parseError
        ) {
          console.error(
            '[SYNC] QR payload parse failed:',
            parseError?.message ||
              parseError
          );

          setError(
            'INVALID PAIRING CODE'
          );

          return false;
        }
      },
      [
        joinPairingWithSecret,
      ]
    );

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
            syncError?.message ||
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
   * DISCONNECT / RECONNECT
   *
   * Disconnect keeps the pairing secret and the secret-scoped Yjs
   * IndexedDB data intact — it only tears down the live WebRTC
   * connection. Reconnect re-derives the same room/password from the
   * same stored secret and reconnects without a page reload.
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
        setStatus('DISCONNECTED');
      },
      []
    );

  const reconnect =
    useCallback(
      () => {
        if (
          providerRef.current
        ) {
          try {
            providerRef.current.connect();

            setStatus(
              'WAITING'
            );

            return;
          } catch (
            reconnectError
          ) {
            console.error(
              '[SYNC] Reconnect failed:',
              reconnectError
            );
          }
        }

        /*
         * No live provider instance (e.g. after a full remount) —
         * re-triggering the main effect by touching secretBytes
         * re-derives credentials from the same stored secret and
         * rebuilds the provider against the same secret-scoped Yjs DB.
         */
        setSecretBytes(
          (current) =>
            current
              ? new Uint8Array(
                  current
                )
              : current
        );
      },
      []
    );

  /*
   * -----------------------------------------------------------------------
   * UNPAIR
   *
   * Removes the pairing secret and deletes ONLY the secret-scoped Yjs
   * IndexedDB database. The finance Dexie database ('nozima-finance')
   * is never touched here.
   * -----------------------------------------------------------------------
   */

  const unpair =
    useCallback(
      async () => {
        if (
          providerRef.current
        ) {
          try {
            providerRef.current.destroy();
          } catch (
            destroyError
          ) {
            console.error(
              '[SYNC] Provider cleanup failed during unpair:',
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
            await persistenceRef.current.clearData();
          } catch (
            clearError
          ) {
            console.error(
              '[SYNC] Yjs data clear failed during unpair:',
              clearError
            );
          }

          try {
            persistenceRef.current.destroy();
          } catch (
            destroyError
          ) {
            console.error(
              '[SYNC] Persistence cleanup failed during unpair:',
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
              '[SYNC] Y.Doc cleanup failed during unpair:',
              destroyError
            );
          }

          ydocRef.current =
            null;
        }

        yMapsRef.current = {};

        firstJoinPendingRef.current =
          false;

        prePairLocalAccountIdsRef.current =
          new Set();

        prePairLocalTransactionIdsRef.current =
          new Set();

        await clearFirstJoinPending();

        await clearPrePairLocalIds();

        await clearSyncSecret();

        setSecretBytes(
          null
        );

        setConfirmationCode(
          null
        );

        setRecoveryMnemonic(
          null
        );

        setQrPayload(
          null
        );

        setConnected(false);
        setPeerCount(0);
        setError(null);
        setStatus('UNPAIRED');
      },
      []
    );

  return {
    status,
    connected,
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
