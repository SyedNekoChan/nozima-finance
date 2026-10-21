# NOMOZ — Game Design & Technical Specification

**Status:** Authoritative working specification  
**Project:** Nomoz, a hidden RPG integrated into the existing finance application  
**Implementation environment:** Claude Code Web operating directly on the existing repository

## 1. Product Vision

Nomoz is a substantial, self-contained RPG hidden inside the existing finance tool. It must feel like a real game rather than a decorative pet feature, while remaining completely isolated from the finance product's functionality, data, persistence, performance, and normal workflows.

The central story is simple: a portal opens, an evil sorcerer steals the black pixel-art cat, and the protagonist enters a fantasy world to rescue it. The cat remains missing until the rescue is completed and successfully saved.

The game combines:
- Creature collection and tactical party experimentation.
- Zelda-inspired exploration, environmental puzzles, secrets, and shortcuts.
- Accessible turn-based RPG combat.
- Meaningful class skill trees and character progression.
- Discovery-driven world and creature collection.

The experience must accommodate players unfamiliar with RPGs. Begin with intuitive mechanics and readable choices. Introduce tactical depth through exploration and experimentation, with optional mastery for players who want it. Avoid overwhelming statistics, unnecessary micromanagement, and mandatory grinding.

The game title is **Nomoz**.

## 2. Scope and Production Strategy

- Target main campaign length: approximately **6–10 hours** for a typical first playthrough, including some optional exploration.
- Target creature roster: **200+ distinct species**, produced in organized waves.
- Development strategy: build a complete, polished vertical slice before scaling content production.
- The initial creature roster must be small enough to polish thoroughly while validating the full gameplay loop.
- The data architecture and asset pipeline must support the eventual 200+ species target from the beginning.
- Do not create hundreds of sprites before the combat, recruitment, progression, save, and asset pipelines have been validated.
- Keep unvalidated numerical balance values configurable until playtesting provides evidence.
- The final protagonist level cap and experience curve will be determined after the vertical slice validates progression pacing.

### Production order

1. Repository audit and finance/RPG safety foundation.
2. Complete playable vertical slice.
3. Core systems and connected-world expansion.
4. Asset production and integration through validated pipelines.
5. Creature roster expansion in waves.
6. Final polish, regression testing, and release-readiness verification.

## 3. Non-Negotiable Finance-Application Safety

The finance application remains the host product. Existing financial workflows and behavior must remain unchanged except for the explicitly approved hidden activation interception.

### 3.1 Hidden Activation

The exact activation phrase is:

`Possibilities are possible`

The player enters this exact phrase into the **amount field of a new Ledger entry** and submits it.

Implementation requirements:

- Inspect the raw amount-input string before `parseAmount`, numeric normalization, transaction construction, or any persistence operation.
- The exact activation branch must exit the ordinary submission path before any finance transaction function can execute.
- Activation must never call `addTransaction`, `updateTransaction`, `createTransfer`, or `editTransfer`.
- Do not create, edit, or save a finance transaction, account, budget, exchange rate, setting, or other finance record to represent activation.
- The phrase must never fall through to normal amount parsing. The existing parser removes non-numeric characters, which could otherwise convert an unintended string into a real transaction amount.
- Preserve existing behavior for all non-trigger inputs.
- The trigger is supported in the new Ledger entry flow. Do not extend it to editing entries, transfers, or other fields without explicit approval.
- If RPG activation fails, finance functionality must remain available and financial data must remain unchanged.
- Do not change the exact phrase or ask the owner to select another trigger.

### 3.2 Portal and Cat-Theft Sequence

The first activation initiates the portal sequence, followed by the evil sorcerer stealing the cat.

- Use a dedicated full-screen overlay or application-level RPG host.
- Do not implement the portal sequence inside the pet-rendering layer.
- The RPG host must cover the finance header, footer, and normal content as needed, while respecting modal layering.
- Do not introduce a visible RPG tab or persistent RPG labels into normal finance navigation.
- Keep the finance application mounted beneath the overlay where practical.
- Maintain a persistent missing-cat state owned by RPG progression.
- The existing pet is NOMOZ.EXE, a black pixel-art cat rendered through the existing pet architecture.
- Use a narrow, explicit bridge or flag to hide the cat while the rescue quest is active.
- Do not use finance events to control the theft or restoration sequence.

The existing pet design prohibits arbitrary teleportation, respawning, or resetting. The cat's temporary disappearance during the theft and its eventual return are an explicit, narrowly scoped exception. Document this exception in the repository's existing design documentation when implementation reaches that phase.

