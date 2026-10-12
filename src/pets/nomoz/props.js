import { createRng, clamp } from '../core/rng.js';
import { drawText, fillPixels } from './sprites.js';

/*
 * NOMOZ.EXE's world-anchored environmental props: small canvases drawn from
 * pixel data, placed in the 3D backdrop by the shared prop layer. Each kind:
 *   { width, height, render(ctx, spec, frame) }
 * `spec` holds only visual fields the owning behavior sets (never
 * application data: a coin is a toy, a terminal shows abstract pixel bars).
 * To add a prop: add a kind here (it is listed in the pet's `props` by
 * PROPS below), and spawn it from a behavior with
 * S.prop(t, id, { kind, sx, sy, z, ... }) or an activity's st.prop(...).
 */

const C = {
  H: '#56606a', // housing highlight
  h: '#3b424a', // housing
  d: '#1c2025', // housing shade
  k: '#0a0c0f', // edge / ink
  s: '#0b1a1d', // screen (off)
  t: '#0f2a2e', // screen (on)
  S: '#1d4750', // screen highlight
  g: '#2fa6c4', // glyph / cursor (dim cyan)
  j: '#8bd9e8', // glyph core
  f: '#0b0e11', // floor
};

const rect = (g, x0, y0, x1, y1, ch) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = ch;
};

/* ------------------------------------------------------------------ */
/* Miniature terminal                                                  */
/* ------------------------------------------------------------------ */

const T_W = 24;
const T_H = 23; // 22 rows of terminal + 1 spare row for the float bob

function terminalGrid(lit) {
  const g = Array.from({ length: T_H }, () => Array(T_W).fill('.'));

  // housing: light on the top / left edges, dark on the bottom / right
  rect(g, 1, 0, 22, 15, 'd');
  rect(g, 2, 0, 21, 0, 'h');
  rect(g, 1, 1, 1, 14, 'h');
  rect(g, 22, 1, 22, 15, 'k');
  rect(g, 2, 15, 21, 15, 'k');
  for (const [x, y] of [[1, 0], [22, 0], [1, 15], [22, 15]]) g[y][x] = '.';
  rect(g, 2, 1, 21, 1, 'H');

  // bezel and screen
  rect(g, 3, 2, 20, 13, 'h');
  rect(g, 4, 3, 19, 12, lit ? 't' : 's');
  g[3][4] = 'k';
  g[3][19] = 'k';
  g[12][4] = 'k';
  g[12][19] = 'k';

  // a restrained highlight on the glass
  g[4][5] = 'S';
  g[4][6] = 'S';
  g[5][5] = 'S';
  if (lit) g[4][7] = 'S';

  // stand, base and a hint of keyboard
  rect(g, 9, 16, 14, 17, 'h');
  rect(g, 6, 18, 17, 19, 'd');
  rect(g, 6, 18, 17, 18, 'h');
  for (let x = 3; x <= 20; x += 2) g[20][x] = 'h';
  for (let x = 4; x <= 19; x += 2) g[21][x] = 'd';
  g[14][18] = lit ? 'g' : 'd'; // power light
  return g;
}

// Abstract pixel bars for the pet's own terminal sessions: lengths come
// from the session's seed, never from any text or data.
function lineLengths(seed) {
  const rng = createRng(seed || 1);
  return [0, 1, 2, 3].map(() => 4 + Math.floor(rng() * 10));
}

const SPIN = [[[0, 0], [0, 1]], [[0, 0], [1, 1]], [[0, 1], [1, 1]], [[1, 0], [0, 1]]];
const CHECK = [[0, 2], [1, 3], [2, 2], [3, 1], [4, 0]];

/*
 * The pet's typing session on the screen (x 4..19, y 3..12):
 *   lines     finished bars (0..4), typing: length of the bar being typed
 *   mode      'busy' (a turning spinner), 'ok' (a check), 'err' (a mark)
 *   progress  0..1 a run bar along the bottom
 */
function drawSession(ctx, spec, frame) {
  const lens = lineLengths(spec.seed);
  const done = Math.max(0, Math.min(4, spec.lines || 0));
  ctx.fillStyle = C.g;
  for (let i = 0; i < done; i++) ctx.fillRect(5, 4 + i * 2, Math.min(14, lens[i]), 1);
  if (spec.typing != null && done < 4) {
    const w = Math.max(0, Math.min(14, Math.round(spec.typing)));
    ctx.fillRect(5, 4 + done * 2, w, 1);
    if (frame % 2 === 0 || spec.typing % 1 === 0) {
      ctx.fillStyle = C.j;
      ctx.fillRect(5 + w, 4 + done * 2, 1, 1);
    }
  }
  if (spec.mode === 'busy') {
    ctx.fillStyle = C.j;
    for (const [x, y] of SPIN[(spec.phase ?? frame) % SPIN.length]) ctx.fillRect(16 + x, 10 + y, 1, 1);
  } else if (spec.mode === 'ok') {
    ctx.fillStyle = '#8fe3a0';
    for (const [x, y] of CHECK) ctx.fillRect(14 + x, 8 + y, 1, 1);
  } else if (spec.mode === 'err') {
    ctx.fillStyle = '#ff9a4a';
    ctx.fillRect(17, 7, 1, 3);
    ctx.fillRect(17, 11, 1, 1);
  }
  if (spec.progress != null) {
    ctx.fillStyle = C.S;
    ctx.fillRect(5, 12, 14, 1);
    ctx.fillStyle = C.j;
    ctx.fillRect(5, 12, Math.round(14 * Math.max(0, Math.min(1, spec.progress))), 1);
  }
}

