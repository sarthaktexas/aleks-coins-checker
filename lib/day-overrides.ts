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
} {
  return {
    ...day,
    qualified: override.override_type === "qualified",
    reason: override.reason || (day.reason as string) || "",
    isOverridden: true,
    overrideType: override.override_type,
  }
}