Do not allow an invisible pet scheduler to continue generating stale behavior underneath the RPG overlay if suspension is required.

**The cat may return only after the final rescue has been completed and its resulting RPG save has been successfully committed.** A failed or interrupted save must never trigger restoration.

### 3.3 Independent Persistence

- Create a separate IndexedDB/Dexie database, initially named `nomoz-rpg`.
- Do not add RPG tables to the existing `nozima-finance` database.
- Do not change the finance database schema, version, or tables for RPG requirements.
- Use a separate Zustand store for RPG state.
- Persist RPG data exclusively through RPG-owned persistence modules.
- Version the RPG save schema independently.
- Save at explicit checkpoints and important state transitions rather than every render or game tick.
- Handle failed writes and interrupted saves without corrupting valid prior progress.
- If RPG storage is unavailable, fail safely without affecting the finance app.
- The finance side may import only a small, defensive RPG activation gate. It must not depend on RPG internals.
- Nothing under `src/rpg/` may import the finance store, finance database, currency parser, or finance-to-pet mood bridge.
- Never reuse the existing `anomalyEvent` channel for RPG messaging or state.

## 4. Existing Repository Context

The pre-implementation audit reported the following architecture. Verify all relevant details against the current checkout before implementation; audit line numbers may have changed.

- Vite 5, React 18, Zustand 4, Dexie 4, Framer Motion 11, and Tailwind 3.
- JavaScript/JSX rather than TypeScript.
- Vite base path: `/nozima-finance/`.
- `src/main.jsx` renders `App.jsx`.
- No router; finance navigation uses the existing finance store and tab components.
- `PunchCard.jsx` owns the Ledger entry form and submission handler.
- `parseAmount` in `src/lib/currency.js` strips non-numeric characters.
- Existing Dexie database: `nozima-finance`, with `transactions`, `accounts`, and `settings`.
- `Anomaly.jsx` is the pet-agnostic shell.
- The existing pet is NOMOZ.EXE, registered through `src/pets/registry.js`.
- `src/lib/nomoz.js` provides read-only finance-to-pet mood derivation.
- The existing portal pet prop is a small world-anchored sprite, not a full-screen overlay.
- The audit found no test runner, linter, typecheck, or package lockfile.
- `node_modules` was absent when the audit was performed, so a successful build was not verified.
- The deployment workflow reportedly publishes to GitHub Pages on pushes to `master`.

Treat these as audit findings, not substitutes for inspecting the actual code.

Do not fix unrelated existing issues merely because they are noticed during the audit.

## 5. World and Exploration

### 5.1 World Structure

The world is one connected overworld containing regions such as:

- Forests.
- Villages.
- Caves.
- Ruins.
- Dungeons.
- Connecting paths and hidden shortcuts.

The player explores freely, with natural gates controlling progression. The main route must remain understandable, while optional areas reward curiosity.

Progression gates may use creature abilities, puzzles, equipment, discoveries, and other established mechanics.

No mandatory rare encounter or rare-creature recruitment condition may block the main story.

### 5.2 Exploration and Encounters

- Encounters are visible and physically represented in the world.
- Most encounters are avoidable, and the player generally chooses when to initiate them.
- Use responsive desktop and mobile movement, including tap-to-move/pathfinding where appropriate.
- Direction changes switch immediately to the correct four-direction walking animation.
- Do not introduce a mandatory turning animation that delays movement.
- The game must remain usable on narrow mobile screens without horizontal overflow.

### 5.3 Environmental Presentation

The world uses mostly still pixel art. Animation is reserved for characters, interactables, and important magical events.

Characters have continuous, subtle idle loops. These should be restrained and should not make the world visually busy.

Audio rules:

- No routine footsteps during exploration.
- Ordinary interactions are silent.
- Mechanisms, doors, and significant discoveries may produce short, restrained sounds.
- Respect the existing master mute and sound-effects volume controls where applicable.

The game must respect `prefers-reduced-motion`. Major animated sequences need an equivalent still or reduced-motion presentation that preserves all important information.

### 5.4 Exploration Safety

The protagonist cannot die outside combat.

Do not introduce exploration damage that unexpectedly reduces HP. Environmental puzzles and hazards should communicate danger through level design, animation, interaction feedback, or other non-damaging consequences unless an authoritative approved decision explicitly changes this rule.

## 6. Visual Direction and Interface

