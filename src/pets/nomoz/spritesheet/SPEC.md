# NOMOZ.EXE sprite-sheet production spec

Reference: `art/source/reference.webp`, the user's concept sheet (a fluffy long-haired black cat, round yellow eyes with slit pupils, big curled tail, dark soft shading). The frames converted from that sheet are the canonical look and are not edited (one exception below); everything else is derived from them. Machine-readable form: `spec.js`; manifest format: `manifest.js`. Review images: `art/review/`.

## Sizes and conventions
- **Frame 96 x 64**, feet on row 61. Frames face LEFT (head left, tail right); `facing > 0` mirrors the whole canvas. Hard pixels, alpha 0 or 255, at most 32 colours (ten near-black fur tones, 3..37 per channel, plus four eye yellows, shared by every frame).
- **Sheet mode** (`SPRITE_RENDERER.mode = 'sheet'` in `../config.js`) uses a 96 x 64 box (`SHEET_SPRITE_SIZE`). The procedural cat, its effects, items and cues are drawn in a 56 x 60 area at the bottom centre of that box, so procedural coordinates stay valid. Procedural mode keeps its 56 x 60 box and is unchanged (pixel-identical over 7,560 state combinations).
- **Lighting** is added by the engine from each frame's silhouette (rim light by depth, floor pool, contact shadow, dithered aura); frames contain none. A clip's `floor` row keeps the shadow on the ground when the art is raised (leaps).
- **Eyes and whiskers are live** (`anchors.js` -> `renderer.js`): the baked eyes are covered with fur taken from just above/below and redrawn from small templates in the approved yellows, so pupil dilation (levels 0-3), gaze, focus tracking, blink, wide, happy, down and the stressed pale eyes work as on the procedural cat. Whiskers are three fine lines a side. Eye boxes and whisker roots are measured from each frame's ear tips by head type (`FACE` in `spec.js`); frames whose eyes are closed in the art (`eyesOff`) and rear heads have none.
- **Overlays follow the art**: crown and chest coin sit at per-frame anchors measured by `build.mjs anchors`; effects, items, cues, the open book and stress marks are drawn at procedural positions shifted so that the procedural head lands on the art's head (also when mirrored), so a book lies on the sheet cat's lap and effects hover over its head.

## Art folders (`art/<id>/<n>.png` -> `sheets/nomoz_<id>.png`)
**Reference (approved) art, 13 frames in 8 folders**, converted from the reference sheet by `art/source/convert_reference.py` and never edited: `idle_front` (4), `walk_side` (3), `sit_threeq`, `sit_doze`, `sit_groom`, `sit_rear`, `curl`, `stretch` (1 each). Their sha-256 prefixes are pinned in `spritesheet.test.mjs`.

**Generated art, 33 frames in 13 folders** (`from: 'generated'` in `spec.js`). **These were rendered by code, not drawn by hand and not made in SpriteForge.** `art/source/generate_production.py` builds each pose from `cat_model.py` (an articulated ellipsoid cat: spine-chain torso, belly and chest fur, two-bone-IK legs, plume tail) and `render_cat.py` (orthographic render from the requested azimuth with a slight camera tilt, a light from the upper left plus a rim light, normals smoothed from the depth buffer, fur-flow noise, ordered dither into the ten approved fur tones, a dark contour, depth-based separation lines between limbs, fluffy tufts on the soft parts, stray-pixel cleanup, then grounding so planted paws end on row 61). The head and chest ruff of each view are the **approved pixels** of the matching reference frame, pasted at their original size and thinned into the render (`idle_front` for front views, `sit_threeq` for three-quarter front, `walk_side` for side, `sit_rear` for the rear); only the rear three-quarter head is rendered (`head3d`). Nothing is mirrored or copied from another pose: every frame is its own render.

| id | frames | what it shows |
|---|---|---|
| walk_front | 3 | toward us: contact left, passing (all paws down), contact right; the forward fore paw is nearer and lower |
| walk_frontQ | 3 | three-quarter toward us, facing left, tail up |
| walk_rearQ | 3 | three-quarter away, facing left, rendered head, tail up |
| walk_rear | 3 | away from us, tail raised at one side |
| creep_front / creep_frontQ / creep_side / creep_rearQ / creep_rear | 3 each | the same five views crouched: belly low, shorter strides, head lowered, tail trailing |
| leap_front | 1 | mid-hop toward us, forelegs reaching, raised 7 px (lowest row 54) |
| leap_side | 1 | mid-hop, forelegs reaching, hind legs pushing, raised 7 px |
| low_front | 2 | head down, eyes closed (the closed-eye approved head), body low; two breathing frames |
| loaf_front | 2 | lying like a loaf, forepaws tucked; two breathing frames |

