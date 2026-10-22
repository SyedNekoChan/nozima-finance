# NOMOZ --- Game Design & Technical Specification

**Status:** Authoritative working specification\
**Campaign target:** 6--10 hours for a typical first playthrough\
**Roster target:** 200+ distinct creatures, produced in validated waves\
**Development strategy:** Safety/architecture foundation → complete
vertical slice → expand systems and content\
**Title:** Nomoz

## 1. Product vision

Nomoz is a hidden, self-contained top-down pixel-art RPG embedded inside
an existing React/TypeScript/Vite finance tool. It must feel like a real
game---not a decorative pet feature---while remaining completely
subordinate to the finance product's reliability and usability.

The core fantasy is simple: an evil sorcerer steals the finance tool's
black cat through a portal. The player chooses a class, follows the
sorcerer's trail through a connected fantasy world, recruits unusual
creatures, explores dungeons, learns tactical combinations, defeats the
sorcerer, and rescues the cat.

The experience combines: - The accessible creature-collection and
tactical party experimentation of a creature RPG. - Zelda-like
environmental exploration, puzzles, secrets, and meaningful world
interactions. - Straightforward, approachable progression and combat. -
A minimalist, atmospheric presentation with a beautiful world and an
eerie undertone.

Keep the main story focused. Avoid prophecy-heavy lore, excessive
dialogue, side-quest systems, grinding, sprawling stat management, and
mechanics that require reflexes or opaque rules.

## 2. Non-negotiable finance-tool protection

The finance tool is a complete, existing product. RPG work must not
impair, degrade, interfere with, or unnecessarily alter its
functionality, UI, workflows, performance, financial data, or
persistence.

### Isolation requirements

-   RPG code and state are isolated from finance code and state.
-   RPG progression lives in a dedicated IndexedDB database. Use
    localStorage only for small RPG preferences and active-session
    coordination.
-   Never read, write, migrate, clear, or repurpose finance storage for
    RPG data.
-   Keep the existing Vite base path and GitHub Pages deployment
    assumptions intact; verify them in the repository rather than
    guessing.
-   Do not make unrelated finance-tool changes.
-   Any RPG failure must be contained within the RPG. A critical RPG
    failure stops the game, preserves the last-known-good save, and
    returns to the finance Dashboard without damaging finance
    functionality.
-   The RPG must remain lightweight. Load essential assets at startup,
    defer other content until needed, cache assets, and preload nearby
    encounter/transition assets without redundant decoding or
    downloading.
-   The game is desktop- and mobile-compatible. Keep interaction rules
    consistent while optimizing layouts independently for each form
    factor.

### Hidden activation

The exact phrase `Possibilities are possible` typed into the amount
field of a new Ledger entry and submitted activates the game. The field
remains visually unobtrusive and amount-like while accepting letters.
Matching is case-insensitive and trims leading/trailing whitespace;
otherwise the field must contain the phrase exactly.

-   A matching phrase must never create, modify, or save a ledger
    transaction.
-   Invalid ordinary amount submissions retain normal validation, keep
    the Ledger form open, show the usual invalid-amount feedback, and do
    not create a transaction.
-   On first activation, close the Ledger form and discard its unsaved
    input, then play the one-time theft sequence over the current
    finance tab.
-   The current finance tab remains visible and interactive during the
    sequence. If the user switches tabs or starts another task, the
    sequence still finishes and automatically enters the RPG.
-   Persist the cat's disappearance and portal state before playing the
    sequence. Refreshing/closing mid-sequence must not replay the theft.
    On return, the finance tool shows the persistent portal, and
    entering the phrase resumes the RPG.
-   The theft sequence is brief and unskippable, and plays only once.
    The sorcerer and portal must match the existing finance-tool cat art
    style, not the RPG's separate art style.
-   The portal appears where the cat was, the sorcerer briefly faces the
    player in silence, takes the cat through the portal, and disappears.
    The cat must disappear completely from every finance pet appearance,
    movement, and behavior until the rescue is completed and saved.
-   The portal settles at a fixed central backdrop position across
    finance tabs, with subtle glow/distortion/animation. It is
    atmospheric and noninteractive.
-   First activation launches the RPG after the theft sequence. First
    RPG entry presents class selection before the world. Re-entry
    resumes the persisted adventure.
-   The cat returns to the finance tool only after the final rescue
    completion has been successfully persisted.

### Session and storage safety

-   Only one browser tab sharing the same storage may actively run the
    RPG. A second tab remains usable as finance, is quietly blocked from
    RPG entry, and receives a small notice with an option to switch to
    the active tab if supported. Never interrupt the active game.
-   Separate browser profiles/independent storage areas represent
    independent adventures; do not coordinate across them.
-   Request persistent browser storage where supported, but do not imply
    it is guaranteed against deliberate browser-data clearing.
-   Verify storage reliability before starting/resuming. Retry transient
    issues silently. Do not run unreliable unsaved gameplay.
-   On low storage, clear regenerable caches and old diagnostics first.
    Never sacrifice progression or the last-known-good save. Stop safely
    if reliable saving remains impossible.
-   Maintain one automatic save and a protected last-known-good
    fallback. Saves should be silent; no visible save indicator.
-   Important events count as complete only after persistence succeeds.
    Final rescue is atomic: write and verify completion before restoring
    the cat in the finance tool.
-   On corruption, restore the last-known-good save. If none is valid,
    recover to a safe opening checkpoint, keep the cat missing, and
    create a valid save. Notify the player only if progress was lost;
    backup restoration is silent.
-   Future save-format changes require automatic migrations, validation,
    and preservation of the previous valid save. Content
    removals/redesigns require stable-ID migration or safe legacy state.

## 3. Story and opening

The protagonist is unnamed and almost silent. Personality comes through
movement, animation, reactions, and actions, not spoken dialogue. The
story is communicated mainly through environment, atmosphere, brief NPC
lines, and a few concise journal thoughts.

### First activation sequence

1.  Persist cat-missing and portal state.
2.  Close the Ledger entry form and discard unsaved input.
3.  Show the brief theft sequence over the current finance tab.
4.  Launch Nomoz and show the five-class selection gallery.
5.  After selection, place the protagonist just beyond the portal. No
    additional opening cutscene.
