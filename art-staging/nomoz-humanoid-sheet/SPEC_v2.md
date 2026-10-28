# Nomoz humanoid base sheet v2 (staged, unapproved). v1 files are unchanged.
Unchanged from v1: frame 40x48; sheet 240x192 (6 cols x 4 rows); rows down, left, right, up; cols idle0, idle1, walk0-walk3;
idle 600 ms, walk 140 ms; ground (20,45), foot baseline y=44, axis x=20, head window 22x20 at (9,3); 23-colour palette;
layers body / hair / composite / underlayer mask; draw order and future slots (see `nm_humanoid_base_v2.json`).
Changed (documented in JSON `changes_from_v1`): hand-drawn side limb poses (stand/fwd/back/lift) in 16 px leg boxes at x=12
(right-facing boxes at x=40-x-w); hand-authored right-facing head/hair/torso; shaped ears, sideburn, nape hairline; shirt/belt/boot
shading; front-view arm foreshortening in walk frames; right leg one tone darker in front/back views.
Build: `python3 -I source/build_sheet_v2.py`. Verify: `python3 -I source/validate_sheet_v2.py` -> `validation_report_v2.txt`.
Parts: `source/parts_v2.py` (text copies in `parts_v2/`). Previews: `preview/*_v2.png` (1x, 2x, 5x) and `preview/nm_humanoid_base_v1_vs_v2_3x.png`.
