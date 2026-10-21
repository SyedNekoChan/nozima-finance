# Nomoz — Claude Project Instructions

## 1. Source of Truth

Before making changes, read:
- `docs/nomoz/GAME_DESIGN.md`
- `docs/nomoz/DEVELOPMENT_ROADMAP.md`

`GAME_DESIGN.md` defines approved game behavior and constraints. `DEVELOPMENT_ROADMAP.md` defines implementation order and acceptance criteria. This file defines how to work.

Treat approved decisions as settled. Do not repeat answered questions, reopen decisions, or request confirmation for details already documented. Resolve non-blocking uncertainties through conservative, configurable defaults. Ask only when an ambiguity genuinely blocks safe implementation.

## 2. Finance Application Protection

The existing finance application is the primary product. Nomoz must never impair its functionality, appearance, workflows, performance, data, or persistence.

- Keep RPG implementation isolated under `src/rpg/`.
- Use a separate RPG persistence database, independent of the finance database and schema.
- Never write, edit, delete, or reinterpret finance transactions as an RPG side effect.
- The activation phrase must be intercepted from the raw new-Ledger-entry amount string before amount parsing or any finance save path.
- Activation must cancel the pending finance submission without creating or modifying a transaction.
- Non-trigger input must retain its existing behavior.
- Keep the finance-to-pet bridge minimal and explicit. Do not couple RPG systems directly to finance stores or persistence.
- RPG failures, unavailable storage, corrupt saves, and failed saves must fail safely without disrupting finance functionality.
- Do not reset, teleport, or alter the existing pet except where the documented cat-theft and successful-rescue lifecycle explicitly requires it.
- Never add RPG state to finance settings, transactions, accounts, budgets, or exchange rates.

## 3. Repository and Architecture

Respect the existing repository and its actual conventions. The application currently uses React, JavaScript/JSX, Vite, Zustand, Dexie, Framer Motion, and Tailwind. Do not introduce TypeScript or a new framework solely for Nomoz.

- Keep RPG modules cohesive, small, and independently testable.
- Separate game state, persistence, rules, content definitions, rendering, input, encounters, combat, and progression.
- Use data-driven definitions for classes, skills, creatures, enemies, items, maps, dialogue, and encounters wherever appropriate.
- Design content schemas and asset-loading conventions to support a roster exceeding 200 creatures without requiring architectural rewrites.
- Build content in validated batches; do not create hundreds of low-quality placeholders to meet a count.
- Keep RPG imports away from finance internals. RPG modules must not import the finance store, finance database, currency utilities, or the existing pet's finance-mood implementation.
- Finance code may depend only on a small, explicit RPG activation gate. Do not make finance components aware of RPG internals.
- Preserve the existing Vite base path and deployment assumptions.
- Avoid unnecessary dependencies, global CSS changes, global event handlers, and application-wide refactors.
- Keep accessibility, touch input, keyboard input, small screens, and reduced-motion preferences in scope.

## 4. Implementation Discipline

Follow the roadmap in order. Implement only the current phase and its dependencies.

For each phase:
1. Inspect the relevant existing code before editing.
2. Identify the smallest safe implementation.
3. Implement the complete phase scope, not unrelated future features.
4. Run available relevant checks and the production build when the environment permits.
5. Verify finance isolation and the phase's acceptance criteria.
6. Report the files changed, checks run, results, and any genuine blockers.

Do not silently skip failed checks. If a check cannot run because a dependency, browser, environment, or service is unavailable, state that limitation accurately.

Do not install packages or modify dependency manifests unless the task explicitly authorizes it. Prefer existing libraries and browser capabilities.

Never run Git commands that commit, stage, push, switch branches, or otherwise manage repository history. Do not create commits. The user manages Git manually.

## 5. Activation and Save Safety

The only hidden activation phrase is the exact case-sensitive string:

`Possibilities are possible`

It is entered into the amount field of a new Ledger entry and submitted. Match the raw input exactly. Do not trigger on partial matches, altered capitalization, surrounding whitespace, edit-entry forms, or other fields.