## Which art each state uses (`manifest.js`, audited by `audit.mjs`)
- sit, front: `idle_front` (frames 0-1, 1 s); eyes closed / blink / happy: its closed frame; eyes closed + droop: `sit_doze`; forepaw at `mid` / `high`: `sit_groom`. sit, frontQ and side: `sit_threeq` (no profile sit art); rearQ and rear: `sit_rear`.
- stand, per view: moving: `walk_<view>`; still: frame 1. legs 3 (hop): `leap_front` / `leap_side` (rear hop: the walk-away art).
- The approved `walk_side` loops 0 1 2 at 320 ms. Every generated walk and creep is contact, passing, contact, played 0 1 2 1 (240 ms / 300 ms per frame). Frame 1 of each is also the standing pose (all four paws down).
- crouch, per view: moving: `creep_<view>`; still: frame 1.
- stretch, curl, loaf, low: their art.
- `audit.mjs` walks 36,480 states (every pose x view x legs x paw x book x eyes x droop): all select a clip. The procedural cat remains the fallback for a failed or missing sheet, for unknown poses, while a sheet is loading, and for the live eyes, whiskers and effects drawn over the art.
- **Explicit approximations** (decided, not accidental): a raised forepaw other than grooming is not drawn (the cat keeps its paws down while the effects play over it); sitting in profile uses the three-quarter sit; a rear hop uses the walk-away art; lying exists only facing front.

## Workflow
1. `python3 art/source/generate_production.py $(pwd)/art` regenerates the 13 generated folders (Pillow + numpy; deterministic). It only reads the approved folders. After you hand-finish a frame, that PNG is the source of truth: do not regenerate over it.
2. To refine by hand (SpriteForge or any editor): replace `art/<id>/<n>.png` with a 96 x 64 PNG that keeps the palette, hard alpha and feet on row 61.
3. `node build.mjs sheets` validates frames and writes `sheets/` and `anchors.js`; `node validate.mjs --strict` checks the manifest against the sheets; `node audit.mjs --strict` checks state coverage and per-frame anchors / eyes / whiskers; `python3 art/source/review_cycles.py out.png [walk|creep]` and `review_gen.py` draw review sheets; `node art/source/review_render.cjs` renders the real renderer's output for 44 states.
4. `npm run sheets:gaps -- --strict` must pass (no stand-ins) before `SPRITE_RENDERER.mode` is `'sheet'`, which it now is.

## Known limits (honest list)
- **The generated frames are a step below the approved ones.** They are cleanly shaded renders with a coherent fur texture, but they lack the hand-placed fur strokes, the sharp chest chevrons and the deliberate dark gap lines of the reference frames; limbs are smoother and more uniform, paws have no toe detail, and the silhouettes are tidier than the approved ones. They are a production-grade first pass for hand-finishing, not a replacement for it.
- The generated bodies are rounder and stockier than the long, slender approved side walk (`walk_side`), so the side walk and the three-quarter walks differ in build.
- The three-quarter views (`walk_frontQ`, `walk_rearQ`) are the weakest: the tail is a stiff upright plume, and the rendered rear three-quarter head is plain.
- `low_front` reads as a seated cat with its head down rather than a crouch; `loaf_front` hides the body behind the head.
- Step cycles are three keyed poses (contact, passing, contact) played out and back; there is no in-betweening.
- Eye templates are 5 x 3 px (4 and 3 px in the three-quarter and profile faces), matching the approved eyes' size, not their exact noise.
- Gestures with raised paws (casting, tapping, reaching) show no paw in sheet mode.

## Production readiness (the gate)
The sprite-sheet cat is the production pet (`SPRITE_RENDERER.mode` is `'sheet'`). It may stay that way only while no code-built stand-in art is used: `npm run sheets:gaps` lists any (`--strict` exits 1 while there are any, `--json` for tools), and `production.test.mjs` fails if the mode is `'sheet'` while any folder is `from: 'built'`, and checks the generated frames (counts, palette, hard alpha, feet rows, no duplicates or mirrors, distinct leg poses per cycle).
