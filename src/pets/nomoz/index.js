import { definePet } from '../core/pet.js';
import { ANIMATIONS } from './animations.js';
import { BEHAVIORS } from './behaviors/index.js';
import {
  APPEARANCES,
  BEHAVIOR_OVERRIDES,
  EQUIPPED,
  LIGHTING,
  REACTIONS_MAP,
  REST_PATCH,
  SHEET_SPRITE_SIZE,
  SPRITE_RENDERER,
  SPRITE_SIZE,
  WORLD_OVERRIDES,
} from './config.js';
import { FINANCIAL_REACTIONS } from './financial.js';
import { PROPS } from './props.js';
import { ITEMS, SLOTS } from './vanity.js';
import { renderSprite } from './sprites.js';
import { SHEET_MANIFEST } from './spritesheet/manifest.js';
import { createSheetRenderer } from './spritesheet/renderer.js';

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
    const sheet = SPRITE_RENDERER.mode === 'sheet';
    const render = sheet ? createSheetRenderer({ manifest: SHEET_MANIFEST }) : renderSprite;
    return definePet({
      id: 'nomoz',
      name: 'NOMOZ.EXE',
      sprite: { ...(sheet ? SHEET_SPRITE_SIZE : SPRITE_SIZE), render },
      lighting: LIGHTING,
      animations: ANIMATIONS,
      behaviors: BEHAVIORS,
      behaviorOverrides: BEHAVIOR_OVERRIDES,
      appearances: APPEARANCES,
      vanity: { slots: SLOTS, items: ITEMS, equipped: EQUIPPED },
      capabilities: ['walk', 'depth', 'read', 'sleep', 'glitch', 'coin', 'crown'],
      reactions: REACTIONS_MAP,
      props: PROPS,
      financialReactions: FINANCIAL_REACTIONS,
      rest: REST_PATCH,
      world: WORLD_OVERRIDES,
      initial: { poses: ['sit', 'sit', 'sit', 'stand'] },
    });
  } catch (err) {
    console.warn('[pets] NOMOZ.EXE failed to assemble:', err);
    return null;
  }
}

export default build();
