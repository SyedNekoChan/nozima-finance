/*
 * NOMOZ.EXE sprite-sheet production spec, as data. The human-readable
 * version is ./SPEC.md; ./build.mjs and ./validate.mjs check the art and the
 * manifest against this file.
 *
 * The art follows the user's reference sheet (art/source/reference.webp): a
 * fluffy long-haired black cat with round yellow eyes and a big curled tail.
 * Frames are 96 x 64, larger than the 56 x 60 procedural box, because the
 * reference cat walks about 87 px long at the pet's pixel density. Sheet
 * mode therefore uses a larger sprite box (SHEET_SPRITE_SIZE in ../config.js).
 */
export const FRAME = { width: 96, height: 64 };
export const FLOOR = 62; // exclusive: paws end on row 61, the box keeps 2 rows below
export const SHEET_DIR = 'src/pets/nomoz/spritesheet/sheets';

/*
 * One art folder per pose family: art/<id>/<n>.png (n from 0), assembled into
 * sheets/nomoz_<id>.png as a single row of `frames` frames. `from` says where
 * the frames come from; 'reference' ones are converted from the user's sheet
 * (art/source/convert_reference.py) and can be hand-finished in SpriteForge,
 * 'todo' ones are not in the reference and have to be drawn in its style.
 */
export const ART = {
  idle_front: { frames: 4, from: 'reference', note: 'sitting, facing us: open, open (tail shifted), wink, eyes closed' },
  walk_side: { frames: 3, from: 'reference', note: 'walking cycle, facing left; head-aligned' },
  sit_threeq: { frames: 1, from: 'reference', note: 'sitting, three-quarter view facing left' },
  sit_doze: { frames: 1, from: 'reference', note: 'sitting, head lowered, eyes closed' },
  sit_groom: { frames: 1, from: 'reference', note: 'sitting, licking a paw' },
  sit_rear: { frames: 1, from: 'reference', note: 'sitting, seen from behind' },
  curl: { frames: 1, from: 'reference', note: 'curled up asleep' },
  stretch: { frames: 1, from: 'reference', note: 'full-body stretch (scaled to fit the box)' },
  walk_front: { frames: 3, from: 'todo', note: 'walking toward the viewer' },
  walk_frontQ: { frames: 3, from: 'todo', note: 'three-quarter front walk' },
  walk_rearQ: { frames: 3, from: 'todo', note: 'three-quarter rear walk' },
  walk_rear: { frames: 3, from: 'todo', note: 'walking away' },
  creep_front: { frames: 3, from: 'todo', note: 'crouched creep, front' },
  creep_frontQ: { frames: 3, from: 'todo', note: 'crouched creep, three-quarter front' },
  creep_side: { frames: 3, from: 'todo', note: 'crouched creep, side' },
  creep_rearQ: { frames: 3, from: 'todo', note: 'crouched creep, three-quarter rear' },
  creep_rear: { frames: 3, from: 'todo', note: 'crouched creep, rear' },
  leap_front: { frames: 1, from: 'todo', note: 'mid-hop, front' },
  leap_side: { frames: 1, from: 'todo', note: 'mid-hop, side' },
  sit_side: { frames: 1, from: 'todo', note: 'sitting in profile' },
  low_front: { frames: 2, from: 'todo', note: 'head down, body low (reading, eating)' },
  loaf_front: { frames: 2, from: 'todo', note: 'lying with paws tucked' },
};

export const sheetId = (art) => `nomoz_${art}`;

/* Expected PNG size of an art folder's sheet. */
export function sheetSize(art) {
  return { width: FRAME.width * ART[art].frames, height: FRAME.height, columns: ART[art].frames, rows: 1 };
}
