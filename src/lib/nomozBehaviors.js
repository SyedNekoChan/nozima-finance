import { AMBIENT_MS, STEP_MS } from './nomoz.js';
import { scaleAt } from './nomozSpace.js';
import { textWidth } from './nomozSprites.js';

/*
 * NOMOZ.EXE behavior system.
 *
 * A registry of behaviors (each with a weight per financial mood, a
 * cooldown and its own rhythm) plus a scheduler that picks the next one
 * dynamically when the previous finishes — never a fixed loop. Each
 * behavior is a pure planner: given the current context it returns a
 * list of timed view patches and a duration. The scheduler runs them
 * from a SINGLE timeout, so the whole entity costs one pending timer.
 */

const NERVOUS_STEP_MS = 320;

const rnd = (r, a, b) => a + r() * (b - a);
const int = (r, a, b) => Math.floor(rnd(r, a, b + 1));
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Where an item sits in the 56px-wide sprite space decides where the eyes go.
const gazeForX = (x) => (x < 20 ? 'l' : x > 36 ? 'r' : 'c');

function makeScript() {
  const beats = [];
  const S = {
    beats,
    at(t, patch) {
      beats.push({ t, patch });
      return S;
    },
    blink(t, back = 'open') {
      S.at(t, { eyes: 'blink' });
      S.at(t + 140, { eyes: back });
    },
  };
  return S;
}

// A band of depth around the current z, kept inside the allowed range.
const zBand = (c, dz) => [
  Math.max(c.geo.zRange[0], c.cur.z - dz),
  Math.min(c.geo.zRange[1], c.cur.z + dz),
];

// Legs alternate while a glide carries the entity along.
function flick(S, t0, ms) {
  for (let t = 0, i = 0; t < ms; t += 400, i++) {
    S.at(t0 + t, { legs: i % 2 ? 2 : 1 });
  }
  S.at(t0 + ms, { legs: 0 });
}

/*
 * Continuous walk from one spot to another: one step per STEP_MS, each
 * a short linear glide, so it reads as walking. Works in all three axes
 * (depth interpolates with the screen position).
 */
function travel(S, c, from, dest, t0, stepMs = STEP_MS) {
  const dx = dest.sx - from.sx;
  const dist = Math.hypot(dx, dest.sy - from.sy);
  const sAvg = (scaleAt(from.z) + scaleAt(dest.z)) / 2;
  const n = clamp(Math.ceil(dist / (c.geo.cell * sAvg * 1.2)), 1, 30);

  for (let i = 0; i < n; i++) {
    const f = (i + 1) / n;
    S.at(t0 + i * stepMs, {
      sx: lerp(from.sx, dest.sx, f),
      sy: lerp(from.sy, dest.sy, f),
      z: lerp(from.z, dest.z, f),
      legs: i % 2 ? 2 : 1,
      gaze: dx < -4 ? 'l' : dx > 4 ? 'r' : 'c',
      pose: 'stand',
      transitionMs: stepMs,
      ease: 'linear',
      ...(Math.abs(dx) > 4 ? { facing: dx < 0 ? -1 : 1 } : {}),
    });
  }

  const end = t0 + n * stepMs;
  S.at(end, { legs: 0, gaze: 'c', pose: 'sit' });
  return end;
}

// Stay put and take in the surroundings with a few dwelling glances.
function sweep(c, S, t0, stops) {
  let t = t0;
  for (let i = 0; i < stops; i++) {
    S.at(t, { gaze: pick(c.rng, ['l', 'c', 'r', 'l', 'r', 'u']) });
    t += rnd(c.rng, 900, 2400);
    if (c.rng() < 0.35) S.blink(t - 400);
  }
  S.at(t, { gaze: 'c' });
  return t + 400;
}

/* ------------------------------------------------------------------ */
/* Registry                                                            */
/* ------------------------------------------------------------------ */

const REGISTRY = [];

// w = [idle, content, stressed] weights (0 = never in that state)
function def(id, { w, cd = 0, moves = false }, plan) {
  REGISTRY.push({ id, w, cd, moves, plan });
}

/* --- stationary: observing -------------------------------------- */

