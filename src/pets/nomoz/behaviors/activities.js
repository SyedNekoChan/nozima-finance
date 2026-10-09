import { defineBehavior } from '../../core/behaviors.js';
import { clamp, int, pick, rnd } from '../../core/rng.js';
import { gazeForX, travel } from '../../core/toolkit.js';
import { W } from './util.js';

/* Behaviors with something to do: props, objects, coin, crown, glitches. */

/* F. Reading a book */
export const read = defineBehavior({
  id: 'read',
  rarity: 'rare',
  weights: W(5, 4),
  cooldown: 70000,
  duration: [10000, 22000],
  requires: ['vanity:book'],
  followOn: { stretch: 4, sit: 2, observe: 2 },
  plan(c, S) {
    let t = 0;

    // settle into a comfortable spot nearby first
    if (!c.reduced && c.rng() < 0.6) {
      const dest = c.pickSpot({
        near: { sx: c.cur.sx, sy: c.cur.sy, radius: c.compact ? 90 : 200 },
        zRange: [Math.max(c.geo.zRange[0], c.cur.z - 60), Math.min(c.geo.zRange[1], c.cur.z + 60)],
      });
      t = travel(S, c, c.cur, dest, 0) + 300;
    }

    const dur = rnd(c.rng, ...this.duration);

    // open the book, then lower the eyes to the page
    S.at(t, { pose: 'sit', gaze: 'c', eyes: 'open', mouth: 'idle', legs: 0, book: 0 });
    S.at(t + rnd(c.rng, 500, 900), { eyes: 'down' });

    // varied rhythm: pages turn, and now and then it looks up
    let u = t + rnd(c.rng, 1800, 3800);
    while (u < t + dur - 2500) {
      if (c.rng() < 0.55) {
        S.play('pageTurn', u);
        u += rnd(c.rng, 2500, 5500);
      } else {
        const back = S.play('lookUpFromBook', u);
        u = back + rnd(c.rng, 1200, 3600);
      }
    }

    S.at(t + dur, { eyes: 'open' });
    S.at(t + dur + 450, { book: null });
    return t + dur + 900;
  },
});

export const inspect = defineBehavior({
  id: 'inspect',
  weights: W(6),
  cooldown: 40000,
  followOn: { ponder: 3, ponderSymbol: 3, look: 2 },
  plan(c, S) {
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
  },
});

export const floatSymbol = defineBehavior({
  id: 'floatSymbol',
  weights: W(5, 3),
  cooldown: 30000,
  moves: true,
  followOn: { lookUp: 2, followPixel: 2 },
  plan(c, S) {
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
  },
});

export const followPixel = defineBehavior({
  id: 'followPixel',
  weights: W(5, 3),
  cooldown: 30000,
  followOn: { lookUp: 3, look: 2 },
  plan(c, S) {
    const ltr = c.rng() < 0.5;
    S.at(0, { pose: 'sit', legs: 0 });
    let t = rnd(c.rng, 300, 800);
    for (let i = 0; i < 19; i++) {
      const x = ltr ? i * 3 : 54 - i * 3;
      S.at(t, { item: { kind: 'block', x, y: 0 }, gaze: gazeForX(x, c.pet.sprite.width) });
      t += rnd(c.rng, 300, 430);
    }
    S.at(t, { item: null, gaze: 'c' });
    return t + 600;
  },
});

/*
 * A. Investigating a pixel: a tiny block drifts through the environment.
 * The cat notices it, watches it pass, briefly follows it with a few steps
 * and loses interest.
 */
export const investigatePixel = defineBehavior({
  id: 'investigatePixel',
  rarity: 'uncommon',
  weights: W(4, 2),
  cooldown: 40000,
  moves: true,
  followOn: { lookUp: 2, look: 3, sit: 2 },
  plan(c, S) {
    const width = c.pet.sprite.width;
    const ltr = c.rng() < 0.5;
    const dir = ltr ? 1 : -1;
    const n = int(c.rng, 15, 20);
    const follow = !c.reduced && c.rng() < 0.7;
    const followAt = Math.floor(n * rnd(c.rng, 0.35, 0.55));

    S.at(0, { pose: 'sit', legs: 0, eyes: 'open' });
    let t = rnd(c.rng, 400, 900);
    let walkEnd = 0;

    for (let i = 0; i < n; i++) {
      const x = Math.round(ltr ? i * (54 / n) : 54 - i * (54 / n));
      const y = Math.round(1 + Math.sin(i * 0.9) * 1.2);
      S.at(t, { item: { kind: 'block', x, y } });

      if (i === 0) S.at(t, { eyes: 'wide' });
      if (i === 2) S.at(t, { eyes: 'open' });

      if (follow && i === followAt) {
        // takes a few steps after it
        const step = c.geo.cell * c.geo.scaleAt(c.cur.z);
        const out = c.geo.clamp({
          sx: c.cur.sx + dir * step * int(c.rng, 2, 4),
          sy: c.cur.sy + rnd(c.rng, -0.5, 0.5) * step,
          z: c.cur.z,
        });
        walkEnd = travel(S, c, c.cur, out, t + 60);
      } else if (!walkEnd || t > walkEnd) {
        S.at(t, { gaze: gazeForX(x, width) });
      }

      t += rnd(c.rng, 300, 450);
    }

    // it drifts away: a last look, then interest fades
    S.at(t, { item: null });
    const tEnd = Math.max(t, walkEnd);
    S.at(tEnd + 500, { gaze: pick(c.rng, ['l', 'r']) });
    S.blink(tEnd + 1300);
    S.at(tEnd + 2000, { gaze: 'c', pose: 'sit', legs: 0 });
    return tEnd + 2600;
  },
});

