# Claude Projects Instructions --- Nomoz

## Mission

Implement **Nomoz**, the hidden JavaScript/JSX RPG embedded in the existing
finance tool, in small, verified phases. Treat the companion Game Design
& Technical Specification as the source of truth. The existing finance
tool is a complete product and must remain safe and unchanged outside
the explicitly required activation/portal/cat-return integration.

## Source of truth and precedence

-   The three documents in `docs/nomoz/` (this file, `GAME_DESIGN.md`,
    `DEVELOPMENT_ROADMAP.md`) are the authoritative RPG guidance.
    `design.md` documents the finance application and its RPG integration
    boundary; do not rewrite unrelated finance documentation.
-   Precedence when sources disagree: the owner's explicit instructions for the
    current task, then these documents, then the delivered and verified
    implementation, then any older specification, other branch or stale copy.
    A stale copy never overrides a settled decision.
-   Settled owner decisions that must not drift: the exact case-sensitive
    activation phrase, JavaScript/JSX (no TypeScript migration), the separate
    `nomoz-rpg` database, the opening flow as delivered, and the roadmap's
    delivery numbering (see the roadmap's status section).

## Required working behavior

1.  Before editing, inspect the repository structure, `design.md`,
    `package.json`, current entry points, storage systems, pet
    rendering/behavior, routing/tab logic, and tests. Report no
    speculative assumptions as facts.
2.  Work only on the current roadmap phase and its dependencies. Do not
    implement the whole game in one pass.
3.  For each task, identify affected files/systems, relevant interfaces,
    safety risks, tests, and acceptance criteria before making changes.
4.  Extend existing systems through documented interfaces/events. Do not
    create duplicate parallel systems or refactor unrelated finance
    code.
5.  Keep code JavaScript/JSX, modular, lightweight, data-driven, and
    compatible with the existing Vite/GitHub Pages setup. Do not
    introduce TypeScript.
6.  Keep RPG state completely separate from finance state. Never access,
    alter, migrate, clear, or repurpose finance persistence for RPG
    data.
7.  Make content extensible through stable-ID registries and manifests.
    A normal creature/item/skill/asset addition should not require
    editing core gameplay systems.
8.  Use well-defined events for cross-system notifications and explicit,
    documented module interfaces for operations that require direct
    responses (JSDoc where it helps; no TypeScript).
9.  Validate asset references, IDs, manifests, animation
    dimensions/sequences, save schemas, and content relationships.
    Production builds must fail on missing required assets/references
    and broken essential animations; optional problems should warn and
    safely fall back.
10. Add focused tests for changed behavior. Run the relevant checks and
    production build when feasible; state exactly what was and was not
    tested.
11. Preserve editable source assets and optimize generated build assets
    without degrading pixel-art appearance.
12. Avoid unnecessary dependencies and abstractions. Prefer existing
    tools and simple JavaScript modules.
13. Keep error handling inside the RPG. Critical RPG failures preserve
    the last-known-good save and return to the finance Dashboard without
    crashing or corrupting finance functionality.
14. Do not create cloud saves, external asset hosting, save
    export/import, cross-device transfer, or cross-profile coordination.
15. Do not add side quests, evolution, random creature drops, creature
    leveling, extra creature combat actions, or other mechanics that
    contradict the spec.
16. Do not reintroduce removed finance-tool functionality or labels.
    Avoid unrelated finance-tool changes.
17. Do not commit, stage, push, or manage Git. The user handles Git
    manually.

## Safety-critical integration rules

-   Activation phrase is exactly `Possibilities are possible`. Matching
    is exact and case-sensitive on the raw string: no trimming, no
    case-folding, no other normalization.
-   Only the amount field of a **new, non-transfer** Ledger entry can
    activate it. Editing a transaction, transfers and all other fields
    never do. The check is the first step of the Ledger submit handler,
    right after the double-submit guard and before validation, parsing
    or persistence.
-   A matching phrase launches/resumes Nomoz but must never create or
    modify a transaction.
-   Ordinary invalid amount input retains the existing validation
    behavior.
-   Persist the missing-cat state before the cat visibly disappears, and
    never advance the story on a failed write. A refresh or close at any
    point must never repeat the theft: before the write only the
    introduction can replay; after it the scene is never replayed.
-   Delivered presentation: a full-screen RPG overlay above the mounted
    finance application. The target of keeping finance interactive during
    the sequence, a persistent finance-backdrop portal and finance-style
    sorcerer art is not implemented; do not change the delivered flow
    without the owner's approval (see GAME_DESIGN).
-   The pet shell mounts the cat only when the RPG bridge reports it
    present. An unreadable RPG save is never evidence that the cat is
    present; the cat stays withheld and the save is never modified by a
    failed read.
-   The cat remains absent from every finance pet appearance/behavior
    until the final rescue has been persisted successfully.
-   RPG data belongs in a dedicated IndexedDB database. localStorage is
    limited to small RPG preferences and active-session coordination.
-   Maintain an automatic save and protected last-known-good save.
    Migrations validate and preserve a recoverable prior version.
-   Verify storage before gameplay; if reliable persistence cannot be
    ensured, stop safely and return to finance.
-   One active RPG tab per shared storage. A second tab stays usable as
    finance and cannot interrupt the active RPG.
-   Final rescue must be atomic: persist and verify RPG completion
    first, then return the cat to the finance tool.
-   Never let an RPG exception crash finance UI or mutate financial
    data.

## Game rules that must not drift

-   One connected world, 6--10-hour target campaign, focused main story,
    meaningful optional dungeons, no side-quest system.
-   Five starting classes: Swordsman, Hunter, Assassin, Mage,
    Necromancer.
-   Party = protagonist + three creatures.
-   Every creature has exactly one unique signature attack, always
    available, no cost/cooldown. No other creature combat actions,
    Guard, or items.
-   Creatures have fixed strength profiles and do not level
    independently. No evolution; one copy per species; unlimited
    collection; target 200+ species in waves.
-   Ten elements only: Fire, Water, Earth, Wind, Lightning, Ice, Nature,
    Metal, Light, Shadow.
-   Four-direction sprites only; no diagonal sets.
-   Protagonist stats: HP, Attack, Defense, Speed; MP separate. No
    manual attribute allocation.
-   Three active class/equipment ability slots. Each class has its own
    retained tree progress and saved loadout. Shared skill-point pool;
    respec only at sanctuary.
-   Protagonist commands: Basic Attack, unlocked Class Skills, Guard,
    Item. Necromancer skills may use fixed HP/MP costs, but HP costs can
    never KO the protagonist.
-   Temporary Necromancer summons are deterministic, one active at a
    time, never permanent party members.
-   Turn-based individual actions, visible turn order, no timers, no
    tactical grid. Manual control of all four party members.
-   Front/back rows; clear enemy intent and attack targeting patterns.
    No random damage variation or critical hits.
-   Single-target actions require target selection then explicit
    Confirm/Cancel. Area actions preview affected targets and also
    require confirmation.
-   Main story must not depend on rare creatures or hidden equipment.
-   Bosses are one-time, pattern-based, clearly telegraphed; each major
    boss awards one unique Weapon/Armor/Relic.
-   Equipment is discovered, never bought/crafted/upgraded; no creature
    equipment.
-   Defeat preserves creatures/discoveries/currency, restores party at
    checkpoint, and permits retry.
-   The protagonist cannot die outside combat. No permanent softlocks.
-   Save indicator is not shown. Saves happen silently with reliable
    recovery.
-   The cat returns only after the final rescue is persisted.

## Mandatory character and creature art direction

- Follow the complete **Mandatory character and creature sprite art standard** in `docs/nomoz/GAME_DESIGN.md` for every protagonist, NPC, recruitable creature, and enemy.
- The target is richly rendered, high-detail, chibi-inspired pixel art: relatively large heads, compact bodies, expressive and carefully shaded faces, layered hair/anatomy, detailed clothing/materials, intentional dense pixel clusters, crisp stepped contours, selective outlines, and multiple coordinated tones that create convincing volume.
- This is not generic minimalist or low-detail 16-bit art. Never use crude large color blocks, flat unshaded sprites, blurred/antialiased art, smooth vector illustrations, 3D renders, or images merely downscaled to look pixelated.
- The 16×16 world tile grid does not constrain character sprite dimensions. Increase character resolution if needed to preserve the required facial detail, shading, and pixel clusters; scale only with pixel-preserving methods.
- Maintain one cohesive rendering style across all species, sizes, rarities, and roles. Silhouette and anatomy may vary; pixel density, shading discipline, contour quality, and finish must remain consistent.
- Do not produce a large character/creature batch until one representative protagonist and one representative creature have been inspected at native resolution and intended gameplay scale against the design document's acceptance criteria.
- Do not claim visual fidelity was verified unless actual asset files were inspected. If the available environment cannot produce or verify assets to this standard, state that limitation and do not label placeholder art as final.
- These rules do not expand a phase's scope. Implement only the assets and features authorized for the current phase.

## Visual/audio standards

-   Game title text is exactly **Nomoz**.
-   Clean, readable pixel art; modern sans-serif UI target. Base tile
    16×16 for terrain only. Characters and creatures follow the mandatory
    art standard above, which is not minimalist; about 24×32 is only an
    initial technical baseline and the canvas grows when the required
    detail needs it.
-   Environments are mostly static; character idle loops are subtle and
    continuous. Four-direction idle/walk for creatures plus shared
    essential combat animations.
-   Transparent PNG spritesheets for animated characters; separate
    assets for standalone objects, portraits, icons, and backgrounds.
-   Environments use mostly flat shading and restrained lighting (this
    does not apply to characters and creatures). Strong silhouettes and
    regional accent palettes.
-   Protagonist must render above major scenery and remain visible.
-   Title screen: dark portal-centered scene, minimal decoration,
    centered vertical menu below title. Selected option brightens
    slightly and gains a small pixel marker.
-   Exploration HUD: protagonist heart icon + HP number top-left; menu
    button top-right; subtle persistent skill-point indicator. No
    persistent MP/currency/party/inventory HUD.
-   Small skill marker appears near sanctuary when skill points are
    unspent. Skill trees are accessible only at sanctuaries.
-   NPC text appears instantly in short speech bubbles. No routine
    footsteps or ordinary interaction sounds; meaningful
    mechanisms/doors/discoveries may sound.
-   Standard battle transition is a direct cut with short fade. Routine
    victory reward summary and level-up highlight dismiss automatically.
-   Creature discovery unlocks codex silently; entries show
    Discovered/Recruited status and only known information.
-   Combat UI is responsive and platform-specific; never squeeze the
    desktop layout onto mobile.
-   Respect separate Music/SFX sliders and master mute.

## Required architecture

-   Centralized, versioned content registries with stable IDs.
-   Lightweight JavaScript modules with clear responsibility and
    documented dependencies.
-   Typed events for cross-system notifications; explicit interfaces for
    direct-response operations.
-   Central bootstrap for gameplay systems; simple build-time/static
    registration for data content.
-   Per-module asset manifests and shared loader; essential assets
    loaded first, others on demand and cached.
-   Dedicated RPG IndexedDB save with schema version, migrations,
    validation, automatic save, and protected last-known-good fallback.
-   Local bounded diagnostic log; no external reporting and no
    finance/sensitive data in logs.
-   A concise architecture guide and lightweight templates for
    creatures, skills, equipment, and content.

## Definition of done for each phase

A phase is complete only when: - Its acceptance criteria are met. -
Changed behavior has focused tests or documented manual checks. -
Relevant lint/test/build checks pass, or failures are
reported accurately. - No unrelated finance changes are included. -
Desktop/mobile impact is considered. - Save compatibility and
asset/content validation are considered where relevant. - The next phase
can build on the implementation without hidden assumptions.

## Output style for implementation tasks

When asked to produce a Claude Code implementation prompt, follow the
user's strict output preference: - Minimal tokens; no explanations or
narrative. - Output code blocks only. - Put the exact file path
immediately above each code block. - Include complete changed files only
when file contents are requested; do not provide partial snippets. -
Never instruct Claude to commit, stage, push, or manage Git. - Do not
claim tests passed unless actually run and verified.