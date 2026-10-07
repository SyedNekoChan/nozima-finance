# NOZIMA // FINANCE.SYS — Design

Black background, white monospace type, square corners, no shadows. Motion
is short, ease-out only (`cubic-bezier(0.2, 0, 0, 1)`), with no springs or
bounce. Timing comes from the tiers in `src/lib/motion.js` and the matching
CSS tokens in `src/styles/index.css`:

| Tier    | Duration | Use                                       |
| ------- | -------- | ----------------------------------------- |
| micro   | ~120ms   | hover / pressed / focus feedback          |
| state   | ~180ms   | UI state changes (tab fill, popovers)     |
| content | ~220ms   | content swaps (tabs, modals, months)      |
| data    | ~320ms   | financial figures and progress values     |
| ambient | ~700ms   | slow backdrop drift and fades (NOMOZ.EXE) |

All tiers collapse to 0ms under `prefers-reduced-motion`.

## Layering

| Layer                                   | z-index |
| --------------------------------------- | ------- |
| NOMOZ.EXE backdrop layer                | 0       |
| Active tab content                      | 10      |
| `[ ! OVER BUDGET ! ]` readout           | 20      |
| Header                                  | 30      |
| Footer                                  | 50      |
| Modals and dropdown overlays            | 50–100  |

The backdrop layer is `absolute inset-0 overflow-hidden pointer-events-none`
and `aria-hidden`. It is mounted once in the application shell, next to
(not inside) the tab content, so it is global: it belongs to no tab. It
lives inside the main area, so it never reaches the header or the fixed
footer. Nothing in it can intercept input, scroll the page, or sit above
foreground UI. Its perspective belongs to the layer itself; no foreground
element is a transformed descendant of it, so it cannot create clipping or
stacking problems for dropdowns and modals.

## Persistent budget readout

When this month's spending exceeds the monthly budget, a small boxed
`[ ! OVER BUDGET ! ]` readout is shown at the top of the main area on every
tab. It is a level-based status (no dismiss, never re-fires) and is the only
OVER BUDGET indicator in the app. The Dashboard progress bar simply renders
maxed out at 100%.

## NOMOZ.EXE — backdrop entity

NOMOZ.EXE is a 16-bit pixel-art solid-black tabby cat that lives in a
shallow 3D space behind the terminal UI. It is the single anomaly element of
the app: a secondary environmental presence, large enough to be recognised at
a glance, but always behind the primary financial content.

### Canonical reference

The attached concept art ("Solid Black Tabby") is the source of truth for
the character. Every frame, in every state, is that same cat:

- A front-facing, sitting solid-black tabby (the default pose).
- Two pointed ears with a lighter inner ear.
- A round head with faint tabby stripes on the forehead and cheeks.
- Big round black eyes, each with a bright vertical highlight.
- A small grey nose, two thin whiskers per side and a small `w` mouth
  (a proper cat face: no long jaw, no light muzzle patch and no big open
  mouth, so it never reads as a moustache or beard).
- A lighter, downward-pointing chest bib.
- Two front legs with a dark gap between them, haunches at the sides and
  a striped tail curling up on one side.

It is not an ASCII cat and not a generic pixel cat. No unrelated accessories
are added; the only extras are the crown and `$` coin of the content state.

### Persistent world

- NOMOZ.EXE belongs to the global backdrop, not to any tab. It is mounted
  once and stays mounted while Dashboard, Ledger, Calendar, Accounts (and
  anything else) change above it.
- Its world position (X, Y, Z), facing, depth, current behavior, behavior
  scheduler, random seed and animation progress all persist across tab
  changes and modal open/close. Switching tabs has no effect on any of
  them; the component does not even read the active tab.
- Foreground content may naturally cover it. That is intended: it keeps
  living behind the UI and is simply seen again wherever it has walked to.
- It is never teleported, relocated or re-placed to stay visible, and
  there is no tab-specific placement or visibility logic. It is never drawn
  above foreground content to make it visible.
- Only a physical viewport resize may clamp its position back into the
  usable range.

### Pixel art

- A 56x60 logical-pixel canvas, drawn from pixel grids and scaled by a
  whole number (3x on phones, 4x elsewhere) with `image-rendering:
  pixelated`. Edges are hard pixels: no smoothing, no gradients on the cat,
  no vector art, no CSS glow.
- Frames are built from shared parts rather than whole pre-drawn images, so
  the design cannot drift between poses: one mirrored head half-grid
  (ears, stripes, wide rounded face), a sitting torso (the reference pose) and a
  standing torso (walk cycle), one tail grid with a small sway, eye / nose /
  mouth overlays, and props (crown, `$` coin, book, objects, a 3x5 pixel
  font for cues). All of it lives in `src/lib/nomozSprites.js`.
