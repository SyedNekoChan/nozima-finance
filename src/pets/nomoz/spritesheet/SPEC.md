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
Sheet art is cleared inside these rectangles and the live procedural pixels are drawn instead, so leave eyes, pupils, nose and mouth to them or they will be overwritten. Head-relative `[x, y, w, h]` from `hx, hy`:
- front / frontQ eyes+pupils `[5, 10, 22, 8]`, nose+mouth `[11, 20, 10, 8]`; rear/rearQ: none.
- side eye+pupil `[1, 10, 8, 8]`, nose+mouth `[-3, 16, 9, 8]`.
- `dynamic.whiskers: true` if the sheet leaves whiskers out.
Static rectangles cannot follow a moving tail or raised paw. Bake tail and paws into the frames, and keep the clip from matching those states (below).

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
