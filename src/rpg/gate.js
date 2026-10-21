import useRpgStore from './state/store.js';

/*
 * The only RPG surface the rest of the app may use. Both calls are
 * idempotent and never throw, so callers cannot be broken by the RPG.
 */
export function openRpg() {
  try {
    useRpgStore.getState().activate();
  } catch (err) {
    console.warn('[rpg] could not open:', err);
  }
}

export function closeRpg() {
  try {
    useRpgStore.getState().deactivate();
  } catch (err) {
    console.warn('[rpg] could not close:', err);
  }
}
