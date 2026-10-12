import { defineActivity } from '../../core/activity.js';
import { EASE, clampPoint, moveProp } from '../../core/choreo.js';
import { int, pick, rnd } from '../../core/rng.js';
import { gazeForX } from '../../core/toolkit.js';
import { RUNE_NAMES, pawSpot } from '../sprites.js';
import { LEAN, PAW, SIGN, W, anySide, maybeTransition, other } from './util.js';

/*
 * Spell magic: one of several distinct spellcasting performances, each
 * built from paw gestures, sprite-space effects (trails, runes, an orb,
 * stars, smoke) and, where a spell reaches into the world, temporary world
 * props (a portal, levitated objects, a glyph circle on the floor).
 * Everything is restrained pixel light and disappears when the spell ends.
 *
 *   runes      glowing runes drawn in the air with a paw, admired, dismissed
 *   orb        an orb conjured between the paws, rolled, lifted, recoloured
 *   stars      tiny stars summoned to orbit the cat (in front and behind)
 *   portal     a miniature portal opens; something peeks or comes out
 *   levitate   a few objects lifted and rearranged with deliberate gestures
 *   unstable   a spell fizzles into a harmless smoke puff, then succeeds
 *   practice   a complex spell rehearsed, rethought, altered, tried again
 *   glyph      a protective circle raised at its feet, inspected, dismissed
 */

const HUE = { C: 'cyan', V: 'violet', G: 'gold', N: 'green' };
const NEXT_COLOR = { C: 'V', V: 'G', G: 'N', N: 'C' };

// where runes are drawn in the air beside the head, per side (sprite space)
const SPOTS = {
  l: [[5, 9], [6, 19], [4, 29]],
  r: [[50, 9], [49, 19], [51, 29]],
};

function runePath(c, x, y) {
  const shape = pick(c.rng, ['loop', 'zig', 'hook', 'cross']);
  const pts = [];
  if (shape === 'loop') {
    for (let i = 0; i <= 8; i++) {
      const a = -Math.PI / 2 + (i / 8) * Math.PI * 2;
      pts.push([x + Math.cos(a) * 3, y + Math.sin(a) * 3]);
    }
  } else if (shape === 'zig') {
    for (let i = 0; i <= 6; i++) pts.push([x - 3 + i, y + (i % 2 ? -2 : 2)]);
  } else if (shape === 'hook') {
    for (let i = 0; i <= 7; i++) pts.push([x - 2 + Math.round(i / 2), y - 3 + i]);
  } else {
    for (let i = -3; i <= 3; i++) pts.push([x + i, y + i]);
    for (let i = -3; i <= 3; i++) pts.push([x + i, y - i]);
  }
  return pts;
}

// a glowing trail drawn point by point
function trail(S, t, key, pts, col, every = 65, dimC) {
  for (let j = 0; j < pts.length; j++) S.fx(t + j * every, key, { kind: 'trail', pts: pts.slice(0, j + 1), c: col, dimC });
  return t + pts.length * every;
}

// a world prop's turning `phase`, ticking from t0 to t1
function spin(st, local, t0, t1, every = 160, from = 0) {
  let ph = from;
  for (let t = t0; t < t1; t += every) st.prop(t, local, { phase: ph++ });
  return ph;
}

// a small burst of sparkles somewhere in the world
function burst(st, local, t, at, tint) {
  st.prop(t, local, { kind: 'trinket', name: 'burst', tint, ...at, frame: 0, fade: 1 });
  st.prop(t + 110, local, { frame: 1 });
  st.prop(t + 220, local, { frame: 2 });
  st.prop(t + 360, local, null);
  return t + 360;
}