- Top-down **16×16 pixel-art foundation**.
- Consistent sprite scale, tile alignment, silhouette readability, and restrained palette usage.
- Desktop and mobile are first-class targets.
- Avoid horizontal overflow and controls too small for touch.
- Keep the interface readable, compact, and consistent with the established visual direction.
- Use animation where it provides meaningful feedback rather than animating every environmental object.
- Preserve the distinction between the normal finance interface and the hidden RPG experience.
- Use an application-level RPG host rather than adding an RPG finance tab.
- Isolate rendering failures with an RPG error boundary.
- Maintain a functional reduced-motion alternative.

Do not add complex visual systems simply for spectacle. Prioritize readable information, consistent pixel-art presentation, and reliable interaction.

## 7. Classes and Protagonist Progression

The first launch presents exactly five class choices:

1. Swordsman
2. Hunter
3. Assassin
4. Mage
5. Necromancer

Each class has its own skill tree with meaningful, limited skill-point choices.

Skills should provide meaningful tactical or play-style differences rather than consisting exclusively of small attribute increases.

### 7.1 Skill-Point Communication

The following decisions are established:

- A subtle persistent skill-point indicator appears beside the menu button.
- The indicator remains visible until the unspent points are used.
- Skill trees are accessible **only at sanctuaries**.
- When unspent points exist, a small pixel-art skill symbol appears near the sanctuary.
- The persistent HUD indicator and sanctuary marker are separate reminders.
- The player should be able to identify the relevant sanctuary interaction without being forced through an intrusive tutorial.

### 7.2 Level and Experience Configuration

- Keep the protagonist's maximum level and experience curve configurable.
- Decide the final level cap after the vertical slice validates combat pacing and campaign content.
- Centralize formulas and tuning data.
- Avoid scattering numeric balance assumptions throughout gameplay code.

Creature progression must follow the authoritative decisions already established in the existing project materials. Do not reopen settled progression questions or invent a new leveling model. If a numerical detail is not recoverable from the authoritative materials, leave it configurable or defer it until the implementation actually requires it.

## 8. Party and Creature Rules

### 8.1 Party Composition

The party consists of:

- One protagonist.
- Three recruited creatures in the active creature party.

The player manually chooses actions for the protagonist and each of the three active creatures during combat.

### 8.2 Creature Roster

The long-term target is 200+ distinct creatures.

Each species needs data-driven support for relevant identity, sprite/animation assets, combat profile, element or affinity where applicable, unique signature attack, codex data, and recruitment behavior.

Do not build the full roster before the content schema and asset pipeline have been validated.

### 8.3 Exactly One Signature Attack

This is a strict rule for every creature:

- Each creature has exactly one unique signature attack.
- The signature attack is its basic attack and its **only combat action**.
- It is always usable on every turn.
- It has no resource cost and no cooldown.
- Creatures do not receive alternate attacks, extra skills, universal Guard, or item-use commands.
- Do not introduce additional creature combat actions as part of equipment, progression, status effects, or later content.

The three creatures should be differentiated through their signature attacks, combat profiles, elemental interactions where applicable, and established overworld interactions—not by giving them multiple combat commands.

### 8.4 Recruitment

Recruitment uses a hybrid model:

- Common creatures have reliable and accessible recruitment paths.
- Rare creatures may require clues, quests, or specific conditions.
- Rare recruitment must never be mandatory for main-story completion.

Recruitment status is separate from discovery status.

### 8.5 Overworld Interactions

Creatures may have signature-based overworld interactions that help solve puzzles or uncover secrets.

- Provide clear contextual clues.
- Make the relationship between a creature's ability and an interactable understandable.
- Do not require the player to guess arbitrary hidden rules.
- Ensure required progression does not depend on an unrecruitable or mandatory rare creature.

## 9. Creature Codex

The following decisions are binding.

### 9.1 Discovery

- A creature receives a codex entry immediately when first discovered.
- Discovery does not mean recruitment.
- Discovery is recorded silently.
- Do not show a discovery toast or a full-screen discovery announcement.

### 9.2 Status

Every known creature entry displays a clear status such as **Discovered** or **Recruited**.

- Discovered but unrecruited creatures retain their visible artwork and known information.
- Discovery knowledge and recruitment/collection status must be stored separately.

### 9.3 Undiscovered Species

- Undiscovered creatures do not appear in the codex.
- Do not reveal their silhouettes, names, locations, or an undiscovered-species count.
- Discovery should reward exploration without turning the codex into a checklist of content the player has not encountered.

The codex must scale to 200+ creatures without requiring species-specific UI code.

## 10. Combat System

