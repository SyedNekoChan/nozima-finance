import { getRpgDb } from './db.js';
import { STORY_STAGES } from '../data/content.js';

export const SAVE_ID = 'main';
export const SAVE_SCHEMA_VERSION = 1;
const OPEN_TIMEOUT_MS = 8000;

// Each entry upgrades a save from version N to N + 1.
const MIGRATIONS = {};

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
    story: { stage: STORY_STAGES.FOUNDATION },
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
  if (!isPlainObject(save.story)) {
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
