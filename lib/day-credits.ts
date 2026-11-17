import { HOLIDAY_COINS_PER_DAY } from "@/lib/badge-constants"

export { HOLIDAY_COINS_PER_DAY }

/** Fields used to split standard exempt vs coins-only exempt vs holiday credits. */
export type ExemptCreditDay = {
  isExcluded?: boolean
  isCoinOnlyExempt?: boolean
  isHoliday?: boolean
  wouldHaveQualified?: boolean
}

/**
 * Standard exempt: coin + extra-credit %.
 * Coins-only exempt: coin only (never added to the EC percentage).
 * Holiday: 5 coins + extra-credit % (skipping is still fine).
 */
export function countExemptCredits(dailyLog: ExemptCreditDay[]) {
  let exemptDayCredits = 0
  let coinOnlyExemptCredits = 0
  let holidayDaysCompleted = 0

  for (const day of dailyLog) {
    if (!day.isExcluded || !day.wouldHaveQualified) continue
    if (day.isHoliday) holidayDaysCompleted++
    else if (day.isCoinOnlyExempt) coinOnlyExemptCredits++
    else exemptDayCredits++
  }

  return {
    exemptDayCredits,
    coinOnlyExemptCredits,
    holidayDaysCompleted,
    holidayCoinsEarned: holidayDaysCompleted * HOLIDAY_COINS_PER_DAY,
  }
}

/** Days that count toward the extra-credit percentage numerator. */
export function countExtraCreditDayCredits(dailyLog: ExemptCreditDay[]) {
  const { exemptDayCredits, holidayDaysCompleted } = countExemptCredits(dailyLog)
  return exemptDayCredits + holidayDaysCompleted
}

export function isStandardExemptCredit(day: ExemptCreditDay) {
  return !!(day.isExcluded && !day.isCoinOnlyExempt && !day.isHoliday && day.wouldHaveQualified)
}

export function isCoinOnlyExemptCredit(day: ExemptCreditDay) {
  return !!(day.isExcluded && day.isCoinOnlyExempt && day.wouldHaveQualified)
}

export function isHolidayCredit(day: ExemptCreditDay) {
  return !!(day.isExcluded && day.isHoliday && day.wouldHaveQualified)
}

type CoinSummaryDay = ExemptCreditDay & {
  date?: string
  qualified?: boolean
  isDoubleCoins?: boolean
  isOverridden?: boolean
  overrideType?: string
}

/** Normalize a daily-log / ISO timestamp to YYYY-MM-DD for comparisons. */
export function toDateOnly(value: string | Date | null | undefined): string | null {
  if (!value) return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return value.toISOString().slice(0, 10)
  }
  const trimmed = String(value).trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10)
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

/** Base coins earned on a single day (before any 2x multiplier). */
export function coinsForDay(day: CoinSummaryDay): number {
  if (day.isExcluded) {
    if (!day.wouldHaveQualified) return 0
    if (day.isHoliday) return HOLIDAY_COINS_PER_DAY
    return 1 // standard exempt or coins-only exempt
  }
  if (!day.qualified) return 0
  let coins = 1
  if (day.isDoubleCoins && !day.isOverridden) coins += 1
  if (day.isOverridden && day.overrideType === "double_coins") coins += 1
  return coins
}

/**
 * Sum coins from a daily log, optionally doubling days on/after `multiplierFromDate`.
 * The 25-day badge multiplier is prospective from the unlock day — not retroactive.
 */
export function totalCoinsFromDailyLog(
  dailyLog: CoinSummaryDay[],
  multiplierFromDate?: string | null,
): number {
  const start = toDateOnly(multiplierFromDate)
  let total = 0
  for (const day of dailyLog) {
    const dayCoins = coinsForDay(day)
    if (dayCoins <= 0) continue
    const dayDate = toDateOnly(day.date)
    const apply2x = !!(start && dayDate && dayDate >= start)
    total += apply2x ? dayCoins * 2 : dayCoins
  }
  return total
}

