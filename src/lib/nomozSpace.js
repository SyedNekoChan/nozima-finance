import { STEPS_PER_SPRITE } from './nomoz.js';

/*
 * NOMOZ.EXE's lightweight 3D space.
 *
 * The backdrop layer carries a CSS `perspective`; the entity is one
 * element moved with translate3d. Positions are kept in SCREEN space
 * (sx, sy = where the sprite's centre appears, z = depth), so walking,
 * and bounds all work in the pixels the user sees, and
 * toTransform() converts back into the pre-perspective offset.
 *
 * The coordinates belong to the global backdrop, not to any tab: the
 * foreground UI never influences where the entity is, and it may be
 * covered by foreground content (it keeps living behind it).
 *
 *   z > 0 : closer  (larger, a little stronger)
 *   z < 0 : farther (smaller, a little fainter)
 *
 * Apparent size = perspective scale x a foreground boost. The boost is
 * exactly 1 from the far end through mid depth, so those sizes are plain
 * perspective, and only eases in over the nearer half of the range up to
 * +NEAR_BOOST at the closest depth. It is a function of z alone, so it
 * interpolates smoothly with the existing depth movement.
 */

export const PERSPECTIVE = 900;

const Z_RANGE = { wide: [-320, 180], compact: [-220, 120] };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const getZRange = (compact) => Z_RANGE[compact ? 'compact' : 'wide'];

export const scaleAt = (z) => PERSPECTIVE / (PERSPECTIVE - z);

// Extra scale at the very closest depth (+28%), eased in from mid depth.
const NEAR_BOOST = 0.28;

export function foregroundBoost(z, compact) {
  const [a, b] = getZRange(compact);
  const t = clamp((z - a) / (b - a), 0, 1);
  const u = clamp((t - 0.5) / 0.5, 0, 1);
  return 1 + NEAR_BOOST * (u * u * (3 - 2 * u)); // smoothstep: no jump, no kink
}

// What the user actually sees: perspective x foreground boost.
export const depthScale = (z, compact) => scaleAt(z) * foregroundBoost(z, compact);

// 0.7 (far) .. 1 (near): depth dims but never hides.
export function alphaAt(z, compact) {
  const [a, b] = getZRange(compact);
  return 0.7 + 0.3 * clamp((z - a) / (b - a), 0, 1);
}

// 0 (far) / 1 / 2 (near): how strongly the rim light reads at this depth.
export function depthLevel(z, compact) {
  const [a, b] = getZRange(compact);
  const t = clamp((z - a) / (b - a), 0, 1);
  return t < 0.34 ? 0 : t < 0.67 ? 1 : 2;
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
    cell: spriteW / STEPS_PER_SPRITE,
    zRange: getZRange(compact),

    // half-size of the sprite as drawn at depth z (boost included), so the
    // bounds keep the larger foreground sprite inside the layer
    half(z) {
      const s = depthScale(z, compact);
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
  // the foreground boost scales about the sprite's own centre, so the
  // projected centre (sx, sy) does not move
  return `translate3d(${x}px, ${y}px, ${z}px) scale(${foregroundBoost(z, geo.compact)})`;
}

/* ------------------------------------------------------------------ */
/* Placement                                                           */
/* ------------------------------------------------------------------ */

/*
 * A random reachable spot anywhere in the backdrop space.
 *   zRange : depth band to sample (default: the full range)
 *   near   : { sx, sy, radius } keeps the spot close to a point
 */
export function pickSpot(geo, rng, { zRange, near } = {}) {
  const [z0, z1] = zRange || geo.zRange;
  const z = z0 + (z1 - z0) * rng();
  const b = geo.bounds(z);

  if (near) {
    return {
      sx: clamp(near.sx + (rng() * 2 - 1) * near.radius, b.minX, b.maxX),
      sy: clamp(near.sy + (rng() * 2 - 1) * near.radius, b.minY, b.maxY),
      z,
    };
  }

  return {
    sx: b.minX + (b.maxX - b.minX) * rng(),
    sy: b.minY + (b.maxY - b.minY) * rng(),
    z,
  };
}
