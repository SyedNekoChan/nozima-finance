import Dexie from 'dexie';

const db = new Dexie('nozima-finance');

db.version(1).stores({
  transactions: 'id, date, currency, accountId, category',
  accounts: 'id, name',
  settings: 'key',
});

// DD-MM-YYYY -> comparable timestamp (matches the parsing pattern already used in Ledger.jsx)
function parseDateToTimestamp(dateStr) {
  const [d, m, y] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function generateId() {
  return crypto.randomUUID();
}

export async function saveTransaction(tx) {
  return db.transactions.put(tx);
}

export async function deleteTransaction(id) {
  return db.transactions.delete(id);
}

export async function getAllTransactions() {
  // DD-MM-YYYY strings don't sort chronologically as IndexedDB keys,
  // so retrieve unsorted and sort in JS using the correct date parsing
  const all = await db.transactions.toArray();
  return all.sort((a, b) => parseDateToTimestamp(b.date) - parseDateToTimestamp(a.date));
}

export async function saveAccount(account) {
  return db.accounts.put(account);
}

export async function deleteAccount(id) {
  return db.accounts.delete(id);
}

export async function getAllAccounts() {
  return db.accounts.toArray();
}

export async function getSetting(key) {
  const row = await db.settings.get(key);
  return row ? row.value : null;
}

export async function setSetting(key, value) {
  return db.settings.put({ key, value });
}

/*
 * Canonical pairing secret, stored as a base64url string via the
 * existing generic settings key/value store. No new persistence
 * mechanism is introduced.
 */
const SYNC_SECRET_KEY = 'syncSecret';

export async function getSyncSecret() {
  return getSetting(SYNC_SECRET_KEY);
}

export async function setSyncSecret(secretBase64Url) {
  return setSetting(SYNC_SECRET_KEY, secretBase64Url);
}

export async function clearSyncSecret() {
  return db.settings.delete(SYNC_SECRET_KEY);
}

/*
 * Persistent first-join-pending flag.
 *
 * Stored as { secret, pending } rather than a bare boolean so it is
 * tied to the exact pairing secret it was set for. A device that
 * re-pairs to a DIFFERENT secret can never inherit a stale pending
 * flag left over from a previous pair, and a mismatched read is
 * treated as "not pending" by the caller.
 */
const FIRST_JOIN_PENDING_KEY = 'firstJoinPending';

export async function getFirstJoinPending() {
  return getSetting(FIRST_JOIN_PENDING_KEY);
}

export async function setFirstJoinPending(secretBase64Url) {
  return setSetting(FIRST_JOIN_PENDING_KEY, {
    secret: secretBase64Url,
    pending: true,
  });
}

export async function clearFirstJoinPending() {
  return db.settings.delete(FIRST_JOIN_PENDING_KEY);
}

/*
 * Permanent pre-pair local record exclusion set.
 *
 * Captured ONCE, at the moment a device joins an existing pair,
 * before any synchronization begins. Unlike firstJoinPending (a
 * transient "still catching up" window), this set never expires:
 * it identifies specific records that existed on this device before
 * it joined this particular pair, and those records must never
 * automatically enter shared sync, no matter how much later a push
 * would otherwise happen.
 *
 * Stored as { secret, accountIds: [...], transactionIds: [...] } so
 * it is tied to the exact pairing secret it was captured for. A
 * device re-pairing to a DIFFERENT secret gets an independent set.
 */
const PRE_PAIR_LOCAL_IDS_KEY = 'prePairLocalIds';

export async function getPrePairLocalIds() {
  return getSetting(PRE_PAIR_LOCAL_IDS_KEY);
}

export async function setPrePairLocalIds(
  secretBase64Url,
  accountIds,
  transactionIds
) {
  return setSetting(PRE_PAIR_LOCAL_IDS_KEY, {
    secret: secretBase64Url,
    accountIds,
    transactionIds,
  });
}

export async function clearPrePairLocalIds() {
  return db.settings.delete(PRE_PAIR_LOCAL_IDS_KEY);
}

export default db;
