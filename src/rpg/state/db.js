import Dexie from 'dexie';

/*
 * The RPG database is completely separate from the finance database
 * ('nozima-finance'). Its schema is versioned independently: bump
 * RPG_DB_VERSION and add a new db.version(n) block for RPG schema changes only.
 */
export const RPG_DB_NAME = 'nomoz-rpg';
export const RPG_DB_VERSION = 1;

let instance = null;

// Created lazily so nothing touches IndexedDB until the RPG is first activated.
export function getRpgDb() {
  if (!instance) {
    const db = new Dexie(RPG_DB_NAME);
    db.version(RPG_DB_VERSION).stores({
      saves: 'id',
    });
    instance = db;
  }
  return instance;
}
