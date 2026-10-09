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
| Pet backdrop layer (NOMOZ.EXE)          | 0       |
| Active tab content                      | 10      |
| `[ ! OVER BUDGET ! ]` readout           | 20      |
| Header                                  | 30      |
| Footer                                  | 50      |
| Modals and dropdown overlays            | 50–100  |

The pet backdrop layer is `absolute inset-0 overflow-hidden pointer-events-none`
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

## NOMOZ.EXE — the backdrop pet

NOMOZ.EXE is a 16-bit pixel-art solid-black cat that lives in a shallow 3D
space behind the terminal UI: a secondary environmental presence, large
enough to recognise at a glance, always behind the primary financial
content. It is the first pet of a small, moddable pet subsystem
(`src/pets`); everything below describes the implemented system.

### Canonical reference

The "lonely black cat" pixel-art image is the source of truth for the
character. Every frame, pose and state is that same cat:

- A solid-black, front-facing, sitting cat with a wide head and a flat
  crown between two pointed ears, each with a white inner ear.
- Half-lidded amber eyes: a pale gold crescent with a small bright
  highlight pixel, on black.
- Long thin whiskers extending past the head on both sides.
- A tall narrow sitting body and a tail curling up on the right (mirrored
  when it faces the other way).
- Near-black internal planes only (chest bib, haunch, leg and stripe
  tones), so it reads as black, never as a grey or generic cat.

Pixel-art rules, for every future frame:

- 16-bit, hard pixels, no blur or smoothing, no vector or cartoon
  reinterpretation. Frames are built from the shared parts of the same cat
  (head, torso, tail, eye overlays); poses are expression, lean, head
  offset and leg frames, never a redrawn or distorted character.
- No bright outlines, neon edges, glossy highlights or extra colours. The
  only bright pixels are the eye highlights, white inner ears, the gold of
  the prosperous state, and the cyan / red cues.
- Eye states: resting amber crescent, wide ring (surprise), lowered crescent
  (reading), closed arc (blink / sleep), `^ ^` (content), pale panic eyes
  (stressed).

### Lighting, shading, shadows, depth

The cat stays black; it is revealed by light, never by recolouring:

- Fur is near-black in five tones (`#000` to `#292e34`) separating body
  planes only.
- A directional rim light on the upper-left edges and a dimmer one on the
  right, computed from the silhouette of every frame, so walking, sleeping
  and reading are lit identically.
- A dithered one-pixel backlight aura just outside the silhouette.
- A dim floor pool under the cat with a black contact shadow under the
  paws. Both scale with the sprite, so the shadow responds to depth.
- Farther placements get a weaker rim and lower opacity, nearer ones a
  stronger rim. Rim levels, pool size, shadow extents and aura threshold
  are in `LIGHTING` (`src/pets/nomoz/config.js`).

Z-depth (`src/pets/core/space.js`, numbers in `WORLD` in
`src/pets/config.js`):

- The layer has `perspective: 900px`; the pet is one `translate3d(x, y, z)`
  child, so depth is real perspective scaling.
- Position is kept in screen space (`sx`, `sy`) plus `z`; `toTransform`
  converts it to the pre-perspective offset, so steps and bounds are in
  visible pixels.
- Apparent size = perspective scale × a foreground boost that is exactly 1
  up to mid depth and eases in (smoothstep) to +28% at the closest depth:
  about 0.74×–1.6× on desktop and 0.8×–1.5× on mobile, no jump anywhere
  along Z. The boost scales about the sprite centre; placement bounds use
  the boosted size, so the larger foreground cat never clips an edge.
- Depth moves continuously by walking or an ambient-tier glide. Movement
  uses `transform` and `opacity` only.
- Sprite box: 56×60 logical pixels at a whole-number scale (3× under 640px
  layer width, 4× above), `image-rendering: pixelated`.

### The persistent global pet environment

- The pet belongs to the global backdrop, mounted once in the shell beside
  (never inside) the tab content. The pet shell (`Anomaly.jsx`) does not
  read the active tab or any foreground UI.
- World position (X, Y, Z), facing, current behavior, the scheduler, the
  random seed and animation progress persist across tab changes, modal
  open/close and ordinary UI updates. Nothing ever teleports, respawns,
  resets or relocates to stay visible; foreground content may cover it.