function renderTerminal(ctx, spec, frame) {
  ctx.clearRect(0, 0, T_W, T_H);
  const lit = (spec.lit ?? 0) > 0;
  const bob = frame % 2; // the whole object drifts one pixel on the slow clock

  ctx.save();
  ctx.translate(0, bob);
  fillPixels(ctx, terminalGrid(lit).map((r) => r.join('')), 0, 0, (ch) => C[ch]);

  // the screen (x 4..19, y 3..12): a cursor, then exactly one decorative glyph
  if (spec.lit === 1 && frame % 2 === 0) {
    ctx.fillStyle = C.g;
    ctx.fillRect(7, 10, 3, 1);
  }
  if (spec.lit === 2 && spec.glyph) {
    const x = 10;
    const y = 5;
    drawText(ctx, spec.glyph, x, y, C.g);
    ctx.fillStyle = C.j; // a brighter core pixel on the glyph
    ctx.fillRect(x + 1, y + 2, 1, 1);
  }
  if (spec.lit === 3) drawSession(ctx, spec, frame);
  // a key pressed on the keyboard hint lights up
  if (spec.key != null) {
    ctx.fillStyle = C.j;
    ctx.fillRect(4 + (Math.abs(spec.key) % 8) * 2, 20 + (spec.key % 2), 1, 1);
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Depth anomaly                                                       */
/* ------------------------------------------------------------------ */

const D = 40;
const SLAB = ['#1c2126', '#242a31', '#242a31', '#2d343b', '#3b424a'];

/*
 * A localized tear in the backdrop: short, dark pixel runs (like torn scan
 * lines) that slip sideways in bands, with a few detached fragments. It is a
 * small, near-black patch with a handful of cooler pixels, never a sphere,
 * orb or portal and never a screen-wide effect.
 *   coherence 0..1  how formed it is (1 whole, 0 gone)
 *   near      0..1  proximity of the pet: bigger offsets
 *   intensity 0..2  a brief surge: bigger offsets, a few more cool pixels
 *   phase           integer step that re-rolls the displacement (set by the
 *                   encounter's own timeline, so there is no extra loop)
 *   seed            fixed per encounter: a different tear every time
 */
function renderDistortion(ctx, spec) {
  ctx.clearRect(0, 0, D, D);

  const coh = clamp(spec.coherence ?? 1, 0, 1);
  if (coh <= 0.03) return;

  const near = spec.near || 0;
  const inten = spec.intensity || 0;
  const seed = spec.seed || 1;
  const phase = spec.phase || 0;
  const cx = 19.5;
  const cy = 19.5;
  const H = 3 + 9 * coh; // half-height in rows
  const W = 4 + 9 * coh; // half-width in columns
  const amp = 1 + near * 1.5 + inten * 1.8;
  const cool = 0.008 + near * 0.01 + inten * 0.03;
  const dot = (x, y, col) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 1, 1);
  };

  for (let y = Math.floor(cy - H); y <= Math.ceil(cy + H); y++) {
    const ny = (y - cy) / H;
    if (Math.abs(ny) > 1) continue;

    // bands of 2-3 rows slip together (a tear, not noise)
    const band = Math.floor((y + seed) / 3);
    const shift = Math.round((createRng(seed * 131 + band * 17 + phase * 977)() - 0.5) * 2 * amp);
    const skew = Math.round(ny * (0.8 + near * 1.6)); // a slight perspective inconsistency
    const rng = createRng(seed * 7919 + y * 104729 + phase * 31);
    // each band has its own width: a ragged tear, not a rounded shape
    const bandW = 0.35 + 0.85 * createRng(seed * 53 + band * 29 + 7)();
    const hw = W * bandW * (1 - 0.35 * Math.abs(ny) ** 2) * (0.85 + 0.3 * rng());

    // broken runs across the row
    let x = Math.floor(cx - hw);
    const xEnd = Math.ceil(cx + hw);
    while (x <= xEnd) {
      const run = 2 + Math.floor(rng() * 5);
      const gap = 1 + Math.floor(rng() * (3 - coh * 1.5));
      if (rng() < 0.3 + 0.7 * coh) {
        for (let i = 0; i < run && x + i <= xEnd; i++) {
          const r = rng();
          const col = r < 0.07 ? '#000000' : r < 0.07 + cool ? '#2fa6c4' : SLAB[Math.floor(rng() * SLAB.length)];
          dot(x + i + shift + skew, y, col);
        }
      }
      x += run + gap;
    }

    // detached fragments drift off as coherence is lost
    if (rng() < 0.2 * (1.4 - coh)) {
      const side = rng() < 0.5 ? -1 : 1;
      const fx = Math.round(cx + side * (hw + 2 + rng() * 3)) + shift;
      dot(fx, y, SLAB[3]);
      if (rng() < 0.5) dot(fx + side, y, SLAB[1]);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Shared drawing helpers for the activity props                       */
/* ------------------------------------------------------------------ */

const dot = (ctx, x, y, c) => {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
};

// rows of palette characters ('.' is empty)
function paint(ctx, rows, x0, y0, pal) {
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch !== '.' && pal[ch]) dot(ctx, x0 + x, y0 + y, pal[ch]);
    }
  }
}

// the same rows centred on (cx, cy)
const paintAt = (ctx, rows, cx, cy, pal) =>
  paint(ctx, rows, Math.round(cx - rows[0].length / 2), Math.round(cy - rows.length / 2), pal);

// a restrained dithered glow ring between r0 and r1 around (cx, cy)
function glow(ctx, cx, cy, r0, r1, c, frame = 0, alpha = 0.45) {
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let y = Math.floor(cy - r1); y <= Math.ceil(cy + r1); y++) {
    for (let x = Math.floor(cx - r1); x <= Math.ceil(cx + r1); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d >= r0 && d <= r1 && (x + y + frame) % 2 === 0) dot(ctx, x, y, c);
    }
  }
  ctx.restore();
}

// a floor contact shadow: a dithered dark ellipse
function floorShadow(ctx, cx, y, rx) {
  for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const solid = Math.abs(x + 0.5 - cx) < rx * 0.6;
    if (solid || x % 2 === 0) dot(ctx, x, y, C.f);
  }
}

// Shared hues for magical things: rim, body, core, white-hot.
const HUES = {
  cyan: { o: '#1d4750', b: '#2fa6c4', c: '#8bd9e8', w: '#e2fbff' },
  violet: { o: '#3a2a6e', b: '#7a5cd6', c: '#b48cff', w: '#f1e8ff' },
  gold: { o: '#5a4210', b: '#b88a1e', c: '#ffd24a', w: '#fff6d6' },
  green: { o: '#1f4a2e', b: '#3f8f5a', c: '#8fe3a0', w: '#eafff0' },
  ember: { o: '#5a1f10', b: '#c4502f', c: '#ff9a4a', w: '#fff0d6' },
  rose: { o: '#4a1a33', b: '#b04a7a', c: '#ff8aa8', w: '#ffe8f0' },
  silver: { o: '#3b424a', b: '#8a949c', c: '#cfd6dc', w: '#f4f4f4' },
};
export const HUE_NAMES = Object.keys(HUES);
const hue = (name) => HUES[name] || HUES.cyan;

/* ------------------------------------------------------------------ */
/* Red yarn ball                                                       */
/* ------------------------------------------------------------------ */

const Y_W = 13;
const Y_H = 10;
const YARN = { r: '#d23c46', d: '#8e2230', h: '#ff8f86', k: '#4a0f16' };

