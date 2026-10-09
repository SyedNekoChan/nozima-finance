import { createAnimationRegistry } from './animations.js';
import { buildBehaviorSet } from './behaviors.js';
import { createVanityRegistry } from './vanity.js';
import { createWorld } from './space.js';

/*
 * definePet: validates and assembles a pet definition into the runtime
 * object every shared system consumes. A pet supplies:
 *
 *   id, name
 *   sprite      { width, height, render(ctx, params), items? }
 *   palette, lighting      documented defaults, used by the pet's sprite module
 *   animations  [animation defs]
 *   behaviors   [behavior modules]  +  behaviorOverrides { id: { enabled, weights, ... } }
 *   appearances { idle|content|stressed: { alpha } }   financial-state looks
 *   vanity      { slots, items, equipped }
 *   capabilities  ['walk', 'read', ...]  optional extensions it supports
 *   reactions   { semanticName: behaviorId }  for the interaction API
 *   world       overrides for depth range, scale, bounds (see config.js)
 *   initial     { poses, ... } hints for the random first placement
 *
 * The backdrop layer, movement engine, financial-state integration, modal
 * stacking and the scheduler are shared and never change per pet.
 */
export function definePet(def) {
  for (const key of ['id', 'name']) {
    if (typeof def[key] !== 'string') throw new Error(`pet needs a string "${key}"`);
  }
  if (!def.sprite || typeof def.sprite.render !== 'function') {
    throw new Error(`pet "${def.id}" needs sprite.render`);
  }

  const vanity = createVanityRegistry({
    petId: def.id,
    slots: def.vanity?.slots,
    items: def.vanity?.items,
    equipped: def.vanity?.equipped,
  });

  const capabilities = new Set(def.capabilities || []);
  const hasCapability = (cap) =>
    cap.startsWith('vanity:') ? vanity.has(cap.slice(7)) : capabilities.has(cap);

  const animations = createAnimationRegistry(def.animations || []);

  return {
    appearances: { idle: { alpha: 1 }, content: { alpha: 1 }, stressed: { alpha: 1 } },
    reactions: {},
    initial: { poses: ['sit'] },
    ...def,
    vanity,
    animations,
    capabilities,
    hasCapability,
    world: createWorld(def.world),
    behaviors: buildBehaviorSet(def.behaviors || [], def.behaviorOverrides, hasCapability),
  };
}