- Only a physical viewport resize may clamp the position back into range.
- Stacking: layer z-0, behind tab content (z-10), the OVER BUDGET readout
  (z-20), header (z-30), footer and modals (z-50+). The layer is
  `pointer-events: none`, `aria-hidden` and `overflow-hidden`; it never
  intercepts input or scrolls the page.
- Placement keeps a margin from every edge (14px desktop, 6px mobile),
  clears the OVER BUDGET readout and ends above the footer. Spots are
  random and never chosen with reference to the foreground UI. Layers
  under 640px use the compact profile (narrower depth range, shorter walks);
  no horizontal scrolling at 320–375px.
- A fresh runtime seed on every page load decides the first position,
  depth, facing, pose, gaze, the first delay (up to ~3s) and the first
  behavior. There is no fixed loop.

### Financial states

The state is derived by `deriveNomozMood` (`src/lib/nomoz.js`) from existing
store selectors only. No threshold, calculation or business rule changed,
and no animation outcome ever touches financial data.

- **Idle** — the reference cat as drawn. It performs the environmental and
  personality behaviors.
- **Content / prosperous** — income this month, at least 30% of it unspent,
  positive balance, budget not reached. The same cat with closed `^ ^`
  eyes, a small smile, a gold pixel crown and the gold `$` cyber-coin on
  the chest bib. Calm, composed behaviors only.
- **Stressed / overspending** — over budget or the budget reached. The same
  cat, tense and fragmented: rows of the sprite slip sideways in two
  alternating frames, sparse pixels drop out, head jitters, tail lashes,
  pale panic eyes, a small jagged mouth, the `$` charm stays, cyan sweat
  droplets and red `! ? X` marks. The frame flips about every second (300ms
  during an overspend event).

One-shot store reactions (`INCOME`, `EXPENSE`, `TRANSFER`, `OVERSPEND`,
`CELEBRATE`) come from the existing `anomalyEvent` and last seconds; on the
special calendar day a pixel heart cue shows once per day. State changes
cross-fade the sprite.

Financial state has priority over every optional activity:

- A behavior can only be chosen if it has a positive weight in the current
  state, so an idle activity can never override the stressed or prosperous
  appearance (e.g. reading, sleeping and the vanity moments are never
  eligible while stressed).
- The sprite additionally refuses incompatible props in the stressed state
  (the book and objects are never drawn; the vanity items declare their own
  visibility by state).
- When the state changes, the running behavior is cancelled cleanly (its
  `exit` hook runs, posture resets) and the same scheduler carries on;
  position and depth are not touched.

### Financial context: mood vs. reactions

Two concepts stay separate:

- **Persistent mood** — the appearance and general demeanor (idle, content,
  stressed), derived by `deriveNomozMood` from the existing store selectors.
  It always wins. The financial context only influences which behaviors are
  eligible; the randomized scheduler still decides what the cat does.
- **Transient reactions** — occasional one-shots for state transitions and
  successful operations, handled by the `FinancialDirector`
  (`src/pets/finance/director.js`, tuned in `src/pets/finance/config.js`,
  mapped per pet in `src/pets/nomoz/financial.js`).

