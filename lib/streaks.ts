/**
 * Pure streak math (no DB). Shared by badge processing and student-facing shelf text.
 */

export type StreakDay = {
  date?: string
  qualified: boolean
  isExcluded?: boolean
  isOverridden?: boolean
  minutes?: number
  topics?: number
  isHoliday?: boolean
  wouldHaveQualified?: boolean
  holidayBreak?: string
}

export type StreakResult = {
  currentStreak: number
  maxStreak: number
  maxStreakEndIndex: number
}

/** Day counts toward a streak: qualified, and not an untouched exempt/holiday day. */
function countsTowardStreak(day: StreakDay): boolean {
  // Qualifying overrides must count even if the day was previously exempt.
  if (day.isOverridden && day.qualified) return true
  if (day.isExcluded) return false
  return !!day.qualified
}

function breaksStreak(day: StreakDay): boolean {
  if (day.isOverridden && day.qualified) return false
  if (day.isExcluded) return false
  return !day.qualified
}

/** Trailing placeholder / future day with no attempt and no override. */
function isTrailingEmptyDay(day: StreakDay): boolean {
  if (day.isOverridden) return false
  if (day.isExcluded) return false
  if (day.qualified) return false
  const minutes = day.minutes ?? 0
  const topics = day.topics ?? 0
  return minutes <= 0 && topics <= 0
}

/**
 * Calculate current and max streaks from a daily log.
 * Current streak walks backward from the most recent real day (skips trailing empty days).
 * Override-qualified days always count, including days that were exempt before the override.
 */
export function calculateStreaks(dailyLog: StreakDay[]): StreakResult {
  let run = 0
  let maxStreak = 0
  let maxStreakEndIndex = -1

  for (let i = 0; i < dailyLog.length; i++) {
    const day = dailyLog[i]

    if (day.isExcluded && !(day.isOverridden && day.qualified)) {
      continue
    }

    if (countsTowardStreak(day)) {
      run++
      if (run > maxStreak) {
        maxStreak = run
        maxStreakEndIndex = i
      }
    } else if (breaksStreak(day)) {
      run = 0
    }
  }

  // Current streak: consecutive qualifies ending at the latest non-empty day
  let currentStreak = 0
  for (let i = dailyLog.length - 1; i >= 0; i--) {
    const day = dailyLog[i]

    if (day.isExcluded && !(day.isOverridden && day.qualified)) {
      continue
    }

    if (currentStreak === 0 && isTrailingEmptyDay(day)) {
      continue
    }

    if (countsTowardStreak(day)) {
      currentStreak++
      continue
    }

    if (breaksStreak(day)) {
      break
    }
  }

  return { currentStreak, maxStreak, maxStreakEndIndex }
}

/**
 * Best max streak and current streak across several period logs (already override-aware).
 * `currentLogIndex` picks which log supplies the "current" streak (usually the latest period).
 */
export function combinePeriodStreaks(
  periodLogs: StreakDay[][],
  currentLogIndex: number = 0,
): StreakResult {
  let maxStreak = 0
  let maxStreakEndIndex = -1
  let currentStreak = 0

  periodLogs.forEach((log, index) => {
    if (!log?.length) return
    const result = calculateStreaks(log)
    if (result.maxStreak > maxStreak) {
      maxStreak = result.maxStreak
      maxStreakEndIndex = result.maxStreakEndIndex
    }
    if (index === currentLogIndex) {
      currentStreak = result.currentStreak
    }
  })

  return { currentStreak, maxStreak, maxStreakEndIndex }
}