/*
 * C. Interacting with a floating object: discovers a small object, looks
 * at it from several angles, nudges it away and leaves it behind.
 */
export const floatingObject = defineBehavior({
  id: 'floatingObject',
  rarity: 'uncommon',
  weights: W(4, 2),
  cooldown: 45000,
  moves: true,
  followOn: { look: 2, ponder: 2, sit: 2 },
  plan(c, S) {
    const name = pick(c.rng, ['box', 'gem', 'disk']);
    const right = c.rng() < 0.5;
    const side = right ? 'r' : 'l';
    const away = right ? 1 : -1;
    let x = right ? 47 : 2;
    let y = 47;
    const obj = () => ({ kind: 'obj', name, x, y });

    S.at(0, { pose: 'sit', legs: 0, eyes: 'open' });
    let t = rnd(c.rng, 500, 1000);

    // it drifts into view, gently bobbing, and is noticed
    S.at(t, { item: obj(), gaze: side, eyes: 'wide' });
    const bob = (from, to) => {
      for (let u = from; u < to; u += rnd(c.rng, 520, 800)) {
        y = y === 47 ? 49 : 47;
        S.at(u, { item: obj() });
      }
    };
    bob(t + 500, t + 1500);
    t += 1600;

    // examines it from different angles
    const views = [
      { eyes: 'down', lean: away, gaze: side },
      { eyes: 'open', lean: 0, gaze: 'u' },
      { eyes: 'down', lean: away, gaze: 'c' },
      { eyes: 'wide', lean: -away, gaze: side },
    ].slice(0, int(c.rng, 3, 4));
    for (const v of views) {
      S.at(t, v);
      const next = t + rnd(c.rng, 1100, 2000);
      bob(t + 400, next);
      t = next;
    }

    // a nudge: the object slides away from it and it follows with its eyes
    for (let i = 0; i < int(c.rng, 2, 3); i++) {
      x = clamp(x + away * 3, 1, 49);
      S.at(t, { item: obj(), lean: away, eyes: 'open', gaze: side });
      S.at(t + 350, { lean: 0 });
      t += rnd(c.rng, 700, 1100);
    }

    // it leaves the object behind: the cat turns and walks off the other way
    S.at(t, { lean: 0, eyes: 'open' });
    if (c.reduced) {
      S.at(t + 600, { item: null, gaze: 'c' });
      return t + 1500;
    }

    const step = c.geo.cell * c.geo.scaleAt(c.cur.z);
    const steps = int(c.rng, 2, 4);
    const dest = c.geo.clamp({ sx: c.cur.sx - away * step * steps, sy: c.cur.sy, z: c.cur.z });
    const walkEnd = travel(S, c, c.cur, dest, t);
    // relative to the walking cat the object slides out of the frame
    for (let i = 1; i <= steps + 1; i++) {
      const u = t + i * 480;
      x += away * 5;
      if (x > 50 || x < -2) {
        S.at(u, { item: null });
        break;
      }
      S.at(u, { item: obj() });
    }
    S.at(walkEnd, { item: null });
    S.blink(walkEnd + 600);
    return walkEnd + rnd(c.rng, 1200, 2400);
  },
});

export const coinPolish = defineBehavior({
  id: 'coinPolish',
  weights: W(4, 10),
  cooldown: 25000,
  flagWeights: { approaching: 2 }, // more thoughtful near the budget limit
  followOn: { crown: 2, glint: 2 },
  plan(c, S) {
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
  },
});

/*
 * H. Inspecting its coin (prosperous state): the cyber-$ is lifted off the
 * chest, turned over and put back.
 */
export const coinInspect = defineBehavior({
  id: 'coinInspect',
  rarity: 'uncommon',
  weights: W(0, 8),
  cooldown: 60000,
  requires: ['vanity:heldCoin', 'vanity:chestCoin'],
  followOn: { vanity: 2, glint: 2 },
  plan(c, S) {
    S.at(0, { pose: 'sit', legs: 0 });
    const end = S.play('coinTurn', rnd(c.rng, 400, 900));
    return end + rnd(c.rng, 900, 1600);
  },
  exit(c) {
    // never leave the coin in the air if the behavior is cancelled
    c.apply({ coin: null });
  },
});

export const crown = defineBehavior({
  id: 'crown',
  weights: W(3, 10),
  cooldown: 25000,
  followOn: { coinPolish: 2 },
  plan(c, S) {
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
  },
});

