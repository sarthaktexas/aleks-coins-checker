import { totalCoinsFromDailyLog } from "@/lib/day-credits"

type CoinDay = Parameters<typeof totalCoinsFromDailyLog>[0][number]

/**
 * Shared period coin total used by student page + leaderboards.
 * Applies the 25-day 2x only on/after `multiplierFromDate`, then adds period adjustments.
 */
export function periodDisplayCoins(
  dailyLog: CoinDay[],
  multiplierFromDate: string | null | undefined,
  adjustment: number = 0,
): number {
  const multiplied = totalCoinsFromDailyLog(dailyLog || [], multiplierFromDate)
  return multiplied + (Number(adjustment) || 0)
}
