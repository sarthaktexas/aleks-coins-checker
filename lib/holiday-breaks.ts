/** Named break presets admins can attach to holiday special days. */
export const HOLIDAY_BREAK_OPTIONS = [
  { value: "thanksgiving", label: "Thanksgiving Break" },
  { value: "spring_break", label: "Spring Break" },
  { value: "winter_break", label: "Winter Break" },
  { value: "other", label: "Holiday" },
] as const

export type HolidayBreakValue = (typeof HOLIDAY_BREAK_OPTIONS)[number]["value"]

export function holidayBreakLabel(value: string | undefined | null): string {
  const match = HOLIDAY_BREAK_OPTIONS.find((option) => option.value === value)
  return match?.label ?? "Holiday"
}

/** Map date → break value (thanksgiving | spring_break | …). */
export type HolidayLabelMap = Record<string, string>
