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

- A solid-black, front-facing, sitting cat with a wide, domed head and a
  flat crown between two pointed ears, each with a white inner ear shaded
  with a few mid-grey fur tufts.
- Half-lidded amber eyes: a heavy dark upper lid, an iris shaded under the
  lid, a slit pupil and one small bright highlight pixel, on black.
- A faint "M" tabby mark on the forehead, soft lit brows, full cheeks that
  end in small fur tufts with tabby strokes, whisker pads with root dots,
  a small nose with a dim sheen, a `w` mouth with soft corners, and a
  rounded jaw and chin.
- Three fine whiskers per side, fanning out from the whisker pads (upper
  lifts, middle level, lower droops) and fading at the tips.
- A tall narrow sitting body: a shadow under the jaw, rounded shoulders, a
  fluffy-edged chest bib with darker V fur strands, curved flank stripes,
  rounded haunches with a lit upper curve, front legs with a lit and a
  shaded edge, knuckled paws with toe seams and small hind paws.
- A tail curling up on the right (mirrored when it faces the other way)
  with a rounded tip, a lit edge, a shaded edge and thin tabby rings.
- Near-black internal planes only (chest bib, haunch, leg and stripe
  tones), so it reads as black, never as a grey or generic cat.

Pixel-art rules, for every future frame:

- 16-bit, hard pixels, no blur or smoothing, no vector or cartoon
  reinterpretation. Frames are built from the shared parts of the same cat
  (head, torso, tail, eye overlays); poses are expression, lean, head
  offset and leg frames, never a redrawn or distorted character.
- Detail comes from small, deliberate pixel clusters at the sprite's own
  pixel density (stepped contours, 1–3 pixel fur strokes and tufts), never
  from a higher resolution, smoothing or anti-aliasing. The head, torso
  and tail are hand-placed half-grids mirrored about the centre, so both
  sides and every frame share exactly the same face and markings.
- No bright outlines, neon edges, glossy highlights or extra colours. The
  only bright pixels are the eye highlights, white inner ears, the gold of
  the prosperous state, the cyan / red cues and the drifting blue flame.
- Eye states (all in the same 6×6 box and anchor, so nothing shifts between
  frames): resting half-lidded amber eye, wide round eye (surprise),
  lowered lid (reading), closed arc (blink / sleep), `^ ^` (a pleased moment a behavior asks for), pale
  panic eyes (stressed).
- Pupils are drawn over the iris of every open eye state (clipped by the
  lids, under the highlight) from four masks: a constricted vertical slit,
  a slit with darkened iris either side, an oval, and a dilated round
  pupil with a faint second reflection. The level eases one step per
  redraw (the slow animation clock or a view change), so every dilation
  and constriction passes through the intermediate frames; it is kept per
  canvas, and closed eyes keep their size. The target comes only from
  fields behaviors already set: wide eyes (surprise, curiosity, noticing an
  encounter) dilate fully; watching the blue flame or another drifting
  object dilates; the stressed eyes take the oval and stay pale; reading,
  pondering and bright glyphs or sparkles constrict to a slit; otherwise
  the depth light decides (deeper and dimmer: oval; middle: relaxed slit;
  near and lit: thin slit). Both pupils shift together one pixel toward
  the gaze, and follow a watched item's position (the flame, a floating
  object, a star, a glyph) only while the cat looks its way.

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
  positive balance, budget not reached. Exactly the idle cat (same face,
  eyes, pupils, expressions and opacity) wearing two vanity items: a gold
  pixel crown and the gold `$` cyber-coin on its necklace. It can do every
  idle behavior, plus its own prosperous moments.
- **Stressed / overspending** — over budget or the budget reached. The same
  cat, tense and fragmented: rows of the sprite slip sideways in two
  alternating frames, sparse pixels drop out, head jitters, tail lashes,
  pale panic eyes, a small jagged mouth, the `$` charm stays, cyan sweat
  droplets and red `! ? X` marks. The frame flips about every second (300ms
  during an overspend event).

One-shot store reactions (`INCOME`, `EXPENSE`, `TRANSFER`, `OVERSPEND`,
`CELEBRATE`) come from the existing `anomalyEvent` and last seconds; on the
special calendar day a pixel heart cue shows once per day. Changes into or
out of the stressed state cross-fade the sprite; idle and prosperous share
one canvas, so the crown and coin simply appear or go on the next frame.

Financial state has priority over every optional activity:

