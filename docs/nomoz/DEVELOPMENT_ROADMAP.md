# Nomoz --- Phased Development Roadmap

## Roadmap rules

-   Follow this order: architecture/safety foundation → one gameplay
    system at a time → asset pipeline and content creation → integrate
    asset batches into systems → finalization/testing.
-   The first milestone is a **complete vertical slice**, not a
    throwaway prototype.
-   Do not build all systems, all content, or 200+ creatures in one
    task.
-   Every phase has a scope boundary, dependencies, deliverables,
    acceptance criteria, and a gate. Do not advance while a
    safety-critical gate fails.
-   Use the Game Design & Technical Specification as source of truth.
    Numerical balance values remain configurable until validated.
-   Finance protection and save reliability take priority over game
    features.

## Status and phase numbering

The delivery numbering is established and unchanged:

-   **Completed phases:** Phase 1, Phase 2, Phase 3, Phase 4.
-   **Completed interim milestones:** Phase 3.1, Phase 4.1, Phase 4.2. These are
    reliability, verification and documentation passes; they add no new phase
    scope.
-   **Planned (not started):** Phase 5 onward.

**How the Phase 4 conflict was resolved.** An earlier planning draft of this
roadmap used Phases 1-5 for different scopes (planned "Phase 4" was combat and
recruitment). Delivered Phases 1-4 keep their delivered meanings. The
earlier draft's content was kept in its original order, not discarded: its
safety-foundation tasks are split between the delivered Phases 1-3 (with 3.1)
and the remaining items in Phase 5A, and its other early phases (registry and
asset pipeline, world and movement, combat and recruitment, hardening and
sign-off) are Phase 5B-5E. Phases 6-11 keep their numbers, scope and order.
Each lettered sub-phase is scoped and delivered separately and is never
combined with another in one task.

### Delivered phases and milestones

| Phase | Status | Scope as delivered | Planned work covered |
| --- | --- | --- | --- |
| 1 - Isolated RPG foundation | Completed | `src/rpg/` module; separate versioned `nomoz-rpg` Dexie database; RPG store, save/load, lifecycle and error states; lazy full-screen host with an RPG error boundary; development-only activation (`__nomozDev`, absent from production builds) | Part of the foundation tasks (remainder in 5A) |
| 2 - Hidden activation and transaction protection | Completed | Exact, case-sensitive phrase in the amount of a new, non-transfer Ledger entry, intercepted at the start of `handleSave` before validation, parsing and persistence; no transaction created; edit, transfer and other input unaffected; synchronous duplicate guard | Part of the foundation tasks (remainder in 5A) |
| 3 - Portal, cat theft and game entry | Completed | Opening scene (portal, sorcerer, theft) in the RPG overlay; persisted opening state; no theft replay; pet hidden through an explicit bridge that stops its scheduler; save schema v2 | Part of the foundation tasks (remainder in 5A) |
| 3.1 - Cat-presence reliability and production verification | Interim milestone (completed) | An unreadable RPG save no longer implies the cat is present: cat withheld, bounded retries, save never modified; production-preview smoke tests | Storage-failure behavior |
| 4 - Starting-class selection | Completed | Five-class selection (Swordsman, Hunter, Assassin, Mage, Necromancer) after entering Nomoz when no class is saved; explicit Confirm; class persisted before advancing; failed-write retry; fixed once saved; text-only (no class art); minimal placeholder afterwards | Prerequisite of Phase 5C (first-launch class choice) |
| 4.1 - Design reconciliation and class identity | Interim milestone (completed) | Documentation only: source-of-truth rules, activation and architecture corrections, delivered-behavior notes, class identities | none |
| 4.2 - Final roadmap and design audit | Interim milestone (completed) | Documentation only: restored this numbering; separated settled from provisional class mechanics | none |

**Planned versus delivered:** everything in Phase 5 onward below is planned and
not implemented, except where a section's status says it is partially
delivered. No combat, exploration, recruitment, skills, equipment or creature
content exists yet.