const PERFORMANCES = {
  runes(y, t) {
    const { c, S, col } = y;
    const s = anySide(c);
    const k = PAW[s];
    S.at(t, { [k]: 'up', gaze: s, ears: 'perk', pupils: 0, eyes: 'open' });
    t += rnd(c.rng, 250, 450);

    const spots = [...SPOTS[s]].sort(() => c.rng() - 0.5);
    const n = int(c.rng, 2, 3);
    for (let i = 0; i < n; i++) {
      const [x, y0] = spots[i];
      S.at(t, { [k]: y0 < 14 ? 'reach' : 'up', gaze: y0 < 14 ? 'u' : s });
      t = trail(S, t, 'trail', runePath(c, x, y0), col, rnd(c.rng, 50, 80));
      S.fx(t, 'trail', null);
      S.fx(t, `rune${i}`, { kind: 'rune', name: pick(c.rng, RUNE_NAMES), x, y: y0, c: col });
      S.fx(t, 'spk', { kind: 'spark', x: x + 3, y: y0 - 3, c: 'W' });
      S.fx(t + 160, 'spk', null);
      t += rnd(c.rng, 350, 700);
    }

    // admired: the runes pulse together
    S.at(t, { [k]: 'mid', eyes: 'wide', gaze: s });
    for (let p = 0; p < 2; p++) {
      const on = {};
      const off = {};
      for (let i = 0; i < n; i++) {
        on[`rune${i}`] = { c: 'W' };
        off[`rune${i}`] = { c: col };
      }
      S.fxMany(t, on);
      S.fxMany(t + 150, off);
      t += 360;
    }
    t += rnd(c.rng, 400, 800);

    // dismissed one by one with a flick of the paw
    S.at(t, { [k]: 'out', eyes: 'open' });
    for (let i = 0; i < n; i++) {
      S.fx(t, `rune${i}`, { a: 0.45, dim: true });
      S.fx(t + 140, `rune${i}`, null);
      t += 170;
    }
    S.at(t + 100, { [k]: null, pupils: null, ears: null, gaze: 'c' });
    return t + 300;
  },

  orb(y, t) {
    const { c, S, st, A } = y;
    let col = y.col;
    S.at(t, { pawL: 'mid', pawR: 'mid', eyes: 'down', pupils: 0, ears: 'perk' });
    t += 300;

    // a spark gathers between the paws and swells into an orb
    let ox = 27.5;
    let oy = 39;
    S.fx(t, 'orb', { kind: 'spark', x: ox, y: oy, c: col });
    S.fx((t += 250), 'orb', { kind: 'orb', size: 0, x: ox, y: oy, c: col });
    S.fx((t += 260), 'orb', { size: 1 });
    S.fx((t += 300), 'orb', { size: 2 });
    t += rnd(c.rng, 300, 600);

    // handled: rolled between the paws, lifted, recoloured, spun
    const moves = st.some('orbMove', { roll: 3, lift: 2, tint: 2, spin: 1.5 }, int(c.rng, 2, 3));
    for (const m of moves) {
      if (m === 'roll') {
        for (const [x, l, r] of [[23, 'front', 'mid'], [32, 'mid', 'front'], [27.5, 'mid', 'mid']]) {
          S.at(t, { pawL: l, pawR: r, gaze: gazeForX(x, 56) });
          S.fx(t, 'orb', { x });
          t += rnd(c.rng, 380, 620);
        }
        ox = 27.5;
      } else if (m === 'lift') {
        S.at(t, { pawL: 'up', pawR: 'up', gaze: 'u', eyes: 'open' });
        for (const yy of [32, 22, 12, 7]) {
          S.fx(t, 'orb', { y: yy });
          t += 170;
        }
        t += rnd(c.rng, 500, 900);
        S.at(t, { pawL: 'mid', pawR: 'mid', gaze: 'c', eyes: 'down' });
        for (const yy of [14, 26, 39]) {
          S.fx(t, 'orb', { y: yy });
          t += 200;
        }
        oy = 39;
      } else if (m === 'tint') {
        const next = NEXT_COLOR[col];
        for (let i = 0; i < 4; i++) {
          S.fx(t, 'orb', { c: i % 2 ? col : next, size: i % 2 ? 2 : 1 });
          t += 140;
        }
        S.fx(t, 'orb', { c: next, size: 2 });
        S.at(t, { eyes: 'wide' });
        col = next;
        t += rnd(c.rng, 500, 900);
        S.at(t, { eyes: 'down' });
      } else {
        for (let i = 0; i < 8; i++) {
          S.fx(t, 'orb', { x: ox + (i % 2 ? 1.5 : -1.5), phase: i });
          t += 110;
        }
        S.fx(t, 'orb', { x: ox });
        t += 200;
      }
    }

    // the finale: it pops into sparkles, or is let go into the world
    if (c.rng() < 0.5) {
      S.at(t, { pawL: 'front', pawR: 'front' });
      S.fx((t += 200), 'orb', { size: 1 });
      S.fx((t += 160), 'orb', { size: 0 });
      t += 140;
      S.fx(t, 'orb', null);
      for (let i = 0; i < 4; i++) {
        S.fx(t, `pop${i}`, { kind: 'spark', x: ox + (i % 2 ? 4 : -4), y: oy + (i < 2 ? -4 : 3), c: i % 2 ? 'W' : col, x2: i > 1 });
        S.fx(t + 260, `pop${i}`, null);
      }
      S.at(t, { eyes: 'happy', pawL: null, pawR: null });
      t += 700;
    } else {
      // a gentle push: it floats off into the distance and fades
      S.at(t, { pawL: 'up', pawR: 'up', gaze: 'u' });
      const from = A.world(ox - 28, oy - 30, 8);
      S.fx(t, 'orb', null);
      st.prop(t, 'drift', { kind: 'wisp', hue: HUE[col], ...from, fade: 1 });
      const to = clampPoint(c, A.world(rnd(c.rng, -30, 30), -36, -160), 11);
      moveProp(S, st.id('drift'), from, to, t, 2400, { every: 150, ease: EASE.inOut, extra: (u, i) => ({ phase: i }) });
      st.prop(t + 1500, 'drift', { fade: 0, fadeMs: 900 });
      const end = t + 2400;
      for (let u = t; u < end; u += 400) A.look(u, { ...from, sx: from.sx + (to.sx - from.sx) * ((u - t) / 2400), sy: from.sy + (to.sy - from.sy) * ((u - t) / 2400) });
      S.at(t + 500, { pawL: null, pawR: null });
      t = end;
    }
    S.at(t, { pupils: null, ears: null, gaze: 'c', focus: null, eyes: 'open' });
    return t + 200;
  },

  stars(y, t) {
    const { c, S, A, col } = y;
    const n = int(c.rng, 3, 5);
    const colors = ['G', 'W', col];
    S.at(t, { pawL: 'up', pawR: 'up', eyes: 'wide', ears: 'perk', pupils: 0 });
    // they pop out of the paws
    const [lx, ly] = pawSpot('up', 'l');
    const [rx0] = pawSpot('up', 'r');
    for (let i = 0; i < n; i++) {
      S.fx(t + i * 120, `st${i}`, { kind: 'star', small: true, x: i % 2 ? rx0 : lx, y: ly - 4, c: colors[i % 3] });
    }
    t += n * 120 + 250;
    S.at(t, { pawL: null, pawR: null, tail: 'swish', eyes: 'open' });

    // and orbit, passing in front of and behind the cat
    const cx = 27.5;
    let cy = 31;
    const rx = 26;
    let ry = 6;
    const a0 = rnd(c.rng, 0, Math.PI * 2);
    const w = (c.rng() < 0.5 ? -1 : 1) * rnd(c.rng, 1.8, 2.6);
    const dur = rnd(c.rng, 2400, 4200);
    const every = 110;
    const pos = (i, u) => a0 + (i * Math.PI * 2) / n + (w * u) / 1000;

    if (!c.reduced && c.rng() < 0.35) {
      // drawn along by them, it drifts a little nearer or farther
      A.glide(t + dur * 0.25, A.world(0, 0, c.rng() < 0.5 ? -45 : 35), Math.round(dur * 0.5), { ease: 'out' });
    }
    for (let u = 0; u <= dur; u += every) {
      const ops = {};
      for (let i = 0; i < n; i++) {
        const a = pos(i, u);
        const back = Math.sin(a) < 0;
        ops[`st${i}`] = { kind: 'star', small: back, back, x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, c: colors[i % 3] };
      }
      S.fxMany(t + u, ops);
      if (u % 440 < every) S.at(t + u, { gaze: gazeForX(cx + Math.cos(pos(0, u)) * rx, 56) });
    }
    t += dur;

    // they spiral up over the head and blink out one by one
    for (let k = 1; k <= 5; k++) {
      cy -= 5;
      ry = Math.max(1, ry - 1);
      const ops = {};
      for (let i = 0; i < n; i++) {
        const a = pos(i, dur + k * every);
        ops[`st${i}`] = { small: true, back: false, x: cx + Math.cos(a) * (rx - k * 4), y: cy + Math.sin(a) * ry };
      }
      S.fxMany(t, ops);
      t += every;
    }
    S.at(t, { gaze: 'u' });
    for (let i = 0; i < n; i++) {
      S.fx(t, `st${i}`, { kind: 'spark', x2: true, c: 'W' });
      S.fx(t + 150, `st${i}`, null);
      t += 120;
    }
    S.at(t + 200, { gaze: 'c', tail: null, pupils: null, ears: null });
    return t + 400;
  },

  portal(y, t) {
    const { c, S, st, A, col } = y;
    const s = anySide(c);
    const dir = SIGN[s];
    const k = PAW[s];
    const where = clampPoint(c, A.world(dir * 27, 0, -6), 24);
    const center = { ...where, z: where.z + 1 };

    // it draws a circle in the air, and the portal opens there
    S.at(t, { [k]: 'out', gaze: s, ears: 'perk', pupils: 0 });
    const [px, py] = pawSpot('up', s);
    const ring = [];
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      ring.push([px + Math.cos(a) * 3, py - 4 + Math.sin(a) * 4]);
    }
    S.at(t + 120, { [k]: 'up' });
    t = trail(S, t + 120, 'trail', ring, col, 55);
    S.fx(t + 120, 'trail', null);
    st.prop(t, 'portal', { kind: 'portal', ...where, open: 0, phase: 0, hue: 'violet', peek: null, fade: 1 });
    for (let i = 1; i <= 8; i++) st.prop(t + i * 90, 'portal', { open: i / 8, phase: i });
    t += 8 * 90;
    const tOpen = t;

    // it peers in: a lean, wide eyes, perhaps a careful step closer
    A.look(t, center, { [k]: null, eyes: 'wide', pupils: 3, lean: LEAN[s] });
    S.at(t + 500, { lean: 0 });
    t += rnd(c.rng, 700, 1200);
    if (!c.reduced && c.rng() < 0.5) {
      t = A.walk(t, A.world(dir * 4, 0, -2), { stepMs: 620, endPose: 'crouch', gaze: s });
      S.at((t += 300), { pose: 'sit' });
    }

    // something comes through
    const what = st.variant('portalPeek', { fish: 2, eyes: 2, paw: 2, star: 2, moth: 2 });
    if (what === 'eyes') {
      st.prop(t, 'portal', { peek: 'eyes' });
      S.at(t, { ears: 'back', eyes: 'wide', lean: -LEAN[s] });
      t += rnd(c.rng, 1200, 2000);
      t = S.play('headTilt', t, { side: s, cue: '?' });
      st.prop(t, 'portal', { peek: null });
      S.at(t, { ears: 'perk', lean: LEAN[s] });
      t += rnd(c.rng, 600, 1000);
      S.at(t, { lean: 0, ears: null });
    } else if (what === 'paw') {
      for (let i = 0; i < 3; i++) {
        st.prop(t, 'portal', { peek: 'paw' });
        st.prop(t + 350, 'portal', { peek: null });
        t += 650;
      }
      // it waves back
      for (let i = 0; i < int(c.rng, 2, 3); i++) {
        S.at(t, { [k]: 'up', eyes: 'happy' });
        S.at(t + 260, { [k]: 'out' });
        t += 520;
      }
      st.prop(t, 'portal', { peek: 'paw' });
      st.prop(t + 400, 'portal', { peek: null });
      S.at(t, { [k]: null, eyes: 'open' });
      t += 700;
    } else {
      const name = what === 'star' ? 'star' : what;
      st.prop(t, 'guest', { kind: 'trinket', name, tint: 'gold', ...center, fade: 0, fadeMs: 200 });
      st.prop(t + 40, 'guest', { fade: 1 });
      let at = center;
      const go = (to, ms, ease = EASE.inOut) => {
        const dest = clampPoint(c, to, 11);
        moveProp(S, st.id('guest'), at, dest, t, ms, { every: 120, ease, extra: (u, i) => ({ frame: i }) });
        for (let u = 0; u < ms; u += 300) A.look(t + u, dest);
        at = dest;
        t += ms;
      };
      if (what === 'fish') {
        go(A.world(dir * 12, -4, 5), 900);
        S.at(t, { lean: LEAN[s], droop: 1 });
        S.at(t + 200, { droop: 0 });
        S.at(t + 450, { droop: 1 });
        S.at(t + 650, { droop: 0, lean: 0 });
        t += 800;
        S.at(t, { [k]: 'out' });
        S.at(t + 200, { [k]: null });
        t += 300;
        // it wriggles, then slips back home
        go({ ...at, sx: at.sx - dir * 2 * A.px() }, 200);
        go({ ...at, sx: at.sx + dir * 2 * A.px() }, 200);
        go(center, 700);
        st.prop(t, 'guest', { fade: 0 });
      } else if (what === 'star') {
        // it circles the cat once, in front and behind, then goes home
        const steps = 14;
        for (let i = 1; i <= steps; i++) {
          const a = Math.PI * (dir > 0 ? 0 : 1) + (i / steps) * Math.PI * 2 * -dir;
          go(A.world(Math.cos(a) * 24, -6 + Math.sin(a) * 4, Math.sin(a) * 30), 130, EASE.linear);
        }
        go(center, 600);
        st.prop(t, 'guest', { fade: 0 });
        S.at(t, { eyes: 'happy' });
      } else {
        // a moth flutters out and away
        go(A.world(dir * 18, -14, 6), 700);
        S.at(t, { [k]: 'reach', gaze: 'u' });
        go(A.world(dir * 30, -40, -40), 900);
        S.at(t, { [k]: null });
        go(A.world(dir * 44, -60, -120), 900);
        st.prop(t - 600, 'guest', { fade: 0, fadeMs: 600 });
      }
      st.prop(t + 600, 'guest', null);
      t += 400;
    }

    // it closes, with a small burst
    spin(st, 'portal', tOpen, t, 160, 9);
    for (let i = 7; i >= 0; i--) st.prop(t + (7 - i) * 80, 'portal', { open: i / 8, peek: null });
    t += 8 * 80;
    t = burst(st, 'pop', t, center, HUE[col]);
    st.prop(t, 'portal', null);
    S.at(t, { pupils: null, focus: null, gaze: 'c', lean: 0 });
    return t + 300;
  },

  levitate(y, t) {
    const { c, S, st, A, col } = y;
    const names = [...['tome', 'gem', 'gear', 'feather', 'crystal', 'key', 'page']].sort(() => c.rng() - 0.5).slice(0, int(c.rng, 2, 3));
    const homes = [
      [-22, 22, 4],
      [22, 22, 4],
      [-10, 27, 14],
      [11, 27, 14],
    ].sort(() => c.rng() - 0.5);
    const objs = names.map((name, i) => ({ id: `obj${i}`, name, at: clampPoint(c, A.world(...homes[i]), 11) }));

    // the objects are there, catching a little light
    objs.forEach((o, i) => {
      st.prop(t + i * 150, o.id, { kind: 'trinket', name: o.name, tint: pick(c.rng, ['cyan', 'violet', 'red', 'gold']), ...o.at, fade: 0 });
      st.prop(t + i * 150 + 40, o.id, { fade: 1 });
    });
    t += objs.length * 150 + 400;
    S.at(t, { eyes: 'down', ears: 'perk' });
    t += rnd(c.rng, 400, 700);

    // both paws up: they rise
    S.at(t, { pawL: 'up', pawR: 'up', eyes: 'open', gaze: 'u', pupils: 0 });
    const lift = (o, dy, ms, glow) => {
      const to = clampPoint(c, { ...o.at, sy: o.at.sy + dy * A.px() }, 11);
      st.prop(t, o.id, { glow, glowHue: HUE[col] });
      moveProp(S, st.id(o.id), o.at, to, t, ms, { every: 120, ease: EASE.inOut });
      o.at = to;
    };
    objs.forEach((o) => lift(o, -rnd(c.rng, 14, 20), 900, true));
    t += 1000;

    // rearranged with deliberate gestures
    const plan = st.variant('arrange', { swap: 2, line: 2, stack: 2, depth: 1.5 });
    const point = (o) => {
      const s = o.at.sx < A.pos.sx ? 'l' : 'r';
      S.at(t, { pawL: s === 'l' ? 'out' : 'up', pawR: s === 'r' ? 'out' : 'up' });
      A.look(t, o.at);
      t += rnd(c.rng, 250, 450);
    };
    const move = (o, to, ms = rnd(c.rng, 700, 1100)) => {
      const dest = clampPoint(c, to, 11);
      moveProp(S, st.id(o.id), o.at, dest, t, ms, { every: 120, ease: EASE.inOut });
      for (let u = 0; u < ms; u += 300) A.look(t + u, dest);
      o.at = dest;
      t += ms + rnd(c.rng, 200, 450);
    };
    if (plan === 'swap' && objs.length >= 2) {
      const [a, b] = objs;
      const pa = a.at;
      const pb = b.at;
      point(a);
      move(a, { ...pb, sy: pb.sy - 6 * A.px() });
      point(b);
      move(b, pa);
      move(a, pb, 400);
    } else if (plan === 'line') {
      objs.forEach((o, i) => {
        point(o);
        move(o, A.world((i - (objs.length - 1) / 2) * 13, -30, 4));
      });
    } else if (plan === 'stack') {
      objs.forEach((o, i) => {
        point(o);
        move(o, A.world(c.rng() < 0.5 ? -20 : 20, 6 - i * 9, 8));
      });
    } else {
      // one floats away into depth and back, the others bob
      const o = objs[0];
      point(o);
      move(o, { ...o.at, z: o.at.z - 110 }, 1200);
      S.at(t, { eyes: 'wide' });
      move(o, A.world(0, -24, 10), 1200);
    }
    S.at(t, { pawL: 'mid', pawR: 'mid', eyes: 'happy', gaze: 'c', focus: null });
    t += rnd(c.rng, 700, 1100);

    // set down and gone
    objs.forEach((o, i) => {
      st.prop(t + i * 120, o.id, { glow: false, fade: 0, fadeMs: 500 });
      if (c.rng() < 0.5) burst(st, `b${i}`, t + i * 120 + 200, o.at, HUE[col]);
    });
    t += objs.length * 120 + 600;
    S.at(t, { pawL: null, pawR: null, eyes: 'open', pupils: null, ears: null });
    return t + 200;
  },

  unstable(y, t) {
    const { c, S, col } = y;
    S.at(t, { pawL: 'front', pawR: 'front', eyes: 'down', pupils: 0, ears: 'perk' });
    t += 300;
    const ox = 27.5;
    const oy = 40;
    // it sputters
    for (let i = int(c.rng, 5, 8); i > 0; i--) {
      S.fx(t, 'orb', c.rng() < 0.5 ? { kind: 'orb', size: int(c.rng, 0, 1), x: ox + rnd(c.rng, -1, 1), y: oy, c: col } : { kind: 'spark', x: ox, y: oy, c: col });
      t += rnd(c.rng, 70, 200);
      if (c.rng() < 0.4) {
        S.fx(t, 'orb', null);
        t += rnd(c.rng, 60, 160);
      }
    }
    // puff: harmless pixel smoke in its face
    S.fx(t, 'orb', null);
    for (let f = 0; f < 4; f++) {
      S.fx(t + f * 150, 'smoke', { kind: 'smoke', x: ox, y: oy - 2 - f * 3, frame: f });
      S.fx(t + f * 150, 'smoke2', { kind: 'smoke', x: ox + (f % 2 ? 6 : -6), y: 24 - f * 2, frame: Math.max(0, f - 1) });
    }
    S.at(t, { pawL: null, pawR: null, eyes: 'closed', ears: 'back', mouth: 'o', pupils: 3 });
    t += 600;
    S.fx(t, 'smoke', null);
    S.fx(t, 'smoke2', null);
    S.at(t, { mouth: 'idle' });
    t = S.play('shake', t + 100) + 200;

    // a moment's thought, then a careful second try
    S.at(t, { eyes: 'open', mouth: 'think', gaze: 'u', cue: '?' });
    t += rnd(c.rng, 800, 1400);
    S.at(t, { mouth: 'idle', cue: null, gaze: 'c', pawL: 'mid', pawR: 'mid', eyes: 'down', pupils: 0 });
    t += 500;
    S.fx(t, 'orb', { kind: 'orb', size: 0, x: ox, y: oy - 1, c: col });
    S.fx((t += 450), 'orb', { size: 1 });
    S.fx((t += 450), 'orb', { size: 2 });
    S.at((t += 300), { eyes: 'wide' });
    t += 400;
    // success: it bursts into a ring of stars
    S.fx(t, 'orb', null);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      S.fx(t, `s${i}`, { kind: 'spark', x: ox + Math.cos(a) * 6, y: oy - 2 + Math.sin(a) * 5, c: i % 2 ? 'W' : col });
      S.fx(t + 350, `s${i}`, null);
    }
    S.at(t, { pawL: 'up', pawR: 'up', eyes: 'happy', tail: 'swish' });
    t += 900;
    S.at(t, { pawL: null, pawR: null, tail: null, eyes: 'open', pupils: null, ears: null });
    return t + 200;
  },

  practice(y, t) {
    const { c, S, col } = y;
    const levels = ['up', 'reach', 'out', 'mid'];
    let pattern = [0, 1, 2].map(() => [anySide(c), pick(c.rng, levels)]);

    const attempt = (strong) => {
      for (const [s, lv] of pattern) {
        S.at(t, { [PAW[s]]: lv, [PAW[other(s)]]: null, gaze: lv === 'reach' ? 'u' : s });
        const [x, y0] = pawSpot(lv === 'mid' ? 'up' : lv, s);
        const pts = runePath(c, x, Math.max(3, y0 - 4));
        t = trail(S, t + 120, 'trail', strong ? pts : pts.filter((_, i) => i % 3 !== 1), strong ? col : 'c', strong ? 60 : 75, 'c');
        t += rnd(c.rng, 150, 300);
      }
      S.fx(t, 'trail', null);
      S.at(t, { pawL: null, pawR: null });
    };

    // first try: a fizzle
    S.at(t, { pupils: 0, ears: 'perk', mouth: 'think' });
    attempt(false);
    S.fx(t, 'fizz', { kind: 'smoke', x: 28, y: 14, frame: 0 });
    S.fx(t + 200, 'fizz', { frame: 1 });
    S.fx(t + 400, 'fizz', null);
    S.at(t, { ears: 'back' });
    t += 600;

    // pauses to think: paw at the chin, looking up
    S.at(t, { pawR: 'high', gaze: 'u', ears: null, cue: '?' });
    t += rnd(c.rng, 900, 1600);
    S.at(t, { cue: null });
    if (c.rng() < 0.5) t = S.play('pawTap', t, { side: 'l', taps: int(c.rng, 2, 4) });
    S.at(t, { pawR: null, gaze: 'c' });

    // alters a gesture and tries again
    const i = int(c.rng, 0, 2);
    pattern = pattern.map((g, j) => (j === i ? [other(g[0]), pick(c.rng, levels.filter((l) => l !== g[1]))] : g));
    t += 300;
    attempt(true);

    if (c.rng() < 0.8) {
      // it works: a rune blooms in front of the cat
      S.fx(t, 'result', { kind: 'rune', name: pick(c.rng, RUNE_NAMES), x: 28, y: 3, c: col });
      S.at(t, { eyes: 'happy', gaze: 'u', mouth: 'idle' });
      t += rnd(c.rng, 900, 1400);
      S.fx(t, 'result', { a: 0.4, dim: true });
      S.fx(t + 200, 'result', null);
    } else {
      // not quite: it lets it be for now
      S.at(t, { cue: '~', mouth: 'idle', lean: c.rng() < 0.5 ? -1 : 1 });
      t += rnd(c.rng, 900, 1300);
      S.at(t, { cue: null, lean: 0 });
    }
    S.at(t + 200, { pupils: null, ears: null, eyes: 'open', gaze: 'c', mouth: 'idle' });
    return t + 400;
  },

  glyph(y, t) {
    const { c, S, st, A, col } = y;
    const hue = HUE[col];
    const back = A.world(0, 25, -4);
    const front = A.world(0, 25, 4);
    S.at(t, { pawL: 'up', pawR: c.rng() < 0.6 ? 'up' : 'mid', eyes: 'open', gaze: 'u', ears: 'perk', pupils: 0 });
    t += 300;
    st.prop(t, 'back', { kind: 'ring', half: 'back', ...back, power: 0, phase: 0, hue, fade: 1 });
    st.prop(t, 'front', { kind: 'ring', half: 'front', ...front, power: 0, phase: 0, hue, fade: 1 });
    for (let i = 1; i <= 8; i++) {
      st.prop(t + i * 100, 'back', { power: i / 8 });
      st.prop(t + i * 100, 'front', { power: i / 8 });
    }
    const t0 = t;
    t += 900;

    // inspects it: down to one side, then the other, then a careful tap
    S.at(t, { pawL: null, pawR: null, eyes: 'down', gaze: 'l', lean: -1 });
    S.at((t += rnd(c.rng, 700, 1100)), { gaze: 'r', lean: 1 });
    S.at((t += rnd(c.rng, 700, 1100)), { gaze: 'c', lean: 0 });
    t += 300;
    const s = anySide(c);
    S.at(t, { [PAW[s]]: 'low' });
    for (const h of ['gold', hue, 'gold', hue]) {
      st.prop(t, 'back', { hue: h });
      st.prop(t, 'front', { hue: h });
      t += 140;
    }
    S.at(t, { [PAW[s]]: null, eyes: 'wide' });
    t += rnd(c.rng, 600, 1000);

    // dismissed with a swipe
    S.at(t, { [PAW[s]]: 'out', eyes: 'open' });
    S.at(t + 200, { [PAW[s]]: null });
    for (let i = 7; i >= 0; i--) {
      st.prop(t + (7 - i) * 80, 'back', { power: i / 8 });
      st.prop(t + (7 - i) * 80, 'front', { power: i / 8 });
    }
    spin(st, 'back', t0, t + 640, 150);
    spin(st, 'front', t0, t + 640, 150);
    t += 640;
    S.fx(t, 'p1', { kind: 'spark', x: 4, y: 52, c: col });
    S.fx(t, 'p2', { kind: 'spark', x: 51, y: 52, c: col });
    S.fx(t + 250, 'p1', null);
    S.fx(t + 250, 'p2', null);
    st.prop(t, 'back', null);
    st.prop(t, 'front', null);
    S.at(t, { pupils: null, ears: null, gaze: 'c' });
    return t + 400;
  },
};

