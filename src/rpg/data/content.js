// Content definitions for Nomoz. Later phases add classes, creatures, maps and
// encounters here as data.
export const GAME_TITLE = 'Nomoz';

// Persisted opening progress. Only these values may appear in a save.
export const OPENING_STEPS = Object.freeze({
  PORTAL: 'portal', // activated; the theft has not happened yet
  STOLEN: 'stolen', // the cat has been taken (persisted); the player has not entered
  ENTERED: 'entered', // the player has entered Nomoz
});

export const STORY_STAGES = Object.freeze({
  OPENING: 'opening',
  NOMOZ: 'nomoz',
});