6.  The protagonist briefly sees the sorcerer in the distance, then sees
    him disappear beyond terrain.
7.  The opening path leads naturally along the trail to a peaceful small
    village and the first sanctuary.

### Opening encounter

-   A common creature from a curated small set is encountered before the
    village and blocks the main path.
-   It does not force a battle merely because the protagonist
    approaches. Interact to challenge it.
-   Use normal common-encounter difficulty, not a specially eased
    tutorial battle.
-   The creature species is selected randomly only when a new adventure
    begins; persist the selection across refreshes/recovery.
-   First victory guarantees recruitment eligibility and the ordinary
    Recruit/Leave prompt. No capture RNG or extra condition.
-   Accepting immediately adds the creature to the active party. If
    declined, it remains recruitable later after another victory.
-   If defeated, restore the protagonist/party and place them near the
    blocking creature for a retry without replaying the opening.
-   No tutorial pop-ups, long exposition, or forced practice encounter.

## 4. World, exploration, and story structure

### World structure

-   One connected overworld with forests, villages, caves, ruins,
    dungeons, paths, shortcuts, and hidden routes.
-   Target a compact 6--10-hour main adventure, plus meaningful optional
    exploration.
-   Main route is understandable and naturally gated. Exploration is
    mostly free; discoveries, equipment, puzzles, and creature field
    abilities reveal optional areas and shortcuts.
-   Never gate mandatory progression behind rare random encounters or
    rare creatures.
-   No side-quest system and no optional NPC conversations. Mandatory
    NPC dialogue is brief and only used when it provides essential
    guidance.
-   Major encounters may be approached in different orders where the
    world design supports it.
-   No postgame areas or systems. After the ending, the world remains
    playable and all world content stays accessible. The ending returns
    the cat to the finance tool once completion is safely saved.
-   Bosses are one-time encounters with no rematches. Ordinary enemies
    respawn only after sanctuary rest.
-   The protagonist cannot die outside combat. There is no exploration
    damage that can cause death. The protagonist cannot die from puzzles
    or environmental hazards.
-   No permanent softlocks. Every area can be exited; one-way routes are
    clearly communicated; optional content is not permanently lost
    because of mistakes.
-   Fast travel is available between discovered safe locations, but only
    when physically standing at a safe location.

### Movement and interaction

-   Tap/click-to-move on desktop and mobile. The game pathfinds around
    obstacles; the player can redirect at any time. An unreachable
    destination produces a clear stop/feedback rather than trapping the
    character.
-   Four-direction sprites only: up, down, left, right; no diagonal
    sprite sets.
-   Switch direction immediately while walking; no turning-pose delay.
-   Character idle animations use subtle continuous loops, even though
    scenery is mostly static.
-   Environmental interaction has no permanent floating prompt. Nearby
    interactables subtly animate or brighten. A prompt appears only
    after the player attempts interaction.
-   An interaction attempt targets the nearest valid object/NPC in the
    protagonist's facing direction. A subtle highlight confirms the
    target before the action.
-   Secret entrances are suggested through environmental clues: cracked
    walls, odd shadows, misplaced objects, suspicious terrain, or
    architectural inconsistency. No pixel-perfect searching; do not
    assume a creature ability is the default secret detector.
-   No routine footsteps. Sound is reserved for special actions,
    creatures, and meaningful environmental interactions.

### Puzzles and field abilities

-   Puzzles mainly involve moving objects, activating mechanisms,
    recognizing visual patterns, opening passages, and interacting with
    the environment.
-   Main-route puzzles are fair, simple, and solvable from nearby clues.
    Optional puzzles can be more complex, but should not require
    memorizing distant clues across multiple regions.
-   Selected creature elements/abilities have field utility. Any
    recruited creature can be used for field interactions regardless of
    active party; no party swap or manual summoning is required.
-   If exactly one recruited creature fits an interaction, activate it
    directly. If multiple fit, show a small selection.
-   Guidance is layered: environmental clue first; when approaching an
    obstacle, offer a subtle hint about the ability type, not the exact
    creature/solution. Remember discovered interactions where
    appropriate.
-   Selected signature attacks support world interactions. All field-use
    rules are clear from visual context; rare creatures are never
    mandatory for essential progression.

### Journal and map

-   The journal records each main objective and a concise
    observation/thought about the next step. Hints are subtle, not a
    quest checklist or explicit waypoint system.
-   World map is a stylized illustrated pixel map of explored geography.
    It is continuous, fixed orientation/zoom, fogged over unexplored
    territory, and supports pan/drag/swipe plus unobtrusive recenter.
-   Map reveals explored paths and landmarks, but not objectives or
    secrets. No region names, scale, or distance indicator. Player
    marker appears only in explored space and has no facing direction.
-   Discovered safe locations use consistent iconography. Thin lines
    show direct fast-travel links between discovered safe locations,
    distinct from ordinary paths.
-   Map opens during exploration, pauses the world, and is disabled
    during combat, dialogue, discovery reveals, and focused
    interactions.
-   Selecting a reachable safe-location icon starts a compact
    confirm/cancel fast-travel flow. Fast travel restores HP/MP and
    revives knocked-out allies.

## 5. Sanctuaries, recovery, and menus

-   All safe locations share an ancient-stone-shrine motif with a softly
    glowing magical core, adapted to the local region.
-   Ordinary safe locations are simpler. Sanctuaries are more elaborate
    with carved details and a distinctive core.
-   The first sanctuary is naturally placed along the main route shortly
    after the opening and before the first major boss; no tutorial
    announcement.
-   All safe locations fully restore HP/MP and revive knocked-out party
    members on arrival, whether reached on foot or via fast travel.
-   Only sanctuaries permit class switching, skill-tree spending/respec,
    active skill loadouts, party composition, formation, and equipment
    changes. Other safe locations provide recovery and fast travel only.
-   Interacting with a sanctuary opens a unified screen: vertical
    service list with pixel icons; selecting a service replaces the list
    with its management view. Back returns to the service list; Back
    there closes the sanctuary. Confirmed changes apply immediately; no
    save button or exit confirmation.