/*
 * A small ball of red wool: wound strands that turn as it rolls (`roll`
 * steps the winding), a highlight, a dark underside and, on the floor, a
 * contact shadow. squash: flattened on a landing; air: no shadow;
 * thread: -1 / 1 a loose end trailing on that side.
 */
function renderYarn(ctx, spec) {
  ctx.clearRect(0, 0, Y_W, Y_H);
  const roll = spec.roll || 0;
  const sq = spec.squash ? 1 : 0;
  if (!spec.air) floorShadow(ctx, 6.5, 9, 3.5 + sq);

  const cx = 6.5;
  const cy = 5 + sq * 0.5;
  const rx = 3.6 + sq * 0.7;
  const ry = 3.6 - sq * 0.7;
  for (let y = 0; y < Y_H - 1; y++) {
    for (let x = 0; x < Y_W; x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      const d = nx * nx + ny * ny;
      if (d > 1) continue;
      let c = YARN.r;
      if ((x + y * 2 + roll) % 4 === 0) c = YARN.d; // the winding
      if ((x * 2 - y + roll * 3 + 40) % 6 === 0) c = YARN.d; // the cross-wound strands
      if (d > 0.72 && nx + ny > 0.3) c = YARN.k; // shaded underside
      if (nx < -0.25 && ny < -0.25 && d < 0.55) c = YARN.h; // highlight
      dot(ctx, x, y, c);
    }
  }

  const side = spec.thread || 0;
  if (side) {
    const x0 = side > 0 ? 10 : 2;
    for (let i = 0; i < 3; i++) dot(ctx, x0 + side * i, 8 + ((i + roll) % 2), YARN.r);
  }
}

/* ------------------------------------------------------------------ */
/* Food bowl                                                           */
/* ------------------------------------------------------------------ */

const B_W = 16;
const B_H = 10;
const BOWL_ROWS = ['.kRRRRRRRRRRRRk.', '.kbbbbbbbbbbbbk.', '..kbbEbbbbEbbk..', '..kbbbbbbbbbbk..', '...kkkkkkkkkk...'];
const BOWL = { k: '#10252b', R: '#5f9aa8', b: '#2c5866', E: '#8bd9e8' };
const FOODS = {
  kibble: ['#a0603a', '#d08a4a', '#6e3c22'],
  fish: ['#9fb3c0', '#cfd6dc', '#5f6f7a'],
  cream: ['#e8e2d0', '#f4f4f4', '#b8b09a'],
};

/*
 * A small bowl conjured for a meal. fill 0..3 is how much is left
 * (each bite lowers it); food: 'kibble' | 'fish' | 'cream'; glint a
 * brief sparkle when it appears.
 */
function renderBowl(ctx, spec, frame) {
  ctx.clearRect(0, 0, B_W, B_H);
  floorShadow(ctx, 8, 9, 6);
  paint(ctx, BOWL_ROWS, 0, 4, BOWL);

  const fill = Math.max(0, Math.min(3, spec.fill ?? 3));
  const [base, light, dark] = FOODS[spec.food] || FOODS.kibble;
  if (spec.food === 'cream') {
    if (fill > 0) for (let x = 3; x <= 12; x++) dot(ctx, x, 4, x % 3 ? base : light);
  } else {
    // a heap: rows from the rim upward, narrower as it rises
    for (let r = 0; r < fill; r++) {
      const y = 4 - r;
      for (let x = 3 + r * 2; x <= 12 - r * 2; x++) {
        const h = (x * 7 + y * 13 + (spec.seed || 0)) % 5;
        dot(ctx, x, y, h === 0 ? dark : h === 1 ? light : base);
      }
    }
    if (spec.food === 'fish' && fill > 1) paint(ctx, ['.ll.l', 'lllll', '.ll.l'], 5, 4 - fill, { l: light });
  }
  if (spec.glint) {
    const c = '#f4f4f4';
    const x = frame % 2 ? 12 : 4;
    dot(ctx, x, 1, c);
    dot(ctx, x - 1, 2, c);
    dot(ctx, x + 1, 2, c);
    dot(ctx, x, 3, c);
  }
}

/* ------------------------------------------------------------------ */
/* Wisp                                                                */
/* ------------------------------------------------------------------ */

const WI = 11;

/*
 * A tiny luminous creature: a white-hot core, a soft body and a dithered
 * glow that flickers on the slow clock and with its own `phase`. dir -1 / 1
 * trails a short tail behind it; hue from HUES.
 */
function renderWisp(ctx, spec, frame) {
  ctx.clearRect(0, 0, WI, WI);
  const h = hue(spec.hue);
  const f = (frame + (spec.phase || 0)) % 3;
  const cx = 5.5;
  const cy = 5.5;
  glow(ctx, cx, cy, 2.6, f === 1 ? 4.6 : 4, h.o, f);
  for (let y = 0; y < WI; y++) {
    for (let x = 0; x < WI; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < 1.1) dot(ctx, x, y, h.w);
      else if (d < 1.9) dot(ctx, x, y, h.c);
      else if (d < 2.6 && (x + y + f) % 3 !== 0) dot(ctx, x, y, h.b);
    }
  }
  const dir = spec.dir || 0;
  if (dir) {
    for (let i = 0; i < 2 + (f % 2); i++) dot(ctx, cx - dir * (3 + i) - 0.5, cy + (i % 2 ? 0 : 1) - 0.5, i ? h.b : h.c);
  }
}

/* ------------------------------------------------------------------ */
/* Portal                                                              */
/* ------------------------------------------------------------------ */

const PO_W = 24;
const PO_H = 26;

/*
 * A miniature portal: an upright oval that opens (open 0..1), its rim
 * turning with `phase`, a deep interior with a few far stars, and
 * something peeking out (peek: 'eyes' | 'paw' | 'glow').
 */
