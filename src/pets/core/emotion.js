/*
 * Emotion: a small, slow model of how a pet feels, for the idle face (see ./attention.js).
 *
 * NOT the financial mood (idle / content / stressed, which picks appearance and behavior weights). The two are
 * independent: this module never reads the financial mood and never touches the scheduler.
 *
 * MODEL. Four charges in 0..1 (curious, playful, sleepy, irritated) and a resting state, `content`. Events add to a
 * charge (scaled by the pet's personality gain) or settle them; each charge fades with its own half-life. The current
 * emotion is the strongest charge above a display threshold, with hysteresis (a rival must beat it by a margin, and the
 * current one is kept for a minimum dwell), so the face never flickers between feelings. A few feelings damp others
 * (a sleepy or irritated cat is not playful). `startled` is not a state but a ~2 s reflex flag, set only by a genuine
 * start (a startle event), never by ordinary wide-eyed attention or curiosity.
 *
 * SLEEPINESS is slow and bounded: it only rises while nothing has stimulated the cat for a while (no event, no pointer
 * movement anywhere on the page), at a rate that takes minutes to reach the display threshold; activity drains it; it can
 * only be the current emotion for a limited dwell, after which it drops away and cannot rise again for a refractory
 * period. A fully inactive cat is therefore sleepy for a small share of the time, never predominantly.
 *
 * PERSONALITY is data (`traits`): per-emotion gain, half-life and cap, thresholds, the events and what they do, and how
 * the idle moments are weighted when each emotion is current. Nothing here is random.
 *
 *   traits   see PERSONALITY in ../nomoz/config.js
 *   now      () => ms
 *   sources  { behavior?: () => { last, at } | null }   the last finished behavior (read in tick)
 * Returns { get, note, impulse, tick, permit, takeCompose, shape, reset }.
 */

