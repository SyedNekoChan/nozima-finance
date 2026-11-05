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

/* Procedural coordinate box: 56 x 60 logical pixels. The overlays (effects, items, cues, vanity) and the head anchors are laid out in it; the sheet canvas (SHEET_SPRITE_SIZE) is larger and centres it. */
export const SPRITE_SIZE = { width: 56, height: 60 };

/*
 * Sprite box of the pet: the sheet frames are 96 x 64 (see spritesheet/spec.js).
 * The 56 x 60 procedural coordinate box (SPRITE_SIZE) is centred inside it.
 * Keep width - 56 even.
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

/* ------------------------------------------------------------------ */
/* Personality and emotion (see core/emotion.js, core/attention.js)    */
/* ------------------------------------------------------------------ */

/*
 * NOMOZ.EXE's temperament: observant, reserved, dryly composed. Quick to be curious about something new, slow to play
 * (strongest around the yarn), hard to irritate and quick to get over it, a cat that dozes now and then but is not
 * a sleepy cat. Her tells are consistent: irritation shows in the tail first and the ears second, never in wide eyes;
 * curiosity is a head tilt with open pupils; sleepiness is slow blinks and squints; after a start there is always a slow,
 * composing blink.
 *
 * Emotion is NOT the financial mood (idle / content / stressed). Nothing here changes behavior weights or the scheduler.
 *
 *   gain / cap       how strongly an event charges each emotion, and the most it can reach
 *   halfLifeMs       how fast an emotion fades on its own (sleepy is driven by `sleepy` below instead)
 *   threshold/exit   charge needed to show an emotion / the lower charge at which it is let go
 *   margin/minDwell  a rival emotion must beat the current one by this much, after this long
 *   inhibit          { by: { damped: factor } } a strong emotion damps another
 *   events           what an event does: add (to charges, x magnitude x gain), drop, settle (x arousal), slept, reflex, compose, stim
 *   behaviors        a finished behavior -> an event
 *   moments          idle-moment weights per emotion: mul (x factor) and add (a share carved out of the others; the
 *                    total weight is kept, so emotion changes WHICH moment, not how often)
 *   displayGapMs     at least this long between two flavoured moments of a kind (nothing is exaggerated)
 */
export const PERSONALITY = {
  threshold: 0.35,
  exit: 0.2,
  margin: 0.15,
  minDwellMs: 15000,
  reflexMs: 2500,
  composeMs: 30000, // after a genuine start, the next idle moment is a slow, composing blink (if it comes within this long)
  maxStepMs: 5000,
  gain: { curious: 1.2, playful: 0.7, sleepy: 1, irritated: 0.6 },
  cap: { curious: 0.9, playful: 0.8, sleepy: 0.6, irritated: 0.6 },
  halfLifeMs: { curious: 25000, playful: 45000, irritated: 35000 },
  // sleepiness rises only after quietMs without any stimulation (an event, or the pointer moving anywhere), takes riseMs
  // to reach the display threshold, drains within recoverMs of activity, shows for at most maxDwellMs and then cannot
  // return for refractoryMs: even a cat left alone all day is sleepy for roughly a seventh of the time
  sleepy: { quietMs: 90000, riseMs: 540000, recoverMs: 45000, maxDwellMs: 150000, refractoryMs: 480000 },
  inhibit: { sleepy: { playful: 0.6, curious: 0.25 }, irritated: { playful: 0.6, curious: 0.3 } },
  events: {
    noticed: { add: { curious: 0.55 } }, // attention took notice of something (x interest x novelty)
    'noticed:yarn': { add: { playful: 0.5 } },
    disturb: { add: { irritated: 0.28 }, drop: { sleepy: 0.1 } }, // the mouse keeps sweeping past
    return: { add: { curious: 0.15 }, drop: { sleepy: 0.3 } }, // the tab is back
    play: { add: { playful: 0.55 }, drop: { sleepy: 0.2 } },
    comfort: { settle: 0.5, stim: false }, // an enjoyable, calm thing: the stirred-up feelings settle
    slept: { slept: true, settle: 0.4, stim: false },
    startle: { reflex: true, compose: true, add: { curious: 0.15 }, stim: false }, // a genuine start (the startle behavior)
  },
  behaviors: {
    yarnPlay: 'play', wispPlay: 'play', treasure: 'play', tinker: 'play',
    groom: 'comfort', eat: 'comfort', music: 'comfort', relax: 'comfort', relief: 'comfort',
    sleep: 'slept',
    startle: 'startle',
  },
  moments: {
    sleepy: { mul: { squint: 2.4, tail: 0.5, alert: 0.4, glance: 0.8, listen: 0.8, tilt: 0.7, sly: 0.5 }, add: { slowBlink: 1.4 } },
    curious: { mul: { tilt: 2.2, listen: 1.5, glance: 1.2, alert: 1.3, squint: 0.5, sly: 0.8 } },
    playful: { mul: { tail: 2.2, sly: 2.4, glance: 1.4, squint: 0.4 } },
    irritated: { mul: { tail: 1.6, listen: 0.7, tilt: 0.4, sly: 0.3, squint: 0.6, alert: 0.6 }, add: { huff: 2.2 } },
  },
  displayGapMs: { huff: 45000, slowBlink: 20000 },
};
