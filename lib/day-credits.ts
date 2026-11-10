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
  qualified?: boolean
  isDoubleCoins?: boolean
  isOverridden?: boolean
  overrideType?: string
}

/**
 * Recalculate coins / EC% from a daily log after overrides are applied.
 * Holiday days pay HOLIDAY_COINS_PER_DAY each (5 total, not 1+5).
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
