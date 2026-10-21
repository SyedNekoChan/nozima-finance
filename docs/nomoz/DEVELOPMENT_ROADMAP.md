# Nomoz — Development Roadmap

## Purpose

Build Nomoz as a hidden, persistent RPG inside the existing finance application without compromising finance functionality, UI, workflows, performance, data, or persistence.

Follow the phases in order. Complete and verify each phase before moving forward. Do not attempt to build the entire game in one pass.

The authoritative gameplay specification is `docs/nomoz/GAME_DESIGN.md`. Permanent implementation rules are in `docs/nomoz/CLAUDE_INSTRUCTIONS.md`.

## Global Rules

- Finance safety takes priority over RPG functionality.
- RPG persistence must use a separate database and independent schema.
- Keep all RPG systems under `src/rpg/`, with only a minimal activation gate exposed to finance code.
- Use the existing JavaScript/JSX stack and dependencies wherever practical.
- Do not install packages or change dependency manifests without explicit authorization.
- Do not commit, stage, push, or manage Git.
- Do not reopen approved design decisions or ask questions already answered.
- Keep unresolved balance values configurable until the game can be playtested.
- Implement the smallest complete version of the current phase.
- Do not expand scope into later phases prematurely.
- Verify each phase against its acceptance criteria before proceeding.

---

## Phase 0 — Repository Baseline and Safety Plan

### Objectives

Understand the relevant existing code and establish a safe implementation boundary.

### Tasks

1. Inspect the current application entry point, Ledger submission flow, amount parsing, pet shell, styling conventions, and persistence setup.
2. Confirm the raw amount string can be intercepted before parsing and finance persistence.
3. Identify the smallest safe integration point for a full-screen RPG overlay.
4. Confirm the existing pet can be hidden and later restored without unintended resets, duplication, or placement changes.
5. Identify available build and test commands and any environment limitations.
6. Record the files and finance pathways that must remain unaffected.

### Acceptance Criteria

- The exact activation interception point is identified.
- Finance and RPG responsibilities have a clear boundary.
- The separate RPG database approach is defined.
- No files have been changed during this baseline phase.
- No dependencies have been installed.

---

## Phase 1 — Isolated RPG Foundation

### Objectives

Create the RPG architecture without exposing gameplay to users.

### Tasks

1. Create the `src/rpg/` module structure.
2. Establish separate modules for:
   - RPG database and versioned schema
   - Save loading and persistence
   - RPG state/store
   - Activation gate
   - Game lifecycle
   - Overlay host
   - Content definitions
3. Mount a minimal full-screen RPG host that is independent of finance tab rendering.
4. Create initialization, loading, saving, and error states.
5. Add development-only activation for testing without requiring the real hidden trigger.
6. Keep development activation inaccessible in production.
7. Ensure initialization and lifecycle operations tolerate React StrictMode and duplicate events.

### Acceptance Criteria

- The application builds successfully when the required environment is available.
- Finance behavior is unchanged.
- No RPG UI appears during ordinary use.
- RPG state is stored separately from finance state.
- Development-only activation can open and close a placeholder RPG safely.
- Closing the placeholder does not reset or corrupt finance state.
- RPG errors cannot crash the finance application.

---

## Phase 2 — Hidden Activation and Transaction Protection

### Objectives

Implement the exact hidden entry mechanism with strict protection against accidental finance writes.

### Tasks

1. Intercept the raw amount field value in the new Ledger entry submission flow.
2. Match only the exact case-sensitive phrase `Possibilities are possible`.
3. Intercept before numeric parsing and every finance persistence operation.
4. Cancel the pending transaction submission when the exact phrase matches.
5. Prevent duplicate activation caused by rapid submission, repeated events, or component lifecycle behavior.
6. Preserve normal validation and saving for all non-matching input.
7. Keep the activation logic isolated from RPG implementation details.

### Acceptance Criteria

- Exact phrase submitted through a new Ledger entry starts RPG activation.
- No transaction is created or modified by activation.
- No partial or numeric interpretation of the phrase reaches finance persistence.
- Different capitalization, added whitespace, partial phrases, edit-entry submissions, and unrelated fields do not activate the game.
- Ordinary numeric amounts continue to behave as before.
- An activation failure does not disrupt Ledger functionality.
- No RPG database failure can corrupt the finance database.

---

## Phase 3 — Portal, Cat Theft, and Game Entry

### Objectives

Implement the first-activation story sequence and establish the persistent missing-cat state.

### Tasks

1. Create the portal transition.
2. Show the evil sorcerer stealing the existing pet cat.
3. Transition into the Nomoz game screen.
4. Hide the pet through an explicit, reversible lifecycle state.
5. Persist the initial story progression and missing-cat state.
6. Ensure later activation skips the introductory theft and resumes the existing game.
7. Ensure interruption or reload during the opening sequence cannot duplicate the theft or create contradictory states.

### Acceptance Criteria

