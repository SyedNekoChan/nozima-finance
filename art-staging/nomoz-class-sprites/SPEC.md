# Nomoz protagonist class sprites v1 (staged, unapproved)
Five complete class sprites on the humanoid base v2 layout: Swordsman, Hunter, Assassin, Mage, Necromancer. Design definitions are in `CLASS_DESIGN.md`
(written before production). Appearance is fixed by class; equipment never changes the sprite (GAME_DESIGN section 6).
- Files per class: `nm_class_<class>_v1.png` (240x192 RGBA, 40x48 frames, 6 cols x 4 rows, rows down/left/right/up, cols idle0, idle1, walk0-walk3) and `nm_class_<class>_v1.json`.
  `nm_class_set_v1.json` is a local staging index only (not a game manifest).
- Shared with base v2: frame/sheet size, timing (idle 600 ms, walk 140 ms), ground anchor (20,45), foot baseline y=44, head anchor (9, 3+bob+breath), hand anchors,
  pose recipes, face rendering and skin ramp, outline colour #17121f, chibi proportions (head/torso/arm rows never thinner than base v2).
- Per class (hand-typed in `source/cls_<class>.py`): torso (front/back/side), head overlay (hat/hood/hair/band) for down/up/left, accessories, weapon, palette ramps, eye colour.
  Right-facing overlays and side torsos are mirrored drafts re-lit by tone order (light stays upper-left); limbs/boots are role-based recolours of the base v2 geometry plus class finish.
- Weapons: Swordsman longsword carried on the back; Hunter bow in the screen-left hand + back quiver; Assassin two reverse-grip daggers; Mage crystal staff planted at screen-right;
  Necromancer skull staff planted at screen-left. In side views the Mage staff, Necromancer staff and Hunter bow are held forward by a dedicated hold-forearm part (`hold_s`/`hold_r`, drawn over the base near arm, which is blanked for these classes);
  Mage/Necromancer staffs are planted on y=44; other held items follow the base hand anchors.
- Secondary motion: 1 px sway on walk contacts for capes, scarf tails and braids; robe hems use lifted-side variants. Hats, hoods and hair are static relative to the head anchor.
- Scope: idle and walk only. No combat poses, portraits, UI, NPCs, creatures or runtime integration.
- Build: `python3 -I source/build_classes.py`. Validate: `python3 -I source/validate_classes.py` -> `validation_report.txt`.
- Previews (`preview/`): `nm_classes_gallery_{1,2,5}x_v1.png` (five classes, idle, four directions), `nm_class_<class>_contact_{1,2,5}x_v1.png` (all 24 frames),
  `nm_classes_walk_2x_v1.png`, `nm_classes_silhouettes_v1.png` (black silhouettes).
