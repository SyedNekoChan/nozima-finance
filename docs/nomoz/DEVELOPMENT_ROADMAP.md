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

## Phase 0 --- Repository audit and baseline

**Purpose:** Understand the existing product before touching it.

**Tasks** - Inspect repository structure, `design.md`, `package.json`,
TypeScript/Vite configuration, app entry points, routing/tab system, pet
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

## Phase 1 --- Safety, isolation, activation, and persistence foundation

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

## Phase 2 --- Content registry, asset manifests, and validation pipeline

**Purpose:** Build the production pipeline before creating large
quantities of content.

**Tasks** - Define stable-ID conventions and versioned registries for
classes, creatures, skills, equipment, elements, maps, interactions,
enemies, and audio. - Define TypeScript schemas/data validation. -
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

## Phase 3 --- Vertical-slice world and movement

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

## Phase 4 --- Vertical-slice combat and recruitment

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

## Phase 5 --- Vertical-slice hardening and sign-off

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

This phase runs alongside world/roster production but follows the
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

## Suggested first implementation task

Start with **Phase 0 only**: inspect the actual repository and report
the architecture, current Ledger submission path, finance persistence
boundaries, pet/portal rendering points, test/build commands, and safest
integration seams. Do not implement gameplay during the audit. After
review, proceed to Phase 1.