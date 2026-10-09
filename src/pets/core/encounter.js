import { ENCOUNTER } from '../config.js';
import { defineBehavior } from './behaviors.js';
import { clamp, lerp, rnd } from './rng.js';
import { travel } from './toolkit.js';

/*
 * Environmental encounters.
 *
 * An encounter is a rare behavior in which a temporary object appears in the
 * pet's persistent X/Y/Z world, the pet notices it, approaches it with the
 * normal walking system, investigates it and leaves, and the object
 * disappears. defineEncounter() supplies the shared scaffolding as ONE
 * registered behavior, so the scheduler needs nothing special:
 *
 *   defineEncounter({
 *     id, name, rarity, weights, moods,   selection (rarity / per-mood weights)
 *     cooldown: [min, max],               randomised per completion (ms)
 *     groupGap, startDelay,               shared quiet times (defaults: ENCOUNTER)
 *     eligible(c), followOn,              extra rule, natural follow-ons
 *     prop: { id, kind },                 the world-anchored object (one id = one prop)
 *     spawn: { depth: [f0, f1],           depth band as fractions of the Z range
 *              distance: { wide: [a, b], compact: [a, b] } },   cells from the pet
 *     approach: { stopDistance: { wide, compact }, zOffset, stepMs },
 *     timing: { settle, fadeIn, notice, hesitate },            ms ranges
 *     appear(c)  -> extra prop fields (glyph, seed...),
 *     examine(S, c, run, t) -> t          the inspection and its climax
 *     depart(S, c, run, t) -> t           how the pet leaves and the prop goes
 *   })
 *
 * `run` carries { id, spec, spawn, stop, facing, gaze, tSpawn, away(cells) }.
 * Lifecycle: enter -> plan (the whole timeline as one script, executed by the
 * scheduler's single timer) -> exit. exit ALSO runs on cancellation (a
 * financial-state change, a request), so the prop is always removed and the
 * cooldowns are always recorded. Props are removed by id, so encounters can
 * never overlap: one behavior runs at a time and every encounter owns its id.
 *
 * Movement uses travel() (continuous X/Y/Z steps). Encounters are `moves`
 * behaviors, so reduced motion never selects them.
 */

const px = (c, cells, z) => cells * c.geo.cell * c.geo.scaleAt(z);
const profile = (c, o) => o[c.compact ? 'compact' : 'wide'];
const dist = (a, b) => Math.hypot(a.sx - b.sx, a.sy - b.sy);

// Screen-space gaze from one point toward another.
export function gazeToward(from, to) {
  const dx = to.sx - from.sx;
  const dy = to.sy - from.sy;
  if (dy < -Math.abs(dx) * 0.9) return 'u';
  if (Math.abs(dx) < 12) return 'c';
  return dx < 0 ? 'l' : 'r';
}

// Walking direction that faces `to` from `from` (sign of the screen dx).
const facingToward = (from, to, fallback = 1) =>
  Math.abs(to.sx - from.sx) > 4 ? (to.sx < from.sx ? -1 : 1) : fallback;

function pickSpawn(c, cfg) {
  const [z0, z1] = c.geo.zRange;
  const [f0, f1] = cfg.spawn.depth;
  const [d0, d1] = profile(c, cfg.spawn.distance);

  for (let i = 0; i < (cfg.spawn.tries ?? ENCOUNTER.spawnTries); i++) {
    const z = lerp(z0, z1, rnd(c.rng, f0, f1));
    const b = c.geo.bounds(z);
    const d = px(c, rnd(c.rng, d0, d1), z);
    const a = c.rng() * Math.PI * 2;
    const sx = c.cur.sx + Math.cos(a) * d;
    const sy = c.cur.sy + Math.sin(a) * d * 0.55;
    if (sx >= b.minX && sx <= b.maxX && sy >= b.minY && sy <= b.maxY) return { sx, sy, z };
  }

  // a cramped layout: any spot in the band, pushed to the far side of the pet
  const spot = c.pickSpot({ zRange: [lerp(z0, z1, f0), lerp(z0, z1, f1)] });
  if (dist(spot, c.cur) < px(c, d0 * 0.6, spot.z)) {
    const b = c.geo.bounds(spot.z);
    spot.sx = c.cur.sx < c.geo.width / 2 ? b.maxX : b.minX;
  }
  return spot;
}

// Where the pet stops to examine the prop: on the pet's side of it.
function pickStop(c, cfg, spawn) {
  const [z0, z1] = c.geo.zRange;
  const z = clamp(spawn.z + (cfg.approach.zOffset ?? 0), z0, z1);
  const [s0, s1] = profile(c, cfg.approach.stopDistance);

  let ux = c.cur.sx - spawn.sx;
  let uy = c.cur.sy - spawn.sy;
  const len = Math.hypot(ux, uy) || 1;
  ux /= len;
  uy /= len;

  const d = px(c, rnd(c.rng, s0, s1), z);
  const at = (k) => c.geo.clamp({ sx: spawn.sx + ux * d * k, sy: spawn.sy + uy * d * 0.6 * k, z });

  let stop = at(1);
  if (dist(stop, spawn) < d * 0.6) stop = at(-1); // wedged against an edge: use the other side
  return stop;
}