def('sit', { w: [14, 16, 0], cd: 6000 }, (c, S) => {
  const hold = rnd(c.rng, 3500, 8000);
  S.at(0, { pose: 'sit', gaze: pick(c.rng, ['c', 'c', 'l', 'r']), eyes: 'open', mouth: 'idle', legs: 0 });
  for (let i = int(c.rng, 1, 3); i > 0; i--) S.blink(rnd(c.rng, 600, hold - 400));
  if (c.rng() < 0.4) S.at(rnd(c.rng, 1200, hold - 800), { gaze: pick(c.rng, ['l', 'r', 'c']) });
  return hold;
});

def('observe', { w: [8, 8, 0], cd: 8000 }, (c, S) => {
  S.at(0, { pose: c.rng() < 0.5 ? 'sit' : 'stand', legs: 0, eyes: 'open' });
  return sweep(c, S, rnd(c.rng, 300, 900), int(c.rng, 3, 5));
});

def('look', { w: [10, 8, 0], cd: 5000 }, (c, S) => {
  S.at(0, { pose: 'sit', legs: 0 });
  let t = rnd(c.rng, 200, 500);
  const dirs = c.rng() < 0.5 ? ['l', 'r', 'c'] : ['r', 'l', 'c'];
  for (const g of dirs.slice(0, int(c.rng, 2, 3))) {
    S.at(t, { gaze: g });
    t += rnd(c.rng, 700, 1500);
  }
  S.at(t, { gaze: 'c' });
  return t + 300;
});

def('lookUp', { w: [6, 4, 0], cd: 15000 }, (c, S) => {
  const x = int(c.rng, 44, 50);
  S.at(0, { gaze: 'u', pose: 'sit', legs: 0 });
  S.at(rnd(c.rng, 300, 800), {
    item: { kind: 'text', text: pick(c.rng, ['*', '+', 'o']), x, y: 0 },
  });
  const hold = rnd(c.rng, 1800, 3600);
  S.blink(hold * 0.6);
  S.at(hold, { item: null });
  S.at(hold + 400, { gaze: 'c' });
  return hold + 800;
});

def('ponder', { w: [6, 0, 0], cd: 12000 }, (c, S) => {
  S.at(0, { pose: 'sit', gaze: pick(c.rng, ['l', 'r', 'u']), mouth: 'think', cue: '.o?' });
  S.at(rnd(c.rng, 1200, 1800), { cue: '?' });
  const hold = rnd(c.rng, 3000, 4800);
  S.at(hold, { cue: null, mouth: 'idle', gaze: 'c' });
  return hold + 500;
});

def('ponderSymbol', { w: [5, 5, 0], cd: 20000 }, (c, S) => {
  const text = pick(c.rng, ['$?', '%?', '+1', '-5', '12%', '=?', '$$']);
  S.at(0, {
    pose: 'sit',
    gaze: 'u',
    mouth: 'think',
    item: { kind: 'text', text, x: 55 - textWidth(text), y: 0 },
  });
  const hold = rnd(c.rng, 2800, 5000);
  S.blink(hold * 0.55);
  S.at(hold, { item: null, mouth: 'idle', gaze: 'c' });
  return hold + 500;
});

def('stillness', { w: [3, 4, 0], cd: 60000 }, (c, S) => {
  const hold = rnd(c.rng, 12000, 26000);
  S.at(0, { pose: 'sit', gaze: pick(c.rng, ['c', 'l', 'r']), legs: 0, eyes: 'open' });
  for (let i = int(c.rng, 1, 2); i > 0; i--) S.blink(rnd(c.rng, 3000, hold - 1000));
  return hold;
});

/* --- stationary: resting ---------------------------------------- */

def('sleep', { w: [4, 0, 0], cd: 90000 }, (c, S) => {
  const dur = rnd(c.rng, 7000, 12000);
  S.at(0, { pose: 'sit', eyes: 'closed', mouth: 'rest', gaze: 'c', legs: 0, cue: 'z' });
  for (let t = 1600, i = 0; t < dur; t += 1600, i++) S.at(t, { cue: i % 2 ? 'z' : 'zZ' });
  S.at(dur, { cue: null, eyes: 'blink' });
  S.at(dur + 250, { eyes: 'open', mouth: 'idle', pose: 'sit' });
  return dur + 1200;
});

