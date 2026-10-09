import { ACTIVE_INTERACTIONS } from '../config.js';

/*
 * Future interaction API (nothing is active in this release).
 *
 * An interaction module (cursor awareness, click reactions, a keyboard
 * easter egg...) is isolated from the application: it never receives the
 * store, the router, the DOM shell or any financial data. It only gets a
 * small PetPort:
 *
 *   port.reactions          names the pet understands ('notice', 'startle', ...)
 *   port.requestReaction(name, { interrupt })
 *   port.snapshot()         read-only { petId, mood, sx, sy, z, facing, reduced }
 *
 * `requestReaction` resolves a semantic name through the pet definition
 * (`pet.reactions`) to one of the pet's own behaviors and hands it to the
 * pet's scheduler, which accepts it only if the behavior is eligible for
 * the current financial state and motion preference. A module can never
 * override the stressed / prosperous appearance, and an unknown name or a
 * refused request is simply ignored.
 *
 * Register a module, then list its id in ACTIVE_INTERACTIONS (config.js):
 *
 *   registerInteraction({
 *     id: 'cursor-awareness',
 *     attach(port) { ...subscribe...; return () => ...unsubscribe...; },
 *   });
 */

const modules = new Map();

export function registerInteraction(mod) {
  if (!mod || typeof mod.id !== 'string' || typeof mod.attach !== 'function') {
    console.warn('[pets] interaction module needs an id and attach(port)');
    return false;
  }
  modules.set(mod.id, mod);
  return true;
}

export const listInteractions = () => [...modules.keys()];

/*
 * Called by the pet hook once the pet is placed. Returns a detach function.
 * controller = { pet, getSnapshot(), request(behaviorId, opts) }
 */
export function attachInteractions(controller, active = ACTIVE_INTERACTIONS) {
  const detachers = [];

  for (const id of active) {
    const mod = modules.get(id);
    if (!mod) continue;

    const port = Object.freeze({
      reactions: Object.freeze(Object.keys(controller.pet.reactions || {})),
      requestReaction(name, opts) {
        // a reaction maps to one behavior id, or a list tried in order
        const target = controller.pet.reactions?.[name];
        const ids = Array.isArray(target) ? target : [target];
        return ids.some((id) => !!id && controller.request(id, opts));
      },
      snapshot: controller.getSnapshot,
    });

    try {
      const detach = mod.attach(port);
      if (typeof detach === 'function') detachers.push(detach);
    } catch (err) {
      console.warn(`[pets] interaction "${id}" failed to attach:`, err);
    }
  }

  return () => {
    for (const d of detachers) {
      try {
        d();
      } catch (err) {
        console.warn('[pets] interaction detach failed:', err);
      }
    }
  };
}