- The art faces one way (tail on the right, as in the reference) and is
  mirrored for the other direction. Gaze and lean are screen-space.
- Breathing is a one-pixel head bob on a slow clock, with an occasional
  tail sway.

### Staying black, staying visible

The cat stays solid black; it is revealed by light instead of recolouring:

- Fur is near-black in five tones (`#000` to `#292e34`). The tones only
  separate body planes: the chest bib, inner ears, haunch and leg planes,
  tabby stripes.
- A directional rim light on the upper-left edges and a dimmer edge on the
  right (`#3b424a` and `#56606a` corners). It is computed for every pose
  from the silhouette, so walking, sleeping and reading are all lit the
  same way.
- A dithered one-pixel backlight aura just outside the silhouette.
- A dim lit floor pool under the cat with a black contact shadow under the
  paws, so the cat sits in a space instead of floating.
- Depth changes the lighting: farther placements get a weaker rim (and
  lower opacity), nearer ones a stronger rim.
- Not used: white outlines, neon edges, halos, glossy highlights, drop
  shadows. The only bright pixels are the eye highlights, the gold of the
  content state, and the cyan and red cues.

### Size

- On a 320px phone the cat is about 140px wide and 160px tall before depth
  scaling; on a wide desktop about 185px by 215px.
- Depth scaling is bounded, so it stays recognisable and never becomes
  small on narrow screens.

### State 1 — Idle

The reference cat as drawn: eyes open with highlights, a small nose and a
small `w` mouth, sitting. Its activity is driven by the behavior scheduler (below).

### State 2 — Content / prosperous

Shown when this month has income, at least 30% of it remains unspent
(net / income >= 0.3), total balance is positive, and the budget is neither
exceeded nor reached.

- The same cat, calm and comfortable: closed happy `^ ^` eyes drawn in a
  light tone so they read on black, and a small open smile under the `w`.
- A small pixel gold crown (the `[_/_]` motif) on the forehead between the
  ears.
- A gold `$` cyber-coin on the chest bib.
- Restrained behaviors: sitting, observing, polishing the coin, adjusting
  the crown, short walks, a brief glint.

### State 3 — Stressed / overspending

Shown when spending exceeds the monthly budget, or has reached it.

- The same cat, tense and fragmented: rows of the sprite slip sideways in two
  alternating frames, sparse pixels drop out of the fur, the head jitters and
  hunches, and the tail lashes.
- Wide panicked eyes (pale eye with a small pupil) and a small jagged mouth;
  the `$` charm stays on the chest.
- Detached cyan sweat droplets and red `! ? X` marks around it.
- The frames flip about every second (every 300ms for the first 3s of an
  overspend event). This is a stepped flicker, not a smooth animation.
- Nervous behaviors: short shuffles and pacing, flinching leans, rapid
  `!` / `?` glances, restrained glitches, long still periods.

### 3D space (X / Y / Z)

- The backdrop layer carries `perspective: 900px` (origin at its centre).
  The sprite is one `translate3d(x, y, z)` child, so depth is real
  perspective scaling.
- Position is tracked in screen space: `sx`, `sy` are where the sprite's
  centre appears and `z` is depth. `toTransform` converts that into the
  pre-perspective offset, so walking steps and bounds are in visible
  pixels.
- Closer (higher z) means larger, more opaque and with a stronger rim; farther
  means smaller, slightly more subdued and with a weaker rim. Depth range
  is about 0.74x–1.25x on desktop and 0.8x–1.15x on mobile.
- Depth interpolates continuously while walking, or glides over the ambient
  tier. The floor pool and contact shadow scale with the sprite, so the
  shadow responds to depth. There is no camera movement or parallax.
- Movement uses `transform` and `opacity` only. Nothing animates layout.
  The canvas keeps nearest-neighbour scaling, so pixel edges stay crisp.

### Placement

- It may be anywhere in the backdrop (X, Y and Z). The usable region keeps
  a margin from every edge (14px desktop, 6px mobile), clears the OVER
  BUDGET readout at the top, and ends at the top of the fixed footer.
- Spots are chosen at random across that region and are never chosen with
  reference to the foreground UI.
- Only the deliberate peek and edge-exit behaviors leave the visible area,
  and they are hidden by the layer's overflow clip.

### Per-load randomness

Nothing about startup is scripted. A fresh runtime seed is generated on every
page load and decides:

- Initial X, Y and depth.
- Facing direction.
- Initial pose and gaze.
- A random delay of up to about 3s before the first behavior.
- The first behavior, which is a weighted draw from the pool.

There is no fixed master loop. The seed is created once and is not reset by
tab switches or modal open/close.

### Behavior scheduler

- Each behavior has a weight per financial state, a cooldown and its own
  rhythm. The next behavior is drawn only when the previous one finishes.