def('tired', { w: [5, 2, 0], cd: 40000 }, (c, S) => {
  const dur = rnd(c.rng, 3000, 6000);
  S.at(0, { pose: 'sit', eyes: 'closed', mouth: 'rest', legs: 0, cue: 'z' });
  S.at(dur * 0.5, { cue: null });
  S.at(dur, { eyes: 'blink' });
  S.at(dur + 200, { eyes: 'open', mouth: 'idle', pose: 'sit' });
  return dur + 800;
});

def('stretch', { w: [5, 6, 0], cd: 30000 }, (c, S) => {
  const hold = rnd(c.rng, 1800, 3000);
  S.at(0, { pose: 'stretch', eyes: 'closed', mouth: 'rest', legs: 0 });
  S.at(hold, { pose: 'sit', mouth: 'idle' });
  S.blink(hold + 100);
  return hold + 700;
});

/* --- stationary: activities ------------------------------------- */

def('read', { w: [5, 4, 0], cd: 70000 }, (c, S) => {
  let t = 0;

  // settle into a comfortable spot nearby first
  if (!c.reduced && c.rng() < 0.6) {
    const dest = c.pickSpot({
      near: { sx: c.cur.sx, sy: c.cur.sy, radius: c.compact ? 90 : 200 },
      zRange: zBand(c, 60),
    });
    t = travel(S, c, c.cur, dest, 0) + 300;
  }

  const dur = rnd(c.rng, 10000, 22000);
  S.at(t, { pose: 'sit', gaze: 'c', eyes: 'down', mouth: 'idle', legs: 0, book: 0 });

  let u = t + rnd(c.rng, 1500, 3500);
  while (u < t + dur - 2500) {
    if (c.rng() < 0.55) {
      S.at(u, { book: 1 });
      S.at(u + 180, { book: 2 });
      S.at(u + 380, { book: 0 });
      u += rnd(c.rng, 2500, 5500);
    } else {
      S.at(u, { eyes: 'open', gaze: pick(c.rng, ['c', 'l', 'r']) });
      S.at(u + rnd(c.rng, 900, 1800), { eyes: 'down', gaze: 'c' });
      u += rnd(c.rng, 1800, 4200);
    }
  }

  S.at(t + dur, { book: null, eyes: 'open' });
  return t + dur + 500;
});

def('inspect', { w: [6, 0, 0], cd: 40000 }, (c, S) => {
  const right = c.cur.facing > 0;
  const name = pick(c.rng, ['box', 'gem', 'disk']);
  const x = right ? 47 : 2;
  const side = right ? 'r' : 'l';
  S.at(0, { pose: 'sit', legs: 0, eyes: 'open' });
  const t1 = rnd(c.rng, 400, 900);
  S.at(t1, { item: { kind: 'obj', name, x, y: 49 }, gaze: side, eyes: 'wide' });
  const t2 = t1 + 900;
  S.at(t2, { eyes: 'down', lean: right ? 1 : -1 });
  const t3 = t2 + rnd(c.rng, 1800, 3500);
  S.at(t3, { eyes: 'open', lean: 0, gaze: 'c' });
  S.at(t3 + rnd(c.rng, 500, 1200), { item: null });
  return t3 + 1700;
});

def('floatSymbol', { w: [5, 3, 0], cd: 30000, moves: true }, (c, S) => {
  const text = pick(c.rng, ['@', '#', '&', '%', '+', '~']);
  // floats in the open corner above one shoulder
  const left = c.rng() < 0.5;
  const [x0, x1] = left ? [1, 12] : [43, 51];
  const g = left ? 'l' : 'r';
  let x = int(c.rng, x0, x1);
  S.at(0, { item: { kind: 'text', text, x, y: 0 }, gaze: g, pose: 'sit', legs: 0 });
  let t = 0;
  for (let i = int(c.rng, 5, 8); i > 0; i--) {
    t += rnd(c.rng, 450, 900);
    x = clamp(x + pick(c.rng, [-3, -2, 2, 3]), x0, x1);
    S.at(t, { item: { kind: 'text', text, x, y: c.rng() < 0.3 ? 1 : 0 }, gaze: c.rng() < 0.2 ? 'u' : g });
  }
  t += 500;
  S.at(t, { item: { kind: 'text', text: '*', x, y: 0 }, eyes: 'happy' });
  S.at(t + 350, { item: null, gaze: 'c' });
  S.at(t + 1300, { eyes: 'open' });
  return t + 1700;
});

