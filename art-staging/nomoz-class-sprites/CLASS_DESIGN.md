# Nomoz protagonist classes: silhouette and visual-language definitions (written before production)

Sources: `docs/nomoz/GAME_DESIGN.md` section 6 (five classes, selection gallery, "distinct silhouette/outfit/details but shared proportions,
scale, and animation conventions", equipment never changes the protagonist sprite) and the art standard (clustered pixels, selective outlines,
coordinated ramps, readable at gameplay scale). Benchmarks: Hero v3 (craft: face shading, hair light, material ramps) and the staged humanoid base v2.

## Shared conventions (all five)
- Frame 40x48, sheet 240x192 (6 cols x 4 rows), rows down/left/right/up, cols idle0, idle1, walk0-walk3, timing and ground anchor (20,45), foot
  baseline y=44 and head anchor (9, 3+bob+breath) exactly as humanoid base v2. Same head size/face rendering (base v2 faces), same body proportions.
- Shared face rendering and skin ramp; class identity comes from hair/headwear, outfit shape, accessories, weapon, eye colour and palette.
- Light from the upper left; one shared outline colour (#17121f); selective inner outlines; each class limited to its own coordinated ramps.
- Appearance is fixed per class: the weapon is part of the class sprite; equipment never changes it.

## Silhouette targets (readable at 1x as a black shape)
| Class | Head | Body / hem | Weapon and back items | Silhouette keyword |
|---|---|---|---|---|
| Swordsman | short spiky hair + red headband tails | wide steel pauldrons, breastplate over crimson, short crimson cape with flared hem, trousers + greaves | longsword carried on the back: hilt above the screen-right shoulder, blade tip at the opposite hip, full diagonal blade from behind | wide shoulders + sword hilt and tip |
| Hunter | soft peaked cap with feather, side braid | leather jerkin + green mantle over shoulders, crossed quiver strap, tall cuffed boots | bow held at screen left, quiver + arrow fletching behind shoulder | cap peak + vertical bow arc |
| Assassin | hood with pointed tip and back tail, scarf mask over mouth, long scarf tails | fitted jacket, leather harness, wrapped forearms, no shoulder bulk | two short reverse-grip daggers angled out-and-down at both hands | lean, hooded, flowing scarf + angled blades |
| Mage | floppy pointed hat with gold band and curled tip, long hair | long robe widening to a bell hem, trimmed sleeves and sash, feet peek out | tall staff with crystal planted at screen right (above head height) | tall bell + hat + tall staff |
| Necromancer | pointed hood, shadowed brow, pale face with glowing green eyes | hooded cloak with ragged hem, bone shoulder piece, skull pendant | skull-topped crooked staff with green flame at screen left | ragged triangle + hood + skull staff |

## Colour languages (class ramps; skin/outline/eyes shared)
Swordsman steel-blue + crimson + brown hair; Hunter forest green + leather brown + copper feather; Assassin charcoal-teal + crimson accent;
Mage royal blue + gold + pale lilac hair; Necromancer black-violet + bone + sickly green glow. Eye colour (iris) also differs per class.

## Animation conventions
Same pose recipes as base v2 (idle breathing, 4-frame walk with bob, lifted/forward/back leg and arm poses). Capes, scarf tails, robe hems, and feathers
get at most 1 px secondary sway on walk frames; everything head-anchored stays pixel-identical across frames of a direction.

## Scope limits (documented up front)
Idle and walk only (no combat poses); no portraits/UI; weapons are carried, not swung; staged only, no runtime integration.

## Production notes and deviations (recorded after production)
- Headroom above the head is only 2 px in the 40x48 frame, so hats cannot be tall: the Mage hat is a wide-brim pointed cap with a curled tip, and the staff and robe carry the tall bell silhouette.
- The Mage and Necromancer staffs are planted on y=44 and are held at the screen-right / screen-left hand in front and back views. In side views they are planted ahead of the body
  (x 4-9 / 2-8) and gripped by a forward-reaching forearm, so they no longer cross the hat band, face, hood or central torso. The Hunter's bow uses the same device (bow held forward, string clear of the torso).
- The Assassin's scarf mask intentionally hides the blush/mouth pixels; eyes and brows always stay visible.
- Right-facing overlays and torsos are mirrored drafts re-lit by tone order; side limbs and boots are recolours of base v2 geometry with class finish (see SPEC.md).

## Visual corrections after review (v1 corrections pass)
- Mage: side/back hair narrowed and tapered (side: tapered lock from the back of the skull; back: curtain narrows from the ears to a short point, no wide slab); side staff moved forward (above);
  robe skirts one row shorter and slippers recoloured to gold so the feet read against the blue hem.
- Necromancer: brow shadow reduced to a one-row hood rim plus a dithered row; side hood gets a shaded inner fold behind the face and closed outlines (stray ticks at the hood back removed);
  skull staff planted ahead of the hood in side views and clear of the hood edge in front/back views; back-view bone motif is now a segmented spine (alternating wide/narrow vertebrae from collar to belt).
- Assassin: floating side-view hood tail replaced by a short cowl peak that is outlined and attached to the hood back; forearm wraps shaded (new dark wrap tone `k`); side torso harness strap now reads as mid leather with a highlight.
- Swordsman: one back-slung sword across all views (front: hilt above the shoulder + crossing leather baldric on the chest + tip at the opposite hip; side: single hilt-to-tip sword along the back; back: hilt over the
  opposite shoulder from the front view, diagonal blade, tip at the hip); side torso simplified to a steel half and a red half.
- Hunter: side bowstring shortened by holding the bow forward (clear of the torso); quiver enlarged in all views with visible arrow fletching; stray hair/cap-edge pixels beyond the outline trimmed.
- Known limits: the forward-hold forearm in side views is a single pose for all six frames (the near arm no longer swings; the far arm still does); the Assassin cowl peak is a small stylised nub.
