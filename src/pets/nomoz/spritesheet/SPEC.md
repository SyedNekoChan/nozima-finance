# NOMOZ.EXE sprite-sheet production spec

Reference: `art/source/reference.webp`, the user's concept sheet (a fluffy long-haired black cat, round yellow eyes with slit pupils, big curled tail, dark soft shading). The converted frames of that sheet are the canonical look; everything else is derived from them. Machine-readable form: `spec.js`; manifest format: `manifest.js`.

## Sizes and conventions
- **Frame 96 x 64**, one cat per frame, feet on row 61 (the last opaque row; two rows stay empty below). Frames face LEFT (head left, tail right); `facing > 0` mirrors the canvas. Hard pixels, alpha 0 or 255, at most 32 colours (10 fur tones + 4 eye yellows, shared by every frame).
- **Sheet mode** (`SPRITE_RENDERER.mode = 'sheet'` in `../config.js`) uses the box `SHEET_SPRITE_SIZE` (96 x 64) because the reference cat is about 87 px long walking. The procedural cat, effects, items and cues are drawn in a 56 x 60 area centred at the bottom of that box, so procedural coordinates stay valid and the procedural cat is the per-state fallback. Procedural mode keeps its 56 x 60 box and is unchanged (pixel-identical over 7,560 state combinations).
- **Lighting** is added by the engine from each frame's silhouette (rim light by depth, floor pool, contact shadow, dithered aura); frames contain none. `lighting: 'baked'` opts out.
- **Eyes are baked** into the art. Live pupil dilation and gaze shifts exist only on the procedural cat.
- **Vanity**: the crown and chest coin follow `anchors`, measured from each frame by `node build.mjs anchors` (ear-tip rows give the crown, the head type gives the coin; `chest: false` / `null` hides it when the chest faces away). Effects, items, cues and the open book are drawn at the procedural positions and do not follow sheet art, so rules exclude `book` and raised paws.
- **Floor**: a clip's `floor` row keeps the shadow on the ground when the art is raised (the leaps).

## Art folders (`art/<id>/<n>.png` -> `sheets/nomoz_<id>.png`)
Converted from the reference (`art/source/convert_reference.py`): `idle_front` (4: open, open, wink, closed), `walk_side` (3), `sit_threeq`, `sit_doze`, `sit_groom`, `sit_rear`, `curl`, `stretch` (1 each; stretch scaled to 0.21 to fit).

Built from those frames (`art/source/build_missing.py`; programmatic assembly, **not hand-drawn**):
| id | frames | how it is made |
|---|---|---|
| walk_front | 3 | `idle_front` with the legs lengthened by repeating fur rows, the haunch left as hind legs; paws lift alternately (left, neutral + head bob, right), tail sways |
| walk_rear | 3 | `sit_rear` with the sitting haunch cut off, two legs taken from the front view, the curled tail raised at the side; paws alternate |
| walk_frontQ | 3 | approved `walk_side` body with the profile head replaced by the `sit_threeq` head, re-sampled from the reference to the walking cat's head size |
| walk_rearQ | 3 | the same body with the rear head from `sit_rear` |
| creep_front / frontQ / side / rearQ / rear | 3 each | the matching walk frames with the leg rows removed (a lower body), the head lowered 2-3 px |
| leap_side, leap_front | 1 each | a walk frame raised 7 px (front also with a paw lifted); floor shadow stays on the ground |
| low_front | 2 | the closed-eye front cat with the neck rows removed, the head resting low |
| loaf_front | 2 | the sitting front cat with the leg and haunch rows removed: a low loaf |

## Which art each state uses (see `manifest.js`; first match wins)
- sit, front: `idle_front` (frames 0-1, 1 s); eyes closed / blink / happy: closed frame; eyes closed + droop: `sit_doze`; a forepaw at `mid` / `high`: `sit_groom`. sit, frontQ and side: `sit_threeq` (no profile sit art exists); sit, rearQ and rear: `sit_rear`.
- stand, per view: moving: `walk_<view>` (320 ms per frame); still: frame 1 of it. legs 3 (hop): `leap_front` (front) or `leap_side` (frontQ, side, rearQ); the rear hop shows the walk-away art.
- crouch, per view: moving: `creep_<view>` (400 ms); still: frame 1.
- stretch, curl: their art. loaf: `loaf_front`. low: `low_front`.
- **Procedural cat (different style) is still drawn for**: any raised forepaw other than the grooming one, the open book (reading), a sitting cat with `legs` 1-3, and any state a rule does not list. Lying poses exist only facing front, as in the procedural cat.

## Workflow (what the tools can really do)
SpriteForge here is a manual editor: `open_editor` / `open_full_editor` open a PNG or pixel grid in a browser editor and return a link; `get_sprite` reads a session back. It cannot generate, batch-process or export files, and this sandbox cannot download from its host (blocked by the egress proxy).
1. `python3 art/source/convert_reference.py` then `python3 art/source/build_missing.py` (Pillow + numpy) produce all frames mechanically. Do not re-run either over hand-finished frames: after editing a frame, the PNG in `art/<id>/` is the source of truth.
2. Refine a frame by hand: open its PNG in SpriteForge, edit, download the PNG, replace `art/<id>/<n>.png`.
3. `node src/pets/nomoz/spritesheet/build.mjs sheets` validates the frames, writes `sheets/` and `anchors.js`; `node src/pets/nomoz/spritesheet/validate.mjs` checks the manifest against the sheets.
4. Try it with `SPRITE_RENDERER.mode = 'sheet'`. The default stays `'procedural'`.

## Known limits
- The built frames are assembled from the approved art with simple pixel surgery. Seams are visible at the neck of the three-quarter and rear walks, the front and rear walks read as a standing cat with small leg motion, the crouches are the walks with shorter legs, and the hop is a raised walk pose. They are consistent in palette, density and proportions but are not hand-finished; the walking cycles in particular would benefit from hand drawing.
- Whiskers are not in the frames (too thin to survive the reference conversion).
- Anchors are measured, not hand-placed; check them by eye per pose.
- Sheet art is dark; the engine adds the rim light.