def('followPixel', { w: [5, 3, 0], cd: 30000, moves: true }, (c, S) => {
  const ltr = c.rng() < 0.5;
  S.at(0, { pose: 'sit', legs: 0 });
  let t = rnd(c.rng, 300, 800);
  for (let i = 0; i < 19; i++) {
    const x = ltr ? i * 3 : 54 - i * 3;
    S.at(t, { item: { kind: 'block', x, y: 0 }, gaze: gazeForX(x) });
    t += rnd(c.rng, 300, 430);
  }
  S.at(t, { item: null, gaze: 'c' });
  return t + 600;
});

def('coinPolish', { w: [4, 10, 0], cd: 25000 }, (c, S) => {
  const content = c.mood === 'content';
  const hold = rnd(c.rng, 4000, 7000);
  S.at(0, {
    pose: 'sit',
    legs: 0,
    ...(content ? {} : { eyes: 'down', item: { kind: 'coin', x: 24, y: 46, spark: false } }),
  });
  for (let t = 400, i = 0; t < hold; t += 500, i++) {
    S.at(
      t,
      content
        ? { item: { kind: 'sparkle', x: i % 2 ? 35 : 16, y: i % 2 ? 31 : 34 } }
        : { item: { kind: 'coin', x: 24, y: 46, spark: i % 2 === 0 } }
    );
  }
  S.at(hold, { cue: null, item: null, eyes: 'open' });
  return hold + 500;
});

def('crown', { w: [3, 10, 0], cd: 25000 }, (c, S) => {
  const hold = rnd(c.rng, 2800, 4800);
  if (c.mood === 'content') {
    S.at(0, { gaze: 'u' });
    for (let t = 500, i = 0; t < hold; t += 550, i++) {
      S.at(t, { crown: [1, -1, 0][i % 3] });
    }
    S.at(hold, { crown: 0, gaze: 'c' });
  } else {
    S.at(0, { gaze: 'u', eyes: 'wide', item: { kind: 'crown', x: 24, y: 0 } });
    S.blink(hold * 0.6, 'wide');
    S.at(hold, { item: null, eyes: 'open', gaze: 'c' });
  }
  return hold + 600;
});

def('glint', { w: [0, 14, 0], cd: 8000 }, (c, S) => {
  S.at(0, { cue: '*' });
  S.at(1400, { cue: null });
  return rnd(c.rng, 4000, 7000);
});

def('twitch', { w: [8, 5, 0], cd: 4000, moves: true }, (c, S) => {
  const lean = c.rng() < 0.5 ? -1 : 1;
  S.at(0, { lean });
  S.at(700, { lean: 0 });
  return rnd(c.rng, 1800, 3000);
});

def('glitch', { w: [3, 0, 8], cd: 40000, moves: true }, (c, S) => {
  let t = 0;
  for (let i = int(c.rng, 2, 4); i > 0; i--) {
    S.at(t, { glitch: int(c.rng, 1, 3) });
    t += rnd(c.rng, 70, 130);
    S.at(t, { glitch: 0 });
    t += rnd(c.rng, 150, 520);
  }
  return t + 1200;
});

def('curious', { w: [5, 2, 6], cd: 20000, moves: true }, (c, S) => {
  const side = c.cur.sx < c.geo.width / 2 ? -1 : 1;
  const g = side < 0 ? 'l' : 'r';
  S.at(0, { gaze: g, eyes: 'wide', cue: '?', lean: side, pose: 'sit', legs: 0 });
  let t = rnd(c.rng, 1500, 3200);

  if (!c.reduced && c.rng() < 0.4) {
    const step = c.geo.cell * scaleAt(c.cur.z);
    const n = int(c.rng, 2, 4);
    const out = c.geo.clamp({ sx: c.cur.sx + side * step * n, sy: c.cur.sy, z: c.cur.z });
    const t1 = travel(S, c, c.cur, out, 500);
    const t2 = travel(S, c, out, c.cur, t1 + rnd(c.rng, 1200, 2200));
    t = t2;
  }

  S.at(t, { eyes: 'open', cue: null, lean: 0, gaze: 'c' });
  return t + 700;
});

/* --- moving ----------------------------------------------------- */