- The opening occurs only on first activation.
- The cat visibly disappears as part of the story.
- The missing-cat state persists after reload.
- Re-entry resumes rather than restarting the story.
- The pet does not appear during the missing-cat state.
- Ordinary finance navigation and functionality remain intact.
- Failed persistence cannot falsely advance the story.

---

## Phase 4 — Playable Vertical Slice

### Objectives

Deliver one small but complete playable section before expanding the world.

### Scope

- Starting class selection
- One small explorable area
- Responsive movement and character idle animation
- Basic interactions and environmental clues
- One sanctuary
- A small initial creature roster
- One recruitment sequence
- One complete battle
- Basic rewards and progression
- Save and resume

### Tasks

1. Implement the five starting classes: Swordsman, Hunter, Assassin, Mage, and Necromancer.
2. Establish protagonist movement, camera behavior, collision, and interaction input.
3. Create reusable map, character, creature, enemy, and interaction definitions.
4. Implement visible, approachable overworld encounters.
5. Implement recruitment and immediate silent codex discovery.
6. Implement a complete battle using the documented party and action rules.
7. Implement checkpoint recovery after defeat.
8. Save meaningful progress and restore it on reload.
9. Test desktop, keyboard, touch, and narrow mobile layouts.

### Acceptance Criteria

- A new player can select a class and explore the area.
- Movement, collision, interaction, and encounter starts work reliably.
- A creature can be discovered, recruited, and added to the codex.
- A full battle can be won or lost.
- Defeat restores the party at the checkpoint while preserving recruited creatures and discoveries.
- Rewards and level-up summaries behave as specified.
- Reloading resumes saved progress.
- No creature has more than its one signature attack.
- The vertical slice works without affecting finance functionality.

**Do not expand the game world until this phase is complete and verified.**

---

## Phase 5 — Core Combat and Progression Systems

### Objectives

Make combat and progression extensible before increasing content volume.

### Tasks

1. Establish the turn scheduler and visible turn order.
2. Implement protagonist actions: Basic Attack, unlocked Class Skills, Guard, and Item.
3. Implement manual action selection for all four party members.
4. Implement single-target selection and area-effect preview with explicit confirmation and cancellation.
5. Display enemy names, continuous HP bars, and status icons.
6. Show exact HP values in detailed inspection.
7. Implement readable enemy intentions and enemy behavior definitions.
8. Add a small, controlled set of effects such as burn, charge interruption, and marks.
9. Implement creature signature attacks as each creature's only combat action.
10. Implement automatic EXP and currency rewards, level-up summaries, and checkpoint recovery.
11. Establish configurable progression curves and defer the final level cap until pacing can be evaluated.
12. Implement sanctuary-only skill tree access and the persistent unspent-point indicator.

### Acceptance Criteria

- All combat actions follow the approved rules.
- Turn order, target selection, enemy intentions, and status effects are readable.
- Target selection cannot accidentally confirm the wrong action.
- Victory rewards and level-up summaries dismiss automatically as specified.
- Skill points persist and the UI clearly indicates when they remain unspent.
- Progression values can be tuned without rewriting core combat systems.
- Combat state survives saving and loading at supported save points.

---

## Phase 6 — World, Exploration, and Content Framework

### Objectives

Build the connected world and reusable exploration systems.

### Tasks

1. Establish reusable connected-map and transition definitions.
2. Implement forests, villages, caves, ruins, dungeons, and paths as reusable environment categories.
3. Implement natural progression gates and hidden shortcuts.
4. Add clue-driven environmental puzzles and creature-specific interactions.
5. Establish data-driven NPC, dialogue, object, quest, and encounter definitions.
6. Support optional dungeons and meaningful discoveries without mandatory rare encounters.
7. Ensure the main route remains understandable.
8. Keep ordinary movement and interactions responsive and accessible.

### Acceptance Criteria

- Areas connect reliably and saved position restores correctly.
- Progression gates and shortcuts behave consistently.
- Clues clearly communicate the intended type of interaction.
- Optional content enriches exploration without blocking the main route unnecessarily.
- Protagonist cannot die outside combat.
- Exploration systems remain data-driven and reusable.

---

## Phase 7 — Creature, Class, and Codex Expansion

### Objectives

Expand content using the validated systems and asset pipeline.

### Tasks

1. Establish consistent schemas and validation for creature definitions.
2. Establish an organized pipeline for creature sprites, animation states, signature attacks, effects, and metadata.
3. Expand class-specific skill trees with meaningful choices and limited points.
4. Add creatures in curated, tested batches.
5. Give every creature exactly one distinctive signature attack.
6. Add common reliable recruitment and rare clue-driven recruitment conditions.
7. Expand codex entries with discovered information and separate recruitment status.
8. Add creature-based exploration interactions with clear clues.
9. Validate every new creature against combat, recruitment, save/load, and UI rules.

### Acceptance Criteria

- New creatures can be added primarily through content definitions and assets rather than custom system code.
- Discovery, recruitment, combat, and codex state remain consistent.
- Undiscovered creatures never appear in the codex.
- The codex updates silently on discovery.
- No creature gains alternate attacks, universal Guard, item use, or a cooldown/resource mechanic.
- Content expansion does not introduce untested exceptions into core systems.

