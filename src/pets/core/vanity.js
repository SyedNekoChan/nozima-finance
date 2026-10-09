/*
 * Vanity / equipment system (architecture only: no shop, inventory or UI).
 *
 * An item is pure data plus a tiny render hook:
 *
 *   defineVanityItem({
 *     id, name,
 *     slot,                 'head' | 'chest' | 'neck' | 'held' | 'prop' | 'accessory'
 *                           (a pet declares which slots it has and where they sit)
 *     pets,                 optional list of compatible pet ids (default: all)
 *     rows(p)  -> string[]  pixel rows (palette chars), or null for nothing
 *     draw(ctx, p, pos, h)  optional custom renderer instead of `rows`
 *     offset(p) -> {x, y}   optional animation offset (crown adjusting...)
 *     visible(p)            visibility condition on the render state
 *     layer                 draw order (higher on top)
 *   })
 *
 * `p` is the sprite render state (mood, view fields, frame). Because
 * visibility and offsets read that state, items integrate with behavior
 * animations without the behavior knowing how the item is drawn.
 */

export const VANITY_SLOTS = ['head', 'neck', 'chest', 'held', 'prop', 'accessory'];

export function defineVanityItem(def) {
  if (!def || typeof def.id !== 'string') throw new Error('vanity item needs an id');
  if (!VANITY_SLOTS.includes(def.slot)) throw new Error(`vanity "${def.id}": unknown slot "${def.slot}"`);
  if (typeof def.rows !== 'function' && typeof def.draw !== 'function') {
    throw new Error(`vanity "${def.id}" needs rows(p) or draw(...)`);
  }
  return { layer: 0, visible: () => true, ...def };
}

/*
 * slots    : { slotName: (p) => ({ x, y }) } anchors supplied by the pet
 * items    : item definitions (invalid or incompatible ones are skipped)
 * equipped : ids worn by default
 */
export function createVanityRegistry({ petId, slots = {}, items = [], equipped = [] }) {
  const defs = new Map();

  for (const raw of items) {
    try {
      const item = defineVanityItem(raw);
      if (item.pets && !item.pets.includes(petId)) continue;
      if (!slots[item.slot]) throw new Error(`pet "${petId}" has no "${item.slot}" slot`);
      defs.set(item.id, item);
    } catch (err) {
      console.warn('[pets] vanity item skipped:', err.message);
    }
  }

  const worn = new Set(equipped.filter((id) => defs.has(id)));

  /*
   * Draws every worn, visible item. `h` = { fillPixels, colorFor }
   * supplied by the pet's sprite module. A failing item is skipped.
   */
  function draw(ctx, p, h) {
    const list = [...worn].map((id) => defs.get(id)).sort((a, b) => a.layer - b.layer);
    for (const item of list) {
      try {
        if (!item.visible(p)) continue;
        const a = slots[item.slot](p);
        const o = item.offset ? item.offset(p) : null;
        const pos = { x: a.x + (o ? o.x : 0), y: a.y + (o ? o.y : 0) };
        if (item.draw) {
          item.draw(ctx, p, pos, h);
        } else {
          const rows = item.rows(p);
          if (rows) h.fillPixels(ctx, rows, pos.x, pos.y, h.colorFor);
        }
      } catch (err) {
        console.warn(`[pets] vanity item "${item.id}" failed:`, err);
      }
    }
  }

  return {
    petId,
    has: (id) => defs.has(id),
    get: (id) => defs.get(id),
    ids: () => [...defs.keys()],
    equipped: () => [...worn],
    isEquipped: (id) => worn.has(id),
    equip: (id) => defs.has(id) && !!worn.add(id),
    unequip: (id) => worn.delete(id),
    draw,
  };
}