function renderPortal(ctx, spec, frame) {
  ctx.clearRect(0, 0, PO_W, PO_H);
  const open = Math.max(0, Math.min(1, spec.open ?? 1));
  if (open <= 0.02) return;
  const h = hue(spec.hue || 'violet');
  const cx = 12;
  const cy = 13;
  const rx = 1 + 8.5 * open;
  const ry = 1.5 + 10.5 * open;
  const phase = spec.phase || 0;

  for (let y = 0; y < PO_H; y++) {
    for (let x = 0; x < PO_W; x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      const d = Math.sqrt(nx * nx + ny * ny);
      if (d > 1.18) continue;
      if (d > 0.86) {
        // the rim: bright arcs that turn
        const a = Math.atan2(ny, nx);
        const k = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 12 + phase) % 4;
        if (d > 1.04) {
          if ((x + y + frame) % 2 === 0) dot(ctx, x, y, h.o);
        } else dot(ctx, x, y, k === 0 ? h.w : k === 1 ? h.c : h.b);
      } else {
        const star = ((x * 31 + y * 17 + Math.floor(phase / 3)) % 23 === 0) && d < 0.75;
        dot(ctx, x, y, star ? h.c : d > 0.7 ? h.o : '#0b0820');
      }
    }
  }

  if (open < 0.7) return;
  if (spec.peek === 'eyes') {
    const blink = frame % 4 === 3;
    const c = '#ffd24a';
    if (!blink) {
      dot(ctx, cx - 3, cy - 1, c);
      dot(ctx, cx - 2, cy - 1, c);
      dot(ctx, cx + 1, cy - 1, c);
      dot(ctx, cx + 2, cy - 1, c);
    } else {
      dot(ctx, cx - 3, cy - 1, h.o);
      dot(ctx, cx + 2, cy - 1, h.o);
    }
  } else if (spec.peek === 'paw') {
    paint(ctx, ['.ss.', 'sSSs', 'SsSs', '.SS.', '.SS.'], cx - 2, cy + 2, { s: '#8a949c', S: '#cfd6dc' });
  } else if (spec.peek === 'glow') {
    glow(ctx, cx, cy, 0, 3, h.w, frame, 0.6);
  }
}

/* ------------------------------------------------------------------ */
/* Arcane glyph circle (front / back halves)                           */
/* ------------------------------------------------------------------ */

const R_W = 50;
const R_H = 16;

/*
 * A protective circle on the floor around the cat. Two props draw the two
 * halves (half: 'back' behind the cat, 'front' in front), so the cat
 * stands inside it. power 0..1 is its radius, phase turns the rune ticks.
 */
function renderRing(ctx, spec, frame) {
  ctx.clearRect(0, 0, R_W, R_H);
  const power = Math.max(0, Math.min(1, spec.power ?? 1));
  if (power <= 0.03) return;
  const h = hue(spec.hue);
  const cx = 25;
  const cy = 8;
  const front = spec.half !== 'back';
  const keep = (y) => (front ? y >= cy - 0.5 : y < cy - 0.5);

  const ellipse = (rx, ry, c, every = 1) => {
    const n = Math.max(12, Math.round(rx * 4));
    for (let i = 0; i < n; i += every) {
      const a = (i / n) * Math.PI * 2;
      const x = cx + Math.cos(a) * rx;
      const y = cy + Math.sin(a) * ry;
      if (keep(y)) dot(ctx, x, y, c);
    }
  };

  ellipse(23 * power, 7 * power, h.c);
  ellipse(17 * power, 5.2 * power, h.b, 2);
  // rune ticks between the two rings
  const phase = spec.phase || 0;
  for (let i = 0; i < 8; i++) {
    const a = ((i + phase * 0.25) / 8) * Math.PI * 2;
    const x = cx + Math.cos(a) * 20 * power;
    const y = cy + Math.sin(a) * 6.1 * power;
    if (!keep(y)) continue;
    dot(ctx, x, y, h.w);
    dot(ctx, x + 1, y, (i + frame) % 2 ? h.c : h.b);
  }
}

/* ------------------------------------------------------------------ */
/* Trinkets: small objects of many kinds                               */
/* ------------------------------------------------------------------ */

const TK = 11;

const GOLD = { G: '#ffd24a', g: '#b88a1e', k: '#2a2008', w: '#fff6d6' };
const METAL = { S: '#cfd6dc', s: '#8a949c', k: '#3b424a', w: '#f4f4f4' };
const COVERS = {
  cyan: ['#243038', '#3a4a56'],
  violet: ['#2a1f4a', '#4a3a7e'],
  red: ['#4a1219', '#8e2230'],
  green: ['#163824', '#2c5c3c'],
  gold: ['#4a3810', '#7a5c1e'],
};
const LIQUIDS = {
  teal: ['#1d4750', '#2fa6c4', '#8bd9e8'],
  violet: ['#3a2a6e', '#7a5cd6', '#b48cff'],
  green: ['#1f4a2e', '#3f8f5a', '#8fe3a0'],
  red: ['#4a1219', '#c4384a', '#ff8aa8'],
  gold: ['#5a4210', '#b88a1e', '#ffd24a'],
  silver: ['#3b424a', '#8a949c', '#e6edf2'],
  ember: ['#5a1f10', '#c4502f', '#ff9a4a'],
};
export const LIQUID_NAMES = Object.keys(LIQUIDS);

const COIN_FACES = [
  ['..ggg..', '.gGGGg.', 'gGGGGGg', 'gGGGGGg', 'gGGGGGg', '.gGGGg.', '..ggg..'],
  ['..gg...', '.gGGg..', '.gGGg..', '.gGGg..', '.gGGg..', '.gGGg..', '..gg...'],
  ['...g...', '...g...', '...g...', '...g...', '...g...', '...g...', '...g...'],
  ['..ggg..', '.gGGGg.', 'gGgggGg', 'gGgGgGg', 'gGgggGg', '.gGGGg.', '..ggg..'],
];
const COIN_SYMBOLS = {
  star: ['.k.', 'kkk', 'k.k'],
  moon: ['kk.', 'k..', 'kk.'],
  eye: ['.k.', 'kwk', '.k.'],
  rune: ['k.k', '.k.', 'k.k'],
  crown: ['k.k', 'kkk', '...'],
  key: ['.k.', '.kk', '.k.'],
};
export const COIN_SYMBOL_NAMES = Object.keys(COIN_SYMBOLS);

const SIGILS = {
  eye: ['....c....', '...cbc...', '..cb.bc..', '.cb.w.bc.', 'cb.wcw.bc', '.cb.w.bc.', '..cb.bc..', '...cbc...', '....c....'],
  spiral: ['..ccccc..', '.c.....c.', 'c..bbb..c', 'c.b...b.c', 'c.b.w.b.c', 'c.b..bb.c', 'c..b....c', '.c..bbbc.', '..c......'],
  tri: ['....c....', '...c.c...', '...c.c...', '..c...c..', '..c.w.c..', '.c.....c.', '.c..b..c.', 'c.......c', 'ccccccccc'],
  knot: ['.cc...cc.', 'c..c.c..c', 'c...c...c', '.c.c.c.c.', '..c.w.c..', '.c.c.c.c.', 'c...c...c', 'c..c.c..c', '.cc...cc.'],
};
export const SIGIL_NAMES = Object.keys(SIGILS);

