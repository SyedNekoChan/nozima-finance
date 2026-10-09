import { definePet } from '../core/pet.js';
import { ANIMATIONS } from './animations.js';
import { BEHAVIORS } from './behaviors/index.js';
import {
  APPEARANCES,
  BEHAVIOR_OVERRIDES,
  EQUIPPED,
  LIGHTING,
  REACTIONS_MAP,
  SPRITE_SIZE,
  WORLD_OVERRIDES,
} from './config.js';
import { FINANCIAL_REACTIONS } from './financial.js';
import { ITEMS, SLOTS } from './vanity.js';
import { renderSprite } from './sprites.js';

/*
 * NOMOZ.EXE: the first registered pet, the solid-black cat of the
 * reference art. Its identity, art and behavior rules are unchanged; this
 * file only assembles the parts for the shared pet systems.
 *
 * If assembly ever fails the pet is simply absent (null); the financial
 * application never depends on it.
 */
function build() {
  try {
    return definePet({
      id: 'nomoz',
      name: 'NOMOZ.EXE',
      sprite: { ...SPRITE_SIZE, render: renderSprite },
      lighting: LIGHTING,
      animations: ANIMATIONS,
      behaviors: BEHAVIORS,
      behaviorOverrides: BEHAVIOR_OVERRIDES,
      appearances: APPEARANCES,
      vanity: { slots: SLOTS, items: ITEMS, equipped: EQUIPPED },
      capabilities: ['walk', 'depth', 'read', 'sleep', 'glitch', 'coin', 'crown'],
      reactions: REACTIONS_MAP,
      financialReactions: FINANCIAL_REACTIONS,
      world: WORLD_OVERRIDES,
      initial: { poses: ['sit', 'sit', 'sit', 'stand'] },
    });
  } catch (err) {
    console.warn('[pets] NOMOZ.EXE failed to assemble:', err);
    return null;
  }
}

export default build();
