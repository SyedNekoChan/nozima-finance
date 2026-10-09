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
  minBehaviorMs: 600,
  historyLength: 4, // recent behaviors that are down-weighted
  historyPenalty: 0.4,
  reducedGapFactor: 1.5, // reduced motion: slower cadence
  reducedDurationFactor: 1.3,
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
