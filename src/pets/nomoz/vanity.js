import { defineVanityItem } from '../core/vanity.js';
import { CROWN, drawBook, drawCoin } from './sprites.js';

/*
 * NOMOZ.EXE's vanity slots and items.
 *
 * Slot anchors place an item relative to the current frame (`p.hx`, `p.hy`
 * are the head's top-left in sprite pixels, so head items follow the head
 * as it breathes, dips or leans). Items decide their own visibility from
 * the render state, and may be offset by behavior-driven view fields.
 *
 * To add an item: append a defineVanityItem(...) here (and its id to
 * EQUIPPED in ./config.js to wear it by default). No other file changes.
 */

export const SLOTS = {
  head: (p) => ({ x: p.hx + 12, y: p.hy + 3 }),
  neck: (p) => ({ x: p.hx + 10, y: p.hy + 26 }),
  chest: () => ({ x: 24, y: 34 }),
  held: () => ({ x: 24, y: 34 }),
  prop: () => ({ x: 0, y: 0 }),
  accessory: (p) => ({ x: p.hx, y: p.hy }),
};

export const ITEMS = [
  // The content state's crown. The crown / crownLift view fields let a
  // vanity behavior nudge it without knowing how it is drawn.
  defineVanityItem({
    id: 'crown',
    name: 'Crown',
    slot: 'head',
    layer: 20,
    rows: () => CROWN,
    offset: (p) => ({ x: p.crown || 0, y: p.crownLift || 0 }),
    visible: (p) => p.mood === 'content',
  }),

  // The cyber-$ coin resting on the chest (content and stressed states).
  defineVanityItem({
    id: 'chestCoin',
    name: 'Chest coin',
    slot: 'chest',
    layer: 10,
    draw: (ctx, p, pos) => drawCoin(ctx, pos.x, pos.y),
    visible: (p) => (p.mood === 'content' || p.mood === 'stressed') && !p.coin,
  }),

  // The same coin lifted off the chest to be examined, turned and put back.
  // view.coin = { dx, dy, turn }
  defineVanityItem({
    id: 'heldCoin',
    name: 'Held coin',
    slot: 'held',
    layer: 30,
    draw: (ctx, p, pos) => drawCoin(ctx, pos.x, pos.y, p.coin.turn || 0),
    offset: (p) => ({ x: p.coin.dx || 0, y: p.coin.dy || 0 }),
    visible: (p) => p.mood === 'content' && !!p.coin,
  }),

  // A temporary prop: the open book of the reading behavior (view.book 0..2).
  defineVanityItem({
    id: 'book',
    name: 'Book',
    slot: 'prop',
    layer: 15,
    draw: (ctx, p) => drawBook(ctx, p.book),
    visible: (p) => p.book != null && p.pose !== 'stand' && p.mood !== 'stressed',
  }),
];
