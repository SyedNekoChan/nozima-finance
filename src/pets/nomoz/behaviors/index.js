import * as observing from './observing.js';
import * as resting from './resting.js';
import * as activities from './activities.js';
import * as movement from './movement.js';
import * as stressed from './stressed.js';
import * as financial from './financial.js';
import * as encounters from './encounters.js';

/*
 * Every NOMOZ.EXE behavior module. To add a behavior: write a
 * defineBehavior(...) export in one of these files (or a new file) and
 * make sure it is exported from that module. Nothing else changes.
 */
export const BEHAVIORS = [observing, resting, activities, movement, stressed, financial, encounters].flatMap((m) =>
  Object.values(m)
);
