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
import { ANCHORS } from './anchors.js';
import { ART, FRAME, sheetId } from './spec.js';

const sheetUrl = (name) => new URL(`./sheets/${name}.png`, import.meta.url).href;

// one sheet per art folder: a single row of 96 x 64 frames
const sheets = Object.fromEntries(
  Object.entries(ART).map(([id, a]) => [
    sheetId(id),
    { src: sheetUrl(sheetId(id)), frameWidth: FRAME.width, frameHeight: FRAME.height, columns: a.frames, rows: 1 },
  ])
);

// a clip over some frames of one art folder; the vanity anchors are measured
// from the frames (anchors.js, written by `node build.mjs anchors`)
const clip = (art, frames, extra = {}) => ({
  sheet: sheetId(art),
  frames,
  anchors: frames.map((i) => ANCHORS[art][i]),
  ...extra,
});

const VIEWS = ['front', 'frontQ', 'side', 'rearQ', 'rear'];
const WALK = 320; // ms per frame: three frames = two steps (480 ms each)
const CREEP = 400;

const clips = {
  idle_front: clip('idle_front', [0, 1], { ms: 1000 }), // breathing, eyes open
  idle_front_closed: clip('idle_front', [3]), // eyes closed (blink, happy, asleep)
  // a slow breath on the single-frame sitting art: everything above the row drops a row for part of each period
  sit_threeq: clip('sit_threeq', [0], { breathe: { cut: 46, ms: 3600 } }),
  sit_doze: clip('sit_doze', [0], { breathe: { cut: 44, ms: 4400 } }),
  // grooming: the tongue strokes the paw (spot on the art); the head above row 36 dips into each lick, the paw rect comes up to meet it and the licked fur shines
  sit_groom: clip('sit_groom', [0], { lick: { at: [30, 26], dip: 36, paw: [27, 28, 22, 9], sheen: [[33, 30], [34, 30], [36, 31]] } }),
  sit_rear: clip('sit_rear', [0], { breathe: { cut: 40, ms: 3800 } }),
  curl: clip('curl', [0]),
  stretch: clip('stretch', [0]),
  low_front: clip('low_front', [0, 1], { ms: 1000 }),
  loaf_front: clip('loaf_front', [0, 1], { ms: 1000 }),
  // the leap is raised off the ground: the floor shadow stays on row 61
  leap_front: clip('leap_front', [0], { floor: 61 }),
  leap_side: clip('leap_side', [0], { floor: 61 }),
};
// The approved side walk is a three-frame loop (0 1 2). Every generated walk and
// creep has five poses: 0 and 2 the two contacts, 1 all four paws down (the
// standing pose) and 3 and 4 the passing poses between the contacts, where the
// body is at its highest. It plays 0 3 2 4, a full stride in four beats.
const STRIDE = [0, 3, 2, 4];
for (const view of VIEWS) {
  const walkArt = `walk_${view}`;
  const creepArt = `creep_${view}`;
  clips[walkArt] = view === 'side' ? clip(walkArt, [0, 1, 2], { ms: WALK }) : clip(walkArt, STRIDE, { ms: Math.round((WALK * 3) / 4) });
  clips[`stand_${view}`] = clip(walkArt, [1]); // arriving or waiting on four legs
  clips[creepArt] = clip(creepArt, STRIDE, { ms: Math.round((CREEP * 3) / 4) });
  clips[`crouch_${view}`] = clip(creepArt, [1]);
}

// Raised forepaws other than grooming (mid / high) are not drawn: those states
// use the same art with the paws down, so the cat never switches to the
// procedural style in the middle of a gesture; effects, cues and the open book
// are drawn over it, aligned to the art's head (see anchors). Reading uses the
// same art too, with the book on its lap.
const FREE = {};

const select = [
  { when: { pose: 'curl' }, clip: 'curl' },
  { when: { pose: 'stretch' }, clip: 'stretch' },
  { when: { pose: 'loaf', ...FREE }, clip: 'loaf_front' },
  { when: { pose: 'low', ...FREE }, clip: 'low_front' },
  // hopping (legs 3)
  { when: { pose: 'stand', legs: 3, view: 'front', ...FREE }, clip: 'leap_front' },
  { when: { pose: 'stand', legs: 3, view: ['frontQ', 'side', 'rearQ'], ...FREE }, clip: 'leap_side' },
  // walking, crouched walking and standing still, each in its own view
  ...VIEWS.flatMap((view) => [
    { when: { pose: 'stand', moving: true, view, ...FREE }, clip: `walk_${view}` },
    { when: { pose: 'stand', moving: false, view, ...FREE }, clip: `stand_${view}` },
    { when: { pose: 'crouch', moving: true, view, ...FREE }, clip: `creep_${view}` },
    { when: { pose: 'crouch', moving: false, view, ...FREE }, clip: `crouch_${view}` },
  ]),
  // sitting
  { when: { pose: 'sit', view: ['rear', 'rearQ'] }, clip: 'sit_rear' },
  { when: { pose: 'sit', view: ['frontQ', 'side'] }, clip: 'sit_threeq' },
  { when: { pose: 'sit', view: 'front', pawL: ['mid', 'high'], pawR: false }, clip: 'sit_groom' },
  { when: { pose: 'sit', view: 'front', pawR: ['mid', 'high'], pawL: false }, clip: 'sit_groom' },
  { when: { pose: 'sit', view: 'front', eyes: 'closed', droop: true, ...FREE }, clip: 'sit_doze' },
  { when: { pose: 'sit', view: 'front', eyes: ['closed', 'blink', 'happy'], ...FREE }, clip: 'idle_front_closed' },
  { when: { pose: 'sit', view: 'front', ...FREE }, clip: 'idle_front' },
];

export const SHEET_MANIFEST = { sheets, clips, select };
