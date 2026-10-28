import { create } from 'zustand';
import { loadSave, writeSave, createInitialSave, peekCatMissing } from './persist.js';

/*
 * RPG-only state. Lifecycle: inactive -> loading -> ready | error -> inactive.
 * Every activation bumps `session`; async results from a stale session are
 * discarded, so duplicate or interrupted activations cannot corrupt state.
 *
 * `catMissing` is the pet-visibility source of truth for the shell. It is
 * null until resolved, and it only ever changes to match a save that was
 * actually read from, or successfully written to, the RPG database. A failed
 * read is never evidence either way: it leaves `catMissing` null and records
 * `catUnresolved`, and the cat stays out until a read or write settles it.
 */
// Bounded automatic re-reads for a transiently unreadable save (then only a new
// page load or an RPG activation retries). Corrupt/newer saves never auto-retry.
const CAT_RETRY_DELAYS_MS = [1500, 4000, 10000, 30000];

let session = 0;
let inFlight = null;
let catRunning = null;
let catTimer = null;
let catAttempt = 0;
let writeChain = Promise.resolve();

const useRpgStore = create((set, get) => ({
  status: 'inactive', // 'inactive' | 'loading' | 'ready' | 'error'
  save: null,
  error: null, // { code, message }
  saveStatus: 'idle', // 'idle' | 'saving' | 'error'
  catMissing: null, // null (unresolved) | boolean
  catUnresolved: null, // { code } once a read has failed while catMissing is null

  // Idempotent: a no-op while loading or ready.
  activate: () => {
    if (get().status === 'loading' || get().status === 'ready') return inFlight;
    const mine = ++session;
    set({ status: 'loading', save: null, error: null, saveStatus: 'idle' });

    inFlight = (async () => {
      try {
        let save = await loadSave();
        if (!save) save = await writeSave(createInitialSave());
        if (mine === session) set({ status: 'ready', save, catMissing: save.catMissing === true, catUnresolved: null });
      } catch (err) {
        if (mine !== session) return;
        console.warn('[rpg] activation failed:', err);
        set({
          status: 'error',
          error: { code: err?.code || 'unknown', message: err?.message || 'The RPG could not start.' },
        });
      }
    })();
    return inFlight;
  },

  deactivate: () => {
    session++;
    inFlight = null;
    set({ status: 'inactive', save: null, error: null, saveStatus: 'idle' });
  },

  // Reads the missing-cat state before the pet mounts. Idempotent while a read
  // or a scheduled retry is pending. A late answer is still honoured; a failed
  // one leaves the state unresolved (cat withheld) and may be retried.
  resolveCatState: () => {
    if (get().catMissing !== null) return Promise.resolve();
    if (catRunning) return catRunning;
    if (catTimer) return Promise.resolve();
    catRunning = (async () => {
      try {
        const missing = await peekCatMissing();
        clearTimeout(catTimer);
        catTimer = null;
        // an activation that already loaded or wrote a save is more authoritative
        if (get().catMissing === null) set({ catMissing: missing, catUnresolved: null });
      } catch (err) {
        console.warn('[rpg] cat state unresolved, cat withheld:', err);
        if (get().catMissing !== null) return;
        const code = err?.code || 'unavailable';
        set({ catUnresolved: { code } });
        const delay = CAT_RETRY_DELAYS_MS[catAttempt];
        if (code === 'unavailable' && delay !== undefined) {
          catAttempt++;
          catTimer = setTimeout(() => {
            catTimer = null;
            get().resolveCatState();
          }, delay);
        }
      } finally {
        catRunning = null;
      }
    })();
    return catRunning;
  },

  // Persist first, commit to state only on success, so a failed write never
  // advances in-memory progress. Writes are serialized; the updater sees the
  // latest committed save and may return it unchanged to skip the write.
  updateSave: (updater) => {
    const mine = session;
    const run = async () => {
      const { status, save } = get();
      if (mine !== session || status !== 'ready' || !save) return false;
      const next = updater(save);
      if (next === save) return true;
      set({ saveStatus: 'saving' });
      try {
        const persisted = await writeSave(next);
        if (mine !== session) return false;
        set({ save: persisted, catMissing: persisted.catMissing === true, saveStatus: 'idle' });
        return true;
      } catch (err) {
        console.warn('[rpg] save failed:', err);
        if (mine === session) set({ saveStatus: 'error' });
        return false;
      }
    };
    const result = writeChain.then(run, run);
    writeChain = result.catch(() => {});
    return result;
  },
}));

export default useRpgStore;
