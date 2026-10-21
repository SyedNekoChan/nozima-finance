import { openRpg, closeRpg } from './gate.js';

/*
 * Development-only activation: run `__nomozDev.open()` in the browser console.
 * This module is only imported behind import.meta.env.DEV (see mount.jsx), so
 * it is dead-code-eliminated from production builds. It is not the hidden trigger.
 */
export function installDevActivation() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  window.__nomozDev = Object.freeze({ open: openRpg, close: closeRpg });
}
