import { create } from 'zustand';
import { getSetting, setSetting } from '../lib/db.js';
import { DEFAULT_VISUAL_MODE, VISUAL_MODE_KEY, nextVisualMode, normalizeVisualMode } from '../lib/visualMode.js';

/*
 * The selected visual mode (see lib/visualMode.js), persisted through Dexie.
 * Kept apart from the finance store: it is a display preference and never
 * touches financial state.
 *
 * `hydrated` turns true once the stored value has been read (or could not
 * be); until then nothing mode-specific is shown, so a stored City choice
 * never flashes the Pet-mode snow first. A choice made before the read
 * finishes wins over the stored value.
 */
const useVisualMode = create((set, get) => ({
  mode: DEFAULT_VISUAL_MODE,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    let stored = null;
    try {
      stored = await getSetting(VISUAL_MODE_KEY);
    } catch (err) {
      console.warn('[mode] could not read the visual mode:', err);
    }
    if (!get().hydrated) set({ mode: normalizeVisualMode(stored), hydrated: true });
  },

  setMode: (value) => {
    const mode = normalizeVisualMode(value);
    set({ mode, hydrated: true });
    setSetting(VISUAL_MODE_KEY, mode).catch((err) => console.warn('[mode] could not save the visual mode:', err));
  },

  toggle: () => get().setMode(nextVisualMode(get().mode)),
}));

export default useVisualMode;
