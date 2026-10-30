import { pick, rnd } from './rng.js';

/*
 * Ambient attention: the small, unscripted life of an idle cat's face, and what it notices.
 *
 * Beside the blinker (./ambient.js) this runs a loose personality, and an awareness of the world around the cat.
 *
 * PERSONALITY MOMENTS. Now and then, when the cat is plainly doing nothing, it glances aside, flicks an ear toward a
 * sound, tilts its head, squints sleepily, flicks its tail, goes briefly alert or gives a sly look.
 *
 * AWARENESS EPISODES. A stimulus (a prop that appears or moves, the mouse sweeping past or lingering near the cat, the
 * tab being revisited; see ./worldwatch.js) may catch its attention. An episode is one connected story, never an isolated
 * animation:  notice (ears up, pupils open, sometimes wide eyes for something surprising)  ->  orient (the eyes turn toward
 * it, sometimes the head follows)  ->  observe (it keeps looking, re-aims if the thing moves, the pupils swell at the
 * peak of interest)  ->  lose interest (the eyes drift back, a slow blink, the pupils settle)  ->  idle. How long it
 * watches depends on how interesting the thing is (now and then a long look), and the cat HABITUATES: every reaction to
 * the same object or kind of event makes the next one less likely and puts it on a rest, so a persistent object is
 * noticed, not reacted to forever. Proximity, direction and relevance set the interest; most things are ignored.
 *
 * RULES, so it never fights a behavior:
 *  - it only acts while the rig is neutral (sitting or standing still, eyes open, gaze centred, ears / tail / pupils /
 *    paws / cue all at rest, on screen) and checks again before every step; an event that arrives while a behavior has
 *    the cat is simply missed;
 *  - it only touches the fields it set, and gives each one back only if it still holds its value; if a behavior has
 *    taken over meanwhile it stops and the behavior's state wins;
 *  - one moment or episode at a time, never the same moment twice in a row, randomised gaps (and now and then a long
 *    quiet), longer between episodes, so nothing repeats on a clock.
 *
 *   rng       () => [0, 1)
 *   getView   () => the current view or null
 *   apply     (patch) => void   (the same merge the scheduler uses)
 *   timing    AMBIENT.attention in ../config.js
 *   mood      'idle' | 'content' | 'stressed' (sleepier when content, never runs stressed)
 *   world     optional { read() -> stimuli since the last call, rect() -> the cat's client rect | null, pointerPos() -> { x, y } | null }
 *   now       () => ms (the clock habituation uses; performance.now by default)
 * Returns stop(): cancels the timers and gives back anything it still holds.
 */

// the neutral rig (what REST_PATCH leaves behind), for the fields a moment may use
const NEUTRAL = { gaze: 'c', ears: null, lean: 0, tail: null, pupils: null, focus: null };
const OK_MOUTH = new Set(['idle', 'rest', undefined, null]);

export function isNeutral(v, own = {}) {
  if (!v || v.offscreen || v.sx === null || v.sx === undefined) return false;
  if (!(v.pose === 'sit' || (v.pose === 'stand' && !v.legs))) return false;
  if (v.legs || v.pawL || v.pawR || v.cue || v.item || v.book || v.droop || v.glitch) return false;
  if (!OK_MOUTH.has(v.mouth)) return false;
  // eyes: open (or the ambient blink in progress), or the squint / wide look this module holds
  if (!(v.eyes === 'open' || v.eyes === 'blink' || (own.eyes !== undefined && v.eyes === own.eyes))) return false;
  for (const [k, neutral] of Object.entries(NEUTRAL)) {
    const want = k in own ? own[k] : neutral;
    if ((v[k] ?? null) !== (want ?? null)) return false;
  }
  return true;
}

// screen-space side of a point relative to the cat: 'l' | 'r' | null (straight ahead / unknown)
export function sideOf(view, x) {
  if (typeof x !== 'number' || typeof view?.sx !== 'number') return null;
  const dx = x - view.sx;
  return Math.abs(dx) < 10 ? null : dx < 0 ? 'l' : 'r';
}

