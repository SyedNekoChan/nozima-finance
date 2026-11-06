/*
 * Hand-authored pixel art for the city's focal elements. The buildings and
 * their windows are generated (scene.js / render.js); these few pieces are
 * drawn by hand, one character per pixel:
 *
 *   PARAPET  the wet coping of the viewer's own roof edge, tiled along the
 *            bottom of the frame (screen space, drawn 1:1 in city pixels)
 *   HELIPAD  painted on one neighbouring roof (world space, mapped in perspective)
 *   PLANT    rooftop plant (fans, ducts) on the mechanical penthouses (world space)
 *   SIGN     a vertical neon sign on one tower facade (world space)
 *   BEACON   the glow of an aircraft warning light (screen space)
 *
 * Colours come from the city palette (palette.js) through each piece's key.
 */

/* ------------------------------------------------------------------ */
/* Foreground: the viewer's parapet                                    */
/* ------------------------------------------------------------------ */

export const PARAPET_KEY = {
  '.': null,
  K: '#030407',
  k: '#06080d',
  d: '#0a0d15',
  e: '#0e121d',
  f: '#131826',
  g: '#191f30',
  h: '#20283b',
  i: '#293248',
  j: '#333d56',
  p: '#231a31',
  P: '#2f2240',
  s: '#26343a',
  S: '#32454c',
  T: '#43585f',
  1: '#25262a',
  2: '#33353a',
  3: '#4a4d54',
  4: '#6d7179',
  o: '#69421e',
  O: '#93562a',
  y: '#e6a54e',
};

// Tiles are 16 pixels wide. Rows, top to bottom: the far edge of the coping
// catching the city glow, its wet top reflecting the cloud, the near lip,
// then the parapet face falling away into shadow.
const COPING = [
  '2232223322232223',
  'hiPPjhhihPPhhiih',
  'ghhhpgghhhhpghhg',
  'ffgffffgfffffgff',
  '3323333233332333',
  '1111111111111111',
  'ffffffffffffffff',
  'eeeeeeeeeeeeeeee',
  'eeeeeeeeeeeeeeee',
  'dddddddddddddddd',
  'kkkkkkkkkkkkkkkk',
  'KKKKKKKKKKKKKKKK',
];

const tile = (edits) => {
  const rows = COPING.map((r) => r.split(''));
  for (const [y, x, s] of edits) for (let n = 0; n < s.length; n++) if (s[n] !== ' ') rows[y][x + n] = s[n];
  return rows.map((r) => r.join(''));
};

export const PARAPET_TILES = [
  // plain
  COPING,
  // a joint between two coping stones
  tile([
    [0, 15, '1'],
    [1, 15, 'f'],
    [2, 15, 'e'],
    [3, 15, 'e'],
    [4, 15, '2'],
    [5, 15, 'f'],
    [6, 15, 'e'],
    [7, 15, 'd'],
    [8, 15, 'd'],
    [9, 15, 'k'],
  ]),
  // a long puddle on the coping, holding the teal of the mist and one warm window
  tile([
    [1, 2, 'SSTTSSsS'],
    [2, 3, 'sSSyOSs'],
    [3, 4, 'sss'],
  ]),
  // a drain spout with a dark rain streak below it
  tile([
    [4, 7, '1K1'],
    [5, 7, 'KKK'],
    [6, 8, 'k'],
    [7, 8, 'd'],
    [8, 8, 'k'],
    [9, 8, 'K'],
  ]),
  // chipped edge with standing water
  tile([
    [0, 5, '11'],
    [1, 4, 'gSSg'],
    [2, 5, 'Ts'],
  ]),
];

/* ------------------------------------------------------------------ */
/* World-space decals                                                  */
/* ------------------------------------------------------------------ */

// Helipad, 16 x 16, mapped onto 24 m of roof. 'L' are its edge lights.
export const HELIPAD = [
  'L......L.......L',
  '......rrrr......',
  '....rr....rr....',
  '...r........r...',
  '..r..........r..',
  '..r..H....H..r..',
  '.r...H....H...r.',
  'Lr...HHHHHH...rL',
  '.r...H....H...r.',
  '.r...H....H...r.',
  '..r..H....H..r..',
  '..r..........r..',
  '...r........r...',
  '....rr....rr....',
  '......rrrr......',
  'L......L.......L',
];
export const HELIPAD_SIZE = 30; // metres

// Rooftop plant, 8 x 8, one tile per 6 m of penthouse roof: a fan in a housing.
export const PLANT = [
  'aaaaaaaa',
  'abbbbbba',
  'ab.cc.ba',
  'abc..cba',
  'abc..cba',
  'ab.cc.ba',
  'abbbbbba',
  'aaaaaaaa',
];
export const PLANT_SIZE = 6; // metres

// Vertical neon sign: the app's own name, one glyph above the next.
const GLYPHS = {
  Н: ['X...X', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
  О: ['.XXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
  З: ['.XXX.', 'X...X', '....X', '..XX.', '....X', 'X...X', '.XXX.'],
  И: ['X...X', 'X...X', 'X..XX', 'X.X.X', 'XX..X', 'X...X', 'X...X'],
  М: ['X...X', 'XX.XX', 'X.X.X', 'X...X', 'X...X', 'X...X', 'X...X'],
  А: ['.XXX.', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
};

function verticalSign(text) {
  // a 1-pixel frame, glyphs 5 wide with a pixel of margin, a row between glyphs
  const rows = ['FFFFFFF'];
  [...text].forEach((ch, n) => {
    if (n) rows.push('F.....F');
    for (const r of GLYPHS[ch]) rows.push(`F${r}F`);
  });
  rows.push('FFFFFFF');
  return rows;
}

export const SIGN = verticalSign('НОЗИМА');
export const SIGN_PIXEL = 2.4; // metres per sign pixel

/* ------------------------------------------------------------------ */
/* Screen-space glow                                                   */
/* ------------------------------------------------------------------ */

// Aircraft warning light: relative intensity per pixel around the lamp.
export const BEACON = [
  [0, 0.12, 0.2, 0.12, 0],
  [0.12, 0.45, 0.8, 0.45, 0.12],
  [0.2, 0.8, 1.6, 0.8, 0.2],
  [0.12, 0.45, 0.8, 0.45, 0.12],
  [0, 0.12, 0.2, 0.12, 0],
];
