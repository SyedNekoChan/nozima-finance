// A fresh seed on every page load / mount: nothing about startup is scripted.
export function runtimeSeed() {
  try {
    const a = new Uint32Array(2);
    crypto.getRandomValues(a);
    return (a[0] ^ a[1] ^ (Date.now() | 0)) >>> 0;
  } catch {
    return Math.floor(Math.random() * 4294967296) ^ (Date.now() | 0);
  }
}

// mulberry32: small seeded PRNG
export function createRng(seed) {
  let t = seed >>> 0;
  return function next() {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export const rnd = (r, a, b) => a + r() * (b - a);
export const int = (r, a, b) => Math.floor(rnd(r, a, b + 1));
export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