def('walk', { w: [16, 10, 0], cd: 3000, moves: true }, (c, S) => {
  const dest = c.pickSpot({
    near: { sx: c.cur.sx, sy: c.cur.sy, radius: c.compact ? 150 : 340 },
    zRange: zBand(c, 90),
  });

  // occasionally stop partway, as though distracted
  if (c.mood === 'idle' && c.rng() < 0.35) {
    const f = rnd(c.rng, 0.35, 0.65);
    const mid = {
      sx: lerp(c.cur.sx, dest.sx, f),
      sy: lerp(c.cur.sy, dest.sy, f),
      z: lerp(c.cur.z, dest.z, f),
    };
    const t1 = travel(S, c, c.cur, mid, 0);
    S.at(t1, { eyes: 'wide', cue: '?', gaze: 'c' });
    S.at(t1 + 1500, { eyes: 'open', cue: null });
    const t2 = travel(S, c, mid, dest, t1 + 1700);
    return t2 + rnd(c.rng, 800, 1800);
  }

  return travel(S, c, c.cur, dest, 0) + rnd(c.rng, 800, 1800);
});

def('travel', { w: [8, 5, 0], cd: 15000, moves: true }, (c, S) => {
  const dest = c.pickSpot({});
  const t = travel(S, c, c.cur, dest, 0);
  const hold = rnd(c.rng, 6000, 14000);
  S.at(t + 200, { pose: 'sit', legs: 0 });
  for (let i = int(c.rng, 1, 3); i > 0; i--) S.blink(t + rnd(c.rng, 800, hold - 500));
  if (c.rng() < 0.5) S.at(t + rnd(c.rng, 1500, hold - 1500), { gaze: pick(c.rng, ['l', 'r', 'u']) });
  return t + hold;
});

def('retreat', { w: [6, 3, 3], cd: 20000, moves: true }, (c, S) => {
  const [z0, z1] = c.geo.zRange;
  const dest = c.pickSpot({ zRange: [z0, z0 + (z1 - z0) * 0.3] });
  const t = travel(S, c, c.cur, dest, 0);
  S.at(t + 200, { pose: 'sit', legs: 0 });
  return sweep(c, S, t + 900, int(c.rng, 3, 5)) + rnd(c.rng, 1500, 4000);
});

def('approach', { w: [6, 3, 6], cd: 20000, moves: true }, (c, S) => {
  const [z0, z1] = c.geo.zRange;
  const dest = c.pickSpot({ zRange: [z1 - (z1 - z0) * 0.3, z1] });
  const t = travel(S, c, c.cur, dest, 0);
  S.at(t + 200, { eyes: 'wide', legs: 0 });
  S.at(t + 900, { eyes: 'open' });
  return sweep(c, S, t + 1100, int(c.rng, 2, 4));
});

def('relocate', { w: [4, 3, 4], cd: 45000, moves: true }, (c, S) => {
  const dest = c.pickSpot({});
  S.at(0, { fade: 0, pose: 'sit', legs: 0 });
  S.at(AMBIENT_MS + 80, {
    sx: dest.sx,
    sy: dest.sy,
    z: dest.z,
    transitionMs: 0,
    facing: c.rng() < 0.5 ? -1 : 1,
    gaze: pick(c.rng, ['c', 'l', 'r']),
  });
  S.at(AMBIENT_MS + 220, { fade: 1 });
  return AMBIENT_MS * 2 + 600;
});

def('edgeExit', { w: [3, 1, 0], cd: 90000, moves: true }, (c, S) => {
  const W = c.geo.width;
  const left = c.cur.sx < W / 2;
  const [hw] = c.geo.half(c.cur.z);
  const dest = c.pickSpot({});
  const [hw2] = c.geo.half(dest.z);
  const enterLeft = c.rng() < 0.5;

  const out = rnd(c.rng, 1800, 2600);
  S.at(0, {
    sx: left ? -hw * 1.4 : W + hw * 1.4,
    facing: left ? -1 : 1,
    gaze: left ? 'l' : 'r',
    pose: 'sit',
    transitionMs: out,
    ease: 'out',
    offscreen: true,
  });
  flick(S, 0, out);

  const hide = out + rnd(c.rng, 2200, 5500);
  S.at(hide, {
    sx: enterLeft ? -hw2 * 1.4 : W + hw2 * 1.4,
    sy: dest.sy,
    z: dest.z,
    transitionMs: 0,
    facing: enterLeft ? 1 : -1,
    gaze: enterLeft ? 'r' : 'l',
    legs: 0,
  });

  const inn = rnd(c.rng, 2200, 3200);
  S.at(hide + 80, { sx: dest.sx, transitionMs: inn, ease: 'out' });
  flick(S, hide + 80, inn);
  S.at(hide + 80 + inn, { offscreen: false, gaze: 'c' });
  return hide + inn + 700;
});

