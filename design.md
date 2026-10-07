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
and `aria-hidden`. It lives inside the main area, so it never reaches the
header or the fixed footer. Nothing in it can intercept input, scroll the
page, or sit above foreground UI. Its perspective belongs to the layer
itself; no foreground element is a transformed descendant of it, so it
cannot create clipping or stacking problems for dropdowns and modals.

## Persistent budget readout

When this month's spending exceeds the monthly budget, a small boxed
`[ ! OVER BUDGET ! ]` readout is shown at the top of the main area on every
tab. It is a level-based status (no dismiss, never re-fires) and is the only
OVER BUDGET indicator in the app. The Dashboard progress bar simply renders
maxed out at 100%.

## NOMOZ.EXE — backdrop entity

NOMOZ.EXE is a character-based ASCII entity that lives in a shallow 3D
space behind the terminal UI. It is the single anomaly element of the app:
a secondary environmental presence, large enough to be recognised at a
glance, but always behind the primary financial content.

### Visual language

- Built only from text: block characters `█ ▒ ░ ▀`, and ASCII
  `/ \ _ = - ^ < > ? ! X ' $ [ ] . w v`.
- Rendered as monospace text in a `<pre>`. No SVG, images, canvases,
  gradients, blur or smooth illustration.
- Its silhouette is cat-like, as an aesthetic identity only: two pointed
  ears (`/\` over `/██\`), a block head, a small muzzle (`v` nose over a
  `w` mouth), whisker extensions (`==` / `--`), a compact body and a
  visible tail. Its behavior is that of a generic living backdrop entity,
  not a pet animal.
- A fixed sprite grid of 15 columns x 11 rows. Every state, pose, prop and
  cue is drawn on this same grid, so the character never changes its box
  size and never causes a layout shift.
- One builder (`buildSprite` in `src/lib/nomoz.js`) draws all states. The art
  is not duplicated across components.
- White text at reduced opacity (about 0.6–0.8 by state, dimmed slightly with
  distance), so it reads as part of the backdrop while staying clearly
  visible.

### Size

- Font size is `clamp(14px, 1.2vw + 10px, 28px)`. The 14px floor is the
  deliberate minimum readable size: the sprite is about 126px x 154px before
  depth scaling on a 320px phone and about 250px x 308px on a wide desktop.
- Depth scaling is bounded (see below) so the entity never shrinks below
  roughly 100px wide on the narrowest phones.

### State 1 — Idle

Shown whenever neither of the other states applies.

```
   /\     /\
  /██\___/██\
  ███████████
  █  o   o  █
==█    v    █==
--█    w    █--
 ▀█████████▀
██▒▒███████▒
    ██   ██
  ░░░░░░░░░░░
```

Idle is driven by the behavior scheduler (below).

### State 2 — Content / prosperous

Shown when this month has income, at least 30% of it remains unspent
(net / income >= 0.3), total balance is positive, and the budget is neither
exceeded nor reached.

```
   /\[_/_]/\
  /██\___/██\
  ███████████
  █  ^   ^  █
==█    v    █==
--█   \w/   █--
 ▀█████████▀
██▒▒██ $ ██▒
    ██   ██
  ░░░░░░░░░░░
```

- Wide happy `^ ^` eyes, a smile, a block crown `[_/_]` between the ears and
  a `$` cyber-coin set into the chest.
- Aligned, whole block construction: composed and satisfied, not hyperactive.
- Behaviors are restrained: sitting, observing, polishing the coin, adjusting
  the crown, short walks, a brief `*` glint.

### State 3 — Stressed / overspending

Shown when spending exceeds the monthly budget, or has reached it.

```
  '    X    '
   /\      /\
  /██\_ _/▒█\
  ▒██░███▒███
  █  <   >  ▒
 \█ ?  v  ! █/
  /█ X _w_ █\
█  ▒▀██████▀░
██▒▒█ \$/ █▒░
   ▒█    █░ ▒
  ░ ░ ░ ░ ░
```

- The same cat, fragmented: misaligned rows, panicked `< >` eyes, splayed
  whiskers, `X ? ! / \` marks, detached `'` sweat droplets, a broken ground
  shadow. The `$` charm stays in the body.
- Two frames flip about every 900ms (300ms for the first 3s of an overspend
  event). This is a stepped, terminal-style flicker, not a smooth animation.
- Behaviors are nervous: short shuffles and pacing, flinching leans, rapid
  `!` / `?` glances, restrained glitches, long still periods.

### 3D space (X / Y / Z)

- The backdrop layer carries `perspective: 900px` (origin at its centre).
  The entity is one `translate3d(x, y, z)` child, so depth is real
  perspective scaling rather than a faked scale.
- Position is tracked in screen space: `sx`, `sy` are where the sprite's
  centre appears and `z` is depth. `toTransform` converts that into the
  pre-perspective offset, so walking steps, bounds and overlap checks are all
  in visible pixels.
- Moving closer (higher z) makes it larger and slightly stronger; moving
  farther makes it smaller and slightly fainter. Depth range is about
  0.74x–1.25x on desktop and 0.8x–1.15x on mobile.
- Depth interpolates continuously while walking, or glides over the ambient
  tier. There is no camera movement or parallax.
- Movement uses `transform` and `opacity` only. Nothing animates layout.

### Placement

- It may be anywhere in the backdrop (X, Y and Z), not just along the
  bottom. The usable region keeps a margin from every edge (14px desktop,
  6px mobile), clears the OVER BUDGET readout at the top, and ends at the top
  of the fixed footer.
- Spots are chosen by sampling candidates and preferring open backdrop. The
  foreground is scanned for charts, tables, controls and painted
  backgrounds. Plain text is not treated as covering.
- After a tab switch or resize it re-checks, and if it ended up under dense
  content it relocates (fade out, reappear in open space).
- Only the deliberate peek and edge-exit behaviors leave the visible area,
  and they are hidden by the layer's overflow clip.

### Per-load randomness

Nothing about startup is scripted. A fresh runtime seed is generated on every
page load and decides:

- Initial X, Y and depth.
- Facing direction (which way the tail trails and where it looks).
- Initial pose and gaze.
- A random delay of up to about 3s before the first behavior.
- The first behavior, which is a weighted draw from the pool.

There is no fixed master loop. Later tab switches and modal open/close
cycles do not reset the entity or its position.

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
  whenever the state changes, so two schedulers can never control the same
  entity.

### Idle behavior library

| Behavior       | What it does                                                        |
| -------------- | ------------------------------------------------------------------- |
| sit            | settles and observes the app, blinking                              |
| observe        | holds one position and sweeps its gaze around                       |
| look           | quick glances left / right                                          |
| lookUp         | looks upward at something passing overhead                          |
| ponder         | small `.o?` thought cue                                             |
| ponderSymbol   | studies a financial-looking symbol or number (`$?`, `12%`, `+1`)    |
| stillness      | sits motionless for a long time, then moves on                      |
| sleep          | sits with closed eyes and a `z` / `zZ` cue                          |
| tired          | a short rest with a subtle `z`                                      |
| stretch        | extends its body, then relaxes                                      |
| read           | see below                                                           |
| inspect        | finds a small ASCII object on the ground and examines it            |
| floatSymbol    | follows a drifting symbol with its eyes, then pops it               |
| followPixel    | tracks a block drifting across the backdrop                         |
| coinPolish     | checks its `$` coin (sparkle cue)                                   |
| crown          | examines a crown overhead (content: adjusts its own)                |
| curious        | notices something off-screen, may step toward it, returns           |
| glitch         | a restrained flicker: rows slip sideways for a moment               |
| walk           | continuous walking to a nearby spot, sometimes stopping partway     |
| travel         | walks to a far destination and pauses there for a long time         |
| retreat        | walks deep into the background and watches from there               |
| approach       | comes closer to the foreground as though investigating the UI       |
| peek           | slides partly in from a screen edge, looks around, withdraws        |
| edgeExit       | leaves past an edge and re-enters elsewhere                         |
| relocate       | fades out and reappears in a different open spot                    |
| twitch         | a one-cell lean and back                                            |

Each has its own duration and rhythm; walking is stepped one character cell
at a time with alternating feet and a linear glide per step, so it reads as
continuous walking.

### Reading a book

A rare, randomized-length behavior (about 10–22s). It may first walk to a
nearby comfortable spot, then sits and holds an open ASCII book in its paws:

```
  /==|==\
  \__|__/
```

It looks down at the page (`. .` eyes), occasionally turns a page (the book
changes over three short frames), glances up briefly, and returns to the
page. The book disappears when it finishes.

### Financial context and reactions

- The persistent state is derived by `deriveNomozMood` from the existing
  store selectors (budget, spend, ledger totals, total balance). No
  financial calculation or rule is changed.
- One-shot reactions come from the existing `anomalyEvent` and last only
  seconds. They never become permanent animations:
  - `INCOME` — happy eyes and a `$` cue.
  - `EXPENSE` — wide eyes and a `'` cue.
  - `TRANSFER` — a left-then-right glance.
  - `OVERSPEND` — fast frame flicker and an `X` cue for 3s, then the
    persistent stressed state takes over.
  - `CELEBRATE` — happy eyes and a `*` cue.
- On the special calendar date, a `<3` cue appears for 8s, once per day.
- Switching states cross-fades the sprite over the content/exit tiers.

### Responsive behavior

- The same character, states and behaviors on every device.
- Layer widths under 640px use the compact profile: smaller edge margin,
  shorter walks, a narrower depth range, and smaller relocation radii. X, Y
  and Z variation is still meaningful.
- No horizontal scrolling at 320–375px, and it is never interactive:
  `pointer-events: none` and `aria-hidden`.

### Reduced motion

With `prefers-reduced-motion: reduce`:

- The initial placement is still random and the correct state is shown.
- Walking, peeking, depth drift, leans, glitches, the stressed flicker and all
  position/opacity transitions are disabled.
- Only stationary behaviors remain (sit, observe, look, look up, ponder,
  sleep, rest, stretch, read, inspect, coin and crown checks), on a slower
  cadence.
- State changes are instant.
