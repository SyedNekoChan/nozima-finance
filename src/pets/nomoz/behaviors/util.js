// Per-mood weights: W(idle, content, stressed). 0 = never in that state.
export const W = (idle, content = 0, stressed = 0) => ({ idle, content, stressed });
