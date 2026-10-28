# Nomoz humanoid base sheet v1 (staged, unapproved)
- Frame 40x48; sheet 240x192 (6 cols x 4 rows). Rows: down, left, right, up. Cols: idle0, idle1, walk0-walk3.
- Anim: idle cols 0-1 @600 ms; walk cols 2-5 @140 ms.
- Anchors: ground (20,45), foot baseline y=44, axis x=20, head window 22x20 at (9,3). Per-frame head/hand anchors in `nm_humanoid_base_v1.json`.
- Layers: body, hair (default), composite = body+hair; underlayer mask for outfit coverage. Draw order: far limbs, legs, torso, clothing/armor, head, hair, accessories, near arm, weapon/off-hand.
- Palette 23 colors (see JSON); light from upper-left; nearest-neighbour scaling only.
- Build: `python3 source/build_sheet.py`; verify: `python3 source/validate_sheet.py` -> `validation_report.txt`.
- Hand-typed parts in `parts/*.txt` (source of truth in `source/parts.py`).
