/*
 * NOMOZ.EXE sprite-sheet asset manifest.
 *
 * This is the one place where sprite sheets and animation clips are
 * registered. The renderer (./renderer.js), the loader (./loader.js) and
 * the scheduler never change when an asset is added: append to `sheets`,
 * `clips` and `select` below. While the manifest is empty (or the sprite
 * renderer mode in ../config.js is 'procedural', the default) the cat is
 * drawn by the procedural renderer in ../sprites.js exactly as before.
 *
 * CONVENTIONS
 *   - Frames are authored in BASE SPACE, like the procedural art: the cat
 *     faces LEFT, its tail is on the right. `facing > 0` mirrors the whole
 *     composite, so never author a right-facing variant.
 *   - One frame is normally the sprite box (56 x 60, see SPRITE_SIZE in
 *     ../config.js) with the cat where the procedural cat stands. Other
 *     frame sizes are allowed; `pivot` (a point in the frame) is placed on
 *     `anchor` (a point in the sprite box). Defaults: pivot = bottom centre
 *     of the frame, anchor = bottom centre of the box.
 *   - Palette and lighting: bake them into the sheet, or leave
 *     `lighting: 'procedural'` (default) to keep the pet's floor pool,
 *     contact shadow and depth aura under the sheet art.
 *   - Sheets are PNGs (indexed or RGBA, hard pixels, no smoothing). Give a
 *     URL, for example  new URL('./sheets/nomoz.png', import.meta.url).href
 *
 * SHEETS   id -> { src, frameWidth, frameHeight, columns, rows,
 *                  margin = 0, spacing = 0 }
 *   Frame i (row-major) sits at column i % columns, row floor(i / columns).
 *
 * CLIPS    id -> {
 *     sheet            a sheet id
 *     row, start?, count?   frames of one sheet row  ... or ...
 *     frames: [i, ...]      explicit frame indices
 *     ms               frame duration: a number, or one per frame (default 120)
 *     loop             true (default) loops; false plays once and holds
 *                      its last frame
 *     next             clip id started when a one-shot finishes
 *     lock             a one-shot that finishes before a different clip
 *                      may replace it (it is never cut short by a pose or
 *                      view change)
 *     still            frame position shown under prefers-reduced-motion
 *     pivot, anchor    see above
 *     lighting         'procedural' (default) | 'baked'
 *     dynamic: {       procedural pixels kept ON TOP of the sheet art, so
 *       head: [[x, y, w, h], ...]   eyes / pupils / mouth keep reacting;
 *                        rectangles are relative to the head anchor
 *                        (the cat's hx, hy of that frame)
 *       base: [[x, y, w, h], ...]   rectangles in sprite space (a tail, a
 *                        raised paw...)
 *       whiskers: bool   keep the procedural whiskers
 *     }                Inside a rectangle the sheet pixels are cleared and
 *                      the procedural cat's pixels are drawn instead.
 *   }
 *
 * SELECT   ordered rules, first match wins: { when, clip }
 *   `when` compares render-state fields (pose, view, legs, moving, eyes,
 *   mouth, tail, ears, pawL, pawR, book, mood, ...). A value may be a
 *   literal, an array (any of), true (set) or false (unset). `moving` is
 *   true while legs is 1, 2 or 3. Direction is just the `view` field
 *   (front, frontQ, side, rearQ, rear), so every view gets its own rule.
 *   No matching rule, or a clip that cannot be shown (sheet missing,
 *   still loading, bad frame), means the procedural cat is drawn for that
 *   frame; the two are never mixed within a frame unless a clip says so.
 *
 * Example (kept as a comment; nothing is registered yet):
 *
 *   sheets: { cat: { src: new URL('./sheets/cat.png', import.meta.url).href,
 *                    frameWidth: 56, frameHeight: 60, columns: 8, rows: 10 } },
 *   clips: {
 *     idleFront: { sheet: 'cat', row: 0, count: 2, ms: 600,
 *                  dynamic: { head: [[6, 9, 14, 6]] } },
 *     walkSide:  { sheet: 'cat', row: 4, count: 4, ms: 140 },
 *     turnToSide: { sheet: 'cat', row: 5, count: 3, ms: 110, loop: false, lock: true },
 *   },
 *   select: [
 *     { when: { pose: 'stand', moving: true, view: 'side' }, clip: 'walkSide' },
 *     { when: { pose: 'sit', moving: false, view: 'front' }, clip: 'idleFront' },
 *   ],
 */
export const SHEET_MANIFEST = {
  sheets: {},
  clips: {},
  select: [],
};
