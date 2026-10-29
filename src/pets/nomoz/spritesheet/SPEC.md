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

**Generated art, 51 frames in 13 folders** (`from: 'generated'` in `spec.js`). **These were rendered by code, not drawn by hand and not made in SpriteForge.** `art/source/generate_production.py` builds each pose from `cat_model.py` (an articulated ellipsoid cat: spine-chain torso, belly and chest fur, two-bone-IK legs, plume tail) and `render_cat.py` (orthographic render from the requested azimuth with a slight camera tilt, a light from the upper left plus a rim light, normals smoothed from the depth buffer, fur-flow noise, ordered dither into the ten approved fur tones, a dark contour, depth-based separation lines between limbs, fluffy tufts on the soft parts, stray-pixel cleanup, then grounding so planted paws end on row 61). The head and chest ruff of each view are the **approved pixels** of the matching reference frame, pasted at their original size and thinned into the render (`idle_front` for front views, `sit_threeq` for three-quarter front, `walk_side` for side, `sit_rear` for the rear); only the rear three-quarter head is rendered (`head3d`). Nothing is mirrored or copied from another pose: every frame is its own render.

| id | frames | what it shows |
|---|---|---|
| walk_front | 5 | toward us: contact, standing (all paws down), contact, two passing poses; the forward fore paw is nearer and lower; the tail curls up behind the haunch |
| walk_frontQ | 5 | three-quarter toward us, facing left, tail up |
| walk_rearQ | 5 | three-quarter away, facing left, rendered head, tail up |
| walk_rear | 5 | away from us, the tail rising from the rump and curling past the head (drawn in front of it) |
| creep_front / creep_frontQ / creep_side / creep_rearQ / creep_rear | 5 each | the same five views crouched: belly low (but the legs show), shorter strides, head lowered, tail trailing in a flowing curve |
| leap_front | 1 | airborne, pouncing at us: the body pitched toward the viewer, forelegs thrown wide and forward, hind legs kicked out behind, tail streaming; no planted leg, raised (lowest row 54) |
| leap_side | 1 | mid-hop, the body pitched nose up, forelegs reaching, hind legs stretched behind, tail streaming, raised (lowest row 54) |
| low_front | 2 | head down, eyes closed (the closed-eye approved head), body low, two forepaws resting in front of the chest; two breathing frames |
| loaf_front | 2 | lying like a loaf, forepaws tucked; two breathing frames |

## Motion on top of the still frames (`tail.js`, `renderer.js`)
The sheets hold still frames, so three things move at run time instead of being baked.
- **Tail.** Every frame lists its tail pixels (`art/tails.json`, merged into `anchors.js` as `tail`: a box of `#` rows, the base and the tip of the spine). Generated frames record theirs from the render (`generate_production.py` knows which pixels are the tail); the approved frames are cut by hand-drawn polygons in `art/source/tail_regions.py`, which only reads the approved art. Every redraw bends those pixels about the base with a wave that travels down the tail (the root stays, the tip lags), so the art is never edited. The swing eases between states (idle, grooming, dozing, walking, `swish`, `lash`, `up`, `still`) and its phase is continuous, so it never snaps; it never stops while the cat idles, grooms, dozes or walks (`still` only calms it). Reduced motion draws the still frame.
- **Tongue.** `sit_groom` draws a pink tongue (four pixels wide, a light tip and a shaded underside) at the muzzle (`lick` in `manifest.js`). Every 620 ms, while a forepaw is at the mouth, it shows its tip, strokes out onto the paw, and goes back; every fifth stroke is a pause. The head above row 36 dips a row while the paw rectangle (`lick.paw`) comes up a row to meet it, and the licked fur shines (`lick.sheen`) for a moment after the tongue goes in. A scripted `mouth: 'lick'` (eating, the end of a groom) shows the tongue under the muzzle of front and three-quarter faces (`mouth` anchor).
- **Breath and cross-fade.** `sit_threeq`, `sit_doze` and `sit_rear` (one frame each) drop everything above a row by one row for 45% of every 3.6-4.4 s. When the clip changes the frame that was on screen fades out over 120 ms under the new one, so poses do not cut.
- The renderer redraws about every 100 ms (60 ms while licking) while any of this moves, and not at all while the tab is hidden.

## Which art each state uses (`manifest.js`, audited by `audit.mjs`)
- sit, front: `idle_front` (frames 0-1, 1 s); eyes closed / blink / happy: its closed frame; eyes closed + droop: `sit_doze`; forepaw at `mid` / `high`: `sit_groom`. sit, frontQ and side: `sit_threeq` (no profile sit art); rearQ and rear: `sit_rear`.
- stand, per view: moving: `walk_<view>`; still: frame 1. legs 3 (hop): `leap_front` / `leap_side` (rear hop: the walk-away art).
- The approved `walk_side` loops 0 1 2 at 320 ms. Every generated walk and creep has five poses (0 and 2 the two contacts, 1 all four paws down, 3 and 4 the two passing poses with the body at its highest) and plays 0 3 2 4 (240 ms / 300 ms per frame, a full stride in four beats). Frame 1 is also the standing pose. In the contacts the weight drops a little, in the passing poses it rises.
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
- The tail bend is a displacement of the art's own pixels. Large swings (`swish`, `lash`) lag less along the tail and are capped (3.8 / 4.2 px at the tip), so the outline moves by at most about half a pixel per row; `smoothEdges` fills one-pixel notches and drops one-pixel spurs, copying colours, never blending. The art's own fur tufts still shimmer a little as they move.
- The three-quarter views are still the weakest of the generated art. `walk_frontQ` / `creep_frontQ` now have a narrower chest under the head and a visible haunch, but the body is still a smooth render beside the approved sitting cat; the rendered rear three-quarter head (cheek ruffs, muzzle, nape, tufted ears) is better but is a render, not a drawing. There is no generated sitting three-quarter art: `sit_frontQ` is the approved `sit_threeq`, which is not edited.
- `low_front` reads as a seated cat with its head down rather than a crouch (its forepaws are small bumps at the bottom edge); `loaf_front` hides the body behind the head. `leap_front` is a convincing pounce but its legs are smooth tubes without toes.
- Step cycles are five keyed poses (two contacts, two passings, standing); there is no in-betweening between them (the 120 ms cross-fade only covers clip changes).
- Eye templates are 5 x 3 px (4 and 3 px in the three-quarter and profile faces), matching the approved eyes' size, not their exact noise.
- Gestures with raised paws (casting, tapping, reaching) show no paw in sheet mode.

## Production readiness (the gate)
The sprite-sheet cat is the production pet (`SPRITE_RENDERER.mode` is `'sheet'`). It may stay that way only while no code-built stand-in art is used: `npm run sheets:gaps` lists any (`--strict` exits 1 while there are any, `--json` for tools), and `production.test.mjs` fails if the mode is `'sheet'` while any folder is `from: 'built'`, and checks the generated frames (counts, palette, hard alpha, feet rows, no duplicates or mirrors, distinct leg poses per cycle).