-   When unspent skill points exist, a small persistent indicator
    appears beside the exploration menu button until all points are
    spent. Skill trees can only be opened at sanctuaries. A tiny
    pixel-art skill marker appears near a sanctuary while points are
    unspent.
-   Pause menu contains only Resume, Audio Settings, Return to Title.
    Map, Journal, Creature Codex, and Equipment Collection are accessed
    through in-world interactions, not the pause menu.
-   Return to Title exits to the finance Dashboard, preserving the save
    and missing-cat state until the rescue is completed and saved.
-   Closing or refreshing returns to the finance tool; entering again
    resumes the latest persisted save/checkpoint.

## 6. Protagonist classes and progression

### Starting classes

The player chooses one class on the first RPG launch: 1. Swordsman 2.
Hunter 3. Assassin 4. Mage 5. Necromancer

Show all five class sprites in a selection gallery. Highlight the
selected class and show a concise description, combat identity, and
starting skill before confirmation. Each class has a distinct
silhouette/outfit/details but shared proportions, scale, and animation
conventions. Equipment does not change the protagonist sprite.

### Stats and levels

-   Core stats: HP, Attack, Defense, Speed. Protagonist MP is tracked
    separately.
-   No Magic/Dexterity stats and no manual attribute allocation.
-   Protagonist stats grow automatically with shared character level,
    regardless of class.
-   Class switching does not reset level or require separate class
    grinding.
-   Keep level cap, XP curve, and milestone schedule configurable until
    the vertical slice validates pacing. Final cap is decided after
    campaign length and combat pacing are tested.
-   Skill points are awarded only at selected level milestones, not
    every level. The exact milestone schedule is configurable and should
    make choices meaningful.
-   Shared skill-point pool can be spent in any class tree. Unspent
    points persist across class switches; each class retains its
    unlocked nodes and spent-point history.
-   Skill-tree respec is available at sanctuaries for predictable,
    modest RPG-currency cost that scales with points invested.
    Experimental builds remain affordable; deep respecs cost more
    without requiring grind.
-   Each class has three themed branches. Branches offer meaningful
    active abilities, with passives secondary. No attribute nodes.
-   Light prerequisites: most ordinary nodes require one nearby node;
    some are directly unlockable. Capstones require a branch investment
    threshold, not every preceding node.
-   Node costs: basic 1 point, advanced 2, capstone 3.
-   Each class starts with one thematic active skill, plus Basic Attack,
    Guard, and Item commands.
-   Only three active class/equipment abilities can be equipped. Each
    class has its own saved active-skill loadout; switching class
    restores that class's loadout.
-   Class skills generally cost MP. Necromancer is the exception, with
    HP-only, MP-only, and combined HP+MP costs.
-   Necromancer HP costs are fixed values independent of max HP and can
    never knock out the protagonist. Combined-cost skills are
    unavailable unless the full cost is affordable; no partial spending.
-   Necromancer branches: Sacrifice (aggressive HP-cost offense),
    Siphoning (conditional life drain), Curses
    (Mark/status/weaken/disrupt).
-   Necromancer life-drain effects are deterministic and may trigger
    together if multiple stated conditions are satisfied, with authored
    balance values and HP capped at max.
-   Selected Necromancer skills summon temporary undead allies. Each
    summon skill unlocks one specific summon and occupies one active
    slot. The Necromancer may equip any mix of summon skills, but only
    one summon can be active at a time.
-   Summons have distinct silhouettes, fixed roles, deterministic
    target-priority lists and tie-breakers, and a fixed duration
    measured in their own turns. They act immediately after the
    Necromancer in the order, with order preview visible. They appear
    immediately but do not act until the next round; duration starts on
    their first actual turn.
-   A successful new summon replaces the previous summon immediately. If
    the new summon cannot legally be placed, the skill is unavailable
    and consumes neither turn nor resources; the existing summon
    remains.
-   Summons occupy authored front/back rows, can be targeted by normal
    enemy targeting and area attacks, can receive/reapply status
    normally, and disappear at combat end, expiry, defeat, or
    replacement. They never become permanent party members or join the
    collection.
-   Summons scale at authored protagonist-level milestones; no summon
    XP, levels, mastery, upkeep, manual dismissal, or per-battle
    cooldown. Summoning cost is paid once. Summon HP and enemy
    vulnerability constrain use.
-   Summons have a compact HP bar, remaining-turn indicator, and subtle
    consistent summon marker/aura. Defeat uses a brief dissolve into
    particles/shadow fragments. Shared VFX/audio language with
    restrained type-specific variations.
-   No normal consumable healing for Necromancer. Specific authored
    Necromancer skills may restore HP conditionally.
-   Final protagonist level cap and exact numerical curves are deferred
    until vertical-slice validation, not left as unstructured guesses.

## 7. Creature roster and collection

### Roster

-   Target 200+ distinct creatures, built in organized waves.
-   Establish complete data/asset/validation pipelines and a small
    polished roster first. Validate the full gameplay loop before
    expanding in batches.
-   Architecture must support 200+ species from the beginning; do not
    require 200 finished sprites before proving the game works.
-   Creature designs range from cute to brutal, exotic, eerie, and
    strange. Distinct silhouette, body proportions, face, limbs, and
    movement must carry recognition at small sizes; color/texture are
    secondary.
-   No evolution system. Every species remains distinct; depth comes
    from collection, party composition, signature attacks, elemental
    matchups, and discoveries.
-   Creatures do not level independently; each has a fixed authored
    strength profile. Their combat strength is not tied to the
    protagonist's level.
-   Collection is unlimited with one copy per species. No duplicates.
-   First discovery unlocks a codex entry immediately, separately from
    recruitment. Discovery is silent---no toast, preview, pause, or
    announcement.
-   Codex entries show a small status label: Discovered or Recruited.
    Artwork and known information remain visible in either state.
-   Codex contains only discovered species. Do not reveal undiscovered
    species names, silhouettes, locations, or total completion count
    unless explicitly approved later.
-   Codex entry contains prominent sprite, name, element, signature
    attack, recruitment status, and only discovered elemental
    weaknesses/resistances. Avoid unapproved habitat data, hidden
    formulas, detailed recruitment conditions, and extra stat panels.

