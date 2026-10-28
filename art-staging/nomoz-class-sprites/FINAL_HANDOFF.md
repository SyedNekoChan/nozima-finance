# Nomoz Class Sprites v1 — Final Handoff

Folder: `art-staging/nomoz-class-sprites/` (staging only; nothing is wired into the game).

## Final status

```
VISUAL QA:                 APPROVED WITH MINOR CORRECTIONS
AUTOMATED VALIDATION:      99 PASS, 0 FAIL
SPRITEFORGE VERIFICATION:  OUTSTANDING
RUNTIME INTEGRATION:       NOT STARTED
```

## 1. What is delivered

Five protagonist class sprites on the humanoid base v2 layout. Appearance is fixed per class; equipment never changes the sprite.

| Class | Sheet | SHA-256 (from `nm_class_set_v1.json`) |
|---|---|---|
| Swordsman | `nm_class_swordsman_v1.png` | `11a10f5d79152a2db4d6475f08b594b7a4260acc3420706ae7b26816adef8974` |
| Hunter | `nm_class_hunter_v1.png` | `c952176570ddb6a398dddbbe6d3d973468be9612247560efb1423ee4fb3c2416` |
| Assassin | `nm_class_assassin_v1.png` | `9956aae422cab95af1f7547fc98e3adc16eca12244046f649828adc852c16521` |
| Mage | `nm_class_mage_v1.png` | `c70232e5de385ea87025e8c52ecd94fdeaf937e9be335595bbdeac6368708966` |
| Necromancer | `nm_class_necromancer_v1.png` | `7ad4256d7dd83e3663b90c48bf02234e6d27f34ea4720313178f2a02f2859bf2` |

Class identity:
- **Swordsman** — steel pauldrons and breastplate over crimson, red headband, short cape; one continuous back-slung longsword in all views (front: hilt, chest baldric, tip; side: hilt-to-tip along the back; back: diagonal blade).
- **Hunter** — feathered peaked cap, copper hair with a braid, leather vest and green mantle, quiver on the back, recurve bow (held forward in side views).
- **Assassin** — charcoal-teal hood with an attached side cowl peak, crimson scarf mask and trailing tails, harness, shaded wrapped forearms, two reverse-grip daggers.
- **Mage** — royal-blue and gold robe, floppy pointed hat, tapered lilac hair, gold slippers, crystal staff.
- **Necromancer** — black-violet hooded cloak with ragged hem, bone shoulder piece, segmented back-view spine motif, skull staff with green flame.

## 2. Sprite-sheet specification

- Per sheet: 240×192 RGBA, alpha only 0/255, 6 columns × 4 rows, 40×48 frames.
- Rows: down, left, right, up. Columns: idle0, idle1, walk0, walk1, walk2, walk3 (24 frames per class, 120 total).
- Ground anchor (20,45), foot baseline y=44, head and hand anchors identical to humanoid base v2.
- Shared outline, skin ramp and face pixels across all classes; class-specific palettes (≤30 colours each) and eye colours.
- Animation scope: idle and walk only. No combat animations, portraits, UI, NPCs or creatures.
- Class-specific motion: 1 px sway for capes, scarf tails and braids; lifted-side robe hems for Mage and Necromancer. In side views the Mage staff, Necromancer staff and Hunter bow are held forward by a fixed hold-forearm part; the near arm does not swing there.

## 3. Folder contents (248 files)

- Sheets and metadata: five `nm_class_<class>_v1.png` / `.json`, plus `nm_class_set_v1.json`.
- Docs: `SPEC.md`, `CLASS_DESIGN.md` (includes the "Visual corrections after review" section), `validation_report.txt`, this file.
- Previews (`preview/`, 20 files): gallery 1×/2×/5×, per-class contact sheets 1×/2×/5×, `nm_classes_walk_2x_v1.png`, `nm_classes_silhouettes_v1.png`.
- Source (`source/`): `classlib.py`, `cls_<class>.py` ×5, `build_classes.py`, `validate_classes.py`, `parts/<class>/*.txt` (typed part grids).

## 4. Validation and reproducibility

