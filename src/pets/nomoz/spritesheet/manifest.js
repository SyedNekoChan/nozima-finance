/*
 * NOMOZ.EXE sprite-sheet asset manifest.
 *
 * The one place where sprite sheets and animation clips are registered. The
 * renderer (./renderer.js), the loader (./loader.js) and the scheduler never
 * change when an asset is added: add to `sheets`, `clips` and `select`. Any
 * state with no matching rule, or whose sheet is loading or failed, keeps the
 * frame on screen (the default sitting frame when nothing is shown yet); no
 * procedural cat is ever drawn. Art, sizes and workflow: ./SPEC.md.
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
 *   those states hold the frame on screen instead of showing a wrong frame.
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

// Facial expression on the single-pose sitting art (renderer.js): where each ear is and the row above which the head leans.
// The expression states (ears: perk / back / flick, lean) are the ones the behaviours and core/attention.js already set.
const EXPR = {
  idle_front: { ears: { y: 8, rows: 5, l: [26, 9], r: [41, 9] }, lean: 30 },
  sit_threeq: { ears: { y: 1, rows: 5, l: [19, 7], r: [35, 7] }, lean: 26 },
  sit_rear: { ears: { y: 0, rows: 6, l: [30, 7], r: [45, 7] }, lean: 26 },
};

const clips = {
  // Breathing. Blinks, closed and happy eyes are drawn live on these frames (the live lids), never by swapping to the closed-eye
  // frame: its head, ears and whiskers are drawn a little differently, so every blink used to make the head jump. A droop nods.
  idle_front: clip('idle_front', [0, 1], { ms: 1000, expr: EXPR.idle_front, nod: { cut: 30 } }),
  // a slow breath on the single-frame sitting art: everything above the row drops a row for part of each period
  sit_threeq: clip('sit_threeq', [0], { breathe: { cut: 46, ms: 3600 }, expr: EXPR.sit_threeq, nod: { cut: 26 } }),
  // (shown once the droop has lasted 1.2 s, i.e. real dozing: a nod to music, a yawn, a concentrating bow of the head are a bob of
  // the live head, not a swap to this art and back)
  sit_doze: clip('sit_doze', [0], { breathe: { cut: 44, ms: 4400 }, enterAfter: 1200, minShow: 800 }),
  // grooming: the tongue strokes the paw (spot on the art); the head above row 36 dips into each lick, the paw rect comes up to meet it and the licked fur shines
  // (a paw lowered for a moment between two grooming moves keeps this art for hold.ms, instead of flipping to the plain
  // sitting art and back; a blink, a shake or the settled pose after it take over at once)
  sit_groom: clip('sit_groom', [0], { lick: { at: [30, 26], dip: 36, paw: [27, 28, 22, 9], sheen: [[33, 30], [34, 30], [36, 31]] }, hold: { ms: 560, to: ['idle_front'] } }),
  sit_rear: clip('sit_rear', [0], { breathe: { cut: 40, ms: 3800 }, expr: EXPR.sit_rear, nod: { cut: 26 } }),
  // a slow breath on the sleeping mound: everything above row 50 rises and falls a row, as the sitting art does
  curl: clip('curl', [0], { breathe: { cut: 50, ms: 4200 } }),
  stretch: clip('stretch', [0]),
  // (the head bobs with each bite: the script's droop, chewing)
  low_front: clip('low_front', [0, 1], { ms: 1000, nod: { cut: 36 } }),
  loaf_front: clip('loaf_front', [0, 1], { ms: 1000, nod: { cut: 46 } }),
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
  // the side walk is the approved one with a single tail (walk_side_even): the approved frames bake three different tails
  const walkArt = view === 'side' ? 'walk_side_even' : `walk_${view}`;
  const creepArt = `creep_${view}`;
  clips[`walk_${view}`] = view === 'side' ? clip(walkArt, [0, 1, 2], { ms: WALK }) : clip(walkArt, STRIDE, { ms: Math.round((WALK * 3) / 4) });
  // arriving or waiting on four legs: a slow breath (the body above the legs a row lower for part of each period, as the sitting
  // art does), so a held stand is not a frozen frame
  clips[`stand_${view}`] = clip(walkArt, [1], { breathe: { cut: 44, ms: 3700 } });
  clips[creepArt] = clip(creepArt, STRIDE, { ms: Math.round((CREEP * 3) / 4) });
  clips[`crouch_${view}`] = clip(creepArt, [1], { breathe: { cut: 48, ms: 3900 } });
}

// Raised forepaws other than grooming (mid / high) are not drawn: those states
// use the same art with the paws down, so the cat never switches to the
// procedural style in the middle of a gesture; effects, cues and the open book
// are drawn over it, aligned to the art's head (see anchors). Reading uses the
// same art too, with the book on its lap.
const FREE = {};

// paw levels of the grooming moves (animations.js: lickPaw, rubFace, cleanEar, washFace, inspectPaw)
const GROOM_PAWS = ['mid', 'high', 'face', 'ear', 'front'];
const WASH_PAWS = ['high', 'face'];

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
  // Grooming: the art follows the paw, never the eyes or the droop that its moves toggle every few hundred ms (cleaning an ear
  // or rubbing the cheek used to alternate this art with the dozing and the plain sitting art). One paw at the mouth, on the
  // cheek, at the ear or held out to look at (the single 'front' paw is the inspecting move; casting holds both paws out and
  // keeps the plain art), or both paws washing the face.
  { when: { pose: 'sit', view: 'front', pawL: GROOM_PAWS, pawR: false }, clip: 'sit_groom' },
  { when: { pose: 'sit', view: 'front', pawR: GROOM_PAWS, pawL: false }, clip: 'sit_groom' },
  { when: { pose: 'sit', view: 'front', pawL: WASH_PAWS, pawR: WASH_PAWS }, clip: 'sit_groom' },
  { when: { pose: 'sit', view: 'front', eyes: 'closed', droop: true, ...FREE }, clip: 'sit_doze' },
  { when: { pose: 'sit', view: 'front', ...FREE }, clip: 'idle_front' },
];

export const SHEET_MANIFEST = { sheets, clips, select };
