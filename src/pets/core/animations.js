/*
 * Animation registry.
 *
 * An animation is a reusable, named timed sequence of view patches
 * (expression, pose, props, offsets...). It knows nothing about when it
 * is chosen: behaviors reference animations by id, and several behaviors
 * may share one. A pet supplies its own set; the frame art those patches
 * select lives in the pet's sprite module.
 *
 *   data form : { id, steps: [[dt, patch], ...] }
 *   code form : { id, build(S, c, t0, opts) -> end }   (varied timing)
 *
 * Patches are plain objects merged into the pet's view.
 */
export function createAnimationRegistry(defs = [], parent = null) {
  const map = new Map();

  const register = (def) => {
    if (!def || typeof def.id !== 'string') throw new Error('animation needs an id');
    if (typeof def.build !== 'function' && !Array.isArray(def.steps)) {
      throw new Error(`animation "${def.id}" needs steps or build`);
    }
    map.set(def.id, def);
  };

  defs.forEach((d) => {
    try {
      register(d);
    } catch (err) {
      console.warn('[pets] animation skipped:', err.message);
    }
  });

  const get = (id) => map.get(id) || (parent ? parent.get(id) : undefined);

  /* Schedules animation `id` on script S from t0; returns its end time. */
  function play(S, c, id, t0 = 0, opts = {}) {
    const def = get(id);
    if (!def) return t0; // a missing optional animation never breaks a behavior
    if (def.build) return def.build(S, c, t0, opts);

    let end = t0;
    for (const [dt, patch] of def.steps) {
      S.at(t0 + dt, typeof patch === 'function' ? patch(opts) : patch);
      end = Math.max(end, t0 + dt);
    }
    return end;
  }

  return { register, get, has: (id) => !!get(id), play, ids: () => [...map.keys()] };
}
