import { getRpgDb, RPG_DB_NAME } from './db.js';
import { STORY_STAGES, OPENING_STEPS } from '../data/content.js';
import { CLASS_IDS } from '../data/classes/index.js';

export const SAVE_ID = 'main';
export const SAVE_SCHEMA_VERSION = 2;
const OPEN_TIMEOUT_MS = 8000;

// Each entry upgrades a save from version N to N + 1.
const MIGRATIONS = {
  // v1 (Phase 1 placeholder) had no story progress: it starts the opening.
  1: (save) => ({
    ...save,
    schemaVersion: 2,
    catMissing: false,
    story: { stage: STORY_STAGES.OPENING, openingStep: OPENING_STEPS.PORTAL },
  }),
};

export class RpgStorageError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'RpgStorageError';
    this.code = code; // 'unavailable' | 'corrupt' | 'newer-version' | 'write-failed'
    this.cause = cause;
  }
}

export function createInitialSave() {
  const now = Date.now();
  return {
    id: SAVE_ID,
    schemaVersion: SAVE_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    catMissing: false,
    story: { stage: STORY_STAGES.OPENING, openingStep: OPENING_STEPS.PORTAL },
  };
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('RPG storage timed out')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function openDb() {
  try {
    const db = getRpgDb();
    await withTimeout(db.open(), OPEN_TIMEOUT_MS);
    return db;
  } catch (err) {
    throw new RpgStorageError('unavailable', 'RPG storage is unavailable.', err);
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function migrate(record) {
  if (!isPlainObject(record) || record.id !== SAVE_ID || !Number.isInteger(record.schemaVersion) || record.schemaVersion < 1) {
    throw new RpgStorageError('corrupt', 'The RPG save is unreadable.');
  }
  if (record.schemaVersion > SAVE_SCHEMA_VERSION) {
    throw new RpgStorageError('newer-version', 'The RPG save was written by a newer version.');
  }
  let save = record;
  while (save.schemaVersion < SAVE_SCHEMA_VERSION) {
    const step = MIGRATIONS[save.schemaVersion];
    if (!step) throw new RpgStorageError('corrupt', 'The RPG save cannot be upgraded.');
    save = step(save);
  }
  const step = save.story?.openingStep;
  // `protagonist` is additive and optional (absent = no class chosen yet), so
  // existing v2 saves need no migration. A class can only exist after entering.
  const hero = save.protagonist;
  const heroOk =
    hero === undefined ||
    (isPlainObject(hero) &&
      (hero.classId === null || (CLASS_IDS.includes(hero.classId) && step === OPENING_STEPS.ENTERED)));
  const valid =
    heroOk &&
    isPlainObject(save.story) &&
    typeof save.catMissing === 'boolean' &&
    Object.values(OPENING_STEPS).includes(step) &&
    // the cat is only ever missing once the theft has been persisted
    (step === OPENING_STEPS.PORTAL ? save.catMissing === false : save.catMissing === true);
  if (!valid) {
    throw new RpgStorageError('corrupt', 'The RPG save is incomplete.');
  }
  return save;
}

// Resolves to the stored save, or null when none exists yet. A corrupt or
// newer save rejects and is never overwritten.
export async function loadSave() {
  const db = await openDb();
  let record;
  try {
    record = await db.saves.get(SAVE_ID);
  } catch (err) {
    throw new RpgStorageError('unavailable', 'RPG storage is unavailable.', err);
  }
  return record === undefined ? null : migrate(record);
}

// Resolves to the record that was actually persisted.
export async function writeSave(save) {
  const db = await openDb();
  const record = { ...save, id: SAVE_ID, schemaVersion: SAVE_SCHEMA_VERSION, updatedAt: Date.now() };
  try {
    await db.saves.put(record);
  } catch (err) {
    throw new RpgStorageError('write-failed', 'The RPG save could not be written.', err);
  }
  return record;
}

// Read-only startup check used by the pet shell. Never creates the database:
// if the browser can list databases and 'nomoz-rpg' is absent, nobody has
// activated the RPG and the cat cannot be missing. Anything unreadable
// (unavailable, timed out, corrupt, newer) rejects: it is NOT evidence that
// the cat is present, and the caller must treat it as unresolved.
export async function peekCatMissing() {
  // no IndexedDB at all: no save can exist in this browser context
  if (typeof indexedDB === 'undefined') return false;
  if (typeof indexedDB.databases === 'function') {
    let dbs;
    try {
      dbs = await indexedDB.databases();
    } catch (err) {
      throw new RpgStorageError('unavailable', 'RPG storage is unavailable.', err);
    }
    if (!dbs.some((d) => d.name === RPG_DB_NAME)) return false;
  }
  const save = await loadSave();
  return save ? save.catMissing === true : false;
}
