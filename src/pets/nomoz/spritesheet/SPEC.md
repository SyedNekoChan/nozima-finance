# NOMOZ.EXE sprite-sheet production spec

Derived from the implementation (`sprites.js`, `core/toolkit.js`, `src/pets/config.js`), not from earlier descriptions. Machine-readable form: `spec.js`; check with `node src/pets/nomoz/spritesheet/validate.mjs [--strict]`. Registration format and conventions: `manifest.js`.

## Ground rules
- Frame: **56 x 60 px**, one cat per frame, **base space**: the cat faces LEFT, tail on the right. Never author right-facing art; `facing > 0` mirrors the finished composite.
- Pivot/anchor default: bottom centre `[28, 60]` of the frame = bottom centre of the sprite box. Keep the cat where the procedural cat stands (feet on rows 55-57; head anchor `hx,hy` per pose below), because vanity items, the chest coin, effects and the floor shadow are placed from the procedural anchors, not from the art.
- Palette: only the colours of `PALETTE` in `sprites.js` (fur ramp `#000000 #0a0c0f #13161a #1c2025 #292e34`, rim `#3b424a #56606a`, eye `#f0cd80 #c99a4a #e6edf2 #8d9ba5`, inner ear `#d6dde3 #8d98a2`). Hard pixels, no anti-aliasing, alpha 0 or 255 only, transparent background. Max 256 colours (SpriteForge limit).
- Lighting: default `lighting: 'procedural'` keeps the floor pool, contact shadow and depth aura under the art, but the aura follows the PROCEDURAL silhouette, so the sheet silhouette must match it closely; otherwise use `lighting: 'baked'` and paint the shadow into the frames. Rim light is not applied to sheet art (bake it, upper-left lit).
- Approved look to preserve: plush furry body, thick limbs (legs 5 px wide, 4 px far legs), substantial tail (r 3.4 -> 1.7 px in turned views, about 18-24 px long), half-lidded amber eyes, lighter chest bib, tufted cheeks, pointed ears with pale inner ear.

## Sheets and clips
One PNG per group in `src/pets/nomoz/spritesheet/sheets/`, named `nomoz_<group>.png` (`nomoz_<group>_v2.png` for a revision; the manifest points at one). Columns = frames, rows = views in this order: `front, frontQ, side, rearQ, rear`. Clip id = `<group>_<view>`.

| group | pose, state | frames x ms | loop | sheet px | notes |
|---|---|---|---|---|---|
| idle | sit, legs 0 | 2 x 1000 | yes | 112x300 | frame 2 = breathing (head 1 px lower, matches `frame % 2`) |
| stand | stand, legs 0 | 2 x 1000 | yes | 112x300 | arrival/hold |
| walk | stand, legs 1/2 | 4 x 240 | yes | 224x300 | contact, pass, contact (other leg), pass; one step = 480 ms |
| creep | crouch, legs 1/2 | 4 x 240 | yes | 224x300 | body 3-4 rows lower, tail low |
| crouch | crouch, legs 0 | 2 x 1000 | yes | 112x300 | |
| leap | stand, legs 3 | 1 x 1000 | yes | 56x300 | forelegs reaching, hind legs pushing |
| stretch / low / loaf / curl | front only | 2 x 1000 | yes | 112x60 each | one row; these poses never turn |

34 clips in total. Turned views exist only for `sit`, `stand`, `crouch`; every other pose is front-only (`TURN_POSES`). Turn transitions need no clips: the scheduler steps `front -> frontQ -> side -> rearQ -> rear` 110 ms per view and each view has its own clip.

Head anchor (the procedural `hy` is what vanity uses): sit 4, stand 3, crouch 7, stretch 9, low 20, loaf 20, curl 25 (+1 when the head bobs, +2 lowered). Turned views: side `hx=4, hy=3`, frontQ/rearQ `hx=9, hy=6`, rear `hx=12, hy=3`.