- A behavior can only be chosen if it has a positive weight in the current
  state, so an idle activity can never override the stressed or prosperous
  appearance (e.g. reading, sleeping and the vanity moments are never
  eligible while stressed).
- The sprite additionally refuses incompatible props in the stressed state
  (the book and objects are never drawn; the vanity items declare their own
  visibility by state).
- When the state changes to or from stressed, the running behavior is
  cancelled cleanly (its `exit` hook runs, posture resets) and the same
  scheduler carries on; position and depth are not touched.
- Idle and prosperous look the same apart from the worn items
  (`SCHEDULER.continuousMoods`), so a change between them only switches the
  mood: the running behavior, its posture and the position carry on. Only a
  behavior that is not allowed in the new mood (a prosperous-only vanity
  moment) or whose plan draws differently per mood (`moodBound`: coinPolish,
  crown, budgetWatch, incomeGlance, relief) is cancelled as above.

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

**Healthy.** The content mood has the whole idle behavior library. On top of
it, eligible, never forced: `coinInspect`, `vanity`, `glint`, and the new
`relax` (a slow-breathing rest), with `coinPolish` and `crown` weighted up.
They sit in the ordinary random pool.

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
2. Essential transitions: a change to or from stressed cancels the running
   behavior through `setMode` (appearance first), then the transition
   reaction is the first thing offered. Between idle and prosperous the
   running behavior usually carries on and the reaction comes at its end.
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

### Rare environmental encounters

Two rare, unscripted discoveries in the cat's world. Each is one registered
behavior built by `defineEncounter` (`src/pets/core/encounter.js`); the
scheduler treats them like any other behavior. Neither reads, shows or
changes application data, and neither is connected to financial events.

**Miniature terminal** (`miniTerminal`). A tiny floating pixel-art terminal
(grey housing, dark teal glass, a faint highlight, stand and keyboard hint, a
one-pixel float on the slow clock) appears at a random X / Y / Z spot in the
backdrop. The cat notices it (wide eyes, gaze toward it), hesitates, then
approaches cautiously with the normal walking steps and stops a little nearer
to the viewer than the terminal. The screen wakes with a blinking cursor, the
cat leans in slightly, and exactly one decorative glyph from a small
configurable set (`glyphs`: `* + # ~ = @ & %`) shows for 2.6–5.2s. The cat
watches, blinks, glances up and back, the screen goes dark, and the cat turns
and walks away; the terminal fades and is removed. It can only ever show that
glyph or a cursor, never text, numbers or user data.