Inputs are only what the application already computes: budget utilisation
(`getSpentThisMonthInUZS` / `getMonthlyBudgetUZS`, the dashboard bar's ratio),
`getIsOverBudgetThisMonth`, ledger totals and total balance (inside
`deriveNomozMood`), and the store's `anomalyEvent`, which the store raises
only after a successful income, expense or transfer is saved (and on the write
that crosses the budget). No financial calculation, threshold or rule was
added or changed, and nothing a pet does feeds back into financial data.

**Healthy.** The content mood keeps the composed look. Eligible, never forced:
sitting and observing, `coinPolish`, `coinInspect`, `crown`, `vanity`, and the
new `relax` (a slow-breathing rest). They sit in the ordinary random pool.

**Approaching the budget limit.** `deriveBudgetProximity` (`src/lib/nomoz.js`)
is a boolean: the existing utilisation ratio is at or above
`FINANCE.approachRatio` (0.8, visual only) while the application still
considers the budget intact. It is a scheduler **context flag**, not a state:
it never cancels anything. While it holds, the `budgetWatch` behavior becomes
eligible (looks at a financial-looking symbol, checks its coin or turns
attentive, sometimes a flicker of concern) and `ponder`, `ponderSymbol` and
`coinPolish` get a ×2 weight. No text, notification or UI is shown.

**Over budget.** The existing stressed treatment and priority are untouched.
Stressed-eligible behaviors gain `startle` (a small tense lean) and
`unsettledLook` (quick wary looks, now and then a tiny glitch), both with long
cooldowns, alongside the existing shuffle, pace, flinch, nervousLook, glitch
and still. They are ordinary weighted candidates, so they cannot repeat every
render or scheduler cycle.

**Transitions** (edge-detected once per change, never on render):

| Transition          | Priority | Reaction (candidates)                              |
| ------------------- | -------- | -------------------------------------------------- |
| stress-entered      | 3        | startle, flinch, unsettledLook, glitch             |
| stress-recovered    | 3        | relief (breath-like pause, attention back to coin), coinInspect |
| position-changed    | 2        | interest, look (idle ↔ healthy)                    |

Transitions only arm after the data has loaded and a short baseline window
(`FINANCE.baselineMs`), so startup, tab switches and exchange-rate refreshes
do not look like financial events. The `OVERSPEND` store event coalesces with
`stress-entered`.

**Successful operations** (priority 1, one coalesced `ack` slot):
`incomeGlance` / `coinInspect` / `crown` for income, `expenseGlance` /
`ponderSymbol` for expenses (`nervousLook` while stressed), `transferNod` /
`look` for transfers. Failed, cancelled or invalid forms never reach the store
event, so they never react; opening modals, sorting, filtering and tab
changes raise nothing.

**Queue rules.** Events are deduplicated by `(type, id)`; a burst coalesces
into a single pending acknowledgement that waits `settleMs` for the burst to
end; per-reaction cooldowns and a global acknowledgement cooldown apply; a
pending persistent change makes a minor acknowledgement redundant, and
taking a priority ≥ 2 reaction drops what is waiting below it; the queue
holds at most `queueMax` entries and every entry expires (`ttl`). Entries
with no candidate playable in the current mood are dropped, so a reaction can
never override the stressed or prosperous appearance. The director owns no
timer and no loop.

**Priority and boundaries.**

1. Persistent mood and appearance (the scheduler's mood rules).
2. Essential transitions: a mood change cancels the running behavior through
   `setMode` (appearance first), then the transition reaction is the first
   thing offered.
3. One-shot reactions: offered only at a behavior boundary
   (`reactionSource.take`), never mid-animation.
4. Ordinary randomized behavior, which resumes afterwards and is otherwise
   unaffected (position, depth, seed and scheduler persist).

Reaction-only behaviors have weight 0 everywhere and a `reactMoods` list; they
never appear at random and only run in the moods that list allows. All of it
is data: add a reaction by appending an entry to `FINANCIAL_REACTIONS`
(e.g. a new transaction type's event), a behavior with `defineBehavior`, or
disable either with `enabled: false`; a pet that defines no
`financialReactions` simply has none. New pets reuse the same adapter and
director.

### Behavior scheduler

`PetScheduler` (`src/pets/core/scheduler.js`) is the only thing that picks
behaviors, and it is independent of tabs:

- Weighted random selection from each behavior's weight for the current
  state; cooldowns; the same behavior never runs back to back; the last few
  are down-weighted (×0.4); `followOn` factors nudge natural continuations
  (reading is often followed by a stretch) without fixed sequences.
- Rarity: `common`, `uncommon`, `rare`, `veryRare`, `extremelyRare` map to
  base weights in `SCHEDULER.rarityWeight`; a behavior may also give
  explicit per-state `weights`.
- Between behaviors a random pause (0.5–2.6s); about one in five pauses is
  long (4–11s), so it spends real time doing nothing. Durations, delays,
  destinations and animation variants are randomised per run.
- One timer drives it. A module-level lock means starting a scheduler stops
  any other one for the same pet. It is created once per mounted pet and
  kept: tab switches and modals neither restart nor touch it. State,
  breakpoint or reduced-motion changes call `setMode`, which cancels the
  current behavior and resumes with cooldowns, history and the random
  stream intact.
- A behavior that throws is disabled for the session and the scheduler
  moves on; a failing `apply` patch is logged and skipped.
- Reduced motion: behaviors flagged `moves` are never chosen, durations
  stretch ×1.3 and pauses ×1.5, the animation clock stops, glides and
  fades are instant. Only stationary behaviors remain.

### Behavior library

Environmental behaviors (new in this system unless noted):

| Behavior           | Moods            | What it does                                                                 |
| ------------------ | ---------------- | ---------------------------------------------------------------------------- |
| investigatePixel   | idle, content    | A tiny block drifts across; it notices, watches, follows a few steps, loses interest |
| watchBeyond        | idle, content    | Looks up / toward a distant point with no object, tracks it slowly, resumes  |
| floatingObject     | idle, content    | Finds a small bobbing object, examines it from several angles, nudges it, walks away leaving it behind |
| longPause          | idle, content    | Extremely rare 28–55s stillness with sparse blinks, gaze shifts and tiny leans / nods |
| vanish             | idle, content    | Walks steadily deeper into Z, smaller and dimmer, stays 8–26s, walks back; fully continuous |

Personality behaviors:

| Behavior     | Moods                 | What it does                                                                 |
| ------------ | --------------------- | ---------------------------------------------------------------------------- |
| read         | idle, content         | Settles (sometimes walks to a nearby spot), opens a pixel book in its lap, 10–22s of reading with varied page turns and glances up, closes it |
| glitch       | idle, content, stressed | Rare, brief: two or three row slips with a faint cyan ghost, then a startled look, a glance aside and back to normal; never a flicker |
| coinInspect  | content               | Lifts the cyber-$ off its chest, turns it over (face, edge, back), puts it back |
| idea         | idle, content         | Stops in a thinking pose; a tiny pixel bulb appears above its head, then goes. An environmental animation, not a UI overlay |
| sleep        | idle                  | Eyes droop, a slow nod, the head sinks, `z` cues for 8–20s, wakes naturally |
| vanity       | content               | Rare and composed: adjusts its crown, admires its coin with sparkles, or checks itself over |

Financial-context behaviors (see "Financial context"): `relax`, `budgetWatch`
(flag-driven), `startle`, `unsettledLook` (stressed), and the reaction-only
`incomeGlance`, `expenseGlance`, `transferNod`, `interest`, `relief`.

Existing behaviors kept as they were: sit, observe, look, lookUp, ponder,
ponderSymbol, stillness, tired, stretch, inspect, floatSymbol, followPixel,
coinPolish, crown, glint, twitch, curious, walk, travel, retreat, approach,
relocate, edgeExit, peek, and the stressed set (shuffle, pace, flinch,
nervousLook, still). Their weights per state are unchanged.

### Pet subsystem architecture (`src/pets`)

```
src/pets/
  config.js            shared WORLD, SCHEDULER, ACTIVE_PET_ID, ACTIVE_INTERACTIONS
  registry.js          registerPet / getPet / listPets / getActivePet
  usePet.js            hook: view state, placement, scheduler, frame clock
  PetErrorBoundary.jsx a pet error removes the pet, never the app
  finance/
    config.js          FINANCE: approach ratio (visual only), queue, cooldowns
    director.js        FinancialDirector + defineFinancialReaction
  core/
    pet.js             definePet: validates and assembles a pet definition
    behaviors.js       defineBehavior, weightFor, buildBehaviorSet
    scheduler.js       PetScheduler (selection, lifecycle, lock, request)
    toolkit.js         makeScript, travel, sweep, zBand, flick
    animations.js      animation registry
    vanity.js          vanity / equipment registry
    interactions.js    future interaction API
    space.js           createWorld: depth, bounds, spots, transform
    rng.js             seed, PRNG and small helpers
  nomoz/
    index.js           the NOMOZ.EXE definition (registered first)
    config.js          appearances, overrides, lighting, equipped items
    sprites.js         pixel art, pose / frame composition, prop drawers
    financial.js       NOMOZ.EXE's financial reactions (data)
    animations.js      shared animation sequences
    vanity.js          slots and items (crown, coins, book)
    behaviors/         one module per group of behaviors
src/lib/nomoz.js      financial mood, budget proximity, store reaction table (the bridge)
src/components/Anomaly.jsx   pet shell: measures, draws the canvas, moves it
```

The shell (`Anomaly.jsx`), the backdrop layer, movement engine, financial
integration, modals and scheduler are pet-agnostic. A pet supplies only a
definition.

#### Pet registry and adding a pet

`definePet` takes: `id`, `name`, `sprite { width, height, render(ctx, params,
vanity) }`, `animations`, `behaviors` (+ `behaviorOverrides`), `appearances`
(per financial state: base alpha), `vanity { slots, items, equipped }`,
`capabilities`, `reactions`, `financialReactions`, `world` overrides, `initial` placement hints,
and palette / lighting data used by its own sprite module.

1. Create `src/pets/<id>/` with a sprite module, animations, behaviors and
   an `index.js` that returns `definePet({...})` (see `nomoz/index.js`,
   which returns `null` rather than throwing if assembly fails).
2. In `registry.js` import it and call `registerPet(...)`.
3. Set `ACTIVE_PET_ID` in `src/pets/config.js`.

Nothing in the backdrop, movement engine, financial integration, modals or
scheduler changes. There is no pet-selection UI and NOMOZ.EXE is the only
registered pet.

#### Creating a behavior

Add a `defineBehavior({...})` export to a file in `nomoz/behaviors/` (the
`index.js` there collects every export). Fields:

| Field                | Meaning                                                           |
| -------------------- | ----------------------------------------------------------------- |
| `id`                 | unique id                                                         |
| `rarity`, `moods`    | base weight from `SCHEDULER.rarityWeight` in each listed state    |
| `weights`            | explicit `{ idle, content, stressed }` (0 = never)                |
| `cooldown`           | ms before it can run again                                        |
| `duration`           | `[min, max]` ms (read with `this.duration` in `plan`)             |
| `moves`              | needs motion: skipped under reduced motion                        |
| `requires`           | capabilities or `vanity:<itemId>`; unsupported behaviors are inert |
| `requiresFlags`      | financial-context flags that must be set (e.g. `approaching`)     |
| `flagWeights`        | `{ flag: factor }` weight multipliers while a flag is set         |
| `reactMoods`         | moods where a financial reaction may run it despite weight 0      |
| `eligible(c)`        | extra rule on the live context                                    |
| `followOn`           | `{ otherId: factor }` natural continuations                       |
| `enter(c)`, `exit(c, why)` | lifecycle; `exit` also runs on cancellation (`why === 'cancel'`) |
| `plan(c, S)`         | adds timed patches to `S`, returns its duration in ms             |
| `enabled`            | `false` switches it off                                           |

`c` holds `rng`, `pet`, `mood`, `compact`, `reduced`, `cur` (current view
including `sx`, `sy`, `z`), `geo`, `pickSpot`, `apply`. `S.at(t, patch)`,
`S.blink(t)` and `S.play(animationId, t, opts)` build the script;
`travel`, `sweep`, `zBand` in `core/toolkit.js` handle movement (travel
walks in X, Y and Z, one linear glide per step, optionally weighting depth
so a pure Z move takes proportionally more steps). The scheduler plays the
script from one timeout. To tune or disable without editing a behavior, use
`BEHAVIOR_OVERRIDES` in `nomoz/config.js` (`{ vanity: { enabled: false } }`).

#### Animations and sprite assets

An animation (`nomoz/animations.js`) is a named, reusable sequence of view
patches, either data (`{ id, steps: [[dt, patch], ...] }`) or code
(`{ id, build(S, c, t0, opts) -> end }` for varied timing). Behaviors
reference them with `S.play('pageTurn', t)`; several behaviors can share
one, and a missing animation is a no-op. Patches only set view fields; the
frame art those fields select lives in `nomoz/sprites.js`:

- View fields: `pose`, `gaze`, `eyes`, `mouth`, `legs`, `lean`, `droop`,
  `cue`, `item`, `book`, `crown`, `crownLift`, `coin`, `glitch`, `fade`,
  plus position (`sx`, `sy`, `z`, `facing`, `transitionMs`).
- New eye / pose / glyph frames are added to the template tables in
  `sprites.js`; temporary overlays go in `ITEM_KINDS` (`text`, `block`,
  `obj`, `crown`, `coin`, `sparkle`, `glyph`). Add a pixel-row table and one
  entry; each asset is defined once and shared.

#### Vanity / equipment

`core/vanity.js` is the foundation (no shop, inventory or monetisation).
A pet declares slots (`head`, `neck`, `chest`, `held`, `prop`, `accessory`)
as anchor functions, and items (`defineVanityItem`) with `id`, `slot`,
compatible `pets`, `rows(p)` or `draw(...)`, `offset(p)` for animation,
`visible(p)` for conditions (state, behavior fields) and `layer`. The pet
lists default-worn ids in `equipped`. Items shipped: `crown`, `chestCoin`,
`heldCoin` (lifted and turned by `coinInspect`) and `book` (shown while
`view.book` is set). To add an item, append a `defineVanityItem` in
`nomoz/vanity.js` and its id to `EQUIPPED`; a behavior can animate it by
setting a view field the item's `visible` / `offset` read. Invalid or
incompatible items are skipped; a failing item draw is skipped.

#### Future interaction API

`core/interactions.js` isolates user-triggered behavior (cursor awareness,
click reactions...). Nothing is active (`ACTIVE_INTERACTIONS` is empty).
A module registers with `registerInteraction({ id, attach(port) })` and is
enabled by adding its id to `ACTIVE_INTERACTIONS`. It receives only a
frozen port: `reactions` (names the pet supports), `requestReaction(name,
{ interrupt })` and a read-only `snapshot()`; never the store, navigation or
shell. Names resolve through the pet's `reactions` map (`notice`, `startle`,
`acknowledge`, `delight` for NOMOZ.EXE) to its own behaviors, and the
scheduler accepts a request only if the behavior is enabled and eligible for
the current financial state and motion preference, so an interaction can
never override the stressed or prosperous appearance.

#### Configuration locations

| What                                                         | Where                                  |
| ------------------------------------------------------------ | -------------------------------------- |
| Depth range, near boost, scale, margins, opacity, light steps | `WORLD` in `src/pets/config.js`        |
| Gaps, cooldown history, rarity weights, step timing, clocks   | `SCHEDULER` in `src/pets/config.js`    |
| Active pet, enabled interactions                              | `src/pets/config.js`                   |
| Approach ratio, queue size, settle / dedupe, ack cooldowns, priorities | `FINANCE` in `src/pets/finance/config.js` |
| Financial reaction triggers, priorities, TTL, cooldowns, candidates | `src/pets/nomoz/financial.js`     |
| Per-pet world override, appearances, lighting / shadow        | `src/pets/nomoz/config.js`             |
| Behavior weights, rarity, cooldowns, durations                | each behavior in `nomoz/behaviors/`, overridable in `BEHAVIOR_OVERRIDES` |
| Vanity slots and items                                        | `nomoz/vanity.js`, `EQUIPPED` in config |
| Financial mood and store reactions                            | `src/lib/nomoz.js`                     |

### Failure isolation and lifecycle

- `PetErrorBoundary` removes the pet if rendering throws; sprite drawing
  errors stop only the drawing; behavior errors disable only that
  behavior; invalid behaviors, animations and vanity items are skipped at
  registration; a pet that fails to assemble is simply not registered.
  The financial application never depends on any of it.
- The scheduler's single timer, the frame interval, reaction timers and
  interaction listeners are all cleared on unmount.
- The sprite is a small canvas redrawn only when a drawn field or the slow
  frame changes (a few times per second at most), not an animation loop;
  there are no per-frame React updates beyond that clock.

### Reduced motion

With `prefers-reduced-motion: reduce` the initial placement is still
random and the correct state is shown, but walking, peeking, depth drift,
leans, glitches, the animation clock and all position / opacity
transitions are disabled. Only stationary behaviors remain (sit, observe,
look, watch beyond, long pause, sleep, read, idea, vanity, coin inspection
and the like, plus the gaze-only financial reactions), on a slower cadence; the coin turn collapses to a still
face-and-back. State changes are instant.
