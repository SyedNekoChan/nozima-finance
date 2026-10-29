# NOMOZ.EXE sprite-sheet production spec

Reference: `art/source/reference.webp`, the user's concept sheet (a fluffy long-haired black cat, round yellow eyes with slit pupils, big curled tail, dark soft shading). The frames converted from that sheet are the canonical look and are not edited (one exception below); everything else is derived from them. Machine-readable form: `spec.js`; manifest format: `manifest.js`. Review images: `art/review/`.

## Sizes and conventions
- **Frame 96 x 64**, feet on row 61. Frames face LEFT (head left, tail right); `facing > 0` mirrors the whole canvas. Hard pixels, alpha 0 or 255, at most 32 colours (ten near-black fur tones, 3..37 per channel, plus four eye yellows, shared by every frame).
- **Sheet mode** (`SPRITE_RENDERER.mode = 'sheet'` in `../config.js`) uses a 96 x 64 box (`SHEET_SPRITE_SIZE`). The procedural cat, its effects, items and cues are drawn in a 56 x 60 area at the bottom centre of that box, so procedural coordinates stay valid. Procedural mode keeps its 56 x 60 box and is unchanged (pixel-identical over 7,560 state combinations).
- **Lighting** is added by the engine from each frame's silhouette (rim light by depth, floor pool, contact shadow, dithered aura); frames contain none. A clip's `floor` row keeps the shadow on the ground when the art is raised (leaps).
- **Eyes and whiskers are live** (`anchors.js` -> `renderer.js`): the baked eyes are covered with fur taken from just above/below and redrawn from small templates in the approved yellows, so pupil dilation (levels 0-3), gaze, focus tracking, blink, wide, happy, down and the stressed pale eyes work as on the procedural cat. Whiskers are three fine lines a side. Eye boxes and whisker roots are measured from each frame's ear tips by head type (`FACE` in `spec.js`); frames whose eyes are closed in the art (`eyesOff`) and rear heads have none.
- **Overlays follow the art**: crown and chest coin sit at per-frame anchors measured by `build.mjs anchors`; effects, items, cues, the open book and stress marks are drawn at procedural positions shifted so that the procedural head lands on the art's head (also when mirrored), so a book lies on the sheet cat's lap and effects hover over its head.

## Art folders (`art/<id>/<n>.png` -> `sheets/nomoz_<id>.png`)
Converted from the reference (`art/source/convert_reference.py`), unedited: `idle_front` (4), `walk_side` (3), `sit_threeq`, `sit_doze`, `sit_groom`, `sit_rear`, `curl` (1 each) and `stretch` (1; scaled to 0.21 to fit). The only change to an approved frame: the converter now drops stray specks from the reference sheet's text labels, which removed four stray pixel groups from `stretch`.

Built (`art/source/build_missing.py`, `paint.py`, `kit.py`). **These were made by code, pixel by pixel, from approved parts and painted fur; they were not drawn in the SpriteForge editor.**
| id | frames | what is real art and what is reused |
|---|---|---|
| walk_front | 3 (A, B, C) | head and chest from `idle_front`; the haunches removed; four legs and paws **painted** (fur-stroked, tapered, toe seams): forelegs side by side, hind legs behind at both sides, a diagonal pair forward per frame |
| walk_rear | 3 | `sit_rear` down to the rump, textured with fur strokes; two hind legs and paws **painted**; the approved curled tail raised at the side |
| walk_frontQ | 3 | approved side-walk body; the three-quarter head re-sampled from the reference to the walking head size; the neck dithered into the ruff |
| walk_rearQ | 3 | the same body with the rear head, fur-textured, dithered into the neck |
| creep_* (5) | 3 each | the matching walks with leg rows removed (a lower body) and the head lowered 2-3 px |
| leap_side | 1 | approved body with its legs **replaced by painted** reaching and pushing legs |
| leap_front | 1 | painted standing front cat with every paw tucked, raised 7 px |
| low_front, loaf_front | 2 each | the closed-eye / sitting front cat with the neck / leg rows removed |