### Party and signature attacks

-   Party = protagonist + three recruited creatures.
-   Every creature has exactly one unique signature attack. It is the
    creature's basic attack and its ONLY combat action, always available
    every turn, with no resource cost or cooldown.
-   Creatures have no alternate attacks/skills, Guard, items, or
    universal extra combat actions.
-   Player manually chooses the action of all four party members every
    turn. No automatic creature turns except temporary Necromancer
    summons.
-   When recruited, creatures fill empty creature slots; if the active
    party is full, a new recruit joins collection only. Never
    auto-replace a party member.
-   Party composition and formation changes are sanctuary-only.
-   First recruited creature immediately joins active party.
-   All creature signature attacks match the creature's elemental
    affinity.
-   Signature attacks can have authored utility effects, such as status
    or interrupt, but exploiting elemental weakness alone does not grant
    an extra turn or automatic interrupt.

### Recruitment

-   Common creature recruitment follows a victory against that species.
    Return to overworld; creature approaches peacefully; compact prompt:
    Recruit / Leave it.
-   Accepting permanently adds the creature to collection/codex;
    declining does not permanently lock it out. No duplicates.
-   Rare creatures require authored environmental discovery or special,
    clearly hinted battle conditions; no random capture chance, opaque
    requirements, side quests, or mandatory rare recruitment.
-   Repeat encounters of already recruited species remain normal and
    avoidable; they award protagonist EXP/currency but cannot create
    duplicates.
-   Recruitment presentation briefly explains the signature attack; its
    value is learned through play, not an automatic
    demonstration/tutorial.
-   Every recruited creature can be used for field interactions
    regardless of active party.

## 8. Elements, combat, and encounters

### Elements

Exactly ten elements: Fire, Water, Earth, Wind, Lightning, Ice, Nature,
Metal, Light, Shadow.

-   Each element has a compact, readable matchup chart.
-   Each has a limited set of strengths/weaknesses; most pairings are
    neutral. Do not make every pairing unique.
-   Element matchup always affects damage. Weakness/resistance feedback
    appears the first time an attack hits a relevant matchup; codex
    records only discovered information.
-   No random damage variation or critical hits.
-   Weakness alone does not create extra turns, interrupts, or status
    effects. Those happen only when an attack explicitly defines them.
-   Status application is deterministic when conditions are met and the
    target is susceptible. Explicit immunities, no percentage rolls.
-   Status reapplication refreshes duration; no intensity stacking.

### Core combat loop

-   Most normal battles transition to a dedicated battle scene. Selected
    bosses/special fights may occur in overworld/custom arenas.
-   Standard encounter transition is a direct cut with only a short
    fade.
-   Individual turns; visible turn order and next actor. Speed-based
    order with previews. No reaction timers or reflex requirements.
-   Normal encounters contain 1--3 enemies; larger groups are reserved
    for special encounters.
-   Battle formation has front/back rows, no tactical grid. Default
    formation is role-based; player can customize at sanctuary but not
    during combat.
-   Melee generally targets front row; ranged/magic/designated area
    attacks can reach back row. Each enemy attack has a consistent,
    clearly communicated targeting pattern.
-   Enemies show broad intent icons above them, not necessarily the
    exact move or target. Enemy names, clean continuous HP bars, and
    status icons remain visible above/beside each enemy. Detailed
    inspection on selection shows current/max HP, known elemental
    matchups, and status details.
-   Damage/healing numbers are small and brief, with restrained hit
    effects. Do not obscure telegraphs. For area attacks, show a
    separate damage number per affected target, positioned to avoid
    overlapping enemy labels and bars.
-   Player selects a command, then target selection begins for
    single-target actions. Area attacks preview/highlight all affected
    enemies before confirmation. Require explicit Confirm/Cancel after
    target selection; do not execute on accidental tap.
-   Combat HUD desktop: turn order across top, enemies centered, compact
    party cards along lower edge, active character's expanded status and
    commands grouped at bottom.
-   Mobile has a dedicated touch-friendly stacked layout, not a squeezed
    desktop layout. Both platforms expose the same information and
    rules.
-   Commands for protagonist: Basic Attack, unlocked Class Skills,
    Guard, Item. Hybrid icon-and-label menu. Skill preview shows cost
    and concise effect before confirmation.
-   Every party member receives a turn; player manually chooses all four
    actions.
-   Normal victory: short defeat animation, compact EXP/currency
    summary, then automatic return to exploration. No extra
    confirmation.
-   Level-up: brief highlight showing new level, restrained visual
    effect, concise automatic stat-increase summary; automatically
    continue after a short moment.
-   No forced victory pose for every ordinary battle; routine encounter
    pacing stays fast.
-   Enemy targeting and action telegraphs must be clear and consistent.
-   Reliable retreat from normal encounters.
-   Protagonist knockout means immediate defeat. Other combatants can be
    knocked out and revived.
-   Defeat recovery returns to a checkpoint, restores the party, and
    preserves collected creatures/completed discoveries. Currency is
    never lost. Do not replay long opening content; the player can
    retry.
-   Defeat is forgiving and intended to teach through observation, not
    punish with lost collection/progression.

### Status effects and damage

-   Status set remains small and intuitive: Burn, interrupt charge, Mark
    (target takes extra damage for a fixed duration), and a few
    carefully authored cross-creature combos.
-   Fixed durations; reapplication refreshes. Clear visual indicators.
-   Burn deals fixed end-of-turn damage.
-   Same damage formula for all attacks: attacker Attack vs target
    Defense; skill/signature move power and effects are authored;
    elemental modifiers adjust final damage.
-   No separate magic damage formula, critical hits, or random damage
    variation.
-   Predictable combat; damage numbers and effects provide clear
    feedback.
-   Guard reduces incoming damage and restores protagonist MP.
-   Consumables have reliable, fixed HP/MP restoration, revive KO, or
    remove status. No rarity tiers or complex secondary effects. Using
    an item consumes the protagonist's turn.
-   Revival consumables restore 50% of the revived ally's maximum HP.
-   Healing/MP attrition is light with generous recovery. Protagonist MP
    is generous.
