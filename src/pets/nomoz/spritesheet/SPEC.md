# NOMOZ.EXE sprite-sheet production spec

Reference: `art/source/reference.webp`, the user's concept sheet (a fluffy long-haired black cat, round yellow eyes with slit pupils, big curled tail, dark soft shading). That sheet, not the old procedural cat, defines the look. Machine-readable form: `spec.js`; manifest format: `manifest.js`.

## Sizes and conventions
- **Frame 96 x 64**, one cat per frame, feet on row 61 (the last opaque row; two rows stay empty below). Frames face LEFT (head left, tail right); `facing > 0` mirrors the canvas. Hard pixels, alpha 0 or 255, at most 32 colours (the converted set uses 10 fur tones + 4 eye yellows).
- **Why 96 x 64**: at the pet's pixel density (about 3.6 reference pixels per sprite pixel) the reference cat is 47 x 54 sitting but 82-87 px long walking. The procedural box is 56 x 60, so sheet mode (`SPRITE_RENDERER.mode = 'sheet'`) uses `SHEET_SPRITE_SIZE` (96 x 64) in `../config.js`. The procedural cat, effects, items and cues are drawn in a 56 x 60 area centred at the bottom of that box, so every procedural coordinate (behaviours, props, paw spots) stays valid and the procedural cat remains the per-frame fallback. Procedural mode keeps its 56 x 60 box and is unchanged (checked pixel-for-pixel over 7,560 state combinations).
- **Lighting** is done by the engine from each frame's silhouette (rim light on the upper-left and right edges by depth, floor pool, contact shadow, dithered aura), so frames contain no baked rim or shadow. A clip can opt out with `lighting: 'baked'`.
- **Eyes are baked** into the art (open, wink, closed frames). Live pupil dilation and gaze shifts exist only on the procedural cat. The procedural eyes can be kept over sheet art through `dynamic` rectangles; this is not used with the reference-style cat.
- **Vanity** (crown, chest coin) is drawn at the clip's `anchors` (per art, canvas coordinates). Effects, items, cues and the open book are drawn at the procedural positions, so they do not follow sheet art yet; rules therefore exclude `book` and raised paws.

## Art folders (`art/<id>/<n>.png`, assembled to `sheets/nomoz_<id>.png`)
| id | frames | status | used for |
|---|---|---|---|
| idle_front | 4 (open, open, wink, closed) | converted from the reference | sit, front: frames 0-1 loop at 1 s; closed eyes (closed, blink, happy) use frame 3 |
| walk_side | 3 | converted, flipped to face left | stand, moving, side: 320 ms per frame |
| sit_threeq | 1 | converted | sit, frontQ |
| sit_doze | 1 | converted | sit, front, eyes closed + droop |
| sit_groom | 1 | converted | sit, front, a forepaw raised (mid / high) |
| sit_rear | 1 | converted | sit, rear |
| curl | 1 | converted | pose curl |
| stretch | 1 | converted (scaled to 0.21 to fit) | pose stretch |
| walk_front, walk_frontQ, walk_rearQ, walk_rear | 3 each | NOT DRAWN (not in the reference) | stand, moving, other views |
| creep_front / frontQ / side / rearQ / rear | 3 each | NOT DRAWN | crouch, moving |
| leap_front, leap_side | 1 each | NOT DRAWN | stand, legs 3 |
| sit_side, low_front, loaf_front | 1-2 | NOT DRAWN | sit in profile; head down; lying |

Everything not drawn keeps the procedural cat (a different style) until it is drawn.

## Workflow (what the tools can really do)
SpriteForge here is a manual editor: `open_editor` / `open_full_editor` open a PNG or pixel grid in a browser editor and return a link; `get_sprite` reads a session back (palette, pixel grid, PNG url). It cannot generate, batch-process or export files, and this sandbox cannot download from its host (blocked by the egress proxy).
1. The first frames were produced mechanically from the reference: `python3 art/source/convert_reference.py` (Pillow + numpy). It crops each cat, removes the grid lines, area-averages to the sprite density, quantises to a shared palette and places the frame. It is a conversion, not new art. Do not re-run it over hand-finished frames.
2. Refine a frame by hand: open its PNG in SpriteForge (`png_base64`), edit, download the PNG from the editor, replace `art/<id>/<n>.png`. New art (the NOT DRAWN rows) is drawn the same way, in the reference's style, at 96 x 64, facing left, feet on row 61.
3. `node src/pets/nomoz/spritesheet/build.mjs check` validates frames; `... sheets` assembles `sheets/nomoz_<id>.png`; `node src/pets/nomoz/spritesheet/validate.mjs` checks the manifest against the sheets.
4. Register the sheet, clip and rule in `manifest.js` (`anchors` from the art), then try it with `SPRITE_RENDERER.mode = 'sheet'`. The default stays `'procedural'` until coverage is reliable.

## Known limits of the current set
- Only the front-sitting, side-walking and a few static poses exist; other views, crouching, leaping, lying and head-down are procedural.
- Anchors for the crown and chest coin are first estimates, to be checked by eye per pose.
- Whiskers of the reference are too thin to survive the conversion (about half a pixel) and are not in the frames.
- Sheet art is dark; the engine adds the rim light, and brightness may need tuning after viewing it in the app.
