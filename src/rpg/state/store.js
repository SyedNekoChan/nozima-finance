import { create } from 'zustand';
import { loadSave, writeSave, createInitialSave } from './persist.js';

/*
 * RPG-only state. Lifecycle: inactive -> loading -> ready | error -> inactive.
 * Every activation bumps `session`; async results from a stale session are
 * discarded, so duplicate or interrupted activations cannot corrupt state.
 */
let session = 0;
let inFlight = null;

const useRpgStore = create((set, get) => ({
  status: 'inactive', // 'inactive' | 'loading' | 'ready' | 'error'
  save: null,
  error: null, // { code, message }
  saveStatus: 'idle', // 'idle' | 'saving' | 'error'

  // Idempotent: a no-op while loading or ready.
  activate: () => {
    if (get().status === 'loading' || get().status === 'ready') return inFlight;
    const mine = ++session;
    set({ status: 'loading', save: null, error: null, saveStatus: 'idle' });

    inFlight = (async () => {
      try {
        let save = await loadSave();
        if (!save) save = await writeSave(createInitialSave());
        if (mine === session) set({ status: 'ready', save });
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

  // Persist first, commit to state only on success, so a failed write never
  // advances in-memory progress.
  updateSave: async (updater) => {
    const { status, save } = get();
    if (status !== 'ready' || !save) return false;
    const mine = session;
    set({ saveStatus: 'saving' });
    try {
      const persisted = await writeSave(updater(save));
      if (mine !== session) return false;
      set({ save: persisted, saveStatus: 'idle' });
      return true;
    } catch (err) {
      console.warn('[rpg] save failed:', err);
      if (mine === session) set({ saveStatus: 'error' });
      return false;
    }
  },
}));

export default useRpgStore;