-   One intended difficulty with gentle assistance; no
    difficulty-selection menu or opaque difficulty spikes.

### Bosses

-   Distinctive, pattern-based bosses with fair telegraphs and a small
    set of unique mechanics.
-   Some bosses may have a second phase or arena interaction. Learning
    comes from observation, preparation, and experimentation.
-   Boss introductions use environmental context and a brief skippable
    transition, not a tutorial.
-   Boss HP bar includes current/total HP and a distinctive nameplate.
    Phase change gets a clear transformation and short message.
-   Bosses are one-time encounters, not repeatable.
-   Each major boss awards one unique protagonist equipment item
    (Weapon, Armor, or Relic), plus appropriate EXP/currency/story
    progression or route access.
-   Boss music uses a small set of atmospheric themes with key
    variations.
-   Boss encounter rewards should be authored, reliable, and never
    random.

## 9. Equipment and economy

### Equipment

-   Three protagonist slots: Weapon, Armor, Relic. Universal across
    classes; no creature equipment.
-   Gear does not alter protagonist sprite.
-   Equipment is discovered in authored locations: chests, hidden rooms,
    puzzles, dungeons, landmarks, and bosses. No random drops, buying
    equipment, crafting, upgrading, durability, weight, or capacity.
-   Each equipment item has one authored source/location and cannot be
    duplicated.
-   Rarity labels are descriptive only: Common, Unusual, Unique. Use
    gray/blue/gold plus symbols/borders so color is not the only cue.
-   Gear expands options rather than being mandatory power. Main story
    must be beatable with reasonable exploration; hidden gear is never
    required.
-   Most common gear offers one simple advantage. Unusual/Unique gear
    may offer deterministic special effects/abilities or conditional
    advantages, sometimes with a drawback. No universal best item or
    arbitrary hidden nerfs.
-   Equipment abilities use the same three active slots as class skills
    and are available only while the source item is equipped and the
    ability is assigned. Passives apply automatically. Passive effects
    of the same type do not stack; strongest applies. Different types
    combine.
-   Ability costs are shown; most active gear abilities use MP. Some
    passive/basic-action modifications do not.
-   If a source item is unequipped, its active ability becomes
    unavailable and is removed from the active loadout; clearly tell the
    player which slot was freed.
-   If all three active slots are occupied, equipping gear does not
    auto-assign its ability; player assigns it manually.
-   Skill menu distinguishes Class Skills and Equipment Abilities with
    icons/labels and source/availability.
-   One shared gear setup across classes.
-   Equipment collection is one screen with Weapon/Armor/Relic
    categories, equipped state, sorting by rarity/name, exact
    comparisons, and clear mechanics descriptions. Free equip/unequip;
    preview then Confirm/Cancel. Changes occur only after confirmation.
-   Comparison shows exact stat/effect gains and losses/conditions; do
    not add synergy recommendations or broad synergy analysis.
-   Descriptions explain actual effects, conditions, and numerical
    values in plain language, plus a brief strategic hint where useful;
    no lore/flavor text and no unsolicited recommendation.
-   Equipment art/name/details reveal only after discovery. Map marks
    collected equipment sources only; undiscovered secrets remain
    unmarked.
-   Equipment detail includes concise location name, not lore. Show
    discovered/total counts by slot and optionally rarity, but never
    reveal undiscovered names/locations. No completion rewards.
-   Collection sources remain permanently marked collected. Revisiting
    shows opened/complete; no duplicate reward.
-   Discovery reveal is brief, skippable, pauses the entire world, uses
    a consistent subtle sound and recognizable pixel icon. Use
    icon/name/rarity/mechanics; do not add equipment discoveries to
    journal.

### Economy and consumables

-   Dedicated RPG currency, fully isolated from finance.
-   Enemies and discoveries award fixed, predictable amounts based on
    authored difficulty/importance; no random drops or grinding bonuses.
-   Village merchants sell consumables/useful supplies only. Fixed
    inventories, unlimited stock, predictable prices; no
    rotation/restocking.
-   Currency is never lost on defeat. Prices are understandable;
    progression must not require grinding.
-   No equipment purchasing or crafting.

## 10. Visual art direction and assets

### Overall visual identity

- Clean, readable pixel art with strong silhouettes, deliberate pixel clusters, restrained textures, and a cohesive world palette.
- The RPG's protagonist, NPC, recruitable creature, and enemy sprites follow the mandatory **richly rendered, high-detail, chibi-inspired pixel-art standard** defined below. This is a production requirement, not loose inspiration.
- RPG character/creature art differs from the finance-tool cat/portal art. Only the finance-side theft sequence matches the existing finance cat's art style.
- The world uses a 16×16 base tile grid. This describes terrain tiles, not a restriction on character sprite resolution or detail.
- Animated characters use transparent PNG spritesheets with metadata. Standalone objects, portraits, icons, and backgrounds use separate files.
- Tile-based terrain uses reusable 16×16 ground/path/water/cliff/transition tiles, plus separate multi-tile trees, rocks, ruins, canopies, and other objects with collision, shadows, and occlusion.
- The world is mostly flat and walkable, with layered visual depth. Real elevation is exceptional. The protagonist must render above major scenery and remain fully visible; use shadows and layering for depth rather than covering the protagonist.
- World palettes use natural greens, earth tones, soft blues, and warm amber, with distinct regional accent palettes. The atmosphere balances inviting beauty with eerie mystery.
- Environments use mostly flat, readable shading and limited lighting. Stronger effects are reserved for important events.
- Exploration environments remain mostly still pixel art. Reserve environmental animation for characters, interactables, and important magical events. Character idle loops are subtle and continuous.
- Important places have recognizable silhouettes, architecture, and signature details. Magical light is used sparingly and meaningfully.
- Preserve editable source assets. Optimize build outputs without degrading pixel-art appearance.

### Mandatory character and creature sprite art standard

All protagonist, NPC, recruitable creature, and enemy sprites must follow one cohesive, richly rendered, high-detail pixel-art style. The target aesthetic combines expressive chibi-inspired character design with sophisticated pixel-art rendering. Characters have relatively large heads, compact bodies, expressive faces, carefully designed silhouettes, and intricate visual details. Rendering is dense, polished, dimensional, and deliberately constructed from visible pixel clusters.