// A point away from the prop, from where the pet stands.
function pickAway(c, from, spawn, cells) {
  let ux = from.sx - spawn.sx;
  let uy = from.sy - spawn.sy;
  const len = Math.hypot(ux, uy) || 1;
  ux /= len;
  uy /= len;
  const d = px(c, cells, from.z);

  const tries = [
    [ux, uy],
    [-uy, ux],
    [uy, -ux],
  ];
  let best = from;
  for (const [x, y] of tries) {
    const p = c.geo.clamp({ sx: from.sx + x * d, sy: from.sy + y * d * 0.5, z: from.z });
    if (dist(p, from) >= d * 0.6) return p;
    if (dist(p, from) > dist(best, from)) best = p;
  }
  return best;
}

export function defineEncounter(cfg) {
  const id = cfg.prop.id;
  const memKey = `${cfg.id}:until`;
  const gapRange = cfg.groupGap || ENCOUNTER.groupGap;
  const startRange = cfg.startDelay || ENCOUNTER.startDelay;

  return defineBehavior({
    id: cfg.id,
    name: cfg.name,
    rarity: cfg.rarity ?? 'extremelyRare',
    moods: cfg.moods ?? ['idle', 'content'],
    weights: cfg.weights ?? null,
    cooldown: 0, // randomised below, per completion
    duration: cfg.duration ?? null,
    moves: true,
    requires: [`prop:${cfg.prop.kind}`],
    followOn: cfg.followOn ?? {},
    enabled: cfg.enabled ?? true,

    // Rare by construction: not soon after load, a random cooldown per
    // encounter, and a shared quiet gap after any encounter.
    eligible(c) {
      const m = c.memory;
      if (!m || c.cur.offscreen) return false;

      const now = performance.now();
      if (m.encounterEarliest === undefined) m.encounterEarliest = now + rnd(c.rng, ...startRange);
      if (now < m.encounterEarliest) return false;
      if (now < (m.encounterQuietUntil ?? 0)) return false;
      if (now < (m[memKey] ?? 0)) return false;

      return cfg.eligible ? cfg.eligible(c) : true;
    },

    enter(c) {
      cfg.enter?.(c);
    },

    plan(c, S) {
      const T = { settle: [900, 2200], fadeIn: [600, 900], notice: [900, 1600], hesitate: [700, 2000], ...cfg.timing };
      const spawn = pickSpawn(c, cfg);
      const stop = pickStop(c, cfg, spawn);
      const spec = { kind: cfg.prop.kind, ...spawn, fade: 0, ...cfg.appear?.(c) };

      const run = {
        id,
        spec,
        spawn,
        stop,
        facing: facingToward(stop, spawn, c.cur.facing),
        gaze: gazeToward(stop, spawn),
        away: (cells) => pickAway(c, run.stop, spawn, cells),
      };

      // 1. the pet is going about an ordinary idle moment
      S.at(0, { pose: 'sit', legs: 0, eyes: 'open', mouth: 'idle' });
      let t = rnd(c.rng, ...T.settle);
      S.blink(t - 500);

      // 2. the object appears, quietly, somewhere in the world
      run.tSpawn = t;
      S.prop(t, id, spec);
      S.prop(t + 60, id, { fade: 1 });
      t += rnd(c.rng, ...T.fadeIn);

      // 3. the pet notices it and pauses
      const there = c.cur;
      S.at(t, {
        pose: 'sit',
        legs: 0,
        eyes: 'wide',
        gaze: gazeToward(there, spawn),
        facing: facingToward(there, spawn, c.cur.facing),
      });
      t += rnd(c.rng, ...T.notice);
      S.at(t, { eyes: 'open' });

      // 4. a hesitation
      t += rnd(c.rng, ...T.hesitate);

      // 5. a gradual approach through X / Y / Z
      t = travel(S, c, c.cur, stop, t, cfg.approach.stepMs, 30, 0.6);
      S.at(t, { facing: run.facing, gaze: run.gaze, pose: 'sit', legs: 0 });
      t += 350;

      // 6. the module's investigation, then 7. the way out
      t = cfg.examine(S, c, run, t);
      t = cfg.depart(S, c, run, t);

      // the prop is gone by now; make sure of it, then a natural pause
      S.prop(t, id, null);
      return t + rnd(c.rng, 500, 1200);
    },

    // Runs on completion AND on cancellation: nothing is ever left behind.
    exit(c, why) {
      c.apply({ propOps: [[id, null]] });

      const m = c.memory;
      if (m) {
        const now = performance.now();
        m[memKey] = now + rnd(c.rng, ...cfg.cooldown);
        m.encounterQuietUntil = now + rnd(c.rng, ...gapRange);
      }
      cfg.exit?.(c, why);
    },
  });
}