### 10.1 Battle Format

Use a hybrid battle presentation:

- Dedicated battle scenes for normal encounters.
- Selected bosses may use overworld combat or custom arenas.

Combat uses individual turns with a visible turn order.

Enemy intentions communicate broad intent, not exact numerical outcomes. Do not introduce reaction timers or real-time input windows.

### 10.2 Player Commands

The player manually chooses commands for all four party members.

**Protagonist commands:**
- Basic Attack.
- Unlocked Class Skills.
- Guard.
- Item.

**Creature commands:**
- The creature's single unique signature attack, and nothing else.

Skill equipment limits and other numerical restrictions that remain undecided must be configurable or deferred rather than arbitrarily finalized.

### 10.3 Target Selection and Confirmation

The approved targeting flow is hybrid:

1. The player chooses an action.
2. A single-target action enters target selection.
3. An area attack previews all affected enemies.
4. The game clearly highlights the selected target or affected enemies.
5. The player explicitly chooses **Confirm** or **Cancel**.
6. The action executes only after confirmation.

Targeting must work on desktop and mobile and must prevent accidental action execution.

The preview must accurately reflect the targets that will be affected.

### 10.4 Enemy Information

Enemy names, HP bars, and status icons are always visible beside or above their sprites.

- Use simple, continuous HP bars.
- Show exact current/max HP in the detailed inspection view.
- Selecting an enemy outside an active targeting step opens a compact information panel.
- Inspection can show the enemy's name, current/max HP, known elemental weaknesses/resistances, and visible status effects.
- Unknown weaknesses or resistances remain undisclosed until discovered.

Avoid overcrowding the battlefield, particularly on mobile.

### 10.5 Damage and Effects

- Show individual damage numbers above each affected enemy.
- Position and time numbers to avoid obscuring names, HP bars, and status icons.
- Keep damage feedback brief and readable.
- Use a small set of intuitive effects such as burn, charge interruption, marks, and limited combos.
- Do not create a large status-effect taxonomy before the core battle loop is validated.

### 10.6 Victory, Rewards, and Level-Ups

Normal battle victories show a brief reward summary containing EXP and currency. The summary dismisses automatically and returns the player to exploration without requiring extra input.

Level-ups display:

- The new level.
- A restrained visual highlight.
- A concise summary of automatic stat increases.

The level-up presentation then continues automatically after a short moment.

Avoid unnecessary confirmation screens for routine encounters.

### 10.7 Defeat and Recovery

Defeat uses checkpoint recovery.

- Restore the party according to the established recovery rules.
- Preserve recruited creatures.
- Preserve discoveries and codex progress.
- Avoid punitive loss of collection progress or excessive backtracking.

Do not erase established progression merely because the player loses a battle.

## 11. Sanctuaries and Optional Systems

Sanctuaries are important safe hubs.

- Skill trees can only be opened at sanctuaries.
- Unspent skill points produce the small pixel-art marker near a sanctuary.
- The player should have a clear path from sanctuary interaction to skill-tree management.

Equipment and customization must follow the decisions already approved in authoritative project materials.

Previously brainstormed ideas that were not explicitly approved must remain deferred. These include:

- Additional equipment slots.
- Creature sigil, rune, or memory modifiers.
- Bond milestones that modify a creature's signature move.
- Expanded creature ecology systems in the codex.

Do not treat an idea as approved merely because it appeared in a brainstorming discussion. Build a coherent core game before expanding optional systems.

## 12. Save, Resume, and Completion

### 12.1 Initial Activation

The first activation starts the portal/theft sequence and safely initializes the RPG save.

### 12.2 Re-entry

Submitting the hidden trigger again resumes the existing save. It must not reset the story, class selection, recruitment, codex, or world progression.

### 12.3 Persistence Boundaries

Save and restore the relevant RPG-owned state, including:

- Game phase and story progress.
- Class selection.
- Protagonist progression.
- Party configuration.
- Recruited creatures.
- Codex discoveries.
- World progression and relevant puzzle state.
- Checkpoint and recovery state.
- Missing-cat/restoration state.

The exact state schema may evolve, but migrations must remain within RPG-owned persistence.

### 12.4 Final Rescue

The final rescue is not complete for restoration purposes until the completion state has been successfully persisted.

- A failed save must not restore the cat.
- Duplicate completion events must not duplicate rewards or trigger inconsistent restoration.
- Restoration must be idempotent.
- Do not use finance events as a proxy for game completion.

### 12.5 Safe Exit