## Which art each state uses (`manifest.js`, audited by `audit.mjs`)
- sit, front: `idle_front` (frames 0-1, 1 s); eyes closed / blink / happy: its closed frame; eyes closed + droop: `sit_doze`; forepaw at `mid` / `high`: `sit_groom`. sit, frontQ and side: `sit_threeq` (no profile sit art); rearQ and rear: `sit_rear`.
- stand, per view: moving: `walk_<view>` (front and rear play frames 0 1 2 1 at 240 ms for a full left-neutral-right-neutral cycle; the others 0 1 2 at 320 ms); still: frame 1. legs 3 (hop): `leap_front` / `leap_side` (rear hop: the walk-away art).
- crouch, per view: moving: `creep_<view>` (same cycles, slower); still: frame 1.
- stretch, curl, loaf, low: their art.
- `audit.mjs` walks 36,480 states (every pose x view x legs x paw x book x eyes x droop): all select a clip, so the procedural cat is no longer drawn in sheet mode for any known pose; it remains the fallback for a failed or missing sheet, for unknown poses, and while a sheet is loading.
- **Explicit approximations** (decided, not accidental): a raised forepaw other than grooming is not drawn, the cat keeps its paws down while the effects/cues play over it; sitting in profile uses the three-quarter sit; a rear hop uses the walk-away art; lying exists only facing front.

## Workflow (what the tools can really do)
SpriteForge here is a manual editor (`open_editor`, `open_full_editor`, `get_sprite`); it cannot generate, batch-process or export files, and this sandbox cannot download from its host. So:
1. `python3 art/source/convert_reference.py` then `python3 art/source/build_missing.py` (Pillow + numpy) rebuild every frame deterministically. After you hand-edit a frame, that PNG is the source of truth: do not re-run these over it.
2. To refine by hand: open the PNG in SpriteForge, edit, download, replace `art/<id>/<n>.png`.
3. `node build.mjs sheets` validates frames and writes `sheets/` and `anchors.js`; `node validate.mjs --strict` checks the manifest against the sheets; `node audit.mjs --strict` checks state coverage and per-frame anchors/eyes/whiskers; `python3 art/source/make_review.py` and `node art/source/review_render.cjs` regenerate `art/review/` (contact sheet of every frame, the walking cycles, and the real renderer's output for 44 states).
4. The default stays `'procedural'`.

## Known limits (honest list)
- Nothing here was hand-drawn in a pixel editor. The painted legs, textures and seam dithering are generated and read as consistent fur, but they are simpler than the approved fur: limbs are uniform columns with a lit left edge, and the rear views are smoother than the approved front views.
- Crouch walks are the walks with shorter legs (no bent joints); the hop poses are static single frames; `low_front` and `loaf_front` are approved art with rows removed.
- The three-quarter and rear walks reuse the approved side-walk body, so their legs and tail swing exactly like the side view.
- Eye templates are 5 x 3 px (4 and 3 px in the three-quarter and profile faces), matching the approved eyes' size, not their exact noise.
- Gestures with raised paws (casting, tapping, reaching) show no paw in sheet mode.

## Production readiness (the gate)
The sprite-sheet cat replaces the procedural cat only when no code-built stand-in art is used. `npm run sheets:gaps` lists exactly what is missing (`--strict` exits 1 while anything is, `--json` for tools), and `production.test.mjs` fails if `SPRITE_RENDERER.mode` is `'sheet'` while any folder is still `from: 'built'` in `spec.js`.

Approved (13 frames in 8 folders, hash-guarded): `idle_front`, `walk_side`, `sit_threeq`, `sit_doze`, `sit_groom`, `sit_rear`, `curl`, `stretch`.

Needed (33 frames in 13 folders, each 96 x 64 PNG, facing left, feet on row 61, hard alpha, the shared fur and eye colours, drawn in SpriteForge in the approved cat's style): `walk_front` (3), `walk_frontQ` (3), `walk_rearQ` (3), `walk_rear` (3), `creep_front` (3), `creep_frontQ` (3), `creep_side` (3), `creep_rearQ` (3), `creep_rear` (3), `leap_front` (1), `leap_side` (1), `low_front` (2), `loaf_front` (2). To land one: export the PNGs over `art/<id>/<n>.png`, set `from: 'reference'` in `spec.js`, run `node build.mjs sheets`, `validate.mjs --strict`, `audit.mjs --strict`. When `gaps.mjs --strict` is clean, change `SPRITE_RENDERER.mode` to `'sheet'`.

