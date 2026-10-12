import * as observing from './observing.js';
import * as resting from './resting.js';
import * as activities from './activities.js';
import * as movement from './movement.js';
import * as stressed from './stressed.js';
import * as financial from './financial.js';
import * as encounters from './encounters.js';
import * as grooming from './grooming.js';
import * as yarn from './yarn.js';
import * as eating from './eating.js';
import * as spells from './spells.js';
import * as magic from './magic.js';
import * as crafts from './crafts.js';
import * as terminal from './terminal.js';
import * as transitions from './transitions.js';

/*
 * Every NOMOZ.EXE behavior module. To add a behavior: write a
 * defineBehavior(...) (or defineActivity(...), for a performance with
 * props and phases) export in one of these files (or a new file) and make
 * sure it is exported from that module. Nothing else changes. Modules
 * export behaviors only; shared helpers live in ./util.js.
 */
export const BEHAVIORS = [
  observing,
  resting,
  activities,
  movement,
  stressed,
  financial,
  encounters,
  grooming,
  yarn,
  eating,
  spells,
  magic,
  crafts,
  terminal,
  transitions,
].flatMap((m) => Object.values(m));
