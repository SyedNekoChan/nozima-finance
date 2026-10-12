/*
 * CSS timing for the pet layer's glides: 'linear' for steps and sampled
 * paths, 'in' for falls (accelerating), anything else the shared ease-out.
 */
export function easeCss(ease) {
  if (ease === 'linear') return 'linear';
  if (ease === 'in') return 'cubic-bezier(0.4, 0, 1, 1)';
  return 'var(--motion-ease)';
}
