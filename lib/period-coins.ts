/**
 * Shared period coin total used by student page + leaderboards.
 * baseCoins should already include day overrides (via summarizeDailyCoins).
 */
export function periodDisplayCoins(
  baseCoins: number,
  hasMultiplier: boolean,
  adjustment: number = 0,
): number {
  const base = Number(baseCoins) || 0
  const adj = Number(adjustment) || 0
  const multiplied = hasMultiplier ? base * 2 : base
  return multiplied + adj
}
