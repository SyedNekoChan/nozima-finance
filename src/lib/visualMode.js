/*
 * The app's visual mode: what lives in the backdrop behind the tabs.
 *
 *   pet   NOMOZ.EXE, the backdrop pet (the default)
 *   city  the night city seen from a supertall tower (src/city)
 *
 * Stored in the Dexie settings table under VISUAL_MODE_KEY. Anything that is
 * not a known mode (nothing stored yet, an old or damaged value) reads as pet.
 */
export const VISUAL_MODES = ['pet', 'city'];
export const DEFAULT_VISUAL_MODE = 'pet';
export const VISUAL_MODE_KEY = 'visualMode';

export const normalizeVisualMode = (value) => (VISUAL_MODES.includes(value) ? value : DEFAULT_VISUAL_MODE);

export const nextVisualMode = (mode) => (normalizeVisualMode(mode) === 'pet' ? 'city' : 'pet');

// What the header toggle shows: [ MODE: PET ] / [ MODE: CITY ]
export const visualModeLabel = (mode) => normalizeVisualMode(mode).toUpperCase();
