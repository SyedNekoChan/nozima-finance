/*
 * NOMOZ.EXE sprite-sheet asset manifest.
 *
 * The one place where sprite sheets and animation clips are registered. The
 * renderer (./renderer.js), the loader (./loader.js) and the scheduler never
 * change when an asset is added: add to `sheets`, `clips` and `select`. The
 * sheets are used only when SPRITE_RENDERER.mode in ../config.js is 'sheet'
 * (it is 'procedural', the default, so nothing here draws yet). Any state
 * with no matching rule, or whose sheet fails to load, is drawn by the
 * procedural cat in ../sprites.js. Art, sizes and workflow: ./SPEC.md.
 *
 * SHEETS   id -> { src, frameWidth, frameHeight, columns, rows, margin?, spacing? }
 *   One row of 96 x 64 frames per art folder (see spec.js), built by
 *   `node build.mjs sheets`. Frame i is column i of row 0.
 *
 * CLIPS    id -> {
 *     sheet            a sheet id
 *     frames: [i, ...] frame indices in play order   (or row, start, count)
 *     ms               frame duration: a number, or one per frame (default 120)
 *     loop             true (default); false plays once and holds its last frame
 *     next             clip id started when a one-shot finishes
 *     lock             a one-shot that finishes before another clip replaces it
 *     still            frame position shown under prefers-reduced-motion
 *     anchors          where the crown and the chest coin sit on this art, in
 *                      canvas coordinates: { crown: [x, y], chest: [x, y] | null }
 *                      (top-left of the 8x4 crown and the 8x8 coin), one for
 *                      the clip or one per frame; without it the vanity items
 *                      use the procedural cat's positions
 *     lighting         'procedural' (default: rim light, floor pool and aura
 *                      from the frame's silhouette) | 'baked'
 *     dynamic          procedural pixels kept on top of the art (in procedural
 *                      coordinates): { head: [[x,y,w,h]], base: [[x,y,w,h]], whiskers }
 *   }
 *
 * SELECT   ordered rules, first match wins: { when, clip }
 *   `when` compares render-state fields (pose, view, legs, moving, eyes, mouth,
 *   tail, ears, pawL, pawR, book, droop, mood, ...). A value may be a literal,
 *   an array (any of), true (set) or false (unset). `moving` is true while legs
 *   is 1, 2 or 3. Direction is the `view` field (front, frontQ, side, rearQ,
 *   rear). Name what the art does NOT cover (raised paws, the open book) so
 *   those states keep the procedural cat instead of showing a wrong frame.
 *
 * Frames face LEFT (the cat's head on the left); `facing > 0` mirrors the
 * whole canvas, as for the procedural cat.
 */
const sheetUrl = (name) => new URL(`./sheets/${name}.png`, import.meta.url).href;
const frame = (art, columns) => ({ src: sheetUrl(`nomoz_${art}`), frameWidth: 96, frameHeight: 64, columns, rows: 1 });

// Where the crown and the chest coin sit on each piece of art (canvas
// coordinates, top-left of the 8 x 4 crown and the 8 x 8 coin).
const HEAD_FRONT = { crown: [33, 11], chest: [33, 29] };

export const SHEET_MANIFEST = {
  sheets: {
    nomoz_idle_front: frame('idle_front', 4),
    nomoz_walk_side: frame('walk_side', 3),
    nomoz_sit_threeq: frame('sit_threeq', 1),
    nomoz_sit_doze: frame('sit_doze', 1),
    nomoz_sit_groom: frame('sit_groom', 1),
    nomoz_sit_rear: frame('sit_rear', 1),
    nomoz_curl: frame('curl', 1),
    nomoz_stretch: frame('stretch', 1),
  },
  clips: {
    // sitting, facing us: breathing between the two open-eye frames
    idle_front: { sheet: 'nomoz_idle_front', frames: [0, 1], ms: 1000, anchors: HEAD_FRONT },
    // eyes closed (blink, happy, asleep)
    idle_front_closed: { sheet: 'nomoz_idle_front', frames: [3], anchors: HEAD_FRONT },
    walk_side: {
      sheet: 'nomoz_walk_side',
      frames: [0, 1, 2],
      ms: 320,
      anchors: [{ crown: [9, 12], chest: [9, 30] }, { crown: [9, 12], chest: [9, 30] }, { crown: [9, 12], chest: [9, 30] }],
    },
    sit_threeq: { sheet: 'nomoz_sit_threeq', frames: [0], anchors: { crown: [26, 5], chest: [26, 24] } },
    sit_doze: { sheet: 'nomoz_sit_doze', frames: [0], anchors: { crown: [55, 10], chest: [55, 28] } },
    sit_groom: { sheet: 'nomoz_sit_groom', frames: [0], anchors: { crown: [35, 9], chest: null } },
    sit_rear: { sheet: 'nomoz_sit_rear', frames: [0], anchors: { crown: [37, 4], chest: null } },
    curl: { sheet: 'nomoz_curl', frames: [0], anchors: { crown: null, chest: null } },
    stretch: { sheet: 'nomoz_stretch', frames: [0], anchors: { crown: null, chest: null } },
  },
  // First match wins. Each rule also names what the art does NOT cover (raised
  // paws, the open book), so those states keep the procedural cat.
  select: [
    { when: { pose: 'curl' }, clip: 'curl' },
    { when: { pose: 'stretch' }, clip: 'stretch' },
    { when: { pose: 'stand', moving: true, view: 'side', pawL: false, pawR: false, book: false }, clip: 'walk_side' },
    { when: { pose: 'sit', view: 'rear', book: false }, clip: 'sit_rear' },
    { when: { pose: 'sit', view: 'frontQ', book: false }, clip: 'sit_threeq' },
    { when: { pose: 'sit', view: 'front', pawL: ['mid', 'high'], pawR: false, book: false }, clip: 'sit_groom' },
    { when: { pose: 'sit', view: 'front', pawR: ['mid', 'high'], pawL: false, book: false }, clip: 'sit_groom' },
    { when: { pose: 'sit', view: 'front', moving: false, eyes: 'closed', droop: true, pawL: false, pawR: false, book: false }, clip: 'sit_doze' },
    { when: { pose: 'sit', view: 'front', moving: false, eyes: ['closed', 'blink', 'happy'], pawL: false, pawR: false, book: false }, clip: 'idle_front_closed' },
    { when: { pose: 'sit', view: 'front', moving: false, pawL: false, pawR: false, book: false }, clip: 'idle_front' },
  ],
};
