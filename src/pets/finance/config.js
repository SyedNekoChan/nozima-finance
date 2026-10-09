/*
 * Financial-context configuration, shared by every pet. Nothing here is a
 * financial rule: the application's own calculations decide the budget,
 * over-budget and balance facts; these numbers only tune how a pet LOOKS
 * at them.
 */
export const FINANCE = {
  /*
   * VISUAL ONLY. Budget utilisation (spent / budget, the same ratio the
   * dashboard bar shows) from which the pet may glance at the budget with
   * mild concern. It never changes a calculation, a threshold or the
   * stressed state, which starts at the application's own limit.
   */
  approachRatio: 0.8,

  // Transitions seen this soon after the data loaded are baseline settling
  // (exchange rates arriving, first render), not real changes.
  baselineMs: 4000,

  // The same (type, id) event inside this window is one event (double effects, re-sends).
  dedupeMs: 1500,

  // Acknowledgements wait this long so a burst coalesces into one reaction.
  settleMs: 1200,

  // Pending reactions: at most this many; each also expires on its own.
  queueMax: 3,

  // Minimum gap between ANY two priority-1 acknowledgements.
  ackGlobalCooldownMs: 12000,

  // Priorities. Higher wins; taking a higher one drops pending lower ones.
  priority: { transition: 3, position: 2, ack: 1 },
};