def('peek', { w: [4, 0, 0], cd: 60000, moves: true }, (c, S) => {
  const W = c.geo.width;
  const left = c.cur.sx < W / 2;
  const [z0, z1] = c.geo.zRange;
  const z = lerp(z0, z1, rnd(c.rng, 0.3, 0.8));
  const [hw] = c.geo.half(z);
  const b = c.geo.bounds(z);
  const sy = lerp(b.minY, b.maxY, c.rng());
  const hiddenX = left ? -hw * 1.3 : W + hw * 1.3;
  const peekX = left ? -hw * 0.2 : W + hw * 0.2;

  // leave while faded out, then slide in just far enough to be seen
  S.at(0, { fade: 0 });
  S.at(AMBIENT_MS + 60, {
    sx: hiddenX,
    sy,
    z,
    transitionMs: 0,
    offscreen: true,
    facing: left ? -1 : 1,
    gaze: left ? 'r' : 'l',
    legs: 0,
    pose: 'sit',
  });
  S.at(AMBIENT_MS + 160, { fade: 1 });

  let t = AMBIENT_MS + 300;
  S.at(t, { sx: peekX, transitionMs: 1300, ease: 'out' });
  t += 1300 + rnd(c.rng, 500, 900);
  S.blink(t);
  t += rnd(c.rng, 800, 1500);
  S.at(t, { sx: hiddenX, transitionMs: 1100, ease: 'out' });
  t += 1100 + rnd(c.rng, 2200, 4000);

  const dest = c.pickSpot({});
  t = travel(S, c, { sx: hiddenX, sy, z }, dest, t);
  S.at(t, { offscreen: false });
  return t + 600;
});

/* --- stressed --------------------------------------------------- */

function nervousSteps(c, S, passes) {
  const step = c.geo.cell * scaleAt(c.cur.z);
  const dir = c.rng() < 0.5 ? -1 : 1;
  let t = 0;
  for (let i = 0; i < passes; i++) {
    const out = c.geo.clamp({
      sx: c.cur.sx + dir * step * int(c.rng, 1, 2),
      sy: c.cur.sy,
      z: c.cur.z,
    });
    t = travel(S, c, c.cur, out, t + (i ? 500 : 0), NERVOUS_STEP_MS);
    t = travel(S, c, out, c.cur, t + 700, NERVOUS_STEP_MS);
  }
  return t + rnd(c.rng, 1500, 2800);
}

def('shuffle', { w: [0, 0, 22], cd: 2000, moves: true }, (c, S) => nervousSteps(c, S, 1));
def('pace', { w: [0, 0, 10], cd: 12000, moves: true }, (c, S) => nervousSteps(c, S, 2));

def('flinch', { w: [0, 0, 22], cd: 2000, moves: true }, (c, S) => {
  const lean = c.rng() < 0.5 ? -1 : 1;
  S.at(0, { lean });
  S.at(450, { lean: 0 });
  S.at(900, { lean: -lean });
  S.at(1300, { lean: 0 });
  return rnd(c.rng, 2200, 3500);
});

def('nervousLook', { w: [0, 0, 14], cd: 8000, moves: true }, (c, S) => {
  let t = 0;
  for (let i = int(c.rng, 3, 5); i > 0; i--) {
    S.at(t, { cue: i % 2 ? '!' : '?' });
    t += rnd(c.rng, 350, 800);
  }
  S.at(t, { cue: null });
  return t + rnd(c.rng, 1200, 2500);
});

def('still', { w: [0, 0, 14], cd: 0 }, (c, S) => {
  S.at(0, { lean: 0, legs: 0, pose: 'sit' });
  return rnd(c.rng, 2500, 5000);
});

/* ------------------------------------------------------------------ */
/* Selection                                                           */
/* ------------------------------------------------------------------ */