**Mysterious depth anomaly** (`depthAnomaly`). A small, localized tear in the
backdrop forms at a random position and depth: short, near-black pixel runs
that slip sideways in bands, a few detached fragments, a handful of cool
pixels. It is not a sphere, orb or portal, nothing screen-wide, and the cat's
sprite is never altered. The cat notices it, hesitates, approaches to a wary
distance (the tear's displacement grows with proximity), studies it for
3.5–7s with wandering gaze and, usually, one small step closer. The tear then
surges (larger offsets, a few more cool pixels) and the cat flinches back and
retreats by walking; the tear loses coherence in steps, fragments, fades and is
removed. The cat stays where it naturally reached, pauses, glances back once
and resumes.

**World props.** Encounter objects are world-anchored props
(`src/pets/EnvProp.jsx`): a small canvas inside the pet's perspective layer,
placed with the same `translate3d` transform as the cat, so they have real
X / Y / Z positions and scale with depth. Props deeper than the cat are drawn
before it and nearer ones after it. They are part of the global backdrop:
they belong to no tab, stay behind all foreground UI and never take pointer
events. A pet declares prop kinds in `definePet({ props })`
(`nomoz/props.js`: `{ width, height, render(ctx, spec, frame) }`); encounters
create, update and remove them by id with `S.prop(t, id, spec | null)`. The
prop's look changes only through the encounter's own script beats (glyph,
screen state, coherence, displacement phase); there is no separate animation
loop.

**Scheduling and rarity.**

- Weights are tiny (about 0.5–0.7 against 3–16 for ordinary behaviors) and the
  rarity tier is `extremelyRare`, so an encounter is a rare pick.
- Not before a randomized `startDelay` after page load (2–5 min).
- A randomized per-encounter cooldown after each run (terminal 20–45 min,
  anomaly 25–50 min) and a shared randomized quiet gap after any encounter
  (8–16 min), kept in the scheduler's per-session `memory`. The two therefore
  never follow each other closely and never repeat soon. The scheduler also
  never repeats a behavior back to back.
- Only in the idle and content moods, never stressed. Not while the pet is
  off-screen. They are `moves` behaviors, so reduced motion never selects
  them.
- One behavior runs at a time and each encounter owns a single prop id, so
  encounters and their props can never overlap or compete for movement.
- Spawn spot, depth, distance from the cat, glyph, tear seed, hesitation and
  inspection times are all drawn at run time.

**Lifecycle and cleanup.** `plan` builds one timeline (settle → appear →
notice → hesitate → approach → examine → depart → removal) that the
scheduler plays from its single timer. `exit` runs on completion and on
cancellation (a financial-state change, an interaction request, an error):
it removes the prop by id and records the cooldowns, so nothing is left
behind, and the pet's posture reset also clears all props. If the financial
state changes mid-encounter the existing transition rules apply, the encounter
is cancelled cleanly and the scheduler resumes with an eligible behavior for
the new state. Movement is continuous walking in X / Y / Z; nothing teleports,
and a viewport resize only clamps props back inside the layer.

**Configuration.** Per-encounter data is in `ENCOUNTERS` (`nomoz/config.js`):
id, name, rarity, weights, cooldown, duration, spawn depth band and distance
(in cells), approach stop distance, depth offset and step time, timing ranges,
glyph set, screen timings, inspection and retreat ranges, follow-ons. Shared
defaults (`startDelay`, `groupGap`, spawn tries) are in `ENCOUNTER`
(`src/pets/config.js`). Disable or retune without code: `BEHAVIOR_OVERRIDES`
(`{ miniTerminal: { enabled: false } }`), or remove the module from
`behaviors/encounters.js`.

**Adding an encounter.** 1) Add a prop kind to `nomoz/props.js` and list it in
the pet's `props`. 2) Add its data block to `ENCOUNTERS`. 3) Export a
`defineEncounter({ ...data, appear(c), examine(S, c, run, t), depart(S, c, run, t) })`
from `behaviors/encounters.js` (or a new file listed in `behaviors/index.js`).
`examine` and `depart` return the new time `t`; `run` provides `spawn`, `stop`,
`facing`, `gaze` and `away(cells)`. The framework supplies selection
eligibility, spawning, noticing, approaching, cleanup and cooldowns. No change
to the scheduler, the shell or any other component is needed, and a pet
without the prop kind simply does not offer the encounter.

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
- Reduced motion: behaviors flagged `moves` are never chosen, a behavior's
  script plays at half its time (`reducedDurationFactor`) with beats closer
  than 150 ms folded into one step (`compressBeats`: a blink or flick never
  shows, the final posture is unchanged), pauses stretch ×1.5, the animation
  clock stops, glides and fades are instant, and `lean` / `glitch` fields are
  dropped from every beat (`reducedDropFields`). Only stationary behaviors remain.

### Behavior library

Environmental behaviors (new in this system unless noted):

| Behavior           | Moods            | What it does                                                                 |
| ------------------ | ---------------- | ---------------------------------------------------------------------------- |
| investigatePixel   | idle, content    | A small blue flame drifts across; it notices, watches, follows a few steps, loses interest |
| watchBeyond        | idle, content    | Looks up / toward a distant point with no object, tracks it slowly, resumes  |
| floatingObject     | idle, content    | Finds a small bobbing object, examines it from several angles, nudges it, walks away leaving it behind |
| longPause          | idle, content    | Extremely rare 28–55s stillness with sparse blinks, gaze shifts and tiny leans / nods |
| vanish             | idle, content    | Walks steadily deeper into Z, smaller and dimmer, stays 8–26s, walks back; fully continuous |

Personality behaviors:

| Behavior     | Moods                 | What it does                                                                 |
| ------------ | --------------------- | ---------------------------------------------------------------------------- |
| read         | idle, content         | Settles (sometimes walks to a nearby spot), opens a pixel book in its lap, 10–22s of reading in a varied rhythm: page turns, a paw following the lines, nudging the book, comparing pages, looking up in thought, a page lifted out with a little magic, absorbed stillness; closes it, dozes off over it and wakes with a start, or stops at a sudden discovery |
| glitch       | idle, content, stressed | Rare, brief: two or three row slips with a faint cyan ghost, then a startled look, a glance aside and back to normal; never a flicker |
| coinInspect  | content               | Lifts the cyber-$ off its chest, turns it over (face, edge, back), puts it back |
| idea         | idle, content         | Stops in a thinking pose; a tiny pixel bulb appears above its head, then goes. An environmental animation, not a UI overlay |
| sleep        | idle, content         | Nods off sitting, lies down sphinx-like, or curls up with its head on its paws (sometimes after turning about and kneading); 9–24s of `z` cues with stirs, ear flicks, tail swishes, half-wakes, position changes and tiny dream symbols (rarely a faint magical shimmer); wakes naturally, often with a yawn and a stretch |
| vanity       | content               | Rare and composed: adjusts its crown, admires its coin with sparkles, or checks itself over |