- The same behavior never runs back-to-back, recent ones are down-weighted,
  and rare behaviors stay rare.
- Some behaviors nudge what tends to follow (reading is often followed by a
  stretch), which gives occasional natural chaining without any fixed chain.
- Between behaviors there is a random pause, and about one in five pauses is
  long (4–11s), so it spends real time doing nothing.
- One timer drives it at any moment. It is cleared on unmount and
  whenever the financial state changes, so two schedulers can never control
  the same entity. It is not touched by tab changes.

### Behavior library

Behaviors play through the sprite's frames (expression, pose, leg frames,
props) and are timed by the scheduler. Walking uses the standing pose with
alternating raised front paws, a body bob, and the gaze turned toward the
direction of travel.

| Behavior       | What it does                                                        |
| -------------- | ------------------------------------------------------------------- |
| sit            | settles and observes the app, blinking                              |
| observe        | holds one position and sweeps its gaze around                       |
| look           | quick glances left / right                                          |
| lookUp         | looks upward at something passing overhead                          |
| ponder         | thought cue (`. o ?`)                                               |
| ponderSymbol   | studies a financial-looking symbol or number (`$?`, `12%`, `+1`)    |
| stillness      | sits motionless for a long time, then moves on                      |
| sleep          | head dips, eyes close, `z` / `zZ` cue                               |
| tired          | a short rest with a subtle `z`                                      |
| stretch        | lowers its head and reaches its paws forward, then relaxes          |
| read           | see below                                                           |
| inspect        | finds a small pixel object on the ground and examines it            |
| floatSymbol    | follows a drifting symbol with its eyes, then pops it               |
| followPixel    | tracks a block drifting across the top of the backdrop              |
| coinPolish     | checks its `$` coin (sparkle)                                       |
| crown          | examines a crown overhead (content: adjusts its own)                |
| curious        | notices something off-screen, may step toward it, returns           |
| glitch         | a restrained flicker: rows slip sideways with a cyan ghost          |
| walk           | continuous walking to a nearby spot, sometimes stopping partway     |
| travel         | walks to a far destination and pauses there for a long time         |
| retreat        | walks deep into the background and watches from there               |
| approach       | comes closer to the foreground as though investigating the UI       |
| peek           | slides partly in from a screen edge, looks around, withdraws        |
| edgeExit       | leaves past an edge and re-enters elsewhere                         |
| relocate       | fades out and reappears in a different spot of its own choosing     |
| twitch         | a one-pixel lean and back                                           |

### Reading a book

A rare, randomized-length behavior (about 10–22s). It may first walk to a
nearby comfortable spot, then settles into the sitting pose, lowers its head
and holds an open pixel-art book in its lap, with its paws resting on the
edges. It looks down at the page, occasionally turns a page (the book changes
over three short frames), glances up briefly, and returns to the page. The
book disappears when it finishes.

### Financial context and reactions

- The persistent state is derived by `deriveNomozMood` from the existing
  store selectors (budget, spend, ledger totals, total balance). No
  financial calculation or rule is changed.
- One-shot reactions come from the existing `anomalyEvent` and last only
  seconds. They never become permanent animations:
  - `INCOME` — happy eyes and a `$` cue.
  - `EXPENSE` — wide eyes and a droplet cue.
  - `TRANSFER` — a left-then-right glance.
  - `OVERSPEND` — fast frame flicker and an `X` cue for 3s, then the
    persistent stressed state takes over.
  - `CELEBRATE` — happy eyes and a `*` cue.
- On the special calendar date, a pixel heart cue appears for 8s, once per
  day.
- Switching states cross-fades the sprite over the content/exit tiers.

### Responsive behavior

- The same cat, states and behaviors on every device; only the whole-number
  scale and movement ranges differ.
- Layer widths under 640px use the compact profile: smaller edge margin,
  shorter walks, a narrower depth range, and smaller wander radii. X, Y
  and Z variation is still meaningful.
- Scale depends only on the viewport and depth, never on the active tab.
- No horizontal scrolling at 320–375px, no overlap with the fixed footer,
  and it is never interactive: `pointer-events: none` and `aria-hidden`.

### Performance

- The sprite is a small canvas redrawn only when its frame changes (a few
  times per second at most), not an animation loop. The scheduler uses one
  timeout and one slow animation clock, and rim lighting is recomputed
  only for those redraws.
- Tab switches cause no re-render of the entity and no timer churn.

### Reduced motion

With `prefers-reduced-motion: reduce`:

- The initial placement is still random and the correct state is shown.
- Walking, peeking, depth drift, leans, glitches, the animation clock and
  all position/opacity transitions are disabled.
- Only stationary behaviors remain (sit, observe, look, look up, ponder,
  sleep, rest, stretch, read, inspect, coin and crown checks), on a slower
  cadence.
- State changes are instant.
