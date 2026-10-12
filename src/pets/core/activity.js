import { ACTIVITY } from '../config.js';
import { defineBehavior } from './behaviors.js';
import { createActor } from './choreo.js';
import { rnd } from './rng.js';

/*
 * Activities: behaviors with a stage.
 *
 * A longer performance (playing with a ball, casting a spell, brewing a
 * potion) creates temporary props and overlay effects and moves the pet
 * through several phases. defineActivity() wraps defineBehavior() so every
 * such behavior gets the same safety and conveniences without the
 * scheduler or the renderer knowing anything about it:
 *
 *   defineActivity({
 *     ...any defineBehavior field (id, rarity, weights, cooldown, moves...),
 *     performance,              true for a long performance: after any one
 *                               of them the others wait a shared quiet gap
 *                               (ACTIVITY.performanceGap in config.js)
 *     plan(c, S, st) -> ms      the usual planner, plus a stage `st`
 *   })
 *
 * The stage:
 *   st.A                      a planned actor (see choreo.js) at the pet's spot
 *   st.prop(t, local, spec)   world props, namespaced by the activity id
 *   st.fx(t, key, spec)       sprite overlay effects (shared S.fx)
 *   st.variant(key, table)    weighted pick { name: weight } that avoids
 *                             repeating the previous pick of this activity
 *   st.chance(p)              a coin flip from the pet's random stream
 *
 * Lifecycle: the plan's last beat removes every prop the activity made and
 * clears the overlays, and `exit` (which also runs on cancellation: a mood
 * change, a request, an unmount) removes anything of its own that is still
 * there and applies the pet's `rest` patch (neutral limbs, ears, focus...).
 * Nothing an activity creates can outlive it. Activities are skipped while
 * the pet is off-screen.
 */
export function defineActivity(def) {
  if (!def || typeof def.id !== 'string' || typeof def.plan !== 'function') {
    throw new Error('activity needs an id and a plan(c, S, st) function');
  }
  const ns = `${def.id}:`;

  return defineBehavior({
    moods: ['idle', 'content'],
    ...def,

    eligible(c) {
      if (c.cur.offscreen) return false;
      if (def.performance && performance.now() < (c.memory?.performanceQuietUntil ?? 0)) return false;
      return def.eligible ? !!def.eligible.call(this, c) : true;
    },

    plan(c, S) {
      const st = makeStage(c, S, ns);
      const end = def.plan.call(this, c, S, st);
      st.cleanup(end);
      return end;
    },

    exit(c, why) {
      const own = Object.keys(c.cur.props || {}).filter((id) => id.startsWith(ns));
      c.apply({
        ...(c.pet.rest || {}),
        fx: {},
        ...(own.length ? { propOps: own.map((id) => [id, null]) } : {}),
      });
      if (def.performance && c.memory) {
        c.memory.performanceQuietUntil = performance.now() + rnd(c.rng, ...ACTIVITY.performanceGap);
      }
      def.exit?.call(this, c, why);
    },
  });
}

function makeStage(c, S, ns) {
  const made = new Set();
  const mem = c.memory || (c.memory = {});

  const st = {
    A: createActor(c, S),

    id: (local) => ns + local,

    prop(t, local, spec) {
      const id = ns + local;
      if (spec) made.add(id);
      S.prop(t, id, spec);
      return t;
    },

    fx(t, key, spec) {
      S.fx(t, key, spec);
      return t;
    },

    chance: (p) => c.rng() < p,

    variant(key, table) {
      const memKey = `${ns}variant:${key}`;
      const entries = Object.entries(table).filter(([, w]) => w > 0);
      if (!entries.length) return null;
      const weights = entries.map(([name, w]) => (name === mem[memKey] && entries.length > 1 ? w * 0.2 : w));
      let r = c.rng() * weights.reduce((s, w) => s + w, 0);
      let name = entries[0][0];
      for (let i = 0; i < entries.length; i++) {
        r -= weights[i];
        if (r <= 0) {
          name = entries[i][0];
          break;
        }
      }
      mem[memKey] = name;
      return name;
    },

    // several distinct picks from a table, in a random order
    some(key, table, n) {
      const out = [];
      const left = { ...table };
      for (let i = 0; i < n; i++) {
        const name = st.variant(`${key}${i}`, left);
        if (!name) break;
        out.push(name);
        delete left[name];
      }
      return out;
    },

    cleanup(t) {
      S.clearFx(t);
      for (const id of made) S.prop(t, id, null);
    },
  };

  return st;
}