// how interesting a kind of prop is (0..1): living / moving / unusual things more than set dressing
export const PROP_INTEREST = { wisp: 0.85, yarn: 0.8, distortion: 0.9, terminal: 0.85, device: 0.7, instrument: 0.6, vessel: 0.55, trinket: 0.5, chart: 0.35, sky: 0.35 };
// the other things it can notice, with their base interest
// (the mouse is a secondary stimulus: low interest, a long rest, and only ever a short glance)
const EVENT_INTEREST = { 'pointer-fast': 0.34, 'pointer-dwell': 0.3, return: 0.35 };

const MOMENTS = {
  // a quick look aside, sometimes with the head following, sometimes a second look the other way
  glance(c) {
    const s = pick(c.rng, ['l', 'r']);
    const o = s === 'l' ? 'r' : 'l';
    const steps = [[0, { gaze: s, ...(c.rng() < 0.35 ? { lean: s === 'l' ? -1 : 1 } : {}) }], [rnd(c.rng, 700, 2000), { gaze: 'c', lean: 0 }]];
    if (c.rng() < 0.25) steps.push([rnd(c.rng, 250, 800), { gaze: o }], [rnd(c.rng, 600, 1400), { gaze: 'c' }]);
    return steps;
  },
  // an ear turns toward a sound; the eyes follow a little
  listen(c) {
    const s = pick(c.rng, ['L', 'R']);
    const steps = [[0, { ears: 'flick' + s, gaze: s === 'L' ? 'l' : 'r' }], [rnd(c.rng, 450, 900), { ears: null }], [rnd(c.rng, 150, 500), { gaze: 'c' }]];
    if (c.rng() < 0.3) {
      const t = s === 'L' ? 'R' : 'L';
      steps.push([rnd(c.rng, 500, 1400), { ears: 'flick' + t }], [rnd(c.rng, 400, 800), { ears: null }]);
    }
    return steps;
  },
  // head tilt at something it cannot quite place: curious pupils, the ears come forward, then it relaxes in stages
  tilt(c) {
    const s = pick(c.rng, [-1, 1]);
    return [
      [0, { lean: s, pupils: 2 }],
      [rnd(c.rng, 200, 450), { ears: 'perk', gaze: s < 0 ? 'l' : 'r' }],
      [rnd(c.rng, 1000, 2400), { gaze: 'c' }],
      [rnd(c.rng, 250, 700), { pupils: null }],
      [rnd(c.rng, 200, 600), { ears: null }],
      [rnd(c.rng, 150, 500), { lean: 0 }],
    ];
  },
  // a relaxed, sleepy squint: the lids sink and the pupils narrow, sometimes ending in a slow blink
  squint(c) {
    const steps = [[0, { eyes: 'down', pupils: 0 }], [rnd(c.rng, 600, 1500), { eyes: 'open' }], [rnd(c.rng, 120, 400), { pupils: null }]];
    if (c.rng() < 0.4) steps.push([rnd(c.rng, 250, 700), { eyes: 'blink' }], [rnd(c.rng, 260, 380), { eyes: 'open' }]);
    return steps;
  },
  // the tip of the tail stirs
  tail(c) {
    return [[0, { tail: 'swish' }], [rnd(c.rng, 1000, 2200), { tail: null }]];
  },
  // startled-awake alertness: wide eyes, big pupils, ears up, then it settles
  alert(c) {
    const s = pick(c.rng, ['l', 'r', 'c']);
    return [
      [0, { eyes: 'wide', pupils: 3, ears: 'perk', gaze: s }],
      [rnd(c.rng, 800, 1600), { gaze: 'c' }],
      [rnd(c.rng, 250, 600), { eyes: 'open', pupils: null }],
      [rnd(c.rng, 200, 500), { ears: null }],
    ];
  },
  // mischief: a sidelong look, pupils wide, the tail twitching, then back to innocence
  sly(c) {
    const s = pick(c.rng, ['l', 'r']);
    return [
      [0, { gaze: s, pupils: 3 }],
      [rnd(c.rng, 250, 500), { tail: 'swish' }],
      [rnd(c.rng, 700, 1300), { gaze: 'c' }],
      [rnd(c.rng, 200, 400), { pupils: null }],
      [rnd(c.rng, 500, 1100), { tail: null }],
    ];
  },
};