/**
 * Recalculate coins / EC% from a daily log after overrides are applied.
 * Holiday days pay HOLIDAY_COINS_PER_DAY each (5 total, not 1+5).
 * `coins` is always the base total (no 2x). Use totalCoinsFromDailyLog for multiplier.
 */
export function summarizeDailyCoins(dailyLog: CoinSummaryDay[]) {
  const workingDayLogs = dailyLog.filter((d) => !d.isExcluded)
  const completedWorkingDays = workingDayLogs.length
  const qualifiedWorkingDays = workingDayLogs.filter((d) => d.qualified).length
  const {
    exemptDayCredits,
    coinOnlyExemptCredits,
    holidayDaysCompleted,
    holidayCoinsEarned,
  } = countExemptCredits(dailyLog)

  const doubleCoinsFromPeriod = workingDayLogs.filter(
    (d) => d.qualified && d.isDoubleCoins && !d.isOverridden,
  ).length
  const doubleCoinsFromOverrides = workingDayLogs.filter(
    (d) => d.qualified && d.isOverridden && d.overrideType === "double_coins",
  ).length
  const doubleCoinsEarned = doubleCoinsFromPeriod + doubleCoinsFromOverrides

  const percentComplete =
    completedWorkingDays > 0
      ? Math.round(
          ((qualifiedWorkingDays + exemptDayCredits + holidayDaysCompleted) / completedWorkingDays) *
            100 *
            10,
        ) / 10
      : 0

  const coins =
    qualifiedWorkingDays +
    exemptDayCredits +
    coinOnlyExemptCredits +
    doubleCoinsEarned +
    holidayCoinsEarned

  return {
    completedWorkingDays,
    qualifiedWorkingDays,
    exemptDayCredits,
    coinOnlyExemptCredits,
    holidayDaysCompleted,
    holidayCoinsEarned,
    doubleCoinsEarned,
    percentComplete,
    coins,
  }
}

export type CoinTotalExplanation = ReturnType<typeof summarizeDailyCoins> & {
  /** Base coins earned on days before the 2x unlock date. */
  baseBeforeMultiplier: number
  /** Base coins earned on/after the 2x unlock date. */
  baseOnOrAfterMultiplier: number
  /** totalCoinsFromDailyLog result (prospective 2x). */
  multipliedCoins: number
  /** Extra coins from the 2x badge (= baseOnOrAfterMultiplier when unlocked). */
  multiplierBonus: number
  multiplierFromDate: string | null
  periodAdjustment: number
  periodTotal: number
}

/**
 * Full arithmetic for a period coin total — for admin / debug UIs.
 * `periodAdjustment` is period-scoped only (not global redemptions).
 */
export function explainCoinTotal(
  dailyLog: CoinSummaryDay[],
  options?: {
    multiplierFromDate?: string | null
    periodAdjustment?: number
  },
): CoinTotalExplanation {
  const summary = summarizeDailyCoins(dailyLog)
  const start = toDateOnly(options?.multiplierFromDate)
  let baseBeforeMultiplier = 0
  let baseOnOrAfterMultiplier = 0

  for (const day of dailyLog) {
    const dayCoins = coinsForDay(day)
    if (dayCoins <= 0) continue
    const dayDate = toDateOnly(day.date)
    if (start && dayDate && dayDate >= start) {
      baseOnOrAfterMultiplier += dayCoins
    } else {
      baseBeforeMultiplier += dayCoins
    }
  }

  const multipliedCoins = totalCoinsFromDailyLog(dailyLog, start)
  const multiplierBonus = multipliedCoins - summary.coins
  const periodAdjustment = options?.periodAdjustment ?? 0

  return {
    ...summary,
    baseBeforeMultiplier,
    baseOnOrAfterMultiplier,
    multipliedCoins,
    multiplierBonus,
    multiplierFromDate: start,
    periodAdjustment,
    periodTotal: multipliedCoins + periodAdjustment,
  }
}