/*
 * Every trinket: rows of palette characters plus a palette, or a draw
 * function. spec fields: name, frame, turn (coins), sym (coin symbol),
 * tint (cover / liquid / hue name), glow (a soft halo), shape (sigils).
 */
const TRINKETS = {
  coin: (ctx, s) => {
    const turn = Math.max(0, Math.min(3, s.turn || 0));
    paintAt(ctx, COIN_FACES[turn], 5.5, 5.5, GOLD);
    if (turn === 0) paintAt(ctx, COIN_SYMBOLS[s.sym] || COIN_SYMBOLS.star, 5.5, 5.5, GOLD);
  },
  tome: (ctx, s) => {
    const [dk, md] = COVERS[s.tint] || COVERS.cyan;
    paintAt(ctx, ['.TTTTTTT.', 'TttttttTp', 'TttGGttTp', 'TttGGttTp', 'TttttttTp', '.TTTTTTTp'], 5.5, 5.5, {
      T: dk,
      t: md,
      G: '#b88a1e',
      p: '#cfd6dc',
    });
  },
  page: (ctx, s) =>
    paintAt(ctx, s.frame % 2 ? ['.ppq', 'pmmq', 'pppq', 'pmm.', 'qqq.'] : ['pppq', 'pmmq', 'pppq', 'pmmq', 'qqqq'], 5.5, 5.5, {
      p: '#cfd6dc',
      m: '#56606a',
      q: '#8a949c',
    }),
  gem: (ctx) =>
    paintAt(ctx, ['..CCC..', '.CWCCc.', 'CWCCCCc', 'cCCCCcc', '.cCCcc.', '..ccc..', '...c...'], 5.5, 5.5, {
      C: '#6fe3ff',
      c: '#2fa6c4',
      W: '#f4f4f4',
    }),
  gear: (ctx, s) =>
    paintAt(
      ctx,
      s.frame % 2
        ? ['k..k..k', '.SSSSS.', '.SskSs.', 'kSkkkSk', '.SskSs.', '.SSSSS.', 'k..k..k']
        : ['.k.k.k.', 'kSSSSSk', '.SskSs.', 'kSkkkSk', '.SskSs.', 'kSSSSSk', '.k.k.k.'],
      5.5,
      5.5,
      METAL
    ),
  spring: (ctx) => paintAt(ctx, ['SSSSS', '...s.', '.SSS.', '.s...', '.SSS.', '...s.', 'SSSSS'], 5.5, 5.5, METAL),
  bolt: (ctx) => paintAt(ctx, ['SSS', 'kSk', '.s.', '.S.', '.s.', '.S.'], 5.5, 5.5, METAL),
  lens: (ctx) =>
    paintAt(ctx, ['.SSS.', 'SwcbS', 'ScbbS', 'SbbbS', '.SSS.'], 5.5, 5.5, { ...METAL, c: '#8bd9e8', b: '#1d4750' }),
  crystal: (ctx) =>
    paintAt(ctx, ['..c..', '.cVc.', '.VwV.', 'cVVVc', 'VVVVD', '.VVD.', '.VDD.', '..D..'], 5.5, 5.5, {
      c: '#f1e8ff',
      V: '#b48cff',
      D: '#5b3fa8',
      w: '#ffffff',
    }),
  vial: (ctx, s) => {
    const [dk, md, lt] = LIQUIDS[s.tint] || LIQUIDS.teal;
    paintAt(ctx, ['.kk.', '.SS.', '.ss.', 'S..S', 'SllS', 'SmlS', 'SmmS', 'SddS', '.SS.'], 5.5, 5.5, {
      k: '#6e3c22',
      S: '#cfd6dc',
      s: '#8a949c',
      l: lt,
      m: md,
      d: dk,
    });
  },
  herb: (ctx) =>
    paintAt(ctx, ['.N.N.', 'NnNnN', '.NnN.', '..n..', '..n..', '.n...'], 5.5, 5.5, { N: '#8fe3a0', n: '#3f8f5a' }),
  shroom: (ctx) =>
    paintAt(ctx, ['.rrr.', 'rwrwr', 'rrrrr', '.sSs.', '.sSs.'], 5.5, 5.5, {
      r: '#d23c46',
      w: '#f4f4f4',
      S: '#cfd6dc',
      s: '#8a949c',
    }),
  star: (ctx, s, frame) => {
    const h = hue(s.tint || 'gold');
    if (s.glow !== false) glow(ctx, 5.5, 5.5, 2.5, 4, h.o, frame);
    paintAt(ctx, (s.frame + frame) % 2 ? ['.c.', 'cwc', '.c.'] : ['..c..', '.ccc.', 'ccwcc', '.ccc.', '.c.c.'], 5.5, 5.5, h);
  },
  feather: (ctx) => paintAt(ctx, ['..w', '.wS', '.wS', 'wS.', 'wS.', 'S..', 's..'], 5.5, 5.5, METAL),
  key: (ctx) => paintAt(ctx, ['.GG....', 'G..GGGG', '.GG.G.G'], 5.5, 5.5, GOLD),
  fish: (ctx) =>
    paintAt(ctx, ['..SSS.S', '.SwSSSS', 'SSSSSS.', '.sSSSsS', '..sss.s'], 5.5, 5.5, { ...METAL, w: '#2a2008' }),
  flower: (ctx) =>
    paintAt(ctx, ['.h.h.', 'hhGhh', '.hhh.', '..n..', '.nn..', '..n..'], 5.5, 5.5, {
      h: '#ff8aa8',
      G: '#ffd24a',
      n: '#3f8f5a',
    }),
  moth: (ctx, s, frame) =>
    paintAt(ctx, (s.frame + frame) % 2 ? ['w...w', 'ww.ww', '.wkw.', 'w.k.w'] : ['.....', 'ww.ww', 'wwkww', '..k..'], 5.5, 5.5, {
      w: '#e6edf2',
      k: '#56606a',
    }),
  // a smoke puff growing and thinning out over frames 0..3
  puff: (ctx, s) => {
    const fr = Math.max(0, Math.min(3, s.frame || 0));
    const r = [2, 3.2, 4.4, 5][fr];
    const keep = [1, 0.95, 0.65, 0.35][fr];
    for (let y = 0; y < TK; y++) {
      for (let x = 0; x < TK; x++) {
        const d = Math.hypot(x + 0.5 - 5.5, (y + 0.5 - 5.5) * 1.15);
        if (d > r) continue;
        const h = ((x * 73856093) ^ (y * 19349663) ^ (fr * 83492791)) >>> 0;
        if ((h % 100) / 100 > keep) continue;
        dot(ctx, x, y, d < r * 0.45 ? '#cfd6dc' : d < r * 0.8 ? '#aab4bd' : '#8a949c');
      }
    }
  },
  // a sparkle burst expanding over frames 0..2
  burst: (ctx, s) => {
    const h = hue(s.tint || 'gold');
    const fr = Math.max(0, Math.min(2, s.frame || 0));
    const r = [1.5, 3, 4.5][fr];
    dot(ctx, 5, 5, fr < 2 ? h.w : h.c);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + fr * 0.2;
      dot(ctx, 5 + Math.cos(a) * r, 5 + Math.sin(a) * r, i % 2 ? h.c : h.w);
      if (fr > 0 && i % 2 === 0) dot(ctx, 5 + Math.cos(a) * (r - 1.2), 5 + Math.sin(a) * (r - 1.2), h.b);
    }
  },
  // a strange floating symbol (shape from SIGILS), shimmering by frame
  sigil: (ctx, s, frame) => {
    const h = hue(s.tint || 'violet');
    glow(ctx, 5.5, 5.5, 3.5, 5.2, h.o, frame + (s.frame || 0));
    const rows = SIGILS[s.shape] || SIGILS.eye;
    const pal = (s.frame + frame) % 2 ? { c: h.c, b: h.b, w: h.w } : { c: h.b, b: h.c, w: h.w };
    paintAt(ctx, rows, 5.5, 5.5, pal);
  },
};
export const TRINKET_NAMES = Object.keys(TRINKETS);

