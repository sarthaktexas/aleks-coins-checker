/** Fields used to split standard exempt vs coins-only exempt credits. */
export type ExemptCreditDay = {
  isExcluded?: boolean
  isCoinOnlyExempt?: boolean
  wouldHaveQualified?: boolean
}

/**
 * Standard exempt: coin + extra-credit %.
 * Coins-only exempt: coin only (never added to the EC percentage).
 */
export function countExemptCredits(dailyLog: ExemptCreditDay[]) {
  let exemptDayCredits = 0
  let coinOnlyExemptCredits = 0

  for (const day of dailyLog) {
    if (!day.isExcluded || !day.wouldHaveQualified) continue
    if (day.isCoinOnlyExempt) coinOnlyExemptCredits++
    else exemptDayCredits++
  }

  return { exemptDayCredits, coinOnlyExemptCredits }
}

export function isStandardExemptCredit(day: ExemptCreditDay) {
  return !!(day.isExcluded && !day.isCoinOnlyExempt && day.wouldHaveQualified)
}

export function isCoinOnlyExemptCredit(day: ExemptCreditDay) {
  return !!(day.isExcluded && day.isCoinOnlyExempt && day.wouldHaveQualified)
}