Verification so far used browser regression scripts run with Playwright
against the dev server and the production preview. Those scripts are not yet
checked into the repository (the project still has no test runner); making them
part of the repo is planned work for Phase 5E.

### Outstanding Phase 5A items (not delivered)

-   Protected last-known-good save, silent save retry, storage-reliability
    verification before play, persistent-storage request, and automatic
    recovery from corruption.
-   localStorage-only RPG preferences and the one-active-tab lock.
-   Bounded local diagnostics, and the critical-error return to the finance
    Dashboard with its reassurance notice.
-   The final-rescue persistence interface (today only the rule exists: the cat
    returns only after a successful write sets `catMissing: false`; no rescue
    is implemented).
-   Not yet scheduled elsewhere: the title screen with Continue/New Game
    (GAME_DESIGN sections 10 and 13); place it with Phase 5C.

### Known deviations from the design (owner decision needed to change)

-   The opening is a modal full-screen overlay, not a sequence over an
    interactive finance tab; no persistent finance-backdrop portal; the sorcerer
    is not drawn in the finance cat's style. The delivered flow is preserved.
-   Class selection is text-only because no class sprites exist and the art
    gate has not been started. It is not final art.
-   The RPG overlay uses the finance application's monospace type rather than
    the planned stone-panel, sans-serif RPG UI.
-   The first-choice class is fixed until sanctuary class switching exists
    (Phases 5D and 6A); see GAME_DESIGN, Starting class versus later class
    switching.

### Where open design work lives