Rare encounters (see "Rare environmental encounters"): `miniTerminal`,
`depthAnomaly`.

**The drifting blue flame.** The small object that drifts past the cat in
`investigatePixel` and `followPixel` (the `block` item) is a mysterious
glowing blue pixel flame: about 5×7 sprite pixels with a deep-blue outer
rim, bright-blue and cyan layers and a white-hot core, an irregular tip and
a rounded base, and a dithered ring of dim blue glow at partial opacity. It
flickers between three frames (tongue and lean of the tip change, the base
stays put), keyed to its own position and the slow animation clock, so it
needs no timer of its own. Only its appearance changed: its path, timing,
frequency, depth and scaling are those of the cat's sprite canvas, it stays
behind all foreground UI and never takes the pointer, and the cat watches
it through the same behaviors as before.

Financial-context behaviors (see "Financial context"): `relax`, `budgetWatch`
(flag-driven), `startle`, `unsettledLook` (stressed), and the reaction-only
`incomeGlance`, `expenseGlance`, `transferNod`, `interest`, `relief`.

Existing behaviors kept as they were: sit, observe, look, lookUp,
ponderSymbol, stillness, tired, stretch, inspect, floatSymbol, followPixel,
coinPolish, crown, glint, twitch, curious, travel, retreat, approach,
relocate, edgeExit, and the stressed set (shuffle, pace, flinch,
nervousLook, still). Their weights per state are unchanged, except that
the idle-only `inspect`, `ponder`, `peek` and `sleep` now have the same
weight while prosperous. `walk`, `peek`, `ponder`, `read` and `sleep` keep
their ids but were expanded (see "Activities and the extended rig").

### Activities and the extended rig

The behavior library adds multi-phase activities built from reusable
primitives. Everything below is visual only: no prop or effect reads, shows
or changes application data (the coins are toys, the terminal shows
abstract pixel bars), and none of it is eligible in the stressed state.

**The rig.** New view fields, all drawn from the same parts of the same cat
(`nomoz/sprites.js`), so the sprite design never changes:

- `pose`: besides `sit`, `stand` and `stretch`, `crouch` (lowered body,
  shortened legs: stalking, eating), `low` (head down with the back and a
  raised tail behind it: sniffing, eating), `loaf` (lying sphinx-like, front
  paws forward, tail along the floor) and `curl` (curled up, head resting
  low, tail wrapped in front). `legs: 3` lifts both forepaws mid-leap.
- `pawL` / `pawR`: a raised forepaw (screen side) at a level: `low`,
  `front`, `mid`, `out`, `high` (mouth), `face`, `ear`, `up`, `reach`. A
  3-pixel forearm with an ink seam and a lit edge, so a black paw reads over
  black fur; the lifted leg leaves a shadowed recess. Lying poses lift the
  front paw instead.
- `ears`: `perk`, `back`, `flick`, `flickL`, `flickR` (the ear is moved,
  not redrawn). `tail`: `swish`, `still`, `up`.
- `mouth`: adds `o` (yawn, gasp, cough), `chew` and `lick` (a small pink
  tongue tip).
- `focus` (a screen-space sprite x) draws the pupils toward a watched world
  object; `pupils` (0–3) asks for a pupil size. Both go through the existing
  eased pupil system, which still decides on its own when they are unset;
  tracked or bright overlay effects also steer it.
- `bookPaw` (a paw following the lines) and `bookShift` (the book nudged)
  for reading.
- `fx`: keyed sprite-space overlay effects (`FX_KINDS`: `spark`, `mote`,
  `star`, `rune`, `trail`, `orb`, `smoke`, `dream`, `note`, `text`,
  `glyph`, `obj`, `page`, `ring`), in screen orientation, optionally behind
  the cat (`back`). Scripts set them with `S.fx(t, key, spec | null)`,
  `S.fxMany` and `S.clearFx`.