This style is substantially more detailed than conventional low-resolution or minimalist 16-bit sprites. Do not interpret the world's 16×16 tile size as a restriction on character sprite resolution or visual complexity.

#### Proportions and character design

- Use chibi-inspired proportions: relatively large heads, compact torsos and limbs, and expressive faces.
- Keep faces readable at gameplay scale. Eyes are prominent and carefully rendered, with layered iris colors, highlights, dark pupil details, eyelids, and deliberate shading where appropriate.
- Give characters distinct facial expressions and recognizable personalities through eyes, eyebrows, mouth shape, posture, hair, and silhouette.
- Design hair in distinct, overlapping locks and clumps, with layered highlights and shadows. Avoid flat, single-color hair masses.
- Clothing and armor should contain visible construction and layering: collars, sleeves, folds, straps, trim, belts, fasteners, and material-specific details where appropriate.
- Accessories, weapons, magical objects, horns, wings, tails, fur, scales, and other defining features must have intentional shapes and readable details.
- Maintain compact, game-appropriate silhouettes. Detail must enhance readability rather than make the character visually noisy.

#### Pixel construction and rendering

- Every sprite must be genuine pixel art, created with deliberate pixel placement and organized pixel clusters.
- Use dense clusters of multiple pixel sizes to form curved contours, stepped edges, fine features, and material texture.
- Silhouettes use controlled pixel stepping. Curves should appear smooth at viewing scale while retaining visibly pixel-defined edges.
- Use layered shading, usually with several coordinated tones for important materials. Build volume with deliberate shadow planes, intermediate tones, highlights, and small reflected-light accents.
- Hair should have directional light and shadow; skin should have nuanced facial and contour shading; cloth should show folds and layered values; metal should have crisp highlights and dark reflective regions; fur and scales should use organized clusters that describe their texture.
- Use selective dark outlines, internal contour lines, and contact shadows to separate overlapping forms. Avoid mechanically outlining every pixel with a uniform black border.
- Highlights should be carefully clustered rather than airbrushed. Shadows should define form rather than simply darken the entire sprite.
- Pixel edges must remain crisp. Never use blur, bilinear smoothing, antialiasing, painterly smudging, or soft gradients as substitutes for pixel-level shading.
- Do not create a smooth illustration, vector character, or 3D render and merely reduce its resolution. Any concept-art source must be cleaned and reconstructed into deliberate, cohesive pixel clusters before becoming a production asset.

#### Color and material rendering

- Use rich, coordinated palettes with clear separation between highlights, midtones, and shadows.
- Allow pale, luminous palettes and dark, dramatic palettes. Both must retain the same detail density, rendering discipline, and dimensionality.
- Use warm/cool shifts where helpful to create volume and atmosphere, without relying on excessive bloom or glow.
- Distinguish materials through pixel clusters, value patterns, edge treatment, and highlights, not color alone.
- Use saturated accents selectively for eyes, magical details, rare features, and important design elements.
- Avoid large, unshaded color regions, muddy palettes, random single-pixel noise, and excessive gradients.
- Preserve readability against both light and dark environments. Use deliberate contour contrast and, where necessary, a restrained outline or shadow.

#### Cohesion across the roster

- The same rendering standard applies to every character and creature, regardless of species, rarity, size, role, or alignment.
- Protagonists and humanoid NPCs share coherent face rendering, shading logic, pixel density, contour treatment, and detail quality.
- Creatures may have radically different anatomy, proportions, silhouettes, surface textures, and expressions, but must use the same overall pixel-art rendering discipline.
- Cute, elegant, tiny, monstrous, intimidating, skeletal, organic, mechanical, and magical creatures must all feel as though they belong to the same carefully illustrated game.
- Creature identity must be recognizable from silhouette and body proportions before color or elemental effects are considered.
- Higher rarity or importance may justify additional design complexity, but ordinary creatures must not look like unfinished placeholders beside protagonists or bosses.
- Class variants must have distinct silhouettes, outfits, and recognizable details while maintaining consistent character proportions and rendering quality.
- Do not mix richly rendered character sprites with flat icons, simplistic low-detail creatures, smooth vector art, or a different pixel-art style.

#### Sprite scale and world integration

- The world uses a 16×16 base tile grid. This describes terrain, not a mandatory character sprite resolution.
- Standard protagonist and ordinary creature sprites are approximately 24×32 pixels as an initial technical baseline, not an unbreakable limit.
- If that resolution cannot support the required facial features, layered hair, shading, clothing detail, and clean contours, increase the sprite canvas dimensions rather than simplifying the art until it no longer matches the standard.
- Select a consistent production resolution after testing representative sprites at actual gameplay scale. Record the chosen dimensions and preserve them consistently across comparable characters.
- Tiny creatures may be smaller and large creatures or bosses may be larger, but all must retain intentional silhouettes and coherent pixel density.
- Scale sprites using nearest-neighbor sampling or equivalent pixel-preserving rendering. Never blur or smooth them when scaling.
- Keep character sprites separate from world tiles so character detail is not constrained by terrain tile dimensions.

#### Animation and directional consistency

- Character spritesheets use transparent PNG frames and organized metadata.
- Characters use four directions only: up, down, left, and right.
- Preserve the same anatomy, face, palette, outline treatment, costume details, and lighting logic across every direction and animation frame.
- Idle and walking animations must not cause facial features, hair shapes, accessories, outlines, or pixel density to change unpredictably.
- Animation should preserve silhouette and design integrity while creating clear, economical movement.
- Reuse shared animation conventions where practical without making different species look mechanically identical.
- The standard creature animation pack includes four-direction idle/walking and shared essential combat animations. Add unique animation only when a signature attack needs it; richer animation is reserved for characters and moments that benefit from it.

#### Asset quality and validation

Before approving a representative character or creature sprite, inspect it at native resolution and at its intended on-screen size.