/*
 * K. A moment of vanity (prosperous state only, rare and composed): it
 * adjusts its crown, admires its coin, or briefly checks itself over.
 */
export const vanity = defineBehavior({
  id: 'vanity',
  rarity: 'rare',
  weights: W(0, 5),
  cooldown: 90000,
  requires: ['vanity:crown', 'vanity:chestCoin'],
  followOn: { coinPolish: 2, coinInspect: 2, sit: 2 },
  plan(c, S) {
    S.at(0, { pose: 'sit', legs: 0, eyes: 'open' });
    let t = rnd(c.rng, 500, 1000);

    const acts = ['crown', 'coin', 'self'];
    const first = pick(c.rng, acts);
    const second = c.rng() < 0.4 ? pick(c.rng, acts.filter((a) => a !== first)) : null;

    for (const act of [first, second]) {
      if (!act) continue;

      if (act === 'crown') {
        t = S.play('crownAdjust', t) + 500;
      } else if (act === 'coin') {
        S.at(t, { gaze: 'c', lean: 0 });
        for (let i = 0; i < int(c.rng, 4, 6); i++) {
          S.at(t + i * 480, { item: { kind: 'sparkle', x: i % 2 ? 35 : 16, y: i % 2 ? 31 : 34 } });
        }
        t += 2600;
        S.at(t, { item: null });
        t += 400;
      } else {
        // checks itself over: a slow look to one side, then the other
        const lean = c.rng() < 0.5 ? -1 : 1;
        S.at(t, { lean, gaze: lean < 0 ? 'l' : 'r' });
        S.at((t += rnd(c.rng, 900, 1400)), { lean: -lean, gaze: lean < 0 ? 'r' : 'l' });
        S.at((t += rnd(c.rng, 900, 1400)), { lean: 0, gaze: 'c' });
        t += 500;
      }
    }

    S.at(t, { item: null, lean: 0, gaze: 'c', crown: 0, crownLift: 0 });
    return t + 900;
  },
});

export const glint = defineBehavior({
  id: 'glint',
  weights: W(0, 14),
  cooldown: 8000,
  plan(c, S) {
    S.at(0, { cue: '*' });
    S.at(1400, { cue: null });
    return rnd(c.rng, 4000, 7000);
  },
});

export const twitch = defineBehavior({
  id: 'twitch',
  weights: W(8, 5),
  cooldown: 4000,
  moves: true,
  plan(c, S) {
    const lean = c.rng() < 0.5 ? -1 : 1;
    S.at(0, { lean });
    S.at(700, { lean: 0 });
    return rnd(c.rng, 1800, 3000);
  },
});

/*
 * G. A tiny system glitch: a brief pixel-level displacement. The cat
 * pauses, reacts and returns to normal. Never an aggressive flicker.
 * (In the stressed state it keeps its existing, restrained behavior.)
 */
export const glitch = defineBehavior({
  id: 'glitch',
  rarity: 'rare',
  weights: W(3, 1.2, 8),
  cooldown: 40000,
  moves: true,
  followOn: { look: 3, sit: 2 },
  plan(c, S) {
    S.at(0, { pose: 'sit', legs: 0 });
    const t0 = rnd(c.rng, 300, 700);
    const t1 = S.play('glitchBurst', t0);

    // it pauses and reacts: a startled look, a glance at where it happened
    const side = pick(c.rng, ['l', 'r']);
    S.at(t1 + 150, { eyes: 'wide', cue: '?', gaze: side, lean: side === 'l' ? -1 : 1 });
    S.at(t1 + 700, { lean: 0 });
    const t2 = t1 + rnd(c.rng, 1100, 1700);
    S.at(t2, { eyes: 'open', cue: null, gaze: 'c' });
    S.blink(t2 + 400);
    return t2 + 1200;
  },
});

export const curious = defineBehavior({
  id: 'curious',
  weights: W(5, 2, 6),
  cooldown: 20000,
  moves: true,
  followOn: { look: 2, ponder: 2 },
  plan(c, S) {
    const side = c.cur.sx < c.geo.width / 2 ? -1 : 1;
    const g = side < 0 ? 'l' : 'r';
    S.at(0, { gaze: g, eyes: 'wide', cue: '?', lean: side, pose: 'sit', legs: 0 });
    let t = rnd(c.rng, 1500, 3200);

    if (!c.reduced && c.rng() < 0.4) {
      const step = c.geo.cell * c.geo.scaleAt(c.cur.z);
      const n = int(c.rng, 2, 4);
      const out = c.geo.clamp({ sx: c.cur.sx + side * step * n, sy: c.cur.sy, z: c.cur.z });
      const t1 = travel(S, c, c.cur, out, 500);
      const t2 = travel(S, c, out, c.cur, t1 + rnd(c.rng, 1200, 2200));
      t = t2;
    }

    S.at(t, { eyes: 'open', cue: null, lean: 0, gaze: 'c' });
    return t + 700;
  },
});
