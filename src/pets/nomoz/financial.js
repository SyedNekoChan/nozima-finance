import { FINANCE } from '../finance/config.js';

/*
 * How NOMOZ.EXE reacts to financial transitions and successful operations.
 * Pure data: each reaction names triggers (from the shared financial
 * adapter) and candidate behaviors of THIS pet. Priority, TTL, cooldown and
 * candidate weights are tuned here; the shared director handles queueing,
 * dedupe, coalescing and hand-off at safe behavior boundaries.
 *
 * Candidates that are not eligible in the current mood are skipped, so a
 * reaction can never override the stressed / prosperous appearance. Add a
 * reaction (or a trigger for a new transaction type) by appending an
 * entry; remove or disable one with `enabled: false`.
 */
const P = FINANCE.priority;

export const FINANCIAL_REACTIONS = [
  // 2. essential transitions
  {
    id: 'stress-entered',
    triggers: [{ transition: 'stress-entered' }, { event: 'OVERSPEND' }],
    priority: P.transition,
    ttl: 30000,
    cooldown: 20000,
    candidates: [
      { id: 'startle', weight: 3 },
      { id: 'flinch', weight: 2 },
      { id: 'unsettledLook', weight: 2 },
      { id: 'glitch', weight: 1 },
    ],
  },
  {
    id: 'stress-recovered',
    triggers: [{ transition: 'stress-recovered' }],
    priority: P.transition,
    ttl: 30000,
    cooldown: 20000,
    candidates: [
      { id: 'relief', weight: 5 },
      { id: 'coinInspect', weight: 1 },
    ],
  },
  {
    id: 'position-changed',
    triggers: [{ transition: 'position-changed' }],
    priority: P.position,
    ttl: 25000,
    cooldown: 60000,
    candidates: [
      { id: 'interest', weight: 3 },
      { id: 'look', weight: 1 },
    ],
  },

  // 3. meaningful, successful operations (one coalesced slot: group 'ack')
  {
    id: 'ack-income',
    group: 'ack',
    triggers: [{ event: 'INCOME' }],
    ttl: 20000,
    cooldown: 25000,
    candidates: [
      { id: 'incomeGlance', weight: 3 },
      { id: 'coinInspect', weight: 2 },
      { id: 'crown', weight: 1 },
    ],
  },
  {
    id: 'ack-expense',
    group: 'ack',
    triggers: [{ event: 'EXPENSE' }],
    ttl: 20000,
    cooldown: 25000,
    candidates: [
      { id: 'expenseGlance', weight: 4 },
      { id: 'ponderSymbol', weight: 1 },
      { id: 'nervousLook', weight: 2 }, // only eligible while stressed
    ],
  },
  {
    id: 'ack-transfer',
    group: 'ack',
    triggers: [{ event: 'TRANSFER' }],
    ttl: 20000,
    cooldown: 30000,
    candidates: [
      { id: 'transferNod', weight: 3 },
      { id: 'look', weight: 1 },
    ],
  },
];
