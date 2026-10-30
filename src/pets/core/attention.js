import { pick, rnd } from './rng.js';

/*
 * Ambient attention: the small, unscripted life of an idle cat's face.
 *
 * Beside the blinker (./ambient.js) this runs a loose personality: now and then, when the cat is plainly doing
 * nothing, it glances aside, flicks an ear toward a sound, tilts its head at something, squints sleepily, flicks its
 * tail or goes briefly alert. It also notices things that appear nearby (a prop in the scene) and turns toward them.
 *
 * Rules, so it never fights a behavior:
 *  - it only acts while the rig is neutral (sitting or standing still, eyes open, gaze centred, ears / tail / pupils /
 *    paws / cue all at rest, on screen); it checks again before every step;
 *  - it only touches the fields it set, and gives each one back only if it is still what it set; if a behavior has
 *    taken over meanwhile it simply stops and the behavior's state wins;
 *  - one moment at a time, never the same moment twice in a row, with randomised gaps (and now and then a long quiet),
 *    shortened a little while the cat is alert and lengthened while it is sleepy, so nothing repeats on a clock.
 *
 *   rng       () => [0, 1)
 *   getView   () => the current view or null
 *   apply     (patch) => void   (the same merge the scheduler uses)
 *   timing    AMBIENT.attention in ../config.js
 *   mood      'idle' | 'content' | 'stressed' (sleepier when content, never runs stressed)
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
  // eyes: open (or the ambient blink in progress), or the squint this module holds
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
  // head tilt at something interesting: the pupils open, the ears come forward, then it all relaxes in stages
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
  // a sleepy squint, sometimes ending in a slow blink
  squint(c) {
    const steps = [[0, { eyes: 'down' }], [rnd(c.rng, 600, 1500), { eyes: 'open' }]];
    if (c.rng() < 0.4) steps.push([rnd(c.rng, 250, 700), { eyes: 'blink' }], [rnd(c.rng, 260, 380), { eyes: 'open' }]);
    return steps;
  },
  // the tip of the tail stirs
  tail(c) {
    return [[0, { tail: 'swish' }], [rnd(c.rng, 1000, 2200), { tail: null }]];
  },
  // wide eyes, big pupils, ears up: something caught its attention
  alert(c) {
    const s = pick(c.rng, ['l', 'r', 'c']);
    return [
      [0, { eyes: 'wide', pupils: 3, ears: 'perk', gaze: s }],
      [rnd(c.rng, 800, 1600), { gaze: 'c' }],
      [rnd(c.rng, 250, 600), { eyes: 'open', pupils: null }],
      [rnd(c.rng, 200, 500), { ears: null }],
    ];
  },
  // mischief: a sidelong look, pupils wide, the tail twitching, then a quick innocent blink
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

export function startAttention({ rng, getView, apply, timing, mood = 'content' }) {
  let timer = null;
  let alive = true;
  let last = null;
  let alertness = 0.3; // 0..1, rises when something happens nearby, decays on its own
  let seenProps = null;
  let held = {}; // field -> value this module has put on the cat and not yet given back

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
      if (v && (v[k] ?? null) === (val ?? null) && !(k === 'eyes' && val === 'blink')) patch[k] = k === 'eyes' ? 'open' : NEUTRAL[k];
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
      const [wait, patch] = steps[i++];
      later(() => {
        if (!alive) return;
        // a behavior (or anything else) took over: stop, keep nothing
        if (!still()) {
          held = {};
          return void done();
        }
        apply(patch);
        for (const k of FIELDS) {
          if (!(k in patch)) continue;
          const neutral = k === 'eyes' ? 'open' : NEUTRAL[k];
          if ((patch[k] ?? null) === (neutral ?? null) || (k === 'eyes' && patch[k] === 'blink')) delete held[k];
          else held[k] = patch[k];
        }
        next();
      }, wait);
    };
    next();
  }

  const scale = () => {
    const sleepy = mood === 'content' ? 1.15 : 1;
    return sleepy * (1.25 - alertness * 0.5);
  };

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

  // something new appeared in the scene: turn toward it (once), unless the cat is busy
  function noticeProps() {
    const v = getView();
    const ids = v && v.props ? Object.keys(v.props) : [];
    const fresh = seenProps === null ? [] : ids.filter((id) => !seenProps.has(id));
    seenProps = new Set(ids);
    if (!fresh.length) return null;
    const spec = v.props[fresh[0]];
    const side = sideOf(v, spec && spec.sx);
    alertness = Math.min(1, alertness + 0.45);
    return [
      [rnd(rng, 250, 900), { ears: 'perk', ...(side ? { gaze: side } : {}), pupils: 2 }],
      [rnd(rng, 400, 900), { ...(side && rng() < 0.5 ? { lean: side === 'l' ? -1 : 1 } : {}) }],
      [rnd(rng, 1200, 2600), { gaze: 'c' }],
      [rnd(rng, 250, 700), { pupils: null }],
      [rnd(rng, 200, 600), { ears: null }],
      [rnd(rng, 150, 500), { lean: 0 }],
    ];
  }

  function tick() {
    if (!alive) return;
    alertness = Math.max(0, alertness - 0.04);
    const react = noticeProps();
    if (!isNeutral(getView())) return void later(tick, rnd(rng, ...timing.retryMs));
    last = react ? 'notice' : chooseMoment();
    const steps = react || MOMENTS[last]({ rng });
    play(steps, () => {
      // a gap that varies a lot: usually a few seconds, now and then a long quiet
      const quiet = rng() < timing.longQuietChance ? rnd(rng, ...timing.longQuietMs) : 0;
      later(tick, rnd(rng, ...timing.everyMs) * scale() + quiet);
    });
  }

  // the props that already exist at start are not news
  seenProps = new Set(Object.keys(getView()?.props || {}));
  later(tick, rnd(rng, ...timing.firstMs));

  return function stop() {
    alive = false;
    clearTimeout(timer);
    release();
  };
}
