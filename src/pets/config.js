import { DUR } from '../lib/motion.js';

/*
 * Pet subsystem configuration shared by every pet. A pet may override any
 * `WORLD` value through its own definition (`pet.world`); behavior weights,
 * cooldowns and vanity items live with the pet (see nomoz/config.js).
 */

// Which registered pet is mounted in the global backdrop.
export const ACTIVE_PET_ID = 'nomoz';
export const DEFAULT_PET_ID = 'nomoz';

// Future interaction modules (cursor awareness, click reactions...) that
// are switched on. Deliberately empty: no interaction feature is active.
export const ACTIVE_INTERACTIONS = [];

/* ------------------------------------------------------------------ */
/* World: depth, bounds, scale                                         */
/* ------------------------------------------------------------------ */

export const WORLD = {
  perspective: 900,
  // [far, near] depth bands per breakpoint profile
  zRange: { wide: [-320, 180], compact: [-220, 120] },
  // extra scale at the closest depth, eased in from mid depth
  nearBoost: 0.28,
  // layer widths under this use the compact profile
  compactMaxWidth: 640,
  // whole-number pixel scale of the sprite box
  pixelScale: { wide: 4, compact: 3 },
  // edge margin and clearance from the OVER BUDGET readout along the top
  margin: { wide: 14, compact: 6 },
  top: { wide: 38, compact: 32 },
  // opacity: far .. near, and the hard ceiling
  alpha: { far: 0.7, near: 1, ceiling: 0.95 },
  // depth fractions where the rim light steps up
  lightSteps: [0.34, 0.67],
  // a walking step moves the sprite by 1/n of its width
  stepsPerSprite: 12,
};

/* ------------------------------------------------------------------ */
/* Scheduler                                                           */
/* ------------------------------------------------------------------ */

export const SCHEDULER = {
  gap: [500, 2600], // pause between behaviors
  longGapChance: 0.18, // about one pause in five is long
  longGap: [4000, 11000],
  firstDelay: [200, 3200], // before the first behavior of a page load
  restartDelay: [300, 1100], // after a mood / breakpoint change
  // Financial moods that look the same apart from worn items (crown, coin).
  // A change between them keeps the running behavior, the position and the
  // sprite canvas; any other change cancels the behavior and cross-fades.
  continuousMoods: ['idle', 'content'],
  minBehaviorMs: 600,
  historyLength: 4, // recent behaviors that are down-weighted
  historyPenalty: 0.4,
  reducedGapFactor: 1.5, // reduced motion: slower cadence
  // reduced motion plays a behavior's script at this fraction of its time
  // and folds beats closer than reducedBeatSlotMs into one step
  reducedDurationFactor: 0.5,
  reducedBeatSlotMs: 150,
  // view fields that only shuffle or flicker the sprite: never applied under reduced motion
  reducedDropFields: ['lean', 'glitch'],
  stepMs: 480, // one walking step
  nervousStepMs: 320,
  ambientMs: Math.round(DUR.ambient * 1000),
  // base weights when a behavior declares a rarity instead of weights
  rarityWeight: { common: 12, uncommon: 6, rare: 3, veryRare: 1.2, extremelyRare: 0.5 },
  // frame clock (breathing, tail flicks, stressed flip)
  frameMs: 1000,
  fastFrameMs: 300,
};

/* ------------------------------------------------------------------ */
/* Ambient life (see core/ambient.js)                                  */
/* ------------------------------------------------------------------ */

export const AMBIENT = {
  blink: {
    firstMs: [1500, 4500],
    everyMs: [3200, 8000], // between blinks while the eyes are plainly open
    retryMs: [900, 2200], // when a behavior's expression is on the face
    closedMs: 140,
    doubleChance: 0.18, // now and then a quick second blink
    doubleGapMs: 240,
  },
  // the loose personality of an idle face (see core/attention.js): a look aside, an ear flick, a head tilt, a squint, a
  // stirring tail. Gaps vary a lot and now and then there is a long quiet, so nothing repeats on a clock.
  attention: {
    firstMs: [3500, 9000],
    everyMs: [3800, 10500], // between moments, scaled by how alert / sleepy the cat is
    retryMs: [1500, 3500], // when a behavior is busy with the face
    longQuietChance: 0.14,
    longQuietMs: [9000, 22000],
    // awareness of what is going on around it (see core/attention.js, core/worldwatch.js)
    watchMs: 500, // how often it looks round for something new
    habituateMs: [25000, 70000], // rest from the same thing after reacting to it
    pointerHabituateMs: [60000, 150000], // the mouse is secondary: a much longer rest
    episodeRestMs: [12000, 32000], // rest from looking at anything after an episode
  },
};

/* ------------------------------------------------------------------ */
/* Environmental encounters (rare, shared defaults)                    */
/* ------------------------------------------------------------------ */

export const ENCOUNTER = {
  // not before this long after page load (randomised per session)
  startDelay: [120000, 300000],
  // quiet time after ANY encounter, so two never follow each other closely
  groupGap: [480000, 960000],
  // spawn attempts before falling back to a plain random spot
  spawnTries: 10,
};

/* ------------------------------------------------------------------ */
/* Activities (longer performances, see core/activity.js)              */
/* ------------------------------------------------------------------ */

export const ACTIVITY = {
  // quiet time after any long performance (yarn play, a spell, alchemy...)
  // before another may start, so they never follow each other closely
  performanceGap: [45000, 120000],
};
