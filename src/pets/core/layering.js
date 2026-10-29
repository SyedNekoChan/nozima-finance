/*
 * Which side of the pet a world prop is drawn on.
 *
 * A prop is behind the pet when it is deeper (z lower or equal) and in front
 * when nearer. The rule has one exception: a prop must not switch sides while
 * it overlaps the pet's body, or it would visibly jump through it. The switch
 * waits until the prop (its last and its new position) is clear of the body;
 * a prop that stays on the other side of the pet's depth for SIDE_SETTLE_MS
 * is drawn there regardless (a resting prop is not mid-flight).
 */
export const SIDE_SETTLE_MS = 700;

// mem: { front, since } | undefined. Returns the new memory ({ front, since, forced }).
export function nextSide(mem, want, touching, now, settleMs = SIDE_SETTLE_MS) {
  if (!mem) return { front: want, since: 0, forced: false };
  if (want === mem.front) return { front: want, since: 0, forced: false };
  const since = mem.since || now;
  if (!touching) return { front: want, since: 0, forced: false };
  if (now - since > settleMs) return { front: want, since: 0, forced: true };
  return { front: mem.front, since, forced: false };
}

// Does a prop at `pos` (half-size `size`) overlap the pet's body footprint (half-extent hw x hh) at `pet`?
export const overlaps = (pos, pet, hw, hh, size = 0) =>
  Math.abs(pos.sx - pet.sx) < hw + size && Math.abs(pos.sy - pet.sy) < hh + size;