- `python3 -I source/validate_classes.py`: **99 PASS, `FAILS: []`**. The checked-in `validation_report.txt` was written by the last run (99 `PASS` lines, `FAILS: []`). The validator was not modified to obtain this result.
- Reproducibility: after the Hunter correction I ran `python3 -I source/build_classes.py` twice and compared SHA-256 of every file in the folder between the two builds: identical. The validator also checks that the rebuilt sheets, metadata JSON, gallery, contact and silhouette previews and part exports equal the staged files.
- Note on that evidence: the two build hashes were taken after the Hunter correction, so they prove the build is deterministic. They are not a snapshot of the previous build.
- Visual QA: all 24 frames of all five classes inspected at 5×, with 7–16× zooms on side-view walk frames, hems, feet and hat/hood details; right-facing frames numerically compared against a flip of the left-facing frames (exact mirror in all frames of all classes after the Hunter fix).

## 5. Changes versus the previous (Hunter-correction) build

**Previous versions are not available.** The folder is untracked in Git and no copy of the earlier build or its hashes was kept, so exact file-by-file attribution cannot be verified. What can be stated:

- **Source edit:** only `source/cls_hunter.py` (mtime 2026-10-28 14:17) was edited in the last QA pass; the other source modules last changed 2026-10-27 (assassin 22:06, swordsman 22:04, necromancer 22:02, mage 22:00, `classlib.py` 14:48, `build_classes.py` 14:46, `validate_classes.py` 14:50). `CLASS_DESIGN.md` and `SPEC.md` last changed 2026-10-27 22:06. These are file timestamps, which are circumstantial evidence only.
- **Hunter sheet — reconstructed comparison (in memory, nothing written):** I rebuilt the Hunter with the two pre-fix settings (right-facing mantle at x=17; bow not following the body bob) and compared it to the staged sheet. They differ in 191 pixels, in left walk1 and walk3 (bow bob) and in all six right-facing frames (mantle offset plus bob). Idle and the other left frames do not differ. This shows the staged Hunter sheet carries the correction; it is a reconstruction, not a stored previous file.
- **Files rewritten without proof of content change:** the build rewrites every export each run. All 20 previews, all five sheets and JSONs, `nm_class_set_v1.json`, `validation_report.txt` and 204 of the 206 `source/parts` files carry the 2026-10-28 14:17 timestamp. Whether the Swordsman, Assassin, Mage and Necromancer sheets, JSONs and previews differ from the previous build in content cannot be verified. Expected: Hunter sheet, Hunter JSON (sheet hash), `nm_class_set_v1.json` (Hunter hash), Hunter contact previews, the three gallery previews and `nm_classes_walk_2x_v1.png` contain Hunter pixels and would differ; the others are expected to be identical but this was not proven.
- **Stale part exports (finding):** two files in `source/parts` were not rewritten (timestamp 2026-10-27 14:51) and no longer correspond to any part in source: `source/parts/mage/hair_up_ext.txt` (removed from `cls_mage.py` during the correction pass) and `source/parts/swordsman/sword_r.txt` (removed from `cls_swordsman.py`). The validator's part-export check passed because it compares current parts against files, not the reverse. They are harmless leftovers and were left in place because this task forbids edits; they can be deleted in a later cleanup.

## 6. Outstanding limitations

- **SpriteForge grid verification has not been performed** on any of the five sheets.
- Right-facing frames are mirrored drafts re-lit by tone order, not independently drawn; they were visually checked and are exact mirrors in outline and weapon placement.
- Necromancer foot-contact readability: the dark robe hem hides the boots, so stride and foot contact read weakly in side walk frames. Feet are present and on y=44.
- Mage and Necromancer side silhouettes are thin vertical columns with the forward-held staff.
- Mage, Necromancer and Hunter side-view near arm is one fixed forward-hold pose across all frames (only the body bob moves it); the Mage side forearm is long and flat by design.
- Cosmetic contacts, not corrected: Mage crystal touches the hat brim tip and Necromancer flame touches the hood's left edge in front/back views; Assassin walk2 side frames have one hip outline pixel and a small gap between crossing legs (from shared base leg geometry); the Assassin cowl peak is a small stylised nub.
- Limbs and boots are recolours of base v2 geometry with class finish.
- No integration work: no runtime loading, gameplay, finance, manifest, dependency or NPC changes were made; no Git operations were performed.