**World props** (`nomoz/props.js`, through the existing prop layer, now
with optional glides `moveMs` / `ease` and fade speed `fadeMs`, instant
under reduced motion, and drawn in depth order): `yarn`, `bowl`, `wisp`,
`portal`, `ring` (a glyph circle in front and back halves), `trinket` (a
table of small objects: coin, tome, page, gem, gear, spring, bolt, lens,
crystal, vial, herb, mushroom, star, feather, key, fish, flower, moth, smoke
puff, sparkle burst, sigils), `chart`, `sky`, `vessel`, `device`,
`instrument`, and the `terminal`, which can now also show a session.

**Primitives** (`nomoz/animations.js`): grooming (`lickPaw`, `rubFace`,
`cleanEar`, `washFace`, `inspectPaw`, `shake`, `satisfied`), gestures
(`pawTap`, `conjure`, `headTilt`, `nod`, `triumph`, `wiggle`, `knead`) and
transitions (`stretchOut`, `yawn`, `survey`, `earFlick`, `tailSwish`,
`pause`, `shakeParticles`, `adjustBook`, `lookToward`). Activities offer
transitions only by chance (`maybeTransition` in `behaviors/util.js`), never
as a mandatory ending.

**Activities** (`defineActivity`, `src/pets/core/activity.js`) are
ordinary behaviors with a stage: a planned actor (`core/choreo.js`: walks,
glides, hops and looks composed from `travel`, sprite-space offsets turned
into world points and back), namespaced props, effect helpers and
`variant(key, table)` picks that avoid repeating the previous run's choice.
The plan's last beat removes everything the activity made; `exit` (which
also runs on cancellation: a mood change, a request, an unmount) removes any
of its props still present, clears the overlays and applies the pet's `rest`
patch (`REST_PATCH`: paws down, ears and tail at rest, pupils automatic).
Activities never run while the pet is off-screen. Long performances set
`performance: true`: after any of them, the others wait a shared quiet gap
(`ACTIVITY.performanceGap`, 45–120s) on top of their own cooldowns.

| Behavior      | Weight idle / content, cooldown | What it does |
| ------------- | ------------------------------- | ------------ |
| groom         | 6 / 5, 45s       | A chain of 2–6 grooming moves (paw licks, face rubs, ear cleaning, a two-paw face wash, paw inspection) whose order, sides and timing vary, ending with a shake and/or a satisfied pose. Stationary |
| yarnPlay      | 4 / 2.5, 110s    | A red yarn ball rolls in, is conjured, or is found; two or three of: passing it between the paws, rolling it wide and following it with eyes and head, bat–track–rush–pounce, stalking it (creeping, freezing, a false start, a wiggle, a pounce), sending it across the world and running after it, losing it behind itself and finding it, lazy taps while lying down, catching it, holding it and letting it go; it is left behind, dissolves, or is swatted off into the distance |
| eat           | 2.5 / 2, 4 min   | A small bowl (kibble, fish or cream) appears; the cat notices, approaches, sniffs, may hesitate and prod it, eats in 2–4 phases with pauses to look around or lick its lips, licks its mouth and leaves; the bowl fades |
| spell         | 2.5 / 2, 2.5 min | One of: runes drawn in the air, an orb conjured between the paws (rolled, lifted, recoloured, popped or released to float off into depth), stars orbiting in front of and behind it, a miniature portal (eyes, a waving paw, a fish, a star that circles the cat, a moth), levitated objects rearranged with gestures (swapped, lined up, stacked, sent into depth), an unstable spell that puffs harmless pixel smoke before succeeding, a rehearsed spell rethought and retried, a protective glyph circle raised at its feet |
| wispPlay      | 2 / 1.5, 3.3 min | A tiny wisp with its own wandering motion: noticed, tracked, reached for, chased through depth with dodged pounces; cupped and released, watched fading into the distance, or burst into sparkles |
| alchemy       | 1.5 / 1.2, 5 min | A cauldron appears; ingredients float in, it is stirred, a floating vial is examined and recoloured; five recipes, and one brew in four surprises it (sparkles, a smoke puff, a floating star, overflowing foam, a moth or flower) |
| constellation | 1.2 / 1, 6 min   | Unfolds a star chart and traces it, looks up at a patch of sky (beside it when there is no room above), points the stars bright, nudges strays into place, a star or two arrives from deep in the distance, the lines are drawn and a figure (cat, fish, crown, key, spiral) is recognised |
| discovery     | 1.2 / 1, 5 min   | A strange floating sigil: a cautious crouched approach, examination from several sides, a touch, and a sparkle burst, a harmless transformation, an unexpected object or a vanishing |
| tinker        | 1.5 / 1.2, 5 min | Assembles a small device (bot, clock, lamp, orrery) from parts, turns it around, tests it, a harmless spark, smoke or jitter, adjustments, success and a small celebration |
| music         | 1.8 / 1.6, 4 min | A chiptune keyboard or crystal chimes: single test notes, then a randomized motif (or, sometimes, a long absorbed performance) in one of several rhythms with visual notes and head bobs, a pause to listen, a flourish |
| treasure      | 1.4 / 2.6, 4 min | A few fantasy coins drift down; two or three of stacking, sorting by symbol, balancing one on a paw, studying a symbol, sending them into orbit; they dissolve or float away |
| bookAntics    | 2 / 1.6, 3 min   | Stacks small books (which may topple), orders floating pages and swats one back, reaches and hops for a book drifting upward then fetches it with magic, or summons a book from across the floor, and reads it a moment |
| terminalWork  | 1.5 / 1.2, 5 min | Conjures its terminal, inspects it, types in bursts (sometimes an exaggerated flurry), waits through a spinner, studies output, corrects a mistake, runs a task with a progress bar and reacts (a nod, a small triumph, or a puzzled tilt and a fix) |
| pawCheck, survey, yawn | 4 / 3, 3 / 3, 3 / 2 | Short stationary connecting actions |
| shakeOff      | 0.6 / 0.6, 30s   | Shakes off leftover magic; made likely by the magical activities' `followOn` |

