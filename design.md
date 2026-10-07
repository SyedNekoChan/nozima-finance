# NOZIMA // FINANCE.SYS — Design

Black background, white monospace type, square corners, no shadows. Motion
is short, ease-out only (`cubic-bezier(0.2, 0, 0, 1)`), with no springs or
bounce. Timing comes from four tiers in `src/lib/motion.js` and the matching
CSS tokens in `src/styles/index.css`:

| Tier    | Duration | Use                                       |
| ------- | -------- | ----------------------------------------- |
| micro   | ~120ms   | hover / pressed / focus feedback          |
| state   | ~180ms   | UI state changes (tab fill, popovers)     |
| content | ~220ms   | content swaps (tabs, modals, months)      |
| data    | ~320ms   | financial figures and progress values     |
| ambient | ~700ms   | slow backdrop drift (NOMOZ.EXE only)      |

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
and `aria-hidden`. Nothing in it can intercept input, scroll the page, or
sit above foreground UI.

## Persistent budget readout

When this month's spending exceeds the monthly budget, a small boxed
`[ ! OVER BUDGET ! ]` readout is shown at the top of the main area on every
tab. It is a level-based status (no dismiss, never re-fires) and is the only
OVER BUDGET indicator in the app. The Dashboard progress bar simply renders
maxed out at 100%.

## NOMOZ.EXE — backdrop entity

NOMOZ.EXE is a small character-based ASCII/pixel entity that lives in the
backdrop of the terminal. It is the single anomaly element of the app. It is
a secondary environmental presence: more readable than a faint texture, but
always behind the primary content.

### Visual language

- Built only from text: block characters `█ ▒ ░ ▀`, and ASCII `^ _ ! / \ X ? ' $ < > [ ]`.
- Rendered as monospace text in a `<pre>`. No SVG, images, canvases,
  gradients, blur or smooth illustration, and nothing circular.
- A fixed sprite grid of 11 columns x 7 rows. Every state, pose and cue is
  drawn on this same grid, so the character never changes its box size and
  never causes a layout shift.
- One builder (`buildSprite` in `src/lib/nomoz.js`) draws all states. The art
  is not duplicated across components.
- Shared identity: a block head with two eyes and a mouth, a wide shaded
  body row, and two block feet, over a `░` ground shadow.
- White text at reduced opacity (about 0.5–0.7 by state), so it reads as
  part of the backdrop.

### State 1 — Idle

Shown whenever neither of the other states applies.

```
  █████
 █ o o █
 █  _  █
░▒█████▒░
  █   █
 ░░░░░░░
```

Idle is a restrained, seeded behavior loop. Behaviors are chosen by weight,
never the same one twice in a row, with long pauses between them:

- **Sit** — still and observing, with an occasional blink.
- **Walk** — slow walking, one character cell per step, with alternating feet
  and gaze toward the direction of travel. It sometimes stops partway with
  wide eyes and a `?`, as though curious.
- **Look** — glances left, then right, then back.
- **Ponder** — a small `.o?` thought cue.
- **Sleep** — sits with closed eyes and a `z` / `zZ` cue; the lowest-motion state.
- **Peek** — fades out, reappears just past a screen edge, slides in
  partially, looks around, retreats off-screen, then walks back in.
- **Depth** — moves farther back (smaller, fainter, slightly higher) or
  closer (slightly larger, slightly stronger), over the ambient tier.
- **Twitch** — a one-cell posture lean and back.

### State 2 — Content / prosperous

Shown when this month has income, at least 30% of it remains unspent
(net / income >= 0.3), total balance is positive, and the budget is neither
exceeded nor reached.

```
  [_/_]
  █████
 █ ^ ^ █
 █ \_/ █
░▒█ $ █▒░
  █   █
 ░░░░░░░
```

- Happy `^ ^` eyes, a smile, a block crown `[_/_]` and a `$` cyber-coin set
  into the chest.
- Aligned, whole block construction: composed and confident, not hyperactive.
- Behaviors are restrained: sitting, glancing, very short walks (1–4 cells),
  a brief `*` glint on the coin, and small leans.

### State 3 — Stressed / overspending

Shown when spending exceeds the monthly budget, or has reached it.

```
 '   X   '
   ▒███░
\ █ < > ▒ /
 ▒█  !  █░
 ░ \█$/█ ░
 ▒█   █░
 ░ ░ ░ ░
```

- Fragmented, misaligned rows; panicked `< >` eyes; flailing `\` `/`
  limbs; `!` and `?` marks; detached `'` sweat droplets; a broken ground
  shadow. The `$` charm remains in the body, so it is clearly the same pet.
- The fragments flip between two frames about every 900ms. This is a
  stepped, terminal-style flicker, not a smooth animation.
- Sits slightly nearer on wide screens. Behaviors are nervous: short
  one-or-two-cell shuffles and flinching leans, with long still periods
  between them.

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

### Placement and depth

- Anchored to the bottom of the main area, inside the overflow-hidden
  backdrop layer. Movement is a `translate3d` and `scale` on one absolutely
  positioned actor, plus opacity. Nothing animates layout.
- The walking range keeps a margin from both edges (16px wide, 8px compact),
  plus slack for the larger "near" scale. Only the deliberate peek may leave
  the visible area, and it is hidden by the layer's overflow clip.
- Size is `clamp(11px, 1vw + 7px, 22px)`, so the 11-column sprite is about
  73px wide at 320px screens and about 140px on desktop.

### Responsive behavior

- The same character, states and behaviors on every device.
- Layer widths under 640px use the compact profile: shorter walks (3–8 cells),
  only two depth levels with a smaller depth range, and no extra enlargement
  in the stressed state.
- It never creates horizontal scrolling at 320–375px, and it is never
  interactive: `pointer-events: none` and `aria-hidden`.

### Reduced motion

With `prefers-reduced-motion: reduce`:

- Walking, peeking, depth drift, leans, the stressed flicker and all
  position/opacity transitions are disabled.
- Only stationary behaviors remain (sit, look, ponder, sleep, glint), and
  they run on a slower cadence.
- State changes are instant.