function renderTrinket(ctx, spec, frame) {
  ctx.clearRect(0, 0, TK, TK);
  const draw = TRINKETS[spec.name];
  if (!draw) return;
  if (spec.glow && spec.name !== 'star' && spec.name !== 'sigil') glow(ctx, 5.5, 5.5, 3.5, 5, hue(spec.glowHue).b, frame);
  draw(ctx, { frame: 0, ...spec }, frame);
}

/* ------------------------------------------------------------------ */
/* Star chart and the sky above it                                     */
/* ------------------------------------------------------------------ */

const CH_W = 24;
const CH_H = 14;
const PARCH = { p: '#cdbf98', s: '#9c8e68', e: '#6e6248', i: '#3b424a', c: '#2fa6c4', w: '#e2fbff' };
// chart stars (x, y) on the unfolded sheet
const CHART_STARS = [[5, 4], [9, 7], [13, 4], [17, 8], [11, 10], [19, 4]];

/*
 * A small star chart: rolled (unfold 0), half open (1), open (2). Open, it
 * shows a few charted stars joined by dotted ink; mark (index) is the star
 * the cat's paw is on.
 */
function renderChart(ctx, spec) {
  ctx.clearRect(0, 0, CH_W, CH_H);
  const u = Math.max(0, Math.min(2, spec.unfold ?? 2));
  floorShadow(ctx, 12, 13, u === 0 ? 5 : u === 1 ? 8 : 11);
  if (u === 0) {
    paint(ctx, ['.eeeeeeeeee.', 'epppppppppps', 'essssssssse.'], 6, 9, PARCH);
    return;
  }
  const x0 = u === 1 ? 6 : 1;
  const x1 = u === 1 ? 17 : 22;
  for (let y = 2; y <= 12; y++) {
    for (let x = x0; x <= x1; x++) {
      const edge = y === 2 || y === 12 || x === x0 || x === x1;
      dot(ctx, x, y, edge ? PARCH.e : (x + y) % 7 === 0 ? PARCH.s : PARCH.p);
    }
  }
  if (u === 1) return;
  // dotted ink between charted stars
  for (let i = 0; i < CHART_STARS.length - 1; i++) {
    const [ax, ay] = CHART_STARS[i];
    const [bx, by] = CHART_STARS[i + 1];
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let k = 1; k < n; k += 2) dot(ctx, ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, PARCH.s);
  }
  CHART_STARS.forEach(([x, y], i) => {
    const on = spec.mark === i;
    dot(ctx, x, y, on ? PARCH.w : PARCH.i);
    if (on) {
      dot(ctx, x - 1, y, PARCH.c);
      dot(ctx, x + 1, y, PARCH.c);
      dot(ctx, x, y - 1, PARCH.c);
      dot(ctx, x, y + 1, PARCH.c);
    }
  });
}

const SK_W = 44;
const SK_H = 28;

// Constellations the cat can discover: stars on the sky canvas and links.
export const CONSTELLATIONS = {
  cat: { stars: [[10, 6], [14, 12], [22, 10], [30, 12], [34, 6], [32, 18], [22, 22], [12, 18]], links: [[0, 1], [1, 2], [2, 3], [3, 4], [3, 5], [5, 6], [6, 7], [7, 1]] },
  fish: { stars: [[6, 14], [12, 9], [22, 8], [31, 13], [37, 9], [37, 19], [31, 14], [22, 20], [12, 19]], links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 0]] },
  crown: { stars: [[8, 20], [8, 8], [15, 14], [22, 5], [29, 14], [36, 8], [36, 20]], links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0]] },
  key: { stars: [[8, 10], [13, 6], [17, 11], [13, 15], [24, 11], [31, 11], [36, 11], [31, 16], [36, 16]], links: [[0, 1], [1, 2], [2, 3], [3, 0], [2, 4], [4, 5], [5, 6], [5, 7], [6, 8]] },
  spiral: { stars: [[22, 14], [26, 12], [27, 17], [21, 20], [15, 15], [17, 8], [26, 5], [34, 10], [34, 20]], links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8]] },
};
export const CONSTELLATION_NAMES = Object.keys(CONSTELLATIONS);

/*
 * The patch of sky the cat maps: stars (positions, which may be moved by
 * the behavior), lit (how many are bright), hidden (indices not yet in
 * place: they arrive from depth as separate props), links drawn so far
 * (drawn), found (the pattern recognised: the whole figure brightens).
 */