- Intercept before numeric parsing and before any transaction persistence.
- Do not let the phrase or any part of it reach finance transaction creation or update functions.
- Prevent duplicate activation from rapid clicks, duplicate events, or React StrictMode behavior.
- First activation starts the documented portal and cat-theft sequence.
- Later activations resume the existing RPG save.
- Persist RPG state only to the separate RPG database.
- Handle save versions, missing data, and failures explicitly.
- Never declare the cat rescued or restore the pet until the final rescue state has been successfully persisted.
- A failed RPG save must not create a false completion state or affect finance data.

If the RPG database is unavailable or initialization fails, abort RPG activation safely and leave finance functionality intact.

## 6. Game Design Compliance

Use `GAME_DESIGN.md` as the authoritative specification. In particular:

- Keep the story focused on rescuing the stolen cat from the evil sorcerer.
- Preserve the five starting class choices and class-specific skill trees.
- The active party consists of the protagonist and three recruited creatures.
- Each creature has exactly one unique signature attack. It is its only combat action, always available, with no resource cost or cooldown.
- Do not add creature guard commands, creature items, alternate creature attacks, or creature skill trees.
- Let players manually select actions for all four party members.
- Keep combat readable, turn-based, and free of reaction timers.
- Preserve visible, generally avoidable overworld encounters and clear exploration clues.
- Keep defeat forgiving and preserve recruited creatures and discoveries.
- Do not show undiscovered creatures in the codex.
- Creature discovery updates the codex silently; recruitment status is separate.
- Keep routine victory rewards and level-up summaries brief and automatic as specified.
- Use configurable values for unresolved numerical balance decisions until playtesting provides evidence.
- Do not introduce ideas documented as unapproved unless the user explicitly approves them.

Do not invent additional lore, mandatory rare encounters, grind requirements, or complex systems that conflict with the compact, accessible adventure.

## 7. Visual and Interaction Quality

Follow the documented top-down 16×16 pixel-art direction and responsive desktop/mobile requirements.

- Keep the environment mostly static while characters and meaningful interactables animate.
- Give characters subtle idle animation.
- Directional movement must respond immediately and select the correct walking animation.
- Keep routine footsteps and ordinary interactions silent; reserve sound for mechanisms, doors, and significant discoveries.
- Preserve clear selection, confirmation, cancellation, target highlighting, enemy information, and touch-friendly controls.
- Respect reduced-motion preferences.
- Avoid clutter, tiny unreadable text, accidental mobile overflow, and unnecessary visual effects.
- Do not compromise the existing finance UI to accommodate the game.

## 8. Testing and Acceptance

Test both success and failure paths, especially where RPG behavior touches finance input.

At minimum, verify as relevant to the current phase:
- Exact activation starts the RPG without saving a finance transaction.
- Near-matches and ordinary numeric amounts behave normally.
- Repeated activation cannot create duplicate sequences or saves.
- Finance accounts, transactions, settings, and database schema remain untouched by RPG persistence.
- RPG state survives reloads and resumes correctly.
- Failed or unavailable RPG storage does not break the finance application.
- The pet is restored only after a successfully saved final rescue.
- Desktop and narrow mobile layouts remain usable.
- The production build succeeds when the required environment is available.

Do not claim a behavior is tested unless it was actually tested. Distinguish automated verification from manual inspection.

## 9. Communication and Output

Be concise and implementation-focused. Do not provide lengthy explanations or repeatedly ask for permission to implement already-approved requirements.

When reporting completed code changes:
- Put the exact repository file path immediately above each code block.
- Output complete contents for every changed file, not partial snippets or diffs, when the user requests code output.
- Do not add unrelated narrative before or after a requested file-only output.
- Do not claim to have modified, tested, or saved anything unless the action actually succeeded.

Do not commit, stage, push, or manage Git. Do not reintroduce removed functionality from unrelated parts of the application.

## 10. Completion Standard

A phase is complete only when its scope is implemented, its acceptance criteria have been checked as far as the environment permits, finance safety has been preserved, and any remaining limitations are reported.

Prefer a small, reliable, playable foundation over a broad but fragile implementation. Keep the architecture extensible, but implement only what the current roadmap phase requires.
