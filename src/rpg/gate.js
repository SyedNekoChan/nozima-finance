import { useEffect } from 'react';
import useRpgStore from './state/store.js';

/*
 * The only RPG surface the rest of the app may use. All calls are
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
  // a deliberate close ends the duplicate window so a real re-entry is never swallowed
  recentlyActivated = false;
  try {
    useRpgStore.getState().deactivate();
  } catch (err) {
    console.warn('[rpg] could not close:', err);
  }
}

/*
 * Pet bridge. The pet shell mounts the cat only when this returns 'present':
 * 'pending' while the missing-cat state is being read (so a missing cat never
 * flashes on reload), 'unresolved' when the RPG save could not be read (the
 * cat is withheld rather than assumed present; reads are retried), and
 * 'missing' while the cat has been stolen.
 */
export function usePetPresence() {
  const catMissing = useRpgStore((s) => s.catMissing);
  const unresolved = useRpgStore((s) => s.catUnresolved !== null);
  useEffect(() => {
    useRpgStore.getState().resolveCatState();
  }, []);
  if (catMissing === null) return unresolved ? 'unresolved' : 'pending';
  return catMissing ? 'missing' : 'present';
}

const ACTIVATION_PHRASE = 'Possibilities are possible';
const DUPLICATE_WINDOW_MS = 1000;
let recentlyActivated = false;

/*
 * Hidden-trigger check for the raw amount string of a new Ledger entry.
 * Returns true when the input is the exact, case-sensitive phrase: the
 * caller must then abandon the submission without parsing or saving it.
 * Activations inside the duplicate window (rapid clicks, repeated events)
 * are swallowed (still true) without re-opening. Never parses or throws.
 */
export function tryActivateFromAmount(rawAmount) {
  if (rawAmount !== ACTIVATION_PHRASE) return false;
  if (!recentlyActivated) {
    recentlyActivated = true;
    setTimeout(() => {
      recentlyActivated = false;
    }, DUPLICATE_WINDOW_MS);
    openRpg();
  }
  return true;
}