Acceptance criteria:
1. It is visibly constructed from deliberate pixel clusters, with crisp edges and no accidental smoothing.
2. Its face, silhouette, hair or anatomy, materials, and defining features are readable.
3. Shading creates convincing volume through controlled highlights, midtones, and shadows.
4. Its detail density and rendering quality are consistent with the mandatory richly rendered chibi-inspired style.
5. It looks coherent beside other approved characters and creatures.
6. It remains readable at gameplay scale and against the actual game environment.
7. Its animation frames and four directions preserve its design.
8. Its production file has the correct transparency, dimensions, organization, and metadata.

Do not expand asset production into large batches until a representative protagonist and representative creature have passed this visual standard. If an asset looks too flat, simplistic, blurry, noisy, or stylistically inconsistent, revise it before integration.

#### Explicitly prohibited interpretations

The following do not satisfy this art direction:
- Generic minimalist pixel sprites with only a few large color blocks.
- Crude, low-detail retro sprites that omit facial and material rendering.
- Flat chibi sprites with no meaningful volume or layered shading.
- Smooth digital illustrations, vector graphics, or 3D renders disguised by pixelation.
- Blurred, airbrushed, or heavily antialiased pixel art.
- Characters whose details disappear into indistinct noise at gameplay scale.
- A roster assembled from unrelated pixel-art styles.

The target is expressive, detailed, dimensional, carefully clustered pixel art with chibi-inspired proportions and a cohesive professional finish.

### Title screen and UI

- Title text is exactly **Nomoz**, with no subtitle unless explicitly approved later.
- Title screen is a dark, mysterious cinematic scene centered on an ancient portal and shadowy architecture with restrained magical glow. The portal scene carries the atmosphere; title/menu decoration is minimal.
- Menu layout: title above a small centered vertical list with generous negative space.
- Menu selection: selected option brightens slightly and gains a small pixel-art marker; confirmation has a brief sound and restrained visual response.
- Continue appears when a valid adventure exists. New Game appears only before an adventure has begun; normal menu flow must not accidentally restart an existing save.
- Opaque dark stone-like UI panels with restrained stone/ancient-metal details, limited colors, crisp modern sans-serif typography, subtle magical accents.
- Exploration HUD: protagonist HP as small heart icon + current HP number at top-left; menu button top-right on desktop and mobile, respecting safe areas. No persistent MP/currency/party/inventory indicators.
- Skill-point indicator beside menu button persists until points are spent. Separate tiny skill marker appears near sanctuary when unspent points exist.
- NPC dialogue uses short in-world speech bubbles above NPCs, no large dialogue panel or mandatory portraits. Text appears instantly, not typewriter. Protagonist is almost silent.
- Interactables subtly animate/brighten when nearby. No permanent floating icon; a prompt appears after interaction attempt.
- Combat layout and enemy labels follow section 8. Desktop and mobile are intentionally different layouts with identical information and rules.
- Audio Settings accessible from pause menu during exploration/combat; opening pauses the world. Separate Music and SFX sliders plus master mute, persisted across sessions and consistent across platforms.
- Soundtrack is atmospheric, chiptune-inspired, restrained; short distinctive SFX. Music/SFX/master mute settings apply everywhere.
- Ordinary interactions and routine movement are silent. Mechanisms, doors, special actions, creatures, and significant discoveries can produce restrained sounds.
- Battle normal transition: direct cut with short fade. Normal victory: short enemy defeat animation, brief EXP/currency summary, auto-return to exploration. Level-up summary briefly displays new level/stat increases, then continues automatically.
- Newly discovered creature codex entries unlock silently; no toast/preview/pause. Codex displays Discovered/Recruited status and only known data.
- Use small, brief damage/healing numbers and restrained effects. Avoid excessive screen shake, long animations, clutter, or covering telegraphs.
- Standard animation pack for every creature: four-direction idle/walking and shared essential combat animations. Add unique animation only when a signature attack needs it; richer animation is reserved for important characters and moments.

## 11. Audio

-   Atmospheric chiptune-inspired soundtrack and restrained ambience.
-   Distinct area moods: beautiful/inviting places contrast with eerie
    areas.
-   Short distinctive sound effects, no constant sound clutter.
-   No routine exploration footsteps.
-   Ordinary NPC interactions are silent; mechanisms, doors, significant
    discoveries, special actions, and creatures may have meaningful
    sounds.
-   Music and SFX have independent sliders; master mute overrides both.
    Persist preferences.
-   Summoning uses the shared combat sound language with restrained
    themed variations. Defeated summons dissolve with a brief restrained
    sound/effect.

## 12. Technical architecture

### Principles

-   TypeScript web game integrated with the existing React/Three.js/Vite
    application. Inspect the actual repository and current design.md
    before changing anything.
-   Keep finance and RPG boundaries explicit and testable. Do not
    refactor unrelated finance code.
-   Hybrid event-driven architecture: typed events for cross-system
    notifications; explicit TypeScript interfaces for direct-response
    operations.
-   Lightweight, self-contained TypeScript feature modules optimized for
    a normal GitHub Pages deployment. No dynamic plugin loader,
    elaborate dependency-injection framework, or needless abstractions.
-   Gameplay systems are explicitly registered through a central
    bootstrap. Repetitive data content (creatures, equipment, asset
    manifests) uses simple build-time generation or statically
    discovered registries with validation.
-   Centralized, versioned content registries with stable IDs for
    creatures, classes, skills, equipment, maps, interactions, and other
    authored content.
-   Data-driven definitions. Adding ordinary content should mean
    defining/registering a module, not modifying core gameplay code.
-   Independent gameplay systems communicate through documented
    interfaces/events.
-   Each feature/content module owns its definition, manifest, and
    unique assets where appropriate; common effects, UI icons, and
    reusable sounds live in shared folders.
-   Asset manifests declare asset refs, frame dimensions, and animation
    sequences. Shared loader supports spritesheets and standalone
    assets.
-   Essential assets load at startup; others load on demand, cache, and
    preload for nearby encounters/transitions.
-   Production build fails on missing required assets, invalid required
    references, and broken essential animations. Optional issues warn
    and use safe fallbacks.
-   Automatic build-time asset optimization preserves pixel-art
    appearance and source files.
-   Minimal justified dependencies; reuse existing dependencies. Verify
    compatibility with current Vite, TypeScript, and GitHub Pages
    build/deploy.