// the fields each step of a moment may set, tracked while it runs
const FIELDS = ['gaze', 'ears', 'lean', 'tail', 'pupils', 'eyes'];
const EYES_NEUTRAL = 'open';

/*
 * One awareness episode toward something at `aim()` (a screen-space side, or null for straight ahead, or undefined when
 * the thing has gone). `interest` 0..1. Steps may be functions of the live view; a function that returns `false` ends the
 * episode early (the thing is gone or the cat's rig was taken), null skips the step.
 */
export function episode(c, interest, aim, opts = {}) {
  if (opts.glance) return glance(c, aim, opts.gone);
  const surprise = interest > 0.8 && c.rng() < 0.45;
  const long = interest > 0.55 && c.rng() < 0.14;
  const watch = long ? rnd(c.rng, 7000, 12000) : rnd(c.rng, 1100, 2200) + interest * rnd(c.rng, 1200, 4200);
  const leanOn = c.rng() < 0.35;
  const steps = [];
  const side = () => aim();
  // notice: the ears come up and the pupils open a little (or the eyes go wide for something unexpected)
  steps.push([rnd(c.rng, 120, 520), surprise ? { eyes: 'wide', pupils: 3, ears: 'perk' } : { ears: 'perk', pupils: 2 }]);
  // orient: the eyes turn to it, the head sometimes follows
  steps.push([rnd(c.rng, 160, 480), () => {
    const s = side();
    if (s === undefined) return false;
    return { ...(s ? { gaze: s } : {}), ...(s && leanOn ? { lean: s === 'l' ? -1 : 1 } : {}) };
  }]);
  if (surprise) steps.push([rnd(c.rng, 350, 700), { eyes: 'open', pupils: 2 }]);
  // observe: keep looking, re-aim when it moves, the pupils swell at the peak of interest and ease off again
  let left = watch;
  let peaked = false;
  while (left > 0) {
    const dt = Math.min(left, rnd(c.rng, 650, 1250));
    left -= dt;
    const midway = !peaked && left < watch * 0.6 && interest > 0.45;
    if (midway) peaked = true;
    steps.push([dt, () => {
      const s = side();
      if (s === undefined) return false;
      return { gaze: s || 'c', ...(midway ? { pupils: 3 } : {}) };
    }]);
  }
  // lose interest: the pupils settle first, the eyes drift back (a slow blink now and then), then the ears and head
  steps.push([rnd(c.rng, 250, 700), { pupils: 2 }]);
  steps.push([rnd(c.rng, 200, 600), { gaze: 'c', pupils: null }]);
  if (c.rng() < 0.5) steps.push([rnd(c.rng, 150, 450), { eyes: 'blink' }], [rnd(c.rng, 250, 380), { eyes: 'open' }]);
  steps.push([rnd(c.rng, 200, 600), { ears: null }], [rnd(c.rng, 150, 500), { lean: 0 }]);
  return steps;
}

/*
 * A glance at something secondary (the mouse): the eyes go to where it was, once, for a second or two, and come back. The
 * side is fixed when the look begins: the eyes never follow it about; if it has gone away (`gone()`), the look ends early.
 */
function glance(c, aim, gone) {
  let fixed;
  const steps = [];
  if (c.rng() < 0.5) steps.push([rnd(c.rng, 100, 450), { pupils: 2 }]);
  steps.push([rnd(c.rng, 140, 420), () => {
    fixed = aim();
    if (fixed === undefined) return false;
    return fixed ? { gaze: fixed } : null;
  }]);
  const watch = rnd(c.rng, 800, 2000);
  steps.push([watch, () => (gone && gone() ? false : null)]);
  steps.push([rnd(c.rng, 150, 450), { gaze: 'c', pupils: null }]);
  if (c.rng() < 0.3) steps.push([rnd(c.rng, 150, 400), { eyes: 'blink' }], [rnd(c.rng, 250, 380), { eyes: 'open' }]);
  return steps;
}

