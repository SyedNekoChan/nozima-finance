import { createRng, clamp } from '../core/rng.js';
import { drawText, fillPixels } from './sprites.js';

/*
 * NOMOZ.EXE's world-anchored environmental props: small canvases drawn from
 * pixel data, placed in the 3D backdrop by the shared prop layer. Each kind:
 *   { width, height, render(ctx, spec, frame) }
 * `spec` holds only visual fields the encounter sets (never application data).
 * To add a prop: add a kind here, list it in the pet's `props`, and spawn it
 * from a behavior with S.prop(t, id, { kind, sx, sy, z, ... }).
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

export const PROPS = {
  terminal: { width: T_W, height: T_H, render: renderTerminal },
  distortion: { width: D, height: D, render: renderDistortion },
};
