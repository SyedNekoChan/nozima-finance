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
 * 'built' ones are not in the reference: they are assembled from the approved
 * frames (art/source/build_missing.py). All of them can be hand-finished in
 * SpriteForge; the PNGs are the source of truth once edited.
 */
export const ART = {
  // converted from the reference (art/source/convert_reference.py)
  idle_front: { frames: 4, from: 'reference', head: 'front', note: 'sitting, facing us: open, open (tail shifted), wink, eyes closed' },
  walk_side: { frames: 3, from: 'reference', head: 'side', note: 'walking cycle, facing left; head-aligned' },
  sit_threeq: { frames: 1, from: 'reference', head: 'threeq', note: 'sitting, three-quarter view facing left' },
  sit_doze: { frames: 1, from: 'reference', head: null, anchors: { crown: [55, 10], chest: [55, 28] }, note: 'sitting, head lowered, eyes closed' },
  sit_groom: { frames: 1, from: 'reference', head: null, anchors: { crown: [37, 8], chest: null }, note: 'sitting, licking a paw' },
  sit_rear: { frames: 1, from: 'reference', head: 'rear', note: 'sitting, seen from behind' },
  curl: { frames: 1, from: 'reference', head: null, anchors: { crown: null, chest: null }, note: 'curled up asleep' },
  stretch: { frames: 1, from: 'reference', head: null, anchors: { crown: null, chest: null }, note: 'full-body stretch (scaled to fit the box)' },
  // built from the approved frames (art/source/build_missing.py)
  walk_front: { frames: 3, from: 'built', head: 'front', note: 'standing, walking toward us: sitting cat with lengthened legs, paws alternate' },
  walk_frontQ: { frames: 3, from: 'built', head: 'side', note: 'approved side-walk body with the three-quarter head' },
  walk_rearQ: { frames: 3, from: 'built', head: 'side', chest: false, note: 'approved side-walk body with the rear head' },
  walk_rear: { frames: 3, from: 'built', head: 'rear', note: 'walking away: rear view, two legs, raised tail' },
  creep_front: { frames: 3, from: 'built', head: 'front', note: 'crouched walk, front' },
  creep_frontQ: { frames: 3, from: 'built', head: 'side', note: 'crouched walk, three-quarter front' },
  creep_side: { frames: 3, from: 'built', head: 'side', note: 'crouched walk, side' },
  creep_rearQ: { frames: 3, from: 'built', head: 'side', chest: false, note: 'crouched walk, three-quarter rear' },
  creep_rear: { frames: 3, from: 'built', head: 'rear', note: 'crouched walk, rear' },
  leap_front: { frames: 1, from: 'built', head: 'front', note: 'mid-hop, front (raised 7 px; floor shadow stays on the ground)' },
  leap_side: { frames: 1, from: 'built', head: 'side', note: 'mid-hop, side (raised 7 px)' },
  low_front: { frames: 2, from: 'built', head: 'front', note: 'head down, body low (eyes closed = looking down)' },
  loaf_front: { frames: 2, from: 'built', head: 'front', note: 'lying, a low loaf' },
};

/*
 * Where the crown and chest coin sit, by head type, measured from the frame:
 * the crown's top-left is (mean x of the ear-tip rows - 4, ear top + 3) and
 * the coin's is (same x, ear top + CHEST_DY[head]). `head: null` art lists its
 * own `anchors`; `chest: false` hides the coin (the chest faces away).
 */
export const CHEST_DY = { front: 21, side: 19, threeq: 22, rear: null };
export const HEAD_COLUMNS = { front: [26, 51], side: [1, 27], threeq: [15, 47], rear: [29, 53] };

export const sheetId = (art) => `nomoz_${art}`;

/* Expected PNG size of an art folder's sheet. */
export function sheetSize(art) {
  return { width: FRAME.width * ART[art].frames, height: FRAME.height, columns: ART[art].frames, rows: 1 };
}