---

## Phase 8 — Full Campaign and Content Completion

### Objectives

Build the complete compact adventure around the validated vertical slice.

### Tasks

1. Expand the connected world into the planned campaign.
2. Implement the main story route and the sorcerer's lair.
3. Add meaningful optional dungeons, secrets, shortcuts, and recruitment opportunities.
4. Develop the roster in organized batches toward the 200+ creature target.
5. Tune encounter frequency, recruitment reliability, progression, and rewards.
6. Add class and party combinations that support multiple viable play styles.
7. Validate that no mandatory progression depends on a rare creature or obscure optional discovery.
8. Keep the campaign focused on rescuing the stolen cat rather than introducing unrelated major lore.

### Acceptance Criteria

- The main story can be completed from a fresh save.
- The intended campaign length remains approximately 6–10 hours, subject to playtesting.
- Optional content rewards exploration without making completion confusing or excessively grind-heavy.
- The creature roster is varied, functional, and supported by consistent data and assets.
- All mandatory content has been tested end to end.

---

## Phase 9 — Cat Rescue, Persistence, and Recovery Hardening

### Objectives

Guarantee reliable save behavior and correct pet restoration.

### Tasks

1. Test interrupted saves, failed writes, corrupt saves, missing databases, and reloads.
2. Test repeated activation at every story stage.
3. Ensure the game never restarts completed introductory sequences.
4. Implement the final rescue state transition.
5. Persist the completed rescue state successfully before restoring the existing pet.
6. Handle recovery after interruption between save completion and visual restoration.
7. Ensure RPG cleanup cannot remove or modify finance data.
8. Validate save schema versioning and safe migrations.

### Acceptance Criteria

- Re-entry resumes the correct game state.
- Failed saves never produce a falsely completed rescue.
- The pet returns only after final rescue completion is successfully persisted.
- Reloading after a completed rescue restores the correct pet state without duplication.
- RPG reset or recovery operations cannot reset the finance application.
- Corrupt or unavailable RPG data fails safely and reports a recoverable error.

---

## Phase 10 — Visual Polish, Accessibility, and Performance

### Objectives

Bring the complete game to a consistent production quality.

### Tasks

1. Refine 16×16 top-down pixel-art presentation and animation consistency.
2. Polish movement, combat transitions, portal effects, discoveries, and significant events.
3. Verify responsive layouts from 320px mobile width through desktop.
4. Verify touch targets, keyboard controls, selection feedback, and cancellation.
5. Respect reduced-motion preferences.
6. Avoid unnecessary background loops, repeated database writes, and expensive React renders.
7. Check asset loading, memory usage, save performance, and recovery states.
8. Ensure Nomoz is entirely absent from ordinary finance use unless activated.
9. Verify the existing finance UI remains visually and functionally unchanged.

### Acceptance Criteria

- No blocking mobile overflow or unusable controls.
- Animations remain readable and do not impair interaction.
- Reduced-motion settings are respected.
- The game remains responsive on supported devices.
- Finance workflows and performance show no meaningful regression.

---

## Phase 11 — Final Verification and Release Readiness

### Objectives

Verify the complete experience and document any remaining limitations.

### Tasks

1. Run the available production build and relevant automated checks.
2. Test the hidden activation path and ordinary Ledger submission paths.
3. Test new saves, existing saves, reloads, defeat recovery, and final rescue.
4. Test all five classes and representative party combinations.
5. Test representative common and rare recruitment paths.
6. Test every mandatory area, puzzle, encounter, boss, and ending.
7. Verify the finance database schema and finance persistence remain unchanged by RPG behavior.
8. Check browser console errors, failed asset requests, and mobile rendering.
9. Confirm no development-only activation mechanism is accessible in production.
10. Report verified results, unverified areas, and known limitations.

### Acceptance Criteria

- The complete game can be started, saved, resumed, and finished.
- The stolen cat is restored only after a successfully saved final rescue.
- The exact hidden phrase never creates or modifies a finance transaction.
- Ordinary finance behavior remains intact.
- The build succeeds in an available, correctly configured environment.
- No unresolved critical or high-severity defects remain.
- Verification claims accurately reflect tests actually performed.

---

## Change Control

If implementation reveals an unavoidable conflict with the approved design:

1. Prefer the smallest change that preserves the design and finance safety.
2. Do not silently alter approved gameplay or expand scope.
3. Explain only the specific blocking conflict and its practical consequence.
4. Ask the user only if no safe, faithful implementation path exists.

Keep this roadmap updated when a phase is completed, but do not reorder phases or add new systems without a concrete technical reason or explicit user approval.

## Definition of Done

Nomoz is complete when the hidden entry path is safe, the full campaign is playable and persistent, the creature and class systems follow the approved rules, the pet is restored only after a successfully saved rescue, and the finance application remains unaffected.
