/*
 * The city's fixed palette. Every pixel the city draws is one of these
 * colours (the renderer quantises to them with an ordered dither), which is
 * what keeps the scene reading as pixel art rather than a render.
 *
 * It is weighted heavily toward darks: the scene sits behind white text, so
 * nearly all of it lives in the bottom fifth of the brightness range and only
 * windows, lamps and beacons reach the bright entries. Its colours are a New
 * York night after rain: cool blue-greys and slates, steel blue, muted violet
 * and neutral concrete, windows of warm white, pale yellow and cool white;
 * amber and red are accents, not a cast.
 */
export const CITY_PALETTE_HEX = [
  // near-black blue-violet ramp (sky, deep shadow, glass)
  '#030407', '#06080d', '#0a0d15', '#0e121d', '#131826', '#191f30', '#20283b', '#293248', '#333d56', '#404b66',
  // blue-grey haze with a violet undertone (light-polluted cloud, far air)
  '#100f18', '#181724', '#231a31', '#2f2240', '#23233a', '#2e2e48', '#3b3b56',
  // slate / teal mist
  '#141c20', '#1c272c', '#26343a', '#32454c', '#43585f', '#5a7178',
  // building materials: charcoal, steel blue, muted violet, brownstone
  '#141518', '#1e2024', '#18202b', '#222c3a', '#2e3a4b', '#1c1826', '#282233', '#1d1714', '#2a221d',
  // more materials, so each reads as its own flat colour: neutral grey, blue-grey, stone, burgundy,
  // deep steel blue, charcoal
  '#18191b', '#232426', '#2e3033', '#151a21', '#1f2630', '#2a3340', '#1b1a17', '#282622', '#35322c',
  '#1a1013', '#271a1d', '#35232a', '#0b111c', '#121a28', '#0e0f11',
  '#221f1b', '#2a2a2d', '#1b2230', '#2a1c17', '#221a2d', '#0c1220',
  // warm darks (the odd sodium street, amber shopfronts)
  '#382416', '#4d311a', '#69421e',
  // amber accents (sodium, crowns, the parapet lamps)
  '#93562a', '#c27c34', '#e6a54e',
  // warm white and pale yellow (most windows)
  '#4d473f', '#7a6f5d', '#ab9c7f', '#d8c9a3', '#f1e6c4', '#fff8e6', '#e8dc9c',
  // cool white (offices) and muted cyan (the odd screen-lit room)
  '#4a515c', '#7d8794', '#b4bec9', '#e3e9f0', '#3c6f78', '#78b0b6',
  // cool lights (fluorescent windows, crown lighting)
  '#3d6d84', '#6fa9bf', '#addbe6', '#e6f6f9',
  // accents (signage, aircraft beacons)
  '#5e1630', '#a82f5c', '#ec5f92', '#185a5f', '#2f9e9a', '#6fe0d4', '#4a0c0c', '#9c1d18', '#ff4436',
  // wet concrete greys
  '#25262a', '#33353a', '#4a4d54', '#6d7179',
];

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

export const CITY_PALETTE = CITY_PALETTE_HEX.map(hexToRgb);

// Weighted (roughly perceptual) distance; green differences matter most.
const WR = 2;
const WG = 4;
const WB = 3;

/* Index of the palette colour nearest to (r, g, b) in 0..255. */
export function nearestIndex(r, g, b) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < CITY_PALETTE.length; i++) {
    const p = CITY_PALETTE[i];
    const dr = r - p[0];
    const dg = g - p[1];
    const db = b - p[2];
    const d = WR * dr * dr + WG * dg * dg + WB * db * db;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/*
 * Nearest palette index for a colour packed as 6 bits per channel
 * ((r << 12) | (g << 6) | b). Answers are cached as they are asked for, so a
 * frame only pays for the colours it actually uses.
 */
const UNSET = 255;
const cache = new Uint8Array(64 * 64 * 64).fill(UNSET);
export function paletteIndex(packed) {
  let v = cache[packed];
  if (v === UNSET) {
    v = nearestIndex(((packed >> 12) & 63) * 4 + 2, ((packed >> 6) & 63) * 4 + 2, (packed & 63) * 4 + 2);
    cache[packed] = v;
  }
  return v;
}
