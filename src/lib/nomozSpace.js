import { SPRITE_COLS } from './nomoz.js';

/*
 * NOMOZ.EXE's lightweight 3D space.
 *
 * The backdrop layer carries a CSS `perspective`; the entity is one
 * element moved with translate3d. Positions are kept in SCREEN space
 * (sx, sy = where the sprite's centre appears, z = depth), so walking,
 * bounds and overlap tests all work in the pixels the user sees, and
 * toTransform() converts back into the pre-perspective offset.
 *
 *   z > 0 : closer  (larger, a little stronger)
 *   z < 0 : farther (smaller, a little fainter)
 */

export const PERSPECTIVE = 900;

const Z_RANGE = { wide: [-320, 180], compact: [-220, 120] };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const getZRange = (compact) => Z_RANGE[compact ? 'compact' : 'wide'];

export const scaleAt = (z) => PERSPECTIVE / (PERSPECTIVE - z);

// 0.7 (far) .. 1 (near): depth dims but never hides.
export function alphaAt(z, compact) {
  const [a, b] = getZRange(compact);
  return 0.7 + 0.3 * clamp((z - a) / (b - a), 0, 1);
}

/*
 * Geometry for one measured layer. metrics = { width, height, spriteW,
 * spriteH } in CSS px (the unscaled sprite box).
 */
export function makeGeo(metrics, compact) {
  const { width, height, spriteW, spriteH } = metrics;
  const margin = compact ? 6 : 14;
  // clear of the OVER BUDGET readout along the top edge
  const top = compact ? 32 : 38;

  const geo = {
    width,
    height,
    spriteW,
    spriteH,
    compact,
    margin,
    cell: spriteW / SPRITE_COLS,
    zRange: getZRange(compact),

    half(z) {
      const s = scaleAt(z);
      return [(spriteW * s) / 2, (spriteH * s) / 2];
    },

    bounds(z) {
      const [hw, hh] = geo.half(z);
      let minX = margin + hw;
      let maxX = width - margin - hw;
      let minY = top + hh;
      let maxY = height - margin - hh;
      if (minX > maxX) minX = maxX = width / 2;
      if (minY > maxY) minY = maxY = height / 2;
      return { minX, maxX, minY, maxY };
    },

    clamp(p) {
      const b = geo.bounds(p.z);
      return {
        sx: clamp(p.sx, b.minX, b.maxX),
        sy: clamp(p.sy, b.minY, b.maxY),
        z: p.z,
      };
    },
  };

  return geo;
}

// Screen-space centre + depth -> the element's translate3d.
export function toTransform({ sx, sy, z }, geo) {
  const s = scaleAt(z);
  const ox = geo.width / 2;
  const oy = geo.height / 2;
  const x = ox + (sx - ox) / s - geo.spriteW / 2;
  const y = oy + (sy - oy) / s - geo.spriteH / 2;
  return `translate3d(${x}px, ${y}px, ${z}px)`;
}

/* ------------------------------------------------------------------ */
/* Foreground awareness                                                */
/* ------------------------------------------------------------------ */

const BUSY_SELECTOR =
  'canvas, svg, img, table, input, textarea, select, button, [class*="bg-"]';
const ALWAYS_BUSY = /^(canvas|svg|img|table)$/;

/*
 * Rectangles (relative to the backdrop layer) of foreground blocks that
 * would visually swallow the entity: graphics, tables, controls and
 * anything with a painted background. Plain text is deliberately not
 * counted — the entity can sit behind sparse type. Called only when a
 * behavior is planned, never per frame.
 */
export function scanBusy(layer) {
  const host = layer && layer.parentElement;
  if (!host) return [];

  const lr = layer.getBoundingClientRect();
  const out = [];

  host.querySelectorAll(BUSY_SELECTOR).forEach((el) => {
    if (layer.contains(el)) return;

    const r = el.getBoundingClientRect();
    if (r.width < 12 || r.height < 12) return;

    let w = 1;
    if (!ALWAYS_BUSY.test(el.tagName.toLowerCase())) {
      const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/);
      if (!m) return;
      const parts = m[1].split(',').map((p) => parseFloat(p));
      w = parts.length > 3 ? parts[3] : 1;
      if (!(w > 0.05)) return;
    }

    out.push({
      l: r.left - lr.left,
      t: r.top - lr.top,
      r: r.right - lr.left,
      b: r.bottom - lr.top,
      w,
    });
  });

  return out;
}

// 0 (open backdrop) .. 1 (fully under foreground blocks)
export function overlapAt(geo, busy, sx, sy, z) {
  if (!busy.length) return 0;
  const [hw, hh] = geo.half(z);
  const l = sx - hw;
  const r = sx + hw;
  const t = sy - hh;
  const b = sy + hh;

  let sum = 0;
  for (const o of busy) {
    const ix = Math.max(0, Math.min(r, o.r) - Math.max(l, o.l));
    const iy = Math.max(0, Math.min(b, o.b) - Math.max(t, o.t));
    sum += ix * iy * o.w;
  }
  return Math.min(1, sum / (4 * hw * hh));
}

/*
 * A random reachable spot, preferring open backdrop. Samples several
 * candidates and picks randomly among the least-covered ones, so it is
 * visible-by-intent but never always the same "best" place.
 *   zRange : depth band to sample (default: the full range)
 *   near   : { sx, sy, radius } keeps the spot close to a point
 */
export function pickSpot(geo, busy, rng, { zRange, near, tries = 28 } = {}) {
  const [z0, z1] = zRange || geo.zRange;
  const cands = [];

  for (let i = 0; i < tries; i++) {
    const z = z0 + (z1 - z0) * rng();
    const b = geo.bounds(z);
    let sx = b.minX + (b.maxX - b.minX) * rng();
    let sy = b.minY + (b.maxY - b.minY) * rng();

    if (near) {
      sx = clamp(near.sx + (rng() * 2 - 1) * near.radius, b.minX, b.maxX);
      sy = clamp(near.sy + (rng() * 2 - 1) * near.radius, b.minY, b.maxY);
    }

    cands.push({ sx, sy, z, ov: overlapAt(geo, busy, sx, sy, z) });
  }

  const best = Math.min(...cands.map((c) => c.ov));
  const pool = cands.filter((c) => c.ov <= best + 0.12);
  const { sx, sy, z } = pool[Math.floor(rng() * pool.length)];
  return { sx, sy, z };
}
