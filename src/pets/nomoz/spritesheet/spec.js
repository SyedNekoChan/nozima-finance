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
 * sheets/nomoz_<id>.png as a single row of `frames` frames. `from` says how
 * the frames were made (honestly):
 *   'reference'  converted from the user's reference sheet
 *                (art/source/convert_reference.py); the approved art.
 *   'generated'  rendered by code (art/source/generate_production.py via
 *                render_cat.py: a 3-D shaded ellipsoid cat model with fur-flow
 *                texture, quantised to the approved fur tones), with the head
 *                and chest ruff taken from the approved frames of the matching
 *                view (the rear three-quarter head is rendered). Neither
 *                hand-drawn nor made in SpriteForge.
 *   'built'      assembled from approved frames by the older
 *                build_missing.py (cut, shifted, repeated rows); a stand-in
 *                that blocks the production switch (gaps.mjs). None remain.
 * The PNGs in each folder are the source of truth once a frame is edited by
 * hand: do not regenerate over hand-finished frames.
 */
export const ART = {
  // converted from the reference (art/source/convert_reference.py)
  idle_front: { frames: 4, from: 'reference', head: 'front', face: 'front', eyesOff: [3], note: 'sitting, facing us: open, open (tail shifted), wink, eyes closed' },
  walk_side: { frames: 3, from: 'reference', head: 'side', face: 'profile', note: 'walking cycle, facing left; head-aligned' },
  sit_threeq: { frames: 1, from: 'reference', head: 'threeq', face: 'threeq', note: 'sitting, three-quarter view facing left' },
  sit_doze: { frames: 1, from: 'reference', head: null, anchors: { crown: [55, 10], chest: [55, 28] }, note: 'sitting, head lowered, eyes closed' },
  sit_groom: { frames: 1, from: 'reference', head: null, anchors: { crown: [37, 8], chest: null }, note: 'sitting, licking a paw' },
  sit_rear: { frames: 1, from: 'reference', head: 'rear', note: 'sitting, seen from behind' },
  curl: { frames: 1, from: 'reference', head: null, anchors: { crown: null, chest: null }, note: 'curled up asleep' },
  stretch: { frames: 1, from: 'reference', head: null, anchors: { crown: null, chest: null }, note: 'full-body stretch (scaled to fit the box)' },
  // generated (art/source/generate_production.py)
  walk_front: { frames: 5, from: 'generated', head: 'front', face: 'front', note: 'walking toward us: contact, standing, contact, two passing poses (0 3 2 4); rendered body and legs, approved head and ruff' },
  walk_frontQ: { frames: 5, from: 'generated', head: 'threeq', face: 'threeq', note: 'walking, three-quarter view toward us, facing left; approved three-quarter head' },
  walk_rearQ: { frames: 5, from: 'generated', head: 'rearQ', chest: false, note: 'walking away, three-quarter view, facing left; fully rendered head' },
  walk_rear: { frames: 5, from: 'generated', head: 'rear', note: 'walking away: approved rear head, rendered haunches, hind legs and raised tail' },
  creep_front: { frames: 5, from: 'generated', head: 'front', face: 'front', note: 'crouched stalking walk, front' },
  creep_frontQ: { frames: 5, from: 'generated', head: 'threeq', face: 'threeq', note: 'crouched stalking walk, three-quarter front' },
  creep_side: { frames: 5, from: 'generated', head: 'side', face: 'profile', note: 'crouched stalking walk, side' },
  creep_rearQ: { frames: 5, from: 'generated', head: 'rearQ', chest: false, note: 'crouched stalking walk, three-quarter rear' },
  creep_rear: { frames: 5, from: 'generated', head: 'rear', note: 'crouched stalking walk, rear' },
  leap_front: { frames: 1, from: 'generated', head: 'front', face: 'front', note: 'mid-hop, front (raised 7 px; floor shadow stays on the ground)' },
  leap_side: { frames: 1, from: 'generated', head: 'side', face: 'profile', note: 'mid-hop, side: forelegs reaching, hind legs pushing (raised 7 px)' },
  low_front: { frames: 2, from: 'generated', head: 'front', face: 'front', eyesOff: [0, 1], note: 'head down, body low (eyes closed = looking down)' },
  loaf_front: { frames: 2, from: 'generated', head: 'front', face: 'front', note: 'lying, a low loaf' },
};

/*
 * Where the crown and chest coin sit, by head type, measured from the frame:
 * the crown's top-left is (mean x of the ear-tip rows - 4, ear top + 3) and
 * the coin's is (same x, ear top + CHEST_DY[head]). `head: null` art lists its
 * own `anchors`; `chest: false` hides the coin (the chest faces away).
 */
export const CHEST_DY = { front: 21, side: 19, threeq: 22, rear: null, rearQ: null };
/*
 * Eyes and whiskers are drawn live over the art (so pupils dilate, gaze moves
 * and the eyes blink, wink or close like the procedural cat's), at spots
 * measured from the head: [dx, dy, ...] relative to (cx, ear top) where cx is
 * the crown's centre column. eyes: [dx, dy, width] (a box `width` x 3);
 * whiskers: [dx, dy, direction, length]. `face` on an ART entry picks the set;
 * `eyesOff: [frames]` lists frames whose eyes are already closed in the art.
 */
export const FACE = {
  front: {
    eyes: [[-7, 11, 5], [2, 11, 5]],
    whiskers: [[-7, 14, -1, 8], [-7, 16, -1, 8], [-7, 18, -1, 7], [7, 14, 1, 8], [7, 16, 1, 8], [7, 18, 1, 7]],
  },
  threeq: {
    eyes: [[-6, 13, 5], [1, 13, 4]],
    whiskers: [[-8, 14, -1, 8], [-8, 16, -1, 8], [-8, 18, -1, 7], [3, 17, 1, 4], [3, 19, 1, 4]],
  },
  threeqWalk: {
    eyes: [[-8, 11, 5], [1, 12, 4]],
    whiskers: [[-9, 15, -1, 7], [-9, 17, -1, 7], [-9, 19, -1, 6], [3, 18, 1, 4], [3, 20, 1, 4]],
  },
  profile: {
    eyes: [[-4, 12, 3]],
    whiskers: [[-6, 16, -1, 3], [-6, 18, -1, 3]],
  },
};

export const HEAD_COLUMNS = { front: [26, 51], side: [1, 27], threeq: [15, 47], rear: [29, 53], rearQ: [12, 46] };

export const sheetId = (art) => `nomoz_${art}`;

/* Expected PNG size of an art folder's sheet. */
export function sheetSize(art) {
  return { width: FRAME.width * ART[art].frames, height: FRAME.height, columns: ART[art].frames, rows: 1 };
}
