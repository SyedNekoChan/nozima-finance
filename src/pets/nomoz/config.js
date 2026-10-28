/*
 * NOMOZ.EXE configuration: everything tunable about this pet in one place.
 * Shared world / scheduler numbers live in src/pets/config.js; per-behavior
 * numbers (weights, cooldowns, durations) sit next to each behavior module
 * in ./behaviors and can be overridden here without editing them.
 */

/* Appearance per financial state: base opacity (depth then dims it). */
export const APPEARANCES = {
  idle: { alpha: 0.95 },
  content: { alpha: 0.95 },
  stressed: { alpha: 1 },
};

/*
 * Behavior overrides, keyed by behavior id. Any behavior field may be
 * replaced; `enabled: false` switches a behavior off entirely.
 *   weights: { idle, content, stressed }  (absolute, 0 = never)
 * Example:  vanity: { enabled: false },  longPause: { weights: { idle: 2 } }
 */
export const BEHAVIOR_OVERRIDES = {};

/*
 * The neutral rig an activity leaves behind when it ends or is cancelled
 * (see core/activity.js): paws down, ears and tail at rest, pupils back
 * on automatic, the book's paw and shift cleared, sitting. Never position.
 */
export const REST_PATCH = {
  view: 'front',
  pose: 'sit',
  legs: 0,
  lean: 0,
  gaze: 'c',
  eyes: 'open',
  mouth: 'idle',
  droop: 0,
  cue: null,
  item: null,
  pawL: null,
  pawR: null,
  ears: null,
  tail: null,
  focus: null,
  pupils: null,
  book: null,
  bookPaw: null,
  bookShift: 0,
};

/* World overrides for this pet (see WORLD in src/pets/config.js). */
export const WORLD_OVERRIDES = {};

/* Sprite box: 56 x 60 logical pixels, scaled by a whole number. */
export const SPRITE_SIZE = { width: 56, height: 60 };

/*
 * Which renderer draws the cat.
 *   'procedural' : the pixel-grid renderer in ./sprites.js (the default).
 *   'sheet'      : sprite-sheet clips from ./spritesheet/manifest.js, with
 *                  the procedural renderer as the per-frame fallback and
 *                  the source of dynamic overlays. With an empty manifest
 *                  it behaves exactly like 'procedural'.
 */
export const SPRITE_RENDERER = { mode: 'procedural' };

/*
 * Sprite box of the 'sheet' mode: the reference-style cat is larger than the
 * procedural one (96 x 64 frames, see spritesheet/spec.js). The procedural
 * cat is drawn centred inside it, so it stays the per-frame fallback. Keep
 * width - 56 even. Procedural mode keeps SPRITE_SIZE.
 */
export const SHEET_SPRITE_SIZE = { width: 96, height: 64 };

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
  shadow: { sitFeet: [14, 41], standFeet: [16, 39], sitY: 56, standY: 58, lieFeet: [7, 48], lieY: 57 },
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

/*
 * Rare environmental encounters (see core/encounter.js and
 * behaviors/encounters.js). Pure data: change a range, a weight or the glyph
 * set here; `enabled: false` (or a BEHAVIOR_OVERRIDES entry) removes one.
 * Distances are in "cells" (1/12 of the sprite width, scaled by depth).
 * Weights are tiny on purpose: ordinary behaviors weigh 3-16.
 */
export const ENCOUNTERS = {
  terminal: {
    id: 'miniTerminal',
    name: 'Miniature terminal',
    rarity: 'extremelyRare',
    weights: { idle: 0.7, content: 0.6 },
    cooldown: [1200000, 2700000], // 20-45 min between two of these
    duration: [24000, 40000],
    prop: { id: 'terminal', kind: 'terminal' },
    spawn: {
      depth: [0.35, 0.8],
      distance: { wide: [14, 22], compact: [9, 14] },
    },
    approach: {
      stopDistance: { wide: [9, 11], compact: [8, 10] },
      zOffset: 25, // the pet stops a little nearer than the terminal
      stepMs: 560, // cautious
    },
    timing: { settle: [900, 2200], fadeIn: [600, 900], notice: [900, 1600], hesitate: [900, 2400] },
    // decorative only: one of these is shown, never any application data
    glyphs: ['*', '+', '#', '~', '=', '@', '&', '%'],
    screen: { wake: [900, 1600], visible: [2600, 5200], afterglow: [500, 900] },
    followOn: { look: 2, sit: 2, observe: 2, walk: 2 },
  },

  distortion: {
    id: 'depthAnomaly',
    name: 'Mysterious depth anomaly',
    rarity: 'extremelyRare',
    weights: { idle: 0.6, content: 0.5 },
    cooldown: [1500000, 3000000], // 25-50 min
    duration: [22000, 36000],
    prop: { id: 'anomaly', kind: 'distortion' },
    spawn: {
      depth: [0.2, 0.85],
      distance: { wide: [14, 24], compact: [9, 15] },
    },
    approach: {
      stopDistance: { wide: [11, 14], compact: [9, 11] }, // keeps a wary distance
      zOffset: 15,
      stepMs: 540,
    },
    timing: { settle: [900, 2200], fadeIn: [700, 1000], notice: [1000, 1800], hesitate: [1200, 2800] },
    inspect: [3500, 7000], // how long it studies the distortion
    intensify: { hold: [600, 900], retreatCells: [5, 8] },
    followOn: { look: 3, sit: 2, observe: 2, watchBeyond: 2 },
  },
};
