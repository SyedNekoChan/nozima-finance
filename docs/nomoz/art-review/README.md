# Art review samples (not approved, not integrated)

Review samples for the roadmap's art quality gate. None is wired into the game,
listed in a manifest, or approved. Authored as code and rendered with
`python3 make_review_sheet.py` (needs Pillow). Every pixel is placed
deliberately; there is no blur, antialiasing, downscaling or smoothing.

## Round 2 (current direction)

Direction taken from two reference images supplied by the owner (not copied):
soft, slightly desaturated pastel palettes with warm/cool shifts; large
expressive eyes with dark lashes and layered irises; voluminous, asymmetric,
wind-swept hair and feathers built from overlapping locks; outlines that are a
darkened, cool-shifted version of the neighbouring colour and are left out on
lit upper-left edges; small checker-dither accents.

| File | Size | Notes |
| --- | --- | --- |
| `protagonist_hunter_58x70.png` | 58x70 | Hunter-style protagonist: copper hair and ponytail, forest-green tunic, cream cowl, bow, hip pouch. Front view, one idle pose |
| `creature_gustwing_66x58.png` | 66x58 | "Gustwing" (Wind kit) sample: puffball bird with wind-swept tufts and tail ribbons. Not an approved species |
| `review_sheet_round2.png` | - | Both at 1x, 3x (game-green, stone, near-black) and 7x |

### Hair and fur pass

Round 2 was reworked after review: hair and plumage are now built from separate,
tapering, S-curved clumps (a dark under-mass first, then fanned clumps with gaps
between them) instead of uniform ribbons and scattered strand lines. Each clump
is lit by a global light term for the whole form blended with its own
across-shading, with a darker shadow edge, a short parting line and a lit glint
along its length, and checker-dithered tone transitions. Wings are fanned primary
feathers with a dark under-mass; cheek and chest fluff are short scalloped tufts.
The round-1 Emberfox fur was not reworked.

## Round 1 (superseded first attempt)

`protagonist_swordsman_44x58.png`, `creature_emberfox_52x46.png` and
`review_sheet_round1.png`: a plainer, near-black-outline style, kept for
comparison only.

## Technical notes

PNGs are RGBA with only fully transparent or fully opaque pixels. Scaling is
whole-number nearest-neighbour only. Canvases exceed the 24x32 baseline because
the face and hair detail required it. Palette sizes: Hunter 68 colours,
Gustwing 54.

## Known weaknesses (author's own review, not an approval)

- Compared with the references, the rendering is less refined, and the hair and
  skin tones of the Hunter are close in value.
- The Hunter's body and arms are boxy and simpler than the head; the Gustwing's
  wings are still dense and its head tufts are smooth lobes rather than fluff.
- Only one front-facing idle pose exists per sprite: no four directions and no
  animation frames, so those criteria are untested.
- Not yet seen against real game environment art (none exists), and no sprite
  metadata or manifest exists.

## Refined protagonist model (single pose, awaiting approval)

`protagonist_model_swordsman_40x47.png` (native 40x47, transparent RGBA, front
view, one static pose) with the inspection sheet `protagonist_model_review.png`
(enlarged 12x, gameplay 3x on two backgrounds, compact 2x, native 1x, silhouette
and a proportion-line overlay). Sources: `model_swordsman.py`,
`make_model_sheet.py`. Intended display: whole-number scaling only, 3x on wide
layouts (120x141 px) and 2x on compact layouts (80x94 px). How this relates to
the 16x16 world tile size is not decided: at 3x with tiles at the same zoom the
figure is about 2.9 tiles tall.

This is the design-review model only: no directions, animation frames, variants
or spritesheet.

Chibi proportions (second pass, replaces the earlier 40x56 model): the head
including hair is about 26 of 47 rows (55%, up from 41%) and 28-30 px wide; the
torso is 9 rows (19%); legs and boots are 11 rows (23%). The body is 15-20 px
wide, so the head is roughly twice the width of the shoulders. Hair is a cap that
follows the skull with four short pointed bangs around a small parting, narrow
side locks and one crown flick; it is no wider than the face.

## Class models: all five classes (single static front pose each, awaiting approval)

The Swordsman model above plus four more, all built on the shared rig in
`chibi_rig.py` (same skull, face, eye, torso and limb geometry; head about 26
rows, torso 9 rows, legs and boots 11 rows) so proportions, scale and rendering
match. Per-class modules: `model_hunter.py`, `model_assassin.py`,
`model_mage.py`, `model_necromancer.py`; export and sheets: `make_class_sheets.py`.

| Class | File | Native size | Identity (provisional, see GAME_DESIGN) |
| --- | --- | --- | --- |
| Swordsman | `protagonist_model_swordsman_40x47.png` | 40x47 | indigo hair, amber eyes, steel breastplate and pauldron, sheathed sword |
| Hunter | `protagonist_model_hunter_46x47.png` | 46x47 | copper hair with a small ponytail, teal eyes, green tunic and cowl, bow, fletched quiver |
| Assassin | `protagonist_model_assassin_46x47.png` | 46x47 | violet-black hair with a long lock, red eyes, charcoal outfit, crimson scarf, half-cloak, hip daggers |
| Mage | `protagonist_model_mage_48x55.png` | 48x55 | silver-lavender hair, blue eyes, small pointed hat, blue robe with gold trim, orb staff |
| Necromancer | `protagonist_model_necromancer_48x51.png` | 48x51 | ash-silver hair, spectral-teal eyes, pale skin, ragged violet coat and cape, bone clasps, flame staff |

Sheets: `class_lineup_review.png` (3x on game-green, 2x, native 1x, silhouettes)
and `class_models_inspection.png` (all five at 9x). Canvases differ in size
because hats, staves and capes extend the silhouette; every model is
bottom-aligned on one feet baseline, and display scaling is whole-number only
(3x wide, 2x compact). Class art here is design direction only: the class
identities in GAME_DESIGN remain provisional and no skills are implied.

Known weaknesses: the Swordsman and Assassin silhouettes are similar and rely on
colour and the scarf/cloak; the Necromancer's face is a little gloomy; chest
gear is small and busy at native size; only one front pose exists per class.
