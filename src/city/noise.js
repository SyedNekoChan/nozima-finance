/*
 * Deterministic hashing and value noise for the city. Everything the city
 * places (buildings, lit windows, puddles, cars, mist) comes from these with a
 * fixed seed, so the same viewport always shows the same city.
 */

export function hash3(a, b, c) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t) => t * t * (3 - 2 * t);

/* Smooth value noise in [0, 1) on an integer lattice. */
export function vnoise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = fade(x - xi);
  const fy = fade(y - yi);
  const a = hash3(xi, yi, seed);
  const b = hash3(xi + 1, yi, seed);
  const c = hash3(xi, yi + 1, seed);
  const d = hash3(xi + 1, yi + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/* Three octaves of value noise, normalised to [0, 1). */
export function fbm(x, y, seed) {
  return (vnoise(x, y, seed) * 4 + vnoise(x * 2.03, y * 2.03, seed + 17) * 2 + vnoise(x * 4.1, y * 4.1, seed + 31)) / 7;
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function smoothstep(a, b, v) {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}