// Behaviors that naturally follow another get a nudge — never a script.
const AFFINITY = {
  read: { stretch: 4, sit: 2, observe: 2 },
  sleep: { stretch: 5 },
  tired: { stretch: 3 },
  stillness: { stretch: 4, look: 3 },
  sit: { stretch: 2, ponder: 2, observe: 2, lookUp: 2 },
  walk: { sit: 3, observe: 3, inspect: 3, curious: 2 },
  travel: { observe: 2, read: 3, sit: 2 },
  inspect: { ponder: 3, ponderSymbol: 3, look: 2 },
  floatSymbol: { lookUp: 2, followPixel: 2 },
  followPixel: { lookUp: 3, look: 2 },
  retreat: { observe: 3, sleep: 2 },
  approach: { look: 3, ponderSymbol: 2 },
  relocate: { look: 2, sit: 2 },
  edgeExit: { look: 2, sit: 2 },
  peek: { look: 2, sit: 2 },
  curious: { look: 2, ponder: 2 },
  glitch: { look: 3, sit: 2 },
  coinPolish: { crown: 2, glint: 2 },
  crown: { coinPolish: 2 },
};

const MOOD_INDEX = { idle: 0, content: 1, stressed: 2 };
const byId = Object.fromEntries(REGISTRY.map((b) => [b.id, b]));

export class NomozScheduler {
  constructor({ rng, mood, reduced, getCtx, apply }) {
    this.rng = rng;
    this.mood = mood;
    this.reduced = reduced;
    this.getCtx = getCtx;
    this.apply = apply;
    this.alive = true;
    this.timer = null;
    this.last = null;
    this.history = [];
    this.lastAt = {};
  }

  // Exactly one pending timer at any moment.
  schedule(fn, ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(fn, Math.max(0, ms));
  }

  start(delay) {
    this.schedule(() => this.next(), delay);
  }

  stop() {
    this.alive = false;
    clearTimeout(this.timer);
  }

  choose(c) {
    const idx = MOOD_INDEX[this.mood];
    const now = performance.now();

    const pool = REGISTRY.filter(
      (b) =>
        b.w[idx] > 0 &&
        b.id !== this.last &&
        (!this.reduced || !b.moves) &&
        now - (this.lastAt[b.id] ?? -Infinity) >= b.cd
    );

    if (!pool.length) return this.mood === 'stressed' ? 'still' : 'sit';

    const aff = AFFINITY[this.last] || {};
    const weights = pool.map(
      (b) =>
        b.w[idx] *
        (aff[b.id] || 1) *
        (this.history.includes(b.id) ? 0.4 : 1)
    );

    let pickW = c.rng() * weights.reduce((s, w) => s + w, 0);
    for (let i = 0; i < pool.length; i++) {
      pickW -= weights[i];
      if (pickW <= 0) return pool[i].id;
    }
    return pool[0].id;
  }

  next(forceId) {
    if (!this.alive) return;

    const c = this.getCtx();
    if (!c) {
      this.schedule(() => this.next(forceId), 200);
      return;
    }

    const id = forceId || this.choose(c);

    const S = makeScript();
    const planned = byId[id].plan(c, S);
    const end = this.reduced ? planned * 1.3 : planned;

    this.current = id;
    this.run(S.beats.sort((a, b) => a.t - b.t), Math.max(end, 600));
  }

  run(beats, end) {
    const t0 = performance.now();
    let i = 0;

    const step = () => {
      if (!this.alive) return;
      const now = performance.now() - t0;

      while (i < beats.length && beats[i].t <= now + 4) {
        this.apply(beats[i].patch);
        i++;
      }

      if (i < beats.length) {
        this.schedule(step, beats[i].t - now);
      } else {
        this.schedule(() => this.finish(), end - now);
      }
    };

    step();
  }

  finish() {
    if (!this.alive) return;

    this.last = this.current;
    this.lastAt[this.current] = performance.now();
    this.history = [...this.history, this.current].slice(-4);

    // Meaningful stretches of doing nothing, with varied pauses.
    const gap =
      this.rng() < 0.18 ? rnd(this.rng, 4000, 11000) : rnd(this.rng, 500, 2600);

    this.schedule(() => this.next(), this.reduced ? gap * 1.5 : gap);
  }
}
