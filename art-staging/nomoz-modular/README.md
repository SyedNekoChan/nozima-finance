# Nomoz modular humanoid kit, Stage 1 (UNAPPROVED, staging only)

- Canvas 44x48, 1 art px = 1 PNG px, transparent RGBA. Scale with nearest-neighbour only.
- All parts share the canvas at origin (0,0). Composite by `layer` ascending with no offsets:
  body 10, head 20, clothing 30, hair/headwear 40, weapon 50.
- Slots: one part each. Hair and cap are exclusive; tunic and coat are exclusive; sword and axe are exclusive.
- Anchors are in `registry.json`: feet baseline y=46, axis x=21.5, weapon grip (31.5,36) on the right hand.
- Recolour by swapping a ramp (dark to light, same length) from `registry.json`. Outline `#010101` and eyes stay fixed.
- `previews/stage1_combos.png` is a 1x check sheet (4 combinations) and is not a production asset.
- Not wired into the runtime.
