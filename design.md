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

NOMOZ.EXE is a small 32-bit pixel-art cat sprite that lives in a shallow 3D
space behind the terminal UI. It is the single anomaly element of the app:
a secondary environmental presence, large enough to be recognised at a
glance, but always behind the primary financial content.

### Persistent world

- NOMOZ.EXE belongs to the global backdrop, not to any tab. It is mounted
  once and stays mounted while Dashboard, Ledger, Calendar, Accounts (and
  anything else) change above it.
- Its world position (X, Y, Z), facing, depth, current behavior, behavior
  scheduler, random seed and animation progress all persist across tab
  changes and modal open/close. Switching tabs has zero effect on any of
  them; the component does not even read the active tab.
- Foreground content may naturally cover it. That is intended: it keeps
  living behind the UI and is simply seen again wherever it has walked to
  once the UI above it no longer covers that spot.
- It is never teleported, relocated or re-placed to stay visible, and
  there is no tab-specific placement or visibility logic. It is also never
  drawn above foreground content to make it visible.
- Only a physical viewport resize may clamp its position back into the
  usable range.

### Visual language

- A hand-authored 32x32 pixel sprite, drawn on a small canvas from pixel
  grids and scaled with whole-number scales and `image-rendering:
  pixelated`. Edges are hard pixels; there is no smoothing, no gradient, no
  vector art and no filter applied to another rendering.
- A restrained retro palette that suits the dark terminal: grey fur in four
  shades with one pink accent for ears and nose, ink for eyes, a small gold
  accent for the crown and coin, cyan for cues and cyber glitches, and red
  only for stress marks.
- A clearly cat-like silhouette: pointed ears with pink inner ears, a cat
  head with a small muzzle and whiskers, a compact body, paws and a
  visible tail.
- It is organised as reusable parts rather than whole pre-drawn images:
  front-view parts (head, body, legs, tail), a side-profile walk cycle with
  two leg frames, and props (crown, `$` coin, book with three page frames,
  small objects, a 3x5 pixel font for cues and symbols). Expressions, poses
  and moods are combined from these parts.
- Both views face right and are mirrored for left. Walking uses the side
  profile; everything else uses the front view.

### Size

- The sprite is 32 logical pixels, scaled by a whole number from 4x to 8x
  according to the backdrop width: 128px on the narrowest phones (the
  deliberate minimum readable size) up to 256px on wide desktops, before
  depth scaling.
- Depth scaling is bounded, so it stays recognisable and never shrinks
  below roughly 100px wide on a 320px phone.

### State 1 — Idle

Shown whenever neither of the other states applies: a plain grey cat with
open eyes and a small nose and mouth. Its activity is driven by the
behavior scheduler (below). A slow one-pixel breathing bob and occasional
tail flick keep it alive without constant motion.

### State 2 — Content / prosperous

Shown when this month has income, at least 30% of it remains unspent
(net / income >= 0.3), total balance is positive, and the budget is neither
exceeded nor reached.

- Happy `^ ^` pixel eyes and a smile.
- A small pixel gold crown (the `[_/_]` motif) between the ears.
- A gold `$` cyber-coin set into the chest.
- Composed and satisfied: calm posture, restrained behaviors (sitting,
  observing, polishing the coin, adjusting the crown, short walks, a brief
  glint).

### State 3 — Stressed / overspending

Shown when spending exceeds the monthly budget, or has reached it.

- The same cat, fragmented: rows of the sprite slip sideways in two
  alternating frames and sparse pixels drop out.
- Panicked wide eyes with `< >` pupils, a jagged mouth, the `$` charm still
  on the chest.
- Detached cyan sweat droplets and red `! ? X` marks around it.
- The frames flip about every second (every 300ms for the first 3s of an
  overspend event). This is a stepped flicker, not a smooth animation.
- Behaviors are nervous: short shuffles and pacing, flinching leans, rapid
  `!` / `?` glances, restrained glitches, long still periods.

### 3D space (X / Y / Z)

- The backdrop layer carries `perspective: 900px` (origin at its centre).
  The sprite is one `translate3d(x, y, z)` child, so depth is real
  perspective scaling.
- Position is tracked in screen space: `sx`, `sy` are where the sprite's
  centre appears and `z` is depth. `toTransform` converts that into the
  pre-perspective offset, so walking steps and bounds are in visible
  pixels.
- Moving closer (higher z) makes it larger and slightly stronger; moving
  farther makes it smaller and slightly fainter. Depth range is about
  0.74x–1.25x on desktop and 0.8x–1.15x on mobile.
- Depth interpolates continuously while walking, or glides over the ambient
  tier. There is no camera movement or parallax.
- Movement uses `transform` and `opacity` only. Nothing animates layout.
  The canvas keeps nearest-neighbour scaling, so pixel edges stay crisp
  while moving through depth.

### Placement

- It may be anywhere in the backdrop (X, Y and Z). The usable region keeps
  a margin from every edge (14px desktop, 6px mobile), clears the OVER
  BUDGET readout at the top, and ends at the top of the fixed footer.
- Spots are chosen at random across that region. They are never chosen
  with reference to the foreground UI.
- Only the deliberate peek and edge-exit behaviors leave the visible area,
  and they are hidden by the layer's overflow clip.

### Per-load randomness

Nothing about startup is scripted. A fresh runtime seed is generated on every
page load and decides:

- Initial X, Y and depth.
- Facing direction (which way it looks and where its tail trails).
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

Behaviors play through the frame-based sprite (expression, pose, leg frames,
props) and are timed by the scheduler.

| Behavior       | What it does                                                        |
| -------------- | ------------------------------------------------------------------- |
| sit            | settles and observes the app, blinking                              |
| observe        | holds one position and sweeps its gaze around                       |
| look           | quick glances left / right                                          |
| lookUp         | looks upward at something passing overhead                          |
| ponder         | thought cue (`. o ?`)                                               |
| ponderSymbol   | studies a financial-looking symbol or number (`$?`, `12%`, `+1`)    |
| stillness      | sits motionless for a long time, then moves on                      |
| sleep          | sits with closed eyes and a `z` / `zZ` cue                          |
| tired          | a short rest with a subtle `z`                                      |
| stretch        | extends its body, then relaxes                                      |
| read           | see below                                                           |
| inspect        | finds a small pixel object on the ground and examines it            |
| floatSymbol    | follows a drifting symbol with its eyes, then pops it               |
| followPixel    | tracks a block drifting across the backdrop                         |
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
| twitch         | a one-pixel-step lean and back                                      |

Walking is stepped with alternating leg frames in the side profile and a
linear glide per step, so it reads as continuous walking. Looking, sitting,
sleeping, stretching and the activities use the front view.

### Reading a book

A rare, randomized-length behavior (about 10–22s). It may first walk to a
nearby comfortable spot, then sits and holds an open pixel book (white
pages, cyan cover) in its paws. It looks down at the page, occasionally
turns a page (the book changes over three short frames), glances up
briefly, and returns to the page. The book disappears when it finishes.

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

- The same sprite, states and behaviors on every device.
- Layer widths under 640px use the compact profile: smaller edge margin,
  shorter walks, a narrower depth range, and smaller wander radii. X, Y
  and Z variation is still meaningful.
- Scale depends only on the viewport and depth, never on the active tab.
- No horizontal scrolling at 320–375px, no overlap with the fixed footer,
  and it is never interactive: `pointer-events: none` and `aria-hidden`.

### Performance

- The sprite is a 32x32 canvas redrawn only when its frame changes (a few
  times per second at most), not an animation loop; the scheduler uses one
  timeout and one slow animation clock.
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