function renderSky(ctx, spec, frame) {
  ctx.clearRect(0, 0, SK_W, SK_H);
  const stars = spec.stars || [];
  const links = spec.links || [];
  const lit = spec.lit ?? stars.length;
  const found = !!spec.found;
  const line = found ? '#ffd24a' : '#2fa6c4';

  const hidden = new Set(spec.hidden || []);
  links.slice(0, spec.drawn ?? 0).forEach(([a, b], i) => {
    if (hidden.has(a) || hidden.has(b)) return;
    const [ax, ay] = stars[a] || [0, 0];
    const [bx, by] = stars[b] || [0, 0];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
    ctx.save();
    ctx.globalAlpha = found ? 0.9 : 0.6;
    for (let k = 1; k < n; k++) if ((k + i + frame) % 2 === 0) dot(ctx, ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, line);
    ctx.restore();
  });

  stars.forEach(([x, y], i) => {
    if (hidden.has(i)) return;
    const on = i < lit;
    const tw = (i + frame + (spec.phase || 0)) % 3 === 0;
    if (!on) {
      dot(ctx, x, y, '#3b424a');
      return;
    }
    const c = found ? '#ffd24a' : '#8bd9e8';
    dot(ctx, x, y, found || tw ? '#ffffff' : c);
    if (found || !tw) {
      dot(ctx, x - 1, y, c);
      dot(ctx, x + 1, y, c);
      dot(ctx, x, y - 1, c);
      dot(ctx, x, y + 1, c);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Alchemy vessel                                                      */
/* ------------------------------------------------------------------ */

const V_W = 18;
const V_H = 17;
const IRON = { k: '#0a0c0f', d: '#1c2025', m: '#2d343b', l: '#56606a' };

/*
 * A miniature cauldron: iron pot, rim light, three short legs, a liquid
 * surface tinted by `liquid`, bubbles stepping with `phase` (more while
 * `boil`), a ladle while stirring (stir 0..2 its angle), a glow and
 * coloured vapour when `vapor`, and foam spilling over when `overflow`.
 */
function renderVessel(ctx, spec, frame) {
  ctx.clearRect(0, 0, V_W, V_H);
  const [dk, md, lt] = LIQUIDS[spec.liquid] || LIQUIDS.teal;
  const phase = spec.phase || 0;
  floorShadow(ctx, 9, 16, 7);

  // body
  for (let y = 7; y <= 14; y++) {
    const hw = Math.round(7.5 - ((y - 7) * (y - 7)) / 12);
    for (let x = 9 - hw; x <= 8 + hw; x++) {
      const edgeL = x === 9 - hw;
      const edgeR = x === 8 + hw;
      dot(ctx, x, y, edgeL ? IRON.l : edgeR || y === 14 ? IRON.k : y === 8 ? IRON.m : IRON.d);
    }
  }
  // legs
  for (const x of [4, 9, 13]) dot(ctx, x, 15, IRON.d);
  // rim and liquid surface
  for (let x = 1; x <= 16; x++) dot(ctx, x, 6, x === 1 ? IRON.l : x === 16 ? IRON.k : IRON.m);
  for (let x = 3; x <= 14; x++) dot(ctx, x, 5, (x + phase) % 5 === 0 ? lt : md);
  dot(ctx, 2, 5, IRON.l);
  dot(ctx, 15, 5, IRON.k);

  // bubbles
  const n = spec.boil ? 4 : 2;
  for (let i = 0; i < n; i++) {
    const x = 4 + ((i * 5 + phase * 3) % 10);
    const y = 4 - ((phase + i) % (spec.boil ? 4 : 3));
    dot(ctx, x, y, (i + frame) % 2 ? lt : md);
  }
  if (spec.glow) glow(ctx, 9, 4, 1, 4, lt, frame, 0.35);
  if (spec.vapor) {
    for (let i = 0; i < 5; i++) {
      const x = 5 + ((i * 3 + phase) % 9);
      const y = 1 + ((i + phase) % 3);
      if ((x + y + frame) % 2 === 0) dot(ctx, x, y, lt);
    }
  }
  if (spec.overflow) {
    for (let x = 2; x <= 15; x += 2) dot(ctx, x, 4 + ((x + phase) % 2), lt);
    dot(ctx, 1, 7 + (phase % 2), lt);
    dot(ctx, 16, 8 - (phase % 2), lt);
  }
  // the ladle
  if (spec.stir != null) {
    const tip = [[6, 4], [9, 3], [12, 4]][Math.max(0, Math.min(2, spec.stir))];
    const top = [[3, 0], [9, 0], [15, 0]][Math.max(0, Math.min(2, spec.stir))];
    const steps = Math.max(Math.abs(tip[0] - top[0]), Math.abs(tip[1] - top[1]));
    for (let k = 0; k <= steps; k++) {
      dot(ctx, top[0] + ((tip[0] - top[0]) * k) / steps, top[1] + ((tip[1] - top[1]) * k) / steps, k === 0 ? '#9c8e68' : '#6e6248');
    }
  }
}

/* ------------------------------------------------------------------ */
/* Tinkering device                                                    */
/* ------------------------------------------------------------------ */

const DV_W = 18;
const DV_H = 16;
const BRASS = { G: '#ffd24a', g: '#b88a1e', d: '#5a4210' };

/*
 * A miniature contraption assembled in stages (parts 0..3) in one of a few
 * designs (variant 'bot' | 'clock' | 'lamp' | 'orrery'). state: 'off' |
 * 'on' | 'spark' | 'smoke' | 'jitter'; turn: 1 shows its narrower side
 * as the cat turns it around; phase drives what moves.
 */
function renderDevice(ctx, spec, frame) {
  ctx.clearRect(0, 0, DV_W, DV_H);
  const parts = Math.max(0, Math.min(3, spec.parts ?? 3));
  const state = spec.state || 'off';
  const phase = spec.phase || 0;
  const cx = 9;
  const k = spec.turn ? 0.55 : 1;
  const jit = state === 'jitter' ? (phase % 2 ? 1 : -1) : 0;
  const d = (x, y, c) => dot(ctx, cx + (x - cx) * k + jit, y - (state === 'jitter' && phase % 3 === 0 ? 1 : 0), c);
  const on = state === 'on';

  floorShadow(ctx, 9, 15, 6);
  // part 1: the base plinth
  if (parts >= 1) {
    for (let x = 3; x <= 14; x++) {
      d(x, 13, x === 3 ? METAL.S : METAL.s);
      d(x, 14, METAL.k);
    }
  }
  const variant = spec.variant || 'bot';
  if (variant === 'bot') {
    if (parts >= 2) for (let y = 7; y <= 12; y++) for (let x = 5; x <= 12; x++) d(x, y, x === 5 || y === 7 ? METAL.S : METAL.s);
    if (parts >= 2) {
      d(8, 10, on ? '#8fe3a0' : METAL.k);
      d(9, 10, on && phase % 2 ? '#ffd24a' : METAL.k);
    }
    if (parts >= 3) {
      for (let y = 2; y <= 6; y++) for (let x = 6; x <= 11; x++) d(x, y, x === 6 || y === 2 ? METAL.S : METAL.s);
      d(7, 4, on ? '#8bd9e8' : METAL.k);
      d(10, 4, on ? '#8bd9e8' : METAL.k);
      d(8, 1, METAL.s);
      d(8, 0, on && frame % 2 ? '#ff5a5a' : METAL.S);
    }
  } else if (variant === 'clock') {
    if (parts >= 2) {
      for (let y = 4; y <= 12; y++) for (let x = 4; x <= 13; x++) d(x, y, x === 4 || y === 4 ? BRASS.G : BRASS.g);
      for (let y = 6; y <= 11; y++) for (let x = 6; x <= 11; x++) if (Math.hypot(x - 8.5, y - 8.5) < 3) d(x, y, '#e6edf2');
    }
    if (parts >= 3) {
      d(8, 3, BRASS.G);
      d(9, 3, BRASS.G);
      d(7, 2, BRASS.g);
      d(10, 2, BRASS.g);
      const a = on ? phase * 0.8 : 0;
      d(8.5 + Math.round(Math.cos(a) * 2), 8.5 + Math.round(Math.sin(a) * 2), METAL.k);
      d(8.5, 8.5, METAL.k);
    }
  } else if (variant === 'lamp') {
    if (parts >= 2) {
      for (let y = 6; y <= 12; y++) {
        d(6, y, BRASS.g);
        d(11, y, BRASS.d);
      }
      for (let x = 6; x <= 11; x++) d(x, 6, BRASS.G);
    }
    if (parts >= 3) {
      if (on) glow(ctx, cx + jit, 9, 2, 5, '#ffd24a', frame, 0.4);
      for (let y = 7; y <= 11; y++) for (let x = 7; x <= 10; x++) d(x, y, on ? (y === 8 ? '#fff6d6' : '#ffd24a') : '#5b3fa8');
      d(8, 4, BRASS.g);
      d(9, 5, BRASS.g);
    }
  } else {
    // orrery: an arc and turning planets
    if (parts >= 2) for (let i = 0; i <= 12; i++) d(3 + i, 8 - Math.round(Math.sin((i / 12) * Math.PI) * 5), BRASS.g);
    if (parts >= 2) for (let y = 8; y <= 12; y++) d(9, y, BRASS.d);
    if (parts >= 3) {
      d(9, 7, '#ffd24a');
      d(8, 7, '#ffd24a');
      const a = on ? phase * 0.6 : 0.4;
      d(9 + Math.cos(a) * 5, 7 + Math.sin(a) * 2, '#8bd9e8');
      d(9 + Math.cos(a + 2.5) * 3, 7 + Math.sin(a + 2.5) * 1.2, '#ff8aa8');
    }
  }

  if (state === 'spark') {
    const sx = 4 + ((phase * 5) % 10);
    dot(ctx, sx, 3, '#ffd24a');
    dot(ctx, sx + 1, 2, '#fff6d6');
    dot(ctx, sx - 1, 4, '#ff9a4a');
  } else if (state === 'smoke') {
    for (let i = 0; i < 6; i++) {
      const x = 6 + ((i * 3 + phase) % 7);
      const y = 1 + ((i + phase) % 4);
      dot(ctx, x, y, i % 2 ? '#8a949c' : '#aab4bd');
    }
  }
}

/* ------------------------------------------------------------------ */
/* Instruments                                                         */
/* ------------------------------------------------------------------ */

const IN_W = 26;
const IN_H = 14;

/*
 * A tiny chiptune keyboard (variant 'keys': eight keys, the pressed one
 * glows and dips) or floating crystal chimes (variant 'chimes': six bars,
 * the struck one glows and swings). key: index of the key / bar in play.
 */
function renderInstrument(ctx, spec, frame) {
  ctx.clearRect(0, 0, IN_W, IN_H);
  const key = spec.key ?? -1;
  if ((spec.variant || 'keys') === 'keys') {
    floorShadow(ctx, 13, 13, 11);
    for (let x = 1; x <= 24; x++) dot(ctx, x, 6, x === 1 ? METAL.S : METAL.k);
    for (let i = 0; i < 8; i++) {
      const x0 = 1 + i * 3;
      const down = i === key ? 1 : 0;
      for (let y = 7 + down; y <= 10 + down; y++) {
        dot(ctx, x0, y, i === key ? '#8bd9e8' : '#e6edf2');
        dot(ctx, x0 + 1, y, i === key ? '#8bd9e8' : '#cfd6dc');
        dot(ctx, x0 + 2, y, METAL.k);
      }
      if (i === key) glow(ctx, x0 + 1, 7, 1, 3, '#2fa6c4', frame, 0.5);
      if (i % 7 !== 2 && i < 7) for (let y = 7; y <= 8; y++) dot(ctx, x0 + 2, y, '#0a0c0f');
    }
    for (let x = 1; x <= 24; x++) dot(ctx, x, 11, METAL.s);
    dot(ctx, 3, 12, METAL.k);
    dot(ctx, 22, 12, METAL.k);
    return;
  }
  // chimes: a bar and six hanging crystals
  for (let x = 2; x <= 23; x++) dot(ctx, x, 1, x % 2 ? BRASS.g : BRASS.G);
  for (let i = 0; i < 6; i++) {
    const x = 4 + i * 3.5;
    const len = 10 - i;
    const swing = i === key ? (frame % 2 ? 1 : -1) : 0;
    const lit = i === key;
    dot(ctx, x, 2, BRASS.d);
    for (let y = 3; y < 3 + len; y++) {
      const dx = y > 3 + len / 2 ? swing : 0;
      dot(ctx, x + dx, y, lit ? '#f1e8ff' : y % 3 === 0 ? '#b48cff' : '#7a5cd6');
    }
    if (lit) glow(ctx, x, 3 + len / 2, 1, 3, '#b48cff', frame, 0.5);
  }
}

export const PROPS = {
  terminal: { width: T_W, height: T_H, render: renderTerminal },
  distortion: { width: D, height: D, render: renderDistortion },
  yarn: { width: Y_W, height: Y_H, render: renderYarn },
  bowl: { width: B_W, height: B_H, render: renderBowl },
  wisp: { width: WI, height: WI, render: renderWisp },
  portal: { width: PO_W, height: PO_H, render: renderPortal },
  ring: { width: R_W, height: R_H, render: renderRing },
  trinket: { width: TK, height: TK, render: renderTrinket },
  chart: { width: CH_W, height: CH_H, render: renderChart },
  sky: { width: SK_W, height: SK_H, render: renderSky },
  vessel: { width: V_W, height: V_H, render: renderVessel },
  device: { width: DV_W, height: DV_H, render: renderDevice },
  instrument: { width: IN_W, height: IN_H, render: renderInstrument },
};
