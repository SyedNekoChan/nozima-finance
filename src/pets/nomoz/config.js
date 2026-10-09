/*
 * NOMOZ.EXE configuration: everything tunable about this pet in one place.
 * Shared world / scheduler numbers live in src/pets/config.js; per-behavior
 * numbers (weights, cooldowns, durations) sit next to each behavior module
 * in ./behaviors and can be overridden here without editing them.
 */

/* Appearance per financial state: base opacity (depth then dims it). */
export const APPEARANCES = {
  idle: { alpha: 0.95 },
  content: { alpha: 1 },
  stressed: { alpha: 1 },
};

/*
 * Behavior overrides, keyed by behavior id. Any behavior field may be
 * replaced; `enabled: false` switches a behavior off entirely.
 *   weights: { idle, content, stressed }  (absolute, 0 = never)
 * Example:  vanity: { enabled: false },  longPause: { weights: { idle: 2 } }
 */
export const BEHAVIOR_OVERRIDES = {};

/* World overrides for this pet (see WORLD in src/pets/config.js). */
export const WORLD_OVERRIDES = {};

/* Sprite box: 56 x 60 logical pixels, scaled by a whole number. */
export const SPRITE_SIZE = { width: 56, height: 60 };

/*
 * Lighting. The cat stays solid black and is revealed by light, never by
 * recolouring: directional rim levels per depth (top/left, corner, right),
 * the lit floor pool, its black contact shadow and the dithered aura.
 */
export const LIGHTING = {
  rim: [
    ['4', '4', '3'], // far
    ['5', '5', '4'], // mid
    ['5', '6', '4'], // near
  ],
  pool: { cx: 27.5, rx: 23, ry: 3.6, solid: 0.45, dy: 1.5 },
  shadow: { sitFeet: [14, 41], standFeet: [16, 39], sitY: 56, standY: 58 },
  auraFromLevel: 1,
};

/* Vanity items worn by default (definitions: ./vanity.js). */
export const EQUIPPED = ['crown', 'chestCoin', 'heldCoin', 'book'];

/* Reaction names an interaction module may request (see core/interactions.js). */
export const REACTIONS_MAP = {
  notice: ['curious'],
  startle: ['flinch', 'twitch'],
  acknowledge: ['look', 'nervousLook'],
  delight: ['glint', 'coinPolish'],
};