-   One concise central architecture guide covers module boundaries,
    registration, events/interfaces, asset manifests, save
    compatibility/migration, testing, and coding conventions.
-   Lightweight reusable templates for creatures, skills, equipment, and
    content. Consult/update architecture docs when relevant.
-   Claude must inspect existing systems before modifying them, extend
    through documented interfaces, avoid duplicate parallel
    implementations, and avoid unnecessary unrelated changes.

### Persistence model

-   Dedicated IndexedDB database for RPG save/progression/structured
    data.
-   localStorage only for small RPG preferences (e.g., audio) and
    active-session coordination.
-   Never store RPG state in finance persistence.
-   One automatic save plus protected last-known-good fallback.
-   Silent save/retry behavior, no visible save indicator.
-   Save schema versioning, migration, validation, recovery, and stable
    IDs are required.
-   Keep regenerable caches separate from progression.
-   Verify reliable storage before entering gameplay.
-   Save failures should retry silently; if reliability cannot be
    assured, stop safely and return to finance.
-   Final rescue completion and cat return are an atomic cross-boundary
    outcome: validate/persist RPG completion first, then update the
    finance-side cat state.

### Diagnostics and error handling

-   Diagnostics remain local in the browser. No external reporting.
-   Small structured rolling log survives sessions and records error
    details, affected system, game version, and recent relevant game
    events.
-   Exclude finance data, sensitive data, and unnecessary personal
    information.
-   Cap log size and evict old entries.
-   Provide copy-report and clear actions. Dashboard shows the
    diagnostics action only when diagnostics exist; after a critical RPG
    error, show a temporary reassurance notice and discreet diagnostics
    action.
-   Warning: continue safely. Recoverable: isolate/fallback/log.
    Critical: stop RPG, preserve save, return to Dashboard.
-   A critical RPG error must not crash or corrupt the finance tool.

### Testing and validation

-   Add focused automated tests for finance/RPG isolation, activation
    behavior, save/migration/recovery, combat rules, recruitment,
    progression, and final rescue persistence.
-   Test desktop and mobile layouts/interaction.
-   Validate affected behavior after every phase; do not defer all
    testing until the end.
-   Use installed project tooling and browser tests where available. Do
    not assume dependencies or commands exist; inspect package.json and
    current scripts.
-   Verify production build and base-path behavior.
-   The game must remain usable with the finance tool's existing
    workflows untouched.

## 13. First vertical slice

The first playable slice is not a disposable prototype. It should use
the intended production architecture and prove the entire game loop with
minimal content.

Required scope: 1. Hidden phrase activation and validation; matching
phrase never saves a transaction. 2. One-time finance-side theft
sequence, persistent portal/cat-missing state, refresh recovery, and
safe RPG re-entry. 3. Finance/RPG storage isolation, active-tab
protection, reliable saves, last-known-good recovery, and critical-error
containment. 4. Title screen and first-time class selection for all five
classes. 5. Small polished explorable opening area using final movement,
camera, interaction, and asset conventions. 6. Opening creature
encounter with persisted species choice, battle transition, manual party
actions, victory/defeat recovery, guaranteed first recruitment, and
party addition. 7. One sanctuary with recovery and core
character/party/skill/equipment service framework. 8. One full normal
battle with turn order, targeting confirmation, enemy intent,
status/element feedback, rewards, and return to exploration. 9. Creature
discovery/codex status, save/resume, and a small journal/map interaction
where feasible within the slice. 10. Return-to-title behavior and safe
finance return.

The slice is accepted only after a fresh adventure, refresh/re-entry,
defeat/retry, recruitment, and save recovery work end to end, and
finance workflows remain unchanged. Only then expand the full campaign.

## 14. Production sequencing

1.  Repository audit and safety baseline.
2.  Finance/RPG boundary, activation state machine, dedicated
    persistence, recovery, session lock, diagnostics.
3.  Asset/content registries, manifests, validation, and build pipeline.
4.  Vertical-slice movement/world/interactions and opening.
5.  Vertical-slice combat/recruitment/sanctuary/save-resume.
6.  Test and polish the vertical slice; resolve all integration issues.
7.  Expand core systems one at a time (combat depth, skill trees,
    equipment, field abilities, map/journal, bosses, dungeons, economy).
8.  Create assets in organized batches using validated production
    pipeline.
9.  Integrate each asset batch into its intended systems and verify
    manifests/animations.
10. Expand creature roster in waves toward 200+, using data validation
    and representative gameplay checks.
11. Final balancing, desktop/mobile QA, performance,
    accessibility/readability, save migration/recovery, production
    build, and finance regression testing.

Do not build all systems and content at once. Each phase must have
explicit deliverables and acceptance criteria, and must pass before
dependent work expands.

## 15. Deliberately configurable / deferred details

Do not block the vertical slice on values that should be validated
through play: - Final protagonist level cap and exact XP curve. - Exact
milestone levels and total skill-point budget. - Final numerical combat
formulas, creature stat tables, enemy stats, boss values, and currency
prices. - Exact world map dimensions and final region/dungeon count. -
Final full 200+ creature catalog and wave composition. - Final inventory
counts and exact equipment list. - Fine balancing of status durations,
skill costs, summon values, and reward pacing.

These values must still be data-driven, validated, and internally
consistent. Deferral is not permission to hardcode arbitrary values
throughout core systems.

## 16. Completion criteria

Nomoz is ready for release when: - The main story and cat rescue work
from first activation through persisted ending. - The 6--10-hour
campaign is coherent, with meaningful optional exploration. - All five
classes and their distinct trees/loadouts work. - Party control,
creature recruitment/collection/codex, elemental combat, equipment,
consumables, sanctuaries, map/journal, bosses, and save recovery behave
according to this spec. - Creature content reaches the intended 200+
target through validated batches. - Desktop/mobile controls and layouts
are usable. - Assets are local, optimized without visual degradation,
and validated. - Save migrations, corruption recovery, active-tab
protection, and final rescue persistence are tested. - RPG failures
remain isolated and finance functionality/data/persistence are
unchanged. - Production build and deployment paths work.