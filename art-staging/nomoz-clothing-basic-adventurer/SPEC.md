# Nomoz clothing: Basic Adventurer v1 (staged, unapproved)
One outfit layer for humanoid base v2 (`art-staging/nomoz-humanoid-sheet/`, unchanged). Same 40x48 frame, 240x192 sheet (6 cols x 4 rows),
rows down/left/right/up, cols idle0, idle1, walk0-walk3; timing, ground anchor (20,45), foot baseline y=44 and hand/head anchors are the base's.
- Pieces: green field tunic (linen collar lacing, placket, sleeve cuffs), leather belt + brass buckle (none on the back), khaki trousers,
  dark chestnut boots with tan cuff band and welt sole. Upper-left lighting; 20 outfit colours + the shared outline colour.
- Draw order per frame: body sheet -> clothing sheet -> hair sheet (hair and clothing only share identical outline-colour pixels).
- Coverage contract: clothing alpha equals `nm_humanoid_base_underlayer_mask_sheet_v2.png` alpha in all 24 frames. It covers the default
  shirt/trousers/boots completely and never touches skin, eyes, hands or neck. No overhang. Underlayer outline pixels that no part paints are
  filled with the outline colour; a colour pixel landing on a body outline pixel keeps the outline colour.
- Parts: `source/outfit_parts.py` (text copies in `source/parts/`). Placements/poses reuse `build_sheet_v2.py` recipes (bob, leg/arm poses).
  Hand-typed: torsos, sleeves, front/back legs. Side leg poses are role-based recolours of the base pose geometry; right-facing legs started
  as mirrored drafts with tones re-ordered (see JSON `authoring`).
- Build: `python3 -I source/build_clothing.py`. Validate: `python3 -I source/validate_clothing.py` -> `validation_report.txt`.
- Previews: `preview/nm_clothing_basic_adventurer_contact_{1,2,5}x_v1.png`, composite sheet `preview/nm_clothing_basic_adventurer_composite_sheet_v1.png`.
