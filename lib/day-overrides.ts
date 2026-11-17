/** Normalize YYYY-MM-DD (or Date-like) strings for override matching. */
export function normalizeOverrideDate(date: unknown): string {
  if (!date) return ""
  if (typeof date === "string") return date.trim().slice(0, 10)
  if (date instanceof Date && !Number.isNaN(date.getTime())) {
    const y = date.getUTCFullYear()
    const m = String(date.getUTCMonth() + 1).padStart(2, "0")
    const d = String(date.getUTCDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
  }
  return String(date).trim().slice(0, 10)
}

export type DayOverrideRow = {
  student_id: string
  day_number?: number
  date: string
  override_type: string
  reason?: string | null
}

/**
 * Build student_id (lowercase) → date → override map.
 * Keys are normalized so calendar/coin paths match the same rows.
 */
export function buildOverridesMap<T extends DayOverrideRow>(overrides: T[]) {
  const map = new Map<string, Map<string, T>>()
  for (const override of overrides) {
    const studentId = (override.student_id || "").toLowerCase().trim()
    const date = normalizeOverrideDate(override.date)
    if (!studentId || !date) continue
    if (!map.has(studentId)) map.set(studentId, new Map())
    map.get(studentId)!.set(date, override)
  }
  return map
}

/** Apply a single override onto a dailyLog day, stamping visibility flags. */
export function applyOverrideToDay<T extends Record<string, unknown>>(
  day: T,
  override: DayOverrideRow,
): T & {
  qualified: boolean
  reason: string
  isOverridden: true
  overrideType: string
  isExcluded?: boolean
  wouldHaveQualified?: boolean
} {
  // For double_coins, the day is qualified AND marked with the special override type
  const isQualified = override.override_type === "qualified" || override.override_type === "double_coins"
  const isNotQualified = override.override_type === "not_qualified"
  const wasExcluded = !!(day as { isExcluded?: boolean }).isExcluded
  const isHoliday = !!(day as { isHoliday?: boolean }).isHoliday

  const next: T & {
    qualified: boolean
    reason: string
    isOverridden: true
    overrideType: string
    isExcluded?: boolean
    wouldHaveQualified?: boolean
  } = {
    ...day,
    qualified: isQualified,
    reason: override.reason || (day.reason as string) || "",
    isOverridden: true,
    overrideType: override.override_type,
  }

  if (isQualified) {
    // Holidays keep exempt semantics so the 5-coin holiday path still applies.
    // Other exempt days become normal working qualifies for coins + streaks.
    if (wasExcluded && !isHoliday) {
      next.isExcluded = false
      next.wouldHaveQualified = true
    } else if (isHoliday) {
      next.wouldHaveQualified = true
    }
  } else if (isNotQualified && wasExcluded) {
    // Explicit miss on an exempt day should break streaks like a normal miss
    next.isExcluded = false
    next.wouldHaveQualified = false
  }

  return next
}

/**
 * Apply date-keyed overrides onto a daily log.
 * Used by coin totals and streak/badge calculations so overridden days count the same way.
 */
export function applyOverridesToDailyLog<T extends { date?: string }>(
  dailyLog: T[],
  overridesByDate: Map<string, DayOverrideRow> | undefined,
): T[] {
  if (!dailyLog?.length || !overridesByDate?.size) return dailyLog

  return dailyLog.map((day) => {
    const override = overridesByDate.get(normalizeOverrideDate(day.date))
    if (!override) return day
    return applyOverrideToDay(day as T & Record<string, unknown>, override)
  })
}