-   Class starting skills, branch themes for the four non-Necromancer classes,
    per-class Basic Attack reach and all class numbers: see GAME_DESIGN, Class
    identities and Open class decisions. They are provisional until approved.
    Skill definitions land in Phase 6A (the Necromancer's in 6D); the starting
    skill is needed by Phase 5D, which introduces the first battle.
-   Class sprites and the representative protagonist/creature validation: the
    art quality gate below. No class or character art may be produced at scale
    before it passes.
-   Combat, exploration, recruitment and later systems remain planned in Phases
    5C-5D and 6-8 as written; Phases 4, 4.1 and 4.2 added none of them.

## Phase 0 --- Repository audit and baseline

**Status:** Satisfied in effect during Phases 1-4 (repository, Ledger submit path, pet shell and persistence were inspected). No standalone audit document was produced.

**Purpose:** Understand the existing product before touching it.

**Tasks** - Inspect repository structure, `design.md`, `package.json`,
Vite configuration, app entry points, routing/tab system, pet
rendering/behavior, Ledger form validation/submission, finance
persistence, existing tests, build/deploy assumptions. - Record current
finance workflows and baseline build/test status. - Identify the
smallest safe integration seam for the hidden trigger, portal state, and
cat-return event. - Document current file ownership/dependencies; do not
refactor unrelated code.

**Deliverables** - Short repository audit and proposed module
boundaries. - Baseline commands and known failures. - Initial risk list
and integration plan.

**Acceptance gate** - Existing project structure and finance persistence
are understood. - Baseline build/test status is recorded accurately. -
No source changes are made until the integration plan is grounded in the
actual repository.

## Phase 1 --- Isolated RPG foundation

**Status:** Completed.

**Delivered:** the `src/rpg/` module structure; a separate, independently
versioned `nomoz-rpg` Dexie database (the finance database is untouched);
isolated RPG store, persistence initialization, save/load interfaces,
lifecycle and explicit loading/error states; a lazy full-screen host mounted
beside the finance tree with an RPG-specific error boundary; development-only
activation (`__nomozDev`, absent from production builds). Initialization is
safe under React StrictMode and duplicate activation. RPG modules never import
the finance store, finance database, currency helpers or the pet mood bridge.

**Acceptance met:** no RPG UI during ordinary use; RPG state stored separately
from finance state; the development activation opens and closes the host
without touching finance state; RPG failures do not affect finance.

## Phase 2 --- Hidden activation and transaction protection

**Status:** Completed.

**Delivered:** the exact, case-sensitive phrase `Possibilities are possible`
in the amount of a new, non-transfer Ledger entry, intercepted at the start of
`handleSave` before account validation, parsing, loading state or persistence;
the form closes and the RPG opens through the activation gate; a synchronous
duplicate guard (cleared when the RPG is deliberately closed).

**Acceptance met:** the phrase never creates or modifies a transaction;
near-matches, different capitalization, added whitespace, edit entries,
transfers and other fields do not activate; ordinary and partly numeric
amounts (for example `7abc`) behave exactly as before.

## Phase 3 --- Portal, cat theft, and game entry

**Status:** Completed.

**Delivered:** the opening scene (portal, evil sorcerer, theft) in the RPG
overlay; persisted opening progress (`portal`, `stolen`, `entered`) and the
persistent missing-cat state, written before the story advances; resume
without replaying the theft; the existing pet is removed through an explicit
bridge that stops its scheduler and timers, and is withheld until its state is
known (no flash on reload); save schema v2. Reduced motion has a manual
alternative.

**Acceptance met:** the opening plays on first activation only; a failed write
never advances the story; the cat returns only after a future rescue is
persisted (the rescue itself is not implemented).

### Phase 3.1 --- Cat-presence reliability and production verification (interim milestone)

**Status:** Interim milestone, completed.

An unreadable, unavailable, slow, corrupt or newer RPG save is never treated as
proof that the cat is present: the cat is withheld, reads are retried a bounded
number of times, and the save is never modified by a failed read. Production
build and preview were smoke-tested.

## Phase 4 --- Starting-class selection

**Status:** Completed.

**Delivered:** the five-class selection (Swordsman, Hunter, Assassin, Mage,
Necromancer) shown after entering Nomoz and only when the save has no class;
inspect-then-explicit-Confirm; the class is saved (`protagonist.classId`)
before the flow advances; a failed write keeps the screen and offers Retry;
once saved the class is fixed and the screen never reopens; duplicate confirms
produce one write; a minimal placeholder follows. The save schema stays at v2
(the new field is additive and optional). Presentation is text-only: no class
art exists and none is claimed.

**Not part of Phase 4:** exploration, combat, skills, equipment, creature
recruitment, class sprites.

### Phase 4.1 --- Design reconciliation and class identity (interim milestone)

**Status:** Interim milestone, completed. Documentation only.

### Phase 4.2 --- Final roadmap and design audit (interim milestone)

**Status:** Interim milestone, completed. Documentation only: restored this
numbering and separated settled from provisional class mechanics.

## Phase 5 --- Vertical-slice completion (sub-phases 5A-5E)

**Status:** Planned (next). Not started, except the delivered parts of 5A
recorded above. The owner scopes each lettered sub-phase; they are delivered in
order and never combined. Delivered Phases 1-4 are prerequisites.

### 5A. Safety, isolation, activation, and persistence foundation

**Status:** Partially delivered by Phases 1, 2, 3 and 3.1 (see the table above). The items under Outstanding Phase 5A items remain planned.

**Purpose:** Prove Nomoz cannot harm the finance tool before building
gameplay.

**Tasks** - Create RPG module/bootstrap boundary. - Implement exact
phrase detection in Ledger submission without transaction
creation/modification. - Preserve ordinary invalid amount validation. -
Persist cat-missing/portal state before the one-time theft animation. -
Ensure animation does not replay after refresh/close. - Ensure finance
remains interactive during animation and Nomoz launches afterward even
if tab changes. - Add dedicated IndexedDB RPG save with versioning,
validation, automatic save, last-known-good fallback, migration hooks,
and recovery. - Add localStorage-only RPG preferences/session lock. -
Implement one-active-tab protection without interrupting finance use in
another tab. - Verify storage before entry and fail safely if reliable
persistence is impossible. - Add bounded local diagnostics and
severity-based error handling. - Add safe final-rescue persistence
boundary/interface, even before the ending is implemented.

**Deliverables** - Activation/state machine. - Finance/RPG storage
boundary. - Save/load/migration/recovery primitives. - Session
coordination. - Diagnostics and critical-error return path. - Focused
tests.

**Acceptance gate** - Matching phrase never creates a ledger entry. -
Normal amount validation is unchanged. - Refresh during theft never
replays it. - Cat-missing state and portal survive refresh. - RPG cannot
write finance persistence. - Corrupt-save and fallback paths behave
safely. - A second tab cannot take over an active RPG. - Critical RPG
error returns to finance without finance crash/data mutation. - No
gameplay expansion until all critical tests pass.

### 5B. Content registry, asset manifests, and validation pipeline

**Status:** Planned. Not started.

**Purpose:** Build the production pipeline before creating large
quantities of content.

**Tasks** - Define stable-ID conventions and versioned registries for
classes, creatures, skills, equipment, elements, maps, interactions,
enemies, and audio. - Define JavaScript schema/data validation (JSDoc or validation functions; no TypeScript migration). -
Define asset manifest format for transparent PNG sprite sheets, frame
dimensions, sequences, standalone objects, portraits, icons,
backgrounds, VFX, and audio. - Build shared asset loader, caching,
on-demand loading, and preloading for nearby encounters/transitions. -
Define static/build-time registration and central gameplay-system
bootstrap. - Add validation for duplicate IDs, missing required assets,
invalid references, invalid animation frames/sequences, missing
definitions, and broken content relationships. - Configure build-time
asset optimization while preserving source assets and pixel-art
appearance. - Create lightweight templates for creature, skill,
equipment, and content modules. - Write the concise architecture guide.

**Deliverables** - Registry and schema layer. -
Manifest/loader/validation pipeline. - Build-time asset optimization and
checks. - Architecture guide and templates.

**Acceptance gate** - Sample content registers without editing core
systems. - Invalid required references fail validation/build. - Optional
missing assets warn and use safe fallback. - Sprite sheet
frames/sequences validate. - Production build works with the actual base
path/deployment assumptions. - No dynamic plugin loader or unnecessary
DI framework.

### 5C. Vertical-slice world and movement

**Status:** Planned. Not started. Prerequisite delivered as Phase 4: first-time class selection (text-only).

**Purpose:** Establish the first playable exploration space with
production conventions.

**Tasks** - Implement four-direction protagonist movement and
tap/click-to-move pathfinding. - Add collision and clear
unreachable-destination behavior. - Implement camera/world layer
ordering; protagonist remains above major scenery. - Add a small area
beyond the portal, trail, first common encounter location, village, and
first sanctuary. - Implement environmental emphasis for interactables,
attempt-triggered prompt, nearest valid target in facing direction, and
subtle target highlight. - Add short instant-text NPC speech bubbles and
brief in-world contextual clues. - Add continuous subtle character idle
loops; keep environment mostly static. - Add world save/checkpoint state
and return/resume. - Create only enough production-quality assets to
validate conventions.

**Deliverables** - Playable opening map. - Movement, collision,
camera/layering, interactions. - Opening narrative beats and sanctuary
placement. - Small initial art set with manifests.

**Acceptance gate** - Movement is responsive on desktop and mobile. -
Pathfinding avoids obstacles and can be redirected at any time. -
Interactions choose the correct nearest valid target. - No permanent
prompts clutter the world. - Protagonist remains visible behind/among
scenery layers. - Refresh restores the correct persisted
location/state. - Finance workflows remain unaffected.

### 5D. Vertical-slice combat and recruitment

**Status:** Planned. Not started. Needs the starting skills and the Basic Attack reach decision (provisional, see GAME_DESIGN Open class decisions) and defines the sanctuary class-switching foundation.

**Purpose:** Complete one end-to-end gameplay loop.

**Tasks** - Implement battle-scene transition with short fade/direct
cut. - Implement individual turn order, party/enemy formations,
front/back targeting rules, intent icons, enemy names/continuous HP
bars/status icons, and enemy inspection. - Implement protagonist
commands and creature signature-only attacks. - Implement single-target
selection and explicit Confirm/Cancel; area target preview. - Implement
damage formula, ten-element data model, weakness/resistance feedback,
status rules, defeat, retreat, rewards, and automatic return to
exploration. - Implement one or more enemy types and a small initial
creature set with distinct signatures. - Implement first creature's
persisted species selection and guaranteed first-victory recruitment. -
Implement collection/codex discovery versus recruitment status. -
Implement sanctuary services needed for recovery, party, class/skill
foundation, and equipment foundation. - Implement compact reward
summary, level-up highlight, save/resume, defeat checkpoint recovery.

**Deliverables** - One fully playable normal battle. - Recruitment and
active-party integration. - Initial codex. - Sanctuary/recovery flow. -
End-to-end save/resume and retry.

**Acceptance gate** - Player manually controls all four party members. -
Every creature has exactly one free, always-available signature
attack. - Targeting cannot execute accidentally. - Enemy telegraphs and
row/area rules are consistent. - Defeat preserves
collection/discoveries/currency and permits retry. - First recruitment
is guaranteed after first victory and never duplicates. - XP/reward
summary returns automatically. - Refresh/re-entry resumes correctly. -
The full activation → exploration → battle → recruitment → sanctuary →
save/resume loop works.

### 5E. Vertical-slice hardening and sign-off

**Status:** Planned. Not started.

**Purpose:** Make the slice a trustworthy base for expansion.

**Tasks** - Test fresh adventure, repeated activation, refresh at
multiple points, interrupted theft animation, invalid amount input,
first battle victory/defeat, recruit/decline/retry, save
corruption/fallback, storage failure, second tab, return to title, and
finance regression. - Test responsive desktop/mobile UI and touch
controls. - Fix architectural, save, input, and integration defects
before content expansion. - Profile startup/transition asset loading and
ensure finance performance remains unchanged. - Validate production
build and GitHub Pages paths.

**Acceptance gate** - All safety-critical tests pass. - No known finance
regression. - No unhandled save corruption/data loss in tested recovery
paths. - No blocker in vertical-slice gameplay. - The user can manually
review and approve the slice before the project scales.

## Phase 6 --- Expand core systems one at a time

Implement in dependency-aware, reviewable increments. Do not combine all
systems into one prompt/task.

### 6A. Shared progression and class trees

**Status:** Planned. Not started. Defines each class's starting skill and the branch themes for Swordsman, Hunter, Assassin and Mage, using GAME_DESIGN's provisional class identities only as direction (no critical hits; identity from skills, not stats).

-   Configurable XP curve/cap, automatic stat growth, skill-point
    milestones, five class trees, shared point pool, class-specific
    saved loadouts, sanctuary-only spending/respec.
-   Gate: class switching preserves tree progress and loadout; no
    per-class grind; respec is predictable.

### 6B. Full combat rules and balance scaffolding

-   Complete ten-element matchup table, status effects, predictable
    damage, enemy intent/targeting patterns, area actions, retreat,
    KO/revive, summon integration interfaces.
-   Gate: deterministic test cases cover damage, elements, status
    duration/reapplication, targeting, and turn order.

### 6C. Equipment and consumables

-   Weapon/Armor/Relic slots, collection, compare/confirm,
    passive/active abilities, three-slot assignment, source
    availability, fixed consumable effects.
-   Gate: no duplicated items; active abilities cannot be used without
    their source item; equipment is never purchased/crafted/upgraded.

### 6D. Necromancer and summons

**Status:** Planned. Not started. The Necromancer's branches, costs, protagonist-survival rule and summon rules are already settled in GAME_DESIGN.

-   Sacrifice/Siphoning/Curses branches, HP/MP costs, deterministic
    drains, summon placement/turns/target
    priority/duration/scaling/replacement.
-   Gate: HP cost never KOs protagonist; failed summon placement spends
    nothing and preserves current summon; deterministic summon behavior
    tests pass.

### 6E. Map, journal, fast travel, and safe locations

-   Fog of war, continuous map, pan/recenter, discovered safe locations,
    fast-travel confirm, journal hints, rest/respawn rules.
-   Gate: no objectives/secrets revealed by map; fast travel only from
    safe locations; arrival restores party.

### 6F. Field interactions and puzzles

-   Element/creature signature-based interactions, contextual creature
    selection, layered clues, environmental puzzle toolkit, hidden
    passage conventions.
-   Gate: any recruited creature can be used regardless of active party;
    mandatory progress never requires a rare creature.

### 6G. Boss framework

-   Boss phase patterns, telegraphs, arena interaction, one-time state,
    boss rewards and special presentation.
-   Gate: every boss pattern is observable and fair; major boss yields
    one unique Weapon/Armor/Relic.

### 6H. Economy and merchants

-   Fixed rewards, dedicated currency, consumable-only stores, no random
    drops/grinding requirements.
-   Gate: defeat never loses currency; mandatory progression does not
    require grinding.

Each subphase includes tests, data validation, responsive UI checks, and
save compatibility checks before the next begins.

## Phase 7 --- Full world and campaign production

**Status:** Planned. Not started.

**Purpose:** Build the connected 6--10-hour campaign using proven
systems.

**Tasks** - Plan connected world regions, main route, natural gates,
villages, caves, ruins, compact dungeons, a few large layered dungeons,
shortcuts, sanctuary/safe-location placement, bosses, story beats,
optional equipment, creature encounters. - Keep main story focused and
environmental storytelling primary. - Add no side-quest system, postgame
areas, boss rematches, or mandatory rare-creature gates. - Add authored
progression checkpoints and verify no softlocks. - Make all world
content remain accessible after ending.

**Deliverables** - Campaign map and progression graph. - Main story
beats and brief mandatory dialogue. - Dungeon/puzzle/secret plan. -
Encounter/reward plan. - Boss and equipment placement plan.

**Acceptance gate** - Main route is understandable without explicit
waypoints. - Optional exploration is meaningful and never required for
hidden gear. - Main campaign fits the 6--10-hour target in
playtesting. - All routes and one-way transitions are fair and
escapable. - Post-ending world remains playable.

## Mandatory character and creature art quality gate

**Status:** In review. One representative protagonist sample and one representative creature sample (round 2, following the owner's reference direction) exist in `docs/nomoz/art-review/` (single front-facing pose each; no four directions or animation). They are unapproved review samples, not wired into the game, and no visual approval has been given or claimed. The gate is not passed. The five class sprites for the class-selection gallery are produced only after the gate passes; until then class selection stays text-only.

Apply the mandatory art standard in `docs/nomoz/GAME_DESIGN.md` to all protagonist, NPC, recruitable creature, and enemy sprites.

Before expanding character/creature production:
- Produce or identify one representative protagonist sprite and one representative creature sprite.
- Inspect both at native resolution and intended gameplay scale.
- Validate expressive chibi-inspired proportions, detailed faces, deliberate pixel clusters, layered material shading, crisp stepped contours, strong silhouettes, and consistent rendering quality.
- Confirm neither sprite relies on blur, smooth vector shapes, flat color blocking, or crude low-detail retro styling.
- Compare both assets for cohesive pixel density, lighting logic, palette richness, outline treatment, and finish.
- Validate transparent backgrounds, canvas dimensions, four-direction conventions, and asset metadata.
- Record approved production sprite dimensions and pixel-preserving scaling convention.

Acceptance gate:
- Do not expand into a large protagonist, NPC, or creature asset batch until both representative assets pass.
- If the environment cannot produce or verify the actual visual assets, report the limitation and do not claim visual approval.
- Every subsequent asset batch must pass the same visual-cohesion and gameplay-scale checks before integration.
- Species variety is encouraged; inconsistent rendering quality is not.
- This gate does not permit skipping dependencies or implementing features from later phases.

## Phase 8 --- Creature roster in waves

**Status:** Planned. Not started.

**Purpose:** Scale to 200+ creatures without compromising consistency.

**Tasks** - Define roster roles, silhouette families, elements,
signature-attack identities, combat profiles, rarity/discovery approach,
and field utility. - Build a representative batch that tests varied
sizes, animation complexity, element coverage, attack effects, and field
interactions. - Validate the production pipeline and per-creature
authoring template before each expansion wave. - Expand in organized
batches, including data, sprite sheets, animations, signatures,
effects/audio as needed, codex data, recruitment rules, and optional
field interactions. - Avoid near-duplicates; silhouette must remain
primary and element cannot be the only distinction. - No evolution,
duplicates, creature leveling, random recruitment chance, or alternate
creature combat actions.

**Deliverables per wave** - Stable IDs and validated definitions. -
Transparent PNG spritesheets with four-direction idle/walk and shared
essential combat animations. - Signature attack definition and effect
references. - Combat/codex/recruitment data. - Tests and validation
report.

**Acceptance gate per wave** - All manifests/frames/IDs/references
validate. - Creature reads clearly at gameplay scale. - Signature is
unique, deterministic, free, and its only combat action. - Creature
works in battle and codex; recruitment behaves correctly. - Performance
and asset loading remain acceptable.

## Phase 9 --- Asset creation and system integration

**Status:** Planned. Not started.

This section runs alongside world/roster production but follows the
pipeline established earlier.

**Tasks** - Create and clean final pixel art from concepts; never ship
raw concept images as final sprites. - Maintain shared palette, pixel
clusters, dimensions, silhouettes, transparency, frame timing, and
manifest conventions. - Build reusable effects for ten elements and
common combat events. - Create regional tilesets, multi-tile scenery,
NPCs, creature/class sprites, UI icons, portraits, backgrounds, and
audio. - Integrate each asset batch immediately into its intended system
and test it there. - Keep editable sources and generate optimized
outputs non-destructively.

**Acceptance gate** - Assets are local to the repository and work under
the production base path. - Required asset errors fail validation;
optional assets have safe fallbacks. - Pixel art is crisp after
optimization. - Animation, transparency, layering, collision, and mobile
readability are verified in-game.

## Phase 10 --- Full integration and final balancing

**Status:** Planned. Not started.

**Tasks** - Play through the full campaign with each class where
practical. - Validate XP/skill points, class-tree costs, equipment,
creature party combinations, currency, consumables, bosses, summon
milestones, and campaign pacing. - Decide final level cap/XP curve based
on real playtests. - Confirm all five classes have distinct identities
without mandatory min-maxing. - Ensure 200+ creature catalog is complete
and validated. - Audit story state, cat-missing/cat-return state, ending
persistence, postgame access, and safe re-entry. - Test all save
migrations and fallback paths.

**Acceptance gate** - Main story can be completed without grinding,
mandatory rare encounters, or hidden mandatory equipment. - Build
supports reasonable party choices. - No duplicated content IDs or
invalid assets. - Ending and cat return are reliable and atomic. - Save
recovery preserves valid progress.

## Phase 11 --- Release readiness

**Status:** Planned. Not started.

**Tasks** - Full desktop/mobile QA and touch-input testing. - Finance
regression suite: Dashboard, Ledger, accounts, budgets, transactions,
graphs, tabs, persistence, existing pet behaviors, and other current
workflows. - Test activation phrase edge cases, invalid amounts,
interrupted animation, repeat activation, second tab, separate profile
behavior, storage quota, browser refresh/close, corrupt save, migration,
and final rescue. - Test production build, base path, asset loading,
audio preferences, local diagnostics, keyboard/touch access, text
readability, and reduced-performance devices. - Verify no remote asset
hosting, telemetry, cloud save, or external diagnostic transmission. -
Fix all critical/high-severity defects before release.

**Release gate** - Finance behavior and financial data are unchanged
except the explicitly intended hidden activation and cat-return
integration. - RPG save/persistence/error handling is reliable under
tested failure cases. - Main story, optional exploration, combat,
recruitment, progression, ending, and post-ending play all work. -
Production build/deployment succeeds. - All required assets/content pass
validation.

## Original first implementation task (historical)

The roadmap originally began with **Phase 0 only**: inspect the actual repository and report
the architecture, current Ledger submission path, finance persistence
boundaries, pet/portal rendering points, test/build commands, and safest
integration seams. Do not implement gameplay during the audit. After
review, proceed to the foundation work. This has been superseded by the delivered-phases table above: the next step is the owner's scoping of Phase 5.