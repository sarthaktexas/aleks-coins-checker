/** Named break presets admins can attach to holiday special days. */
export const HOLIDAY_BREAK_OPTIONS = [
  { value: "thanksgiving", label: "Thanksgiving Break", badgeType: "holiday_thanksgiving", emblem: "turkey" },
  { value: "winter_break", label: "Winter Break", badgeType: "holiday_winter", emblem: "tree" },
  { value: "july4", label: "July 4th", badgeType: "holiday_july4", emblem: "fireworks" },
  { value: "spring_break", label: "Spring Break", badgeType: "holiday_spring", emblem: "flower" },
] as const

export type HolidayBreakValue = (typeof HOLIDAY_BREAK_OPTIONS)[number]["value"]

export type HolidayBadgeType =
  | "holiday_thanksgiving"
  | "holiday_winter"
  | "holiday_july4"
  | "holiday_spring"

export const HOLIDAY_BADGE_TYPES: HolidayBadgeType[] = [
  "holiday_thanksgiving",
  "holiday_winter",
  "holiday_july4",
  "holiday_spring",
]

export function isHolidayBadgeType(value: string | undefined | null): value is HolidayBadgeType {
  return !!value && (HOLIDAY_BADGE_TYPES as string[]).includes(value)
}

/** Legacy generic `holiday` badge counts as winter for display. */
export function normalizeHolidayBadgeType(
  value: string | undefined | null,
): HolidayBadgeType | null {
  if (!value) return null
  if (value === "holiday") return "holiday_winter"
  if (isHolidayBadgeType(value)) return value
  return null
}

export function holidayBreakLabel(value: string | undefined | null): string {
  const match = HOLIDAY_BREAK_OPTIONS.find((option) => option.value === value)
  return match?.label ?? "Holiday"
}

export function holidayBadgeTypeForBreak(
  value: string | undefined | null,
): HolidayBadgeType {
  const match = HOLIDAY_BREAK_OPTIONS.find((option) => option.value === value)
  return match?.badgeType ?? "holiday_winter"
}

export function holidayBreakForBadgeType(badgeType: HolidayBadgeType): HolidayBreakValue {
  const match = HOLIDAY_BREAK_OPTIONS.find((option) => option.badgeType === badgeType)
  return match?.value ?? "winter_break"
}

export function holidayBadgeLabel(badgeType: HolidayBadgeType): string {
  const match = HOLIDAY_BREAK_OPTIONS.find((option) => option.badgeType === badgeType)
  return match?.label ?? "Holiday"
}

/** Short shelf name under the shield. */
export function holidayBadgeShortName(badgeType: HolidayBadgeType): string {
  switch (badgeType) {
    case "holiday_thanksgiving":
      return "Turkey"
    case "holiday_winter":
      return "Winter"
    case "holiday_july4":
      return "July 4"
    case "holiday_spring":
      return "Spring"
  }
}

/** Map date → break value (thanksgiving | spring_break | …). */
export type HolidayLabelMap = Record<string, string>

export function resolveHolidayBreak(
  date: string,
  labels: HolidayLabelMap | undefined | null,
): HolidayBreakValue {
  const raw = labels?.[date]
  if (HOLIDAY_BREAK_OPTIONS.some((option) => option.value === raw)) {
    return raw as HolidayBreakValue
  }
  // Default unlabeled holiday dates to winter (tree) for backwards compatibility
  return "winter_break"
}
