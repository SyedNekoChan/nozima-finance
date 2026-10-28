/*
 * The five approved starting classes. Data only: skill trees, stats and art
 * are later work, so the descriptions below stay to a short archetype line.
 * `art` is intentionally absent: no class illustration exists yet, and none
 * is faked. Order is the presentation order.
 */
export const CLASSES = Object.freeze([
  {
    id: 'swordsman',
    name: 'Swordsman',
    role: 'Front-line blade fighter',
    blurb: 'Fights up close with a sword. Steady and direct.',
    cost: 'Skills cost MP.',
  },
  {
    id: 'hunter',
    name: 'Hunter',
    role: 'Ranged marksman',
    blurb: 'Strikes from a distance. Patient and observant.',
    cost: 'Skills cost MP.',
  },
  {
    id: 'assassin',
    name: 'Assassin',
    role: 'Quick, precise striker',
    blurb: 'Prepares a target, then finishes it with a decisive strike.',
    cost: 'Skills cost MP.',
  },
  {
    id: 'mage',
    name: 'Mage',
    role: 'Spellcaster',
    blurb: 'Works elemental magic, choosing the element that fits the enemy.',
    cost: 'Skills cost MP.',
  },
  {
    id: 'necromancer',
    name: 'Necromancer',
    role: 'Dark arts specialist',
    blurb: 'Curses foes, drains life, and can call temporary undead allies.',
    cost: 'Skills cost HP, MP, or both.', // the one class that pays HP; never enough to be knocked out
  },
]);

// Every class begins with one thematic active skill plus these commands.
// No skill is specified for any class yet (see GAME_DESIGN, Open class decisions),
// so none is named here; class identity comes from skills, not stats.
export const STARTING_KIT = 'one thematic class skill (not yet defined), plus Basic Attack, Guard and Item.';

export const CLASS_IDS = Object.freeze(CLASSES.map((c) => c.id));

export const getClass = (id) => CLASSES.find((c) => c.id === id) ?? null;