const PERF_WEIGHTS = {
  runes: 3,
  orb: 3,
  stars: 2.5,
  portal: 1.5,
  levitate: 2,
  unstable: 2,
  practice: 2,
  glyph: 2,
};

export const spell = defineActivity({
  id: 'spell',
  performance: true,
  rarity: 'uncommon',
  weights: W(2.5, 2),
  cooldown: 150000,
  duration: [7000, 24000],
  moves: true,
  followOn: { shakeOff: 6, groom: 2, sit: 2, observe: 2 },
  plan(c, S, st) {
    const col = st.variant('hue', { C: 3, V: 3, G: 2, N: 1.5 });
    const y = { c, S, st, A: st.A, col };
    S.at(0, { pose: 'sit', legs: 0, eyes: 'open', mouth: 'idle', lean: 0 });
    let t = rnd(c.rng, 300, 800);

    // gathering focus: a breath with the eyes closed, then the ears come up
    if (c.rng() < 0.6) {
      S.at(t, { eyes: 'closed', droop: 1 });
      t += rnd(c.rng, 500, 900);
      S.at(t, { eyes: 'open', droop: 0, ears: 'perk' });
      t += 300;
    }

    t = PERFORMANCES[st.variant('perf', PERF_WEIGHTS)](y, t);
    S.clearFx(t);
    t = maybeTransition(S, c, t + 200, {
      chance: 0.5,
      pool: { shakeParticles: 3, satisfied: 2, survey: 1, inspectPaw: 1 },
      opts: { c: col },
    });
    return t + rnd(c.rng, 400, 900);
  },
});