export const EMOTIONS = ['curious', 'playful', 'sleepy', 'irritated'];
const AROUSAL = ['curious', 'playful', 'irritated'];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const defaultNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function createEmotion({ traits, now = defaultNow, sources = {} }) {
  const T = traits;
  const S = T.sleepy;
  const t0 = now();
  const charge = { curious: 0, playful: 0, sleepy: 0, irritated: 0 };
  let current = 'content';
  let since = t0;
  let last = t0;
  let reflexUntil = 0;
  let composeUntil = 0; // after a genuine start: a slow, composing blink is owed
  let stimAt = t0; // the last stimulation (an event, or the pointer moving anywhere)
  let blockedUntil = 0; // sleepiness cannot rise again until then
  let seenBehaviorAt;
  let primed = false;
  const shown = {}; // name -> when a flavoured display was last permitted

  function advance(t) {
    const dt = clamp(t - last, 0, T.maxStepMs); // a throttled background tab must not fast-forward the feelings
    last = t;
    if (!dt) return;
    for (const k of AROUSAL) charge[k] *= Math.pow(0.5, dt / T.halfLifeMs[k]);
    const quiet = t - stimAt >= S.quietMs;
    if (quiet && t >= blockedUntil) {
      charge.sleepy = Math.min(T.cap.sleepy, charge.sleepy + (dt * T.threshold) / S.riseMs);
    } else if (!quiet) {
      charge.sleepy = Math.max(0, charge.sleepy - (dt * T.threshold) / S.recoverMs);
    }
    // sleepiness is a passing phase: it gives way after a while and cannot return at once
    if (current === 'sleepy' && t - since >= S.maxDwellMs) {
      charge.sleepy = Math.min(charge.sleepy, T.exit * 0.5);
      blockedUntil = t + S.refractoryMs;
    }
  }

  function effective(k) {
    let e = charge[k];
    for (const j of EMOTIONS) if (j !== k) e -= (T.inhibit[j]?.[k] ?? 0) * charge[j];
    return e;
  }

  function select(t) {
    if (current !== 'content' && effective(current) < T.exit) {
      current = 'content';
      since = t;
    }
    let best = null;
    for (const k of EMOTIONS) if (effective(k) >= T.threshold && (!best || effective(k) > effective(best))) best = k;
    if (!best || best === current) return;
    if (current === 'content' || (effective(best) >= effective(current) + T.margin && t - since >= T.minDwellMs)) {
      current = best;
      since = t;
    }
  }

  function add(k, amount) {
    if (k === 'sleepy' && now() < blockedUntil) return;
    charge[k] = clamp(charge[k] + amount * (T.gain[k] ?? 1), 0, T.cap[k] ?? 1);
  }

  function apply(effect, magnitude, t) {
    if (effect.add) for (const [k, v] of Object.entries(effect.add)) add(k, v * magnitude);
    if (effect.drop) for (const [k, v] of Object.entries(effect.drop)) charge[k] = Math.max(0, charge[k] - v);
    if (effect.settle !== undefined) for (const k of AROUSAL) charge[k] *= effect.settle;
    if (effect.slept) {
      charge.sleepy = 0;
      blockedUntil = t + S.refractoryMs;
    }
    if (effect.reflex) reflexUntil = t + T.reflexMs;
    if (effect.compose) composeUntil = t + T.composeMs;
    if (effect.stim !== false) stimAt = t;
  }

  // a named event (see traits.events), with a 0..1 magnitude
  function note(name, magnitude = 1) {
    const effect = T.events[name];
    if (!effect) return;
    const t = now();
    advance(t);
    apply(effect, clamp(magnitude, 0, 1), t);
    select(t);
  }

  function impulse(kind, amount) {
    const t = now();
    advance(t);
    if (kind in charge) add(kind, amount);
    stimAt = t;
    select(t);
  }

  // called from the attention watcher (a few times a second): time passes, the pointer's activity is noted, and a
  // behavior that has finished since the last call is turned into an event
  function tick({ activityAt = 0 } = {}) {
    const t = now();
    advance(t);
    if (activityAt > stimAt) stimAt = Math.min(activityAt, t);
    const b = sources.behavior && sources.behavior();
    if (!primed) {
      // what finished before the first look is not news
      primed = true;
      seenBehaviorAt = b ? b.at : undefined;
    } else if (b && b.last && b.at !== seenBehaviorAt) {
      seenBehaviorAt = b.at;
      const ev = T.behaviors[b.last];
      if (ev) note(ev);
    }
    select(t);
  }

  function get() {
    const t = now();
    advance(t);
    select(t);
    const level = current === 'content' ? 0 : clamp((charge[current] - T.exit) / ((T.cap[current] ?? 1) - T.exit), 0, 1);
    return { kind: current, level, startled: t < reflexUntil, charge: { ...charge } };
  }

  // may a flavoured display (a named moment) happen now? At most once per its gap, so nothing is exaggerated
  function permit(name) {
    const gap = T.displayGapMs[name];
    if (gap === undefined) return true;
    const t = now();
    if (shown[name] !== undefined && t - shown[name] < gap) return false;
    shown[name] = t;
    return true;
  }

  // is a composing blink owed after a genuine start? Answers yes once, and only within composeMs of the start
  function takeCompose() {
    const t = now();
    if (t >= composeUntil) return false;
    composeUntil = 0;
    return true;
  }

  /*
   * Re-weights a table of idle moments { name: weight } for the current emotion. The TOTAL weight is kept, so the
   * emotion changes which moment is likely, never how often moments happen. Content leaves the table untouched.
   */
  function shape(weights, emo = get()) {
    const prof = T.moments[emo.kind];
    if (!prof || emo.level <= 0) return weights;
    const total = Object.values(weights).reduce((s, w) => s + w, 0);
    const out = {};
    for (const [name, w] of Object.entries(weights)) out[name] = w * (1 + ((prof.mul?.[name] ?? 1) - 1) * emo.level);
    for (const [name, w] of Object.entries(prof.add || {})) out[name] = (out[name] ?? 0) + w * emo.level;
    const sum = Object.values(out).reduce((s, w) => s + w, 0);
    for (const name of Object.keys(out)) out[name] *= total / sum;
    return out;
  }

  function reset() {
    for (const k of EMOTIONS) charge[k] = 0;
    current = 'content';
    since = now();
    reflexUntil = 0;
    composeUntil = 0;
  }

  return { get, note, impulse, tick, permit, takeCompose, shape, reset };
}

export const NO_EMOTION = Object.freeze({ kind: 'content', level: 0, startled: false });