## Dynamic regions (keep expressions alive)
Sheet art is cleared inside these rectangles and the live procedural pixels are drawn instead (the procedural fur in the rectangle comes with them, so keep rectangles tight and keep the sheet's face where the procedural face is). Head-relative `[x, y, w, h]` from the head anchor `hx, hy` (front, sit: `hx = 12`, `hy = 4`, +1 on the breathing frame). Also in `spec.js` (`DYNAMIC`):
- eyes + pupils (gaze moves them 1 px sideways, 2 px up): `[5, 10, 8, 8]` and `[19, 10, 8, 8]`
- nose `[14, 20, 4, 2]`; mouth (all expressions) `[12, 22, 8, 4]`
- `whiskers: true` only if the sheet leaves them out (the procedural whiskers are not mirrored-safe over art that has its own).
Side view: eye+pupil `[1, 10, 8, 8]`, nose+mouth `[-3, 16, 9, 8]`. Rear views: none.
Static rectangles cannot follow a moving tail or raised paw. Bake tail and paws into the frames, and keep the clip from matching those states (below).

## Construction rules (refined design, from the canonical front idle)
The approved procedural cat is the reference for identity; the sheet art redraws it with better proportions. All views and poses are built from these rules so they stay one cat:
- Head: 28 px wide at the cheeks (x 14-41), ear tips on row 3-4, skull rows 9-28, eyes 6x6 at `(hx+6, hy+12)` and `(hx+20, hy+12)` exactly as in `sprites.js` (EYES), nose and mouth at the procedural positions. Ears 9 rows tall with a pale tufted inner ear (`I`/`i`).
- Body: wider at the base than the head (haunches 37 px at the floor, x 10-45), forelegs 7 px wide with a 2 px black gap, paws 10 px wide on rows 54-57 with toe seams, hind paws showing beside them, chest ruff and a lighter bib (`4`/`3`) under the coin spot `(24, 34)`.
- Tail: substantial, root 4 px thick tapering to 2 px, 33 px long, rising on the right side and hooking inward at the tip, tabby rings every 5 px.
- Shading: light from the upper left. Planes `3` (lit), `2` (base), `1` (shadow), `0` ink for seams only. Rim light (`5`, `6` on up/left edges, `4` on the right edge) is baked in, as `sprites.js` would draw it. Fur tufts break the silhouette along cheeks, chest, haunches and tail.
- Only characters from `PALETTE` in `sprites.js`; transparent background; no anti-aliasing.

## Art pipeline (what is actually possible)
SpriteForge exposes only a manual editor (`open_editor`, `open_full_editor`) and a read-only `get_sprite` (palette + pixel grid, PNG url). There is no generation, batch or export tool, and this environment cannot download the PNG url (the host is blocked by the egress proxy), so exports are done by hand:
1. A frame is seeded (from `art/draft/<clip>.txt` via `node build.mjs draft`, or an existing PNG) and opened in an editor session; the session link is shared with the artist.
2. The artist refines it in the editor and downloads the PNG, then commits it as `art/<clip>/<n>.png` (56x60, n from 0). `get_sprite` with `include_pixels` returns the same pixels as a grid if a PNG is not available.
3. `node build.mjs check` validates every frame (size, binary alpha, colour count, frame count per clip); `node build.mjs sheets` assembles a group's sheet only when all of its clips are drawn; `node validate.mjs` checks the registered manifest and sheet sizes.
4. Only then is the sheet registered in `manifest.js` and its rules added. The procedural renderer stays the default and the fallback for every clip not yet registered.

## Status
- `idle_front` (2 frames): drafted from the refined construction rules, in `art/idle_front/`, awaiting approval. Not registered. Registration once approved: sheet `nomoz_idle` (columns 2, rows 5), clip `idle_front` `{ sheet: 'nomoz_idle', row: 0, ms: 1000, dynamic: { head: [[5,10,8,8],[19,10,8,8],[14,20,4,2],[12,22,8,4]] } }`, rule `{ when: { pose: 'sit', view: 'front', moving: false, pawL: false, pawR: false, ears: false, book: false }, clip: 'idle_front' }` (rows 1-4 of the sheet are the turned views and must exist first, because the sheet is assembled per group).
- Everything else: not started.

## Selection rules (the one convention that prevents mismatched art)
`select` is first-match-wins on `SPRITE_FIELDS`. Every art rule must also exclude states the sheet does not cover, so the procedural cat draws those instead of a wrong frame: `pawL: false, pawR: false, book: false, ears: false, tail: [null, 'still']` as the clip covers. Order: leap (`legs: 3`), then walk/creep (`moving: true`), then idle/stand/crouch (`moving: false`), then front-only poses. Direction is `view`.

## Production batches (SpriteForge is a manual editor: one session = one clip, 56x60 canvas, frames, 256 colours; no generation, batch or export tool)
Workflow per batch: open the clip in the editor (`open_full_editor`, `art` or `png_base64`), edit by hand, then `get_sprite` and download the PNG for each frame (`png_url` + `&frame=N`); assemble the group sheet into the file above with an external image tool (not provided by this repo), run `validate.mjs`, register the sheet/clips/rules, and compare against the procedural cat in sheet mode before the next batch. Edit links expire 24 h after the last edit and are readable by anyone with the link.
1. Reference lock: `idle_front` (2 frames). Everything else is matched to it.
2. `walk_front`, `walk_side` (4 each): the most visible clips.
3. `walk_rear`, `walk_frontQ`, `walk_rearQ`.
4. `idle_` and `stand_` for frontQ, side, rearQ, rear (front is batch 1 / step 2).
5. `creep_` (5 clips) and `crouch_` (5 clips).
6. `leap_` (5 single frames).
7. Front-only poses: `stretch`, `low`, `loaf`, `curl`.
8. Calibration pass in sheet mode (`SPRITE_RENDERER.mode = 'sheet'`): mirrored facing, coin/crown anchors, pupils, stressed/glitch passes, compact and wide scale, then flip the default only after approval.