The RPG must provide a safe route back to the finance application.

- Do not silently discard unsaved progress.
- Do not change the finance tab or reset finance form state unnecessarily.
- Preserve the finance tree beneath the RPG overlay where practical.

## 13. Technical Architecture

The following is the recommended starting structure. Adjust to verified repository conventions when needed, but preserve the dependency boundaries.

```text
src/rpg/
  gate.js
  state/
    store.js
    persist.js
  host/
    RpgHost.jsx
  sequence/
    Theft.jsx
  game/
    engine.js
    world.js
    Screen.jsx
  data/
    classes/
    creatures/
    maps/
    encounters/
  restore.js
```

### 13.1 Separation of Responsibilities

- **Activation gate:** Recognizes the raw trigger and returns a clear result. It must not parse amounts or write finance data.
- **RPG state store:** Owns game state and coordinates explicit persistence.
- **RPG persistence:** Owns the separate Dexie database, save schema, migrations, and safe writes.
- **RPG host:** Owns the full-screen layer, error boundary, and lifecycle.
- **Story sequence:** Owns the portal and theft presentation.
- **Game engine:** Owns testable rules and state transitions independently of React rendering.
- **World/content data:** Defines maps, creatures, classes, skills, encounters, and related data.
- **Renderer/input:** Displays the world and processes desktop/mobile interaction.
- **Restoration bridge:** Applies the narrow cat-visibility exception only after successful rescue persistence.

### 13.2 Dependency Rules

- RPG modules must not import the finance store, finance database, currency parser, or finance-to-pet mood bridge.
- The finance submission handler may import only the small activation gate.
- Keep finance and RPG state in separate stores and databases.
- Do not introduce an RPG tab.
- Do not reuse `anomalyEvent` for RPG messaging.
- Use an RPG-specific error boundary.
- Keep content data separate from rules and rendering.
- Make creature, class, map, skill, item, and encounter data extensible.
- Keep the game compatible with the current JavaScript/JSX stack unless a separate migration is explicitly approved.
- Avoid new dependencies unless a clear need is demonstrated and authorized.

### 13.3 Performance

- Do not run expensive game systems while the RPG is inactive.
- Avoid frame-by-frame persistence.
- Avoid repeated full-roster processing when only one creature or region is needed.
- Load and render only the assets required for the current experience where practical.
- Ensure that RPG failures cannot bring down the finance application.

## 14. Verification and Quality Gates

Before implementation:

- Read repository instructions and the current `design.md`.
- Inspect the current Ledger submission path and amount-input handling.
- Verify database ownership and the existing pet lifecycle.
- Check current scripts, dependencies, lockfiles, and test availability.
- Establish the actual baseline. Do not claim a build passes if it was not run.

### Required Safety Tests

1. The exact trigger opens or resumes Nomoz without creating or editing a finance transaction.
2. Finance transaction contents remain unchanged across activation.
3. Valid ordinary Ledger amounts retain existing behavior.
4. Invalid, empty, zero, and non-trigger inputs retain existing behavior.
5. The activation branch exits before amount parsing and all finance transaction writes.
6. The `nozima-finance` database schema, name, version, and tables remain unchanged.
7. RPG state is stored only in the separate `nomoz-rpg` database.
8. No RPG module imports prohibited finance modules.
9. RPG database, persistence, and rendering failures do not break the finance UI.
10. Closing the RPG preserves the finance tab and relevant form state.
11. The game is not exposed during normal finance workflows.
12. Desktop and narrow mobile layouts have no horizontal overflow.
13. Reduced-motion mode remains fully functional.
14. Re-entry resumes the saved game.
15. Cat restoration occurs only after successful final rescue persistence.
16. Defeat preserves recruited creatures and discoveries.
17. An RPG rendering failure does not crash the finance application.

A successful Vite build alone is not sufficient evidence of isolation. Report build and test results only when actually observed.

## 15. Authoritative Working Rules

- The game is named **Nomoz**.
- Approved decisions in this document are settled.
- Do not ask again about decisions already settled in this document or other authoritative repository documentation.
- Do not invent approval for unapproved brainstorms.
- Keep non-blocking unresolved details configurable or deferred.
- Ask the owner only when an unresolved issue genuinely blocks safe implementation.
- Work in small, reviewable phases with explicit acceptance criteria.
- Never perform Git operations. The owner handles commits manually.
- Do not commit, stage, push, or deploy.
- Do not silently install packages or alter dependency manifests.
- Preserve the finance application's existing functionality, persistence, and visual identity.