Expanded existing behaviors (same ids):

- **walk** draws a route style: a stroll (the original), a meander with
  pauses to look, sniff or listen, a brisk purposeful stride, cautious
  crouched steps with freezes, a playful pounce on a glinting speck, or an
  arc deep into the scene and across. Headings avoid doubling back on the
  previous walk, so it does not shuttle along one line.
- **peek** varies the edge (usually the nearer side, sometimes the farther
  side or the bottom), how much shows, and how often (moving along the edge
  while hidden), then withdraws, comes in cautiously, or comes in to
  inspect a small object lying near the edge.
- **ponder** works a thought over by pacing, weighing two imaginary
  options, turning an object over in a paw, tapping a paw, glancing into
  the book or at a conjured terminal, and ends in a decision (the bulb, a
  nod) or lets it go.
- **read** and **sleep**: see the table above.

### Pet subsystem architecture (`src/pets`)

```
src/pets/
  config.js            shared WORLD, SCHEDULER, ACTIVE_PET_ID, ACTIVE_INTERACTIONS
  registry.js          registerPet / getPet / listPets / getActivePet
  usePet.js            hook: view state, placement, scheduler, frame clock
  PetErrorBoundary.jsx a pet error removes the pet, never the app
  EnvProp.jsx          one world-anchored environmental prop (encounter / activity objects)
  motion.js            CSS easing for the pet layer's glides
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
    encounter.js       defineEncounter: rare environmental encounters
    activity.js        defineActivity: behaviors with a stage (props, fx, cleanup)
    choreo.js          planned actor: world <-> sprite offsets, walk, glide, hop, look
    space.js           createWorld: depth, bounds, spots, transform
    rng.js             seed, PRNG and small helpers
  nomoz/
    index.js           the NOMOZ.EXE definition (registered first)
    config.js          appearances, overrides, lighting, equipped items
    sprites.js         pixel art, pose / frame composition, prop drawers
    spritesheet/       sprite-sheet renderer (the production cat), its
                       art, build / validate / audit tools and tests
    financial.js       NOMOZ.EXE's financial reactions (data)
    props.js           world props: terminal, depth anomaly, yarn, bowl, wisp,
                       portal, glyph ring, trinkets, chart, sky, vessel,
                       device, instrument
    animations.js      shared animation sequences and primitives
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
`capabilities`, `reactions`, `props`, `financialReactions`, `world` overrides, `initial` placement hints,
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
`index.js` there collects every export, so behavior modules export
behaviors only; shared helpers live in `behaviors/util.js`). For a
multi-phase performance with props or effects use `defineActivity({...})`
(same fields plus `performance`, and `plan(c, S, st)` receives a stage; see
"Activities and the extended rig"). Fields:

| Field                | Meaning                                                           |
| -------------------- | ----------------------------------------------------------------- |
| `id`                 | unique id                                                         |
| `rarity`, `moods`    | base weight from `SCHEDULER.rarityWeight` in each listed state    |
| `weights`            | explicit `{ idle, content, stressed }` (0 = never)                |
| `cooldown`           | ms before it can run again                                        |
| `duration`           | `[min, max]` ms (read with `this.duration` in `plan`)             |
| `moves`              | needs motion: skipped under reduced motion                        |
| `requires`           | capabilities or `vanity:<itemId>`; unsupported behaviors are inert |
| `requires` (`prop:<kind>`) | a pet must declare that prop kind                        |
| `requiresFlags`      | financial-context flags that must be set (e.g. `approaching`)     |
| `flagWeights`        | `{ flag: factor }` weight multipliers while a flag is set         |
| `reactMoods`         | moods where a financial reaction may run it despite weight 0      |
| `moodBound`          | `plan` draws differently per mood: cancelled on an idle ↔ prosperous change |
| `eligible(c)`        | extra rule on the live context                                    |
| `followOn`           | `{ otherId: factor }` natural continuations                       |
| `enter(c)`, `exit(c, why)` | lifecycle; `exit` also runs on cancellation (`why === 'cancel'`) |
| `plan(c, S)`         | adds timed patches to `S`, returns its duration in ms             |
| `enabled`            | `false` switches it off                                           |

`c` holds `rng`, `pet`, `mood`, `compact`, `reduced`, `cur` (current view
including `sx`, `sy`, `z`), `geo`, `pickSpot`, `apply`, `has`, `memory`.
`S.at(t, patch)`, `S.blink(t)`, `S.prop(t, id, spec | null)`,
`S.fx(t, key, spec | null)`, `S.clearFx(t)` and `S.play(animationId, t, opts)` build the script;
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
  `pawL`, `pawR`, `ears`, `tail`, `focus`, `pupils`, `bookPaw`,
  `bookShift`, `fx`, plus position (`sx`, `sy`, `z`, `facing`,
  `transitionMs`, `ease`). The shell hands the drawn ones to the sprite via
  one field list (`SPRITE_FIELDS` in `Anomaly.jsx`).
- New eye / pose / glyph frames are added to the template tables in
  `sprites.js` (poses in `POSES`, paw positions in `PAW_AT`); temporary
  overlays go in `ITEM_KINDS` (`text`, `block` (the blue flame), `obj`,
  `crown`, `coin`, `sparkle`, `glyph`) or `FX_KINDS` (keyed effects). Add a
  pixel-row table and one entry; each asset is defined once and shared.

#### Sprite-sheet renderer (production)

`nomoz/spritesheet/` can draw the cat from PNG sheets instead of
`sprites.js`. `SPRITE_RENDERER.mode` in `nomoz/config.js` selects it;
the shipped value is `'sheet'`; `'procedural'` is the one-line revert, and the procedural cat is also the fallback
for a failed or still-loading sheet and for any state no clip covers. Sheet
mode uses a 96 x 64 box (`SHEET_SPRITE_SIZE`); the procedural drawing sits
in a 56 x 60 area at the bottom centre, so effects, items and cues keep
their coordinates and follow the art's head through per-frame anchors.

- `manifest.js` lists sheets, clips and ordered `select` rules (first match
  wins; `when` takes a value, an array, `true` / `false` and the derived
  `moving`). `clips.js` validates it (invalid entries are skipped with a
  warning, never thrown) and does selection and frame timing.
- `renderer.js` plays the clips (timers, one-shots, reduced motion), adds the
  silhouette lighting, and redraws the eyes and whiskers live.
- Art lives in `art/<id>/<n>.png` (source of truth) and is assembled into
  `sheets/`; `anchors.js` is generated. See `spritesheet/SPEC.md` for
  conventions: 13 frames are approved art; the other 33 are rendered by code
  (`art/source/render_cat.py`; not hand-drawn, not SpriteForge).
- Motion over the still frames (`tail.js`): the tail pixels listed per frame (`art/tails.json`) are bent every ~100 ms with a continuous, eased swing (idle, grooming, dozing, walking, swish, lash), a grooming cat strokes its paw with a tongue while the head dips, single-frame sitting art breathes, and a clip change cross-fades over 120 ms. Reduced motion draws the still frames.
- World props (the treasure coins) are drawn behind or in front of the pet by depth, but a prop never changes side while it overlaps the pet's body (`core/layering.js`, used by `components/Anomaly.jsx`), and `moveProp(..., { around })` routes a prop that must change side round the pet's footprint, so coins travel in front of or behind the cat, never through it.
- Production gate: `npm run sheets:gaps` separates approved, code-generated and stand-in art; sheet mode may only be on while no stand-ins remain, enforced by `production.test.mjs`.
- Tooling and tests: `npm run sheets:build`, `sheets:validate`,
  `sheets:audit` (every pose / view / leg state must select a clip) and
  `npm test` (unit tests, approved-frame hash guard, the three tools in
  strict mode). CI runs `npm test` before the build. `npm run test:browser` runs real-Chromium
  tests with the pinned `playwright` devDependency (browser installed by
  `npx playwright install chromium`): the shipped sheets through the real
  renderer at desktop and mobile sizes, frame timing, reduced motion, fallback,
  tab hiding, the app on Vite dev servers, and production builds (shipped and
  procedural/sheet pinned) served with `vite preview`: emitted sheets match the sources byte
  for byte, load as `image/png`, and render. Sheet mode is switched on in memory
  by a Vite plugin around the existing `SPRITE_RENDERER` constant; the shipped
  config is `'sheet'`. Locally the browser tests skip with a reason when
  Chromium is missing; with `CI=true` or `REQUIRE_BROWSER=1` that is an error.
  `.github/workflows/ci.yml` (pull requests, non-master pushes) and the deploy
  workflow both run `npm ci`, `npm test`, `test:browser` and the build.

#### Vanity / equipment

`core/vanity.js` is the foundation (no shop, inventory or monetisation).
A pet declares slots (`head`, `neck`, `chest`, `held`, `prop`, `accessory`)
as anchor functions, and items (`defineVanityItem`) with `id`, `slot`,
compatible `pets`, `rows(p)` or `draw(...)`, `offset(p)` for animation,
`visible(p)` for conditions (state, behavior fields) and `layer`. The pet
lists default-worn ids in `equipped`. Items shipped: `crown` (on the head
anchor, so it follows every pose, lean, dip and breath), `chestCoin` (on its
necklace: the `chest` anchor, `chestSpot` in `sprites.js`, sits on the bib
of the sitting and standing body, lower when crouching or stretching, and
just under the chin when the head is low, lying or curled up; its `$` is
pre-reversed so it reads correctly whichever way the cat faces),
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
| Moods that share one look (no cancel, no cross-fade)          | `SCHEDULER.continuousMoods`            |
| Active pet, enabled interactions                              | `src/pets/config.js`                   |
| Encounter start delay and shared quiet gap                    | `ENCOUNTER` in `src/pets/config.js`    |
| Quiet gap between long performances                           | `ACTIVITY` in `src/pets/config.js`     |
| Neutral rig after an activity                                 | `REST_PATCH` in `src/pets/nomoz/config.js` |
| Encounter weights, cooldowns, spawn, glyphs, timing           | `ENCOUNTERS` in `src/pets/nomoz/config.js` |
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

#### Ambient blinking

`core/ambient.js` (`AMBIENT.blink` in `pets/config.js`) runs beside the
scheduler: every 3.2-8 s it closes plainly open eyes for 140 ms (one blink in
five is a quick double). Behaviors only blinked inside their own scripts, so
the eyes could stay open for a minute or more (measured over simulated hours:
a median 9 s but 42% of gaps over 12 s, up to 82 s). It never touches a
behavior's own expression (closed, down, wide, happy, a blink in progress),
is off while off-screen, under reduced motion and in the stressed look, and
reopens eyes it left closed when stopped.

The mood is re-derived at calendar-month boundaries (`hooks/useCurrentMonth.js`):
its inputs (spent / income / budget "this month") change at midnight without
any store change, and zustand reuses a selector's last result while the store
and the selector are unchanged, so a content or stressed pet stayed that way
into the new month (in normal and reduced motion alike). The selectors now
follow the month, which re-renders the pet from one timer per month (not a
ticking clock) and again when the page wakes (visible, focus, pageshow).

The reduced-motion setting is read live (`pets/usePrefersReducedMotion.js`): the
stock framer-motion hook reads it once per mount, so switching the OS option on
while the app was open left the pet blinking and walking until a reload.

### Reduced motion

With `prefers-reduced-motion: reduce` the initial placement is still
random and the correct state is shown, but walking, peeking, depth drift,
leans, glitches, the animation clock and all position / opacity
transitions are disabled. Only stationary behaviors remain (sit, observe,
look, watch beyond, long pause, sleep, read, idea, vanity, coin inspection,
grooming, paw checks, surveys, yawns, pondering without pacing and the
like, plus the gaze-only financial reactions; the walking encounters and
every activity that moves or conjures world props are not offered), on a
slower cadence; the coin turn collapses to a still face-and-back. Sleep
skips turning about, and prop glides and fades are instant. State changes
are instant.
