import Dexie from 'dexie';

const db = new Dexie('nozima-finance');

db.version(1).stores({
  transactions: 'id, date, currency, accountId, category',
  accounts: 'id, name',
  settings: 'key',
});

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
  // orderBy on an indexed field, then reverse for descending
  return db.transactions.orderBy('date').reverse().toArray();
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

export default db;