export function startAttention({ rng, getView, apply, timing, mood = 'content', world = null, now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) }) {
  let timer = null;
  let watcher = null;
  let alive = true;
  let busy = false; // a moment or an episode is playing
  let last = null;
  let alertness = 0.3; // 0..1, rises when something happens nearby, decays on its own
  let restUntil = 0; // after an episode the cat does not look for the next thing for a while
  let held = {}; // field -> value this module has put on the cat and not yet given back
  const habit = new Map(); // stimulus key -> { n, until, pos }

  const later = (fn, ms) => {
    timer = setTimeout(fn, Math.max(0, ms));
  };

  // is everything still as this module left it (and nothing else going on)?
  const still = () => isNeutral(getView(), held);

  // give back what it holds: only the fields that still carry its value
  function release() {
    const v = getView();
    const patch = {};
    for (const [k, val] of Object.entries(held)) {
      if (v && (v[k] ?? null) === (val ?? null)) patch[k] = k === 'eyes' ? EYES_NEUTRAL : NEUTRAL[k];
    }
    held = {};
    if (Object.keys(patch).length) apply(patch);
  }

  function play(steps, done) {
    let i = 0;
    const next = () => {
      if (!alive) return;
      if (i >= steps.length) {
        // the last step leaves everything neutral; anything still held is handed back
        release();
        return void done();
      }
      const [wait, what] = steps[i++];
      later(() => {
        if (!alive) return;
        // a behavior (or anything else) took over: stop, keep nothing
        if (!still()) {
          held = {};
          return void done();
        }
        const patch = typeof what === 'function' ? what() : what;
        if (patch === false) {
          // the thing it was watching is gone: skip to the settling steps
          const rest = steps.slice(i).findIndex(([, w]) => typeof w !== 'function' && ('pupils' in w || 'gaze' in w) && w.gaze === 'c');
          i = rest < 0 ? steps.length : i + rest;
          return void next();
        }
        if (patch) {
          apply(patch);
          for (const k of FIELDS) {
            if (!(k in patch)) continue;
            const neutral = k === 'eyes' ? EYES_NEUTRAL : NEUTRAL[k];
            if ((patch[k] ?? null) === (neutral ?? null) || (k === 'eyes' && patch[k] === 'blink')) delete held[k];
            else held[k] = patch[k];
          }
        }
        next();
      }, wait);
    };
    next();
  }

  const scale = () => (mood === 'content' ? 1.15 : 1) * (1.25 - alertness * 0.5);

  function weights() {
    const a = alertness;
    return {
      glance: 3.5,
      listen: 2.5,
      tilt: 1.6 + 2 * a,
      squint: mood === 'content' ? 2.6 - 1.4 * a : 1.2 - a,
      tail: 1.8,
      alert: 0.25 + 2.4 * a,
      sly: 0.7,
    };
  }

  function chooseMoment() {
    const w = weights();
    const names = Object.keys(w).filter((n) => n !== last);
    const total = names.reduce((s, n) => s + w[n], 0);
    let r = rng() * total;
    for (const n of names) {
      r -= w[n];
      if (r <= 0) return n;
    }
    return names[0];
  }

  /* ---- what it notices ---------------------------------------------------------------------------------------- */

  const seenProps = new Map(); // id -> { sx, sy }
  let primed = false;

  // candidate stimuli from the scene's props: a new one, or one that has moved a good way
  function propStimuli(v) {
    const out = [];
    const props = (v && v.props) || {};
    for (const [id, spec] of Object.entries(props)) {
      const prev = seenProps.get(id);
      seenProps.set(id, { sx: spec.sx, sy: spec.sy });
      if (!primed) continue;
      const moved = prev && Math.hypot((spec.sx ?? 0) - (prev.sx ?? 0), (spec.sy ?? 0) - (prev.sy ?? 0)) > 14;
      if (prev && !moved) continue;
      const base = PROP_INTEREST[spec.kind] ?? 0.4;
      out.push({ key: `prop:${spec.kind || ''}:${id}`, interest: base * (prev ? 0.8 : 1), aim: () => (getView()?.props?.[id] ? sideOf(getView(), getView().props[id].sx) : undefined) });
    }
    for (const id of [...seenProps.keys()]) if (!props[id]) seenProps.delete(id);
    primed = true;
    return out;
  }

  // candidate stimuli from the world (the mouse, the tab): the watcher already weighed repetition, proximity and dwell
  function worldStimuli() {
    if (!world) return [];
    const out = [];
    for (const e of world.read()) {
      const base = EVENT_INTEREST[e.kind];
      if (!base) continue;
      const pointer = e.kind !== 'return';
      const rect = world.rect && world.rect();
      const cx = rect ? rect.x + rect.width / 2 : null;
      const where = () => (world.pointerPos ? world.pointerPos() : null);
      // the side of the mouse as it is now; undefined when it has gone (left the page, or well away from the cat)
      const aim = () => {
        if (!pointer) return null;
        const p = where();
        if (!p || cx === null) return undefined;
        const dx = p.x - cx;
        return Math.abs(dx) < Math.max(14, (rect?.width || 0) * 0.18) ? null : dx < 0 ? 'l' : 'r';
      };
      const gone = () => {
        const p = where();
        const r = world.rect && world.rect();
        if (!p || !r || !r.width) return true;
        return Math.hypot(p.x - (r.x + r.width / 2), p.y - (r.y + r.height / 2)) / r.width > 6;
      };
      out.push({
        key: pointer ? 'world:pointer' : 'world:return', // both kinds of mouse event wear the same habituation
        interest: Math.min(1, base * (0.7 + 0.6 * (e.strength ?? 0.5))),
        aim,
        glance: pointer,
        gone,
        habituateMs: pointer ? timing.pointerHabituateMs : undefined,
      });
    }
    return out;
  }

  // does this stimulus catch the cat's attention? Interest, how alert it is and how used to the thing it is
  function accepts(s) {
    const t = now();
    const h = habit.get(s.key) || { n: 0, until: 0 };
    if (t < h.until) return false; // still resting from the last time
    const p = Math.min(0.9, s.interest * Math.pow(0.55, h.n) * (0.55 + alertness * 0.9));
    if (rng() > p) {
      habit.set(s.key, { n: h.n + 0.35, until: t + rnd(rng, 4000, 12000) }); // glanced at and dismissed: a little more used to it
      return false;
    }
    habit.set(s.key, { n: h.n + 1, until: t + rnd(rng, ...(s.habituateMs || timing.habituateMs)) });
    return true;
  }

  function startEpisode(s) {
    busy = true;
    last = 'episode';
    alertness = Math.min(1, alertness + (s.glance ? 0.05 : 0.2 + 0.2 * s.interest)); // a glance at the mouse hardly stirs it
    play(episode({ rng }, s.interest, s.aim, { glance: s.glance, gone: s.gone }), () => {
      busy = false;
      restUntil = now() + rnd(rng, ...timing.episodeRestMs);
      scheduleMoment(rnd(rng, ...timing.everyMs) * scale());
    });
  }

  // the watcher: cheap, a few times a second; it only ever starts something when the cat is idle and rested
  function watch() {
    if (!alive) return;
    const v = getView();
    const stim = [...propStimuli(v), ...worldStimuli()];
    if (!busy && stim.length && now() >= restUntil && isNeutral(v)) {
      // the most interesting thing first; the rest are missed (it only follows one thing)
      stim.sort((a, b) => b.interest - a.interest);
      for (const s of stim) {
        if (accepts(s)) {
          clearTimeout(timer);
          startEpisode(s);
          break;
        }
      }
    }
    watcher = setTimeout(watch, timing.watchMs);
  }

  function scheduleMoment(ms) {
    later(tick, ms);
  }

  function tick() {
    if (!alive) return;
    if (busy) return void later(tick, rnd(rng, ...timing.retryMs));
    alertness = Math.max(0, alertness - 0.04);
    if (!isNeutral(getView())) return void later(tick, rnd(rng, ...timing.retryMs));
    last = chooseMoment();
    busy = true;
    play(MOMENTS[last]({ rng }), () => {
      busy = false;
      // a gap that varies a lot: usually a few seconds, now and then a long quiet
      const quiet = rng() < timing.longQuietChance ? rnd(rng, ...timing.longQuietMs) : 0;
      later(tick, rnd(rng, ...timing.everyMs) * scale() + quiet);
    });
  }

  // what already exists at start is not news
  propStimuli(getView());
  scheduleMoment(rnd(rng, ...timing.firstMs));
  watcher = setTimeout(watch, timing.watchMs);

  return function stop() {
    alive = false;
    clearTimeout(timer);
    clearTimeout(watcher);
    release();
  };
}
