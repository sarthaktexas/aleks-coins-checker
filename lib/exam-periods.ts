// Get current year
export const CURRENT_YEAR = new Date().getFullYear()

// Define exam periods configuration
export const EXAM_PERIODS = {
  spring2025_exam1: {
    name: `Spring ${CURRENT_YEAR} - Exam 1 Period`,
    startDate: `${CURRENT_YEAR}-01-15`,
    endDate: `${CURRENT_YEAR}-02-10`,
    excludedDates: [`${CURRENT_YEAR}-01-20`, `${CURRENT_YEAR}-02-03`],
  },
  spring2025_exam2: {
    name: `Spring ${CURRENT_YEAR} - Exam 2 Period`,
    startDate: `${CURRENT_YEAR}-02-11`,
    endDate: `${CURRENT_YEAR}-03-10`,
    excludedDates: [`${CURRENT_YEAR}-02-17`, `${CURRENT_YEAR}-03-03`],
  },
  spring2025_exam3: {
    name: `Spring ${CURRENT_YEAR} - Exam 3 Period`,
    startDate: `${CURRENT_YEAR}-03-11`,
    endDate: `${CURRENT_YEAR}-04-07`,
    excludedDates: [`${CURRENT_YEAR}-03-17`, `${CURRENT_YEAR}-03-31`],
  },
  spring2025_final: {
    name: `Spring ${CURRENT_YEAR} - Final Exam Period`,
    startDate: `${CURRENT_YEAR}-04-08`,
    endDate: `${CURRENT_YEAR}-04-28`,
    excludedDates: [`${CURRENT_YEAR}-04-21`],
  },
  summer2025_exam1: {
    name: `Summer ${CURRENT_YEAR} - Exam 1 Period`,
    startDate: `${CURRENT_YEAR}-05-31`,
    endDate: `${CURRENT_YEAR}-06-23`,
    excludedDates: [`${CURRENT_YEAR}-06-07`, `${CURRENT_YEAR}-06-08`],
  },
  summer2025_exam2: {
    name: `Summer ${CURRENT_YEAR} - Exam 2 Period`,
    startDate: `${CURRENT_YEAR}-06-24`,
    endDate: `${CURRENT_YEAR}-07-17`,
    excludedDates: [`${CURRENT_YEAR}-07-04`, `${CURRENT_YEAR}-07-05`, `${CURRENT_YEAR}-07-06`],
  },
  summer2025_exam3: {
    name: `Summer ${CURRENT_YEAR} - Exam 3 Period`,
    startDate: `${CURRENT_YEAR}-07-18`,
    endDate: `${CURRENT_YEAR}-08-03`,
    excludedDates: [`${CURRENT_YEAR}-07-26`, `${CURRENT_YEAR}-07-27`],
  },
  summer2025_final: {
    name: `Summer ${CURRENT_YEAR} - Final Exam Period`,
    startDate: `${CURRENT_YEAR}-08-04`,
    endDate: `${CURRENT_YEAR}-08-10`,
    excludedDates: [],
  },
  fall2025_exam1: {
    name: `Fall ${CURRENT_YEAR} - Exam 1 Period`,
    startDate: `${CURRENT_YEAR}-08-26`,
    endDate: `${CURRENT_YEAR}-09-20`,
    excludedDates: [`${CURRENT_YEAR}-09-02`, `${CURRENT_YEAR}-09-16`],
  },
  fall2025_exam2: {
    name: `Fall ${CURRENT_YEAR} - Exam 2 Period`,
    startDate: `${CURRENT_YEAR}-09-21`,
    endDate: `${CURRENT_YEAR}-10-18`,
    excludedDates: [`${CURRENT_YEAR}-10-14`],
  },
  fall2025_exam3: {
    name: `Fall ${CURRENT_YEAR} - Exam 3 Period`,
    startDate: `${CURRENT_YEAR}-10-19`,
    endDate: `${CURRENT_YEAR}-11-15`,
    excludedDates: [`${CURRENT_YEAR}-11-11`],
  },
  fall2025_final: {
    name: `Fall ${CURRENT_YEAR} - Final Exam Period`,
    startDate: `${CURRENT_YEAR}-11-16`,
    endDate: `${CURRENT_YEAR}-12-13`,
    excludedDates: [
      `${CURRENT_YEAR}-11-25`,
      `${CURRENT_YEAR}-11-26`,
      `${CURRENT_YEAR}-11-27`,
      `${CURRENT_YEAR}-11-28`,
      `${CURRENT_YEAR}-11-29`,
    ],
  },
} as const

export type ExamPeriodKey = keyof typeof EXAM_PERIODS
export type ExamPeriod = typeof EXAM_PERIODS[ExamPeriodKey]

export type SemesterSeason = "spring" | "summer" | "fall" | "winter"

export type ParsedPeriodKey = {
  season: SemesterSeason
  year: number
  examSuffix: string
  semesterLabel: string
  semesterKey: string
}

const SEASON_ORDER: Record<SemesterSeason, number> = {
  spring: 1,
  summer: 2,
  fall: 3,
  winter: 4,
}

const SEASON_LABELS: Record<SemesterSeason, string> = {
  spring: "Spring",
  summer: "Summer",
  fall: "Fall",
  winter: "Winter",
}

const PERIOD_KEY_RE = /^(spring|summer|fall|winter)(\d{4})(?:_(.+))?$/i

/** Parse a period key like `spring2025_exam2` into season, year, and exam suffix. */
export function parsePeriodKey(periodKey: string): ParsedPeriodKey | null {
  const match = periodKey.trim().match(PERIOD_KEY_RE)
  if (!match) return null

  const season = match[1].toLowerCase() as SemesterSeason
  const year = Number(match[2])
  // Bare semester keys (legacy Exam 1, e.g. fall2025) → treat as exam1
  const examSuffix = match[3] ?? "exam1"

  return {
    season,
    year,
    examSuffix,
    semesterLabel: `${SEASON_LABELS[season]} ${year}`,
    semesterKey: `${season}${year}`,
  }
}

/** Human-readable exam label from a period key (e.g. Exam 2, Final). */
export function getExamLabel(periodKey: string): string {
  const parsed = parsePeriodKey(periodKey)
  if (!parsed) return periodKey

  if (parsed.examSuffix === "final") return "Final"
  const examMatch = parsed.examSuffix.match(/^exam(\d+)$/i)
  if (examMatch) return `Exam ${examMatch[1]}`
  return parsed.examSuffix.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Sort key for exam order within a semester (Exam 1 → Exam 2 → … → Final). */
export function getExamSortOrder(periodKey: string): number {
  const parsed = parsePeriodKey(periodKey)
  if (!parsed) return 999
  if (parsed.examSuffix === "final") return 100
  const examMatch = parsed.examSuffix.match(/^exam(\d+)$/i)
  if (examMatch) return Number(examMatch[1])
  return 50
}

export type SemesterGroup<T> = {
  semesterKey: string
  semesterLabel: string
  season: SemesterSeason | "other"
  year: number
  items: T[]
}

/**
 * Group items by semester/year parsed from a period key.
 * Semesters are sorted newest-first; items within a semester use `getItemKey` for exam order when possible.
 */
export function groupBySemester<T>(
  items: T[],
  getPeriodKey: (item: T) => string,
): SemesterGroup<T>[] {
  const groups = new Map<string, SemesterGroup<T>>()

  for (const item of items) {
    const periodKey = getPeriodKey(item)
    const parsed = parsePeriodKey(periodKey)
    const semesterKey = parsed?.semesterKey ?? `other:${periodKey}`
    const existing = groups.get(semesterKey)

    if (existing) {
      existing.items.push(item)
    } else {
      groups.set(semesterKey, {
        semesterKey,
        semesterLabel: parsed?.semesterLabel ?? periodKey,
        season: parsed?.season ?? "other",
        year: parsed?.year ?? 0,
        items: [item],
      })
    }
  }

  const sorted = Array.from(groups.values()).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year
    const aOrder = a.season === "other" ? 99 : SEASON_ORDER[a.season]
    const bOrder = b.season === "other" ? 99 : SEASON_ORDER[b.season]
    return bOrder - aOrder
  })

  for (const group of sorted) {
    group.items.sort((a, b) => getExamSortOrder(getPeriodKey(a)) - getExamSortOrder(getPeriodKey(b)))
  }

  return sorted
}

export type ExamType = "exam1" | "exam2" | "exam3" | "final"

export const EXAM_TYPE_OPTIONS: { value: ExamType; label: string; suffix: string }[] = [
  { value: "exam1", label: "Exam 1", suffix: "_exam1" },
  { value: "exam2", label: "Exam 2", suffix: "_exam2" },
  { value: "exam3", label: "Exam 3", suffix: "_exam3" },
  { value: "final", label: "Final", suffix: "_final" },
]

export const SEMESTER_OPTIONS: { value: SemesterSeason; label: string }[] = [
  { value: "spring", label: "Spring" },
  { value: "summer", label: "Summer" },
  { value: "fall", label: "Fall" },
  { value: "winter", label: "Winter" },
]

/** Build a period key from semester parts, e.g. spring + 2026 + exam2 → spring2026_exam2 */
export function buildPeriodKey(season: SemesterSeason, year: number, examType: ExamType): string {
  const option = EXAM_TYPE_OPTIONS.find((o) => o.value === examType)
  return `${season}${year}${option?.suffix ?? "_exam1"}`
}

/** Build a display name from semester parts */
export function buildPeriodName(season: SemesterSeason, year: number, examType: ExamType): string {
  const option = EXAM_TYPE_OPTIONS.find((o) => o.value === examType)
  const examLabel = option?.label ?? "Exam"
  const periodLabel = examType === "final" ? "Final Exam Period" : `${examLabel} Period`
  return `${SEASON_LABELS[season]} ${year} - ${periodLabel}`
}

/** Infer exam type from a period key */
export function getExamTypeFromKey(periodKey: string): ExamType {
  const parsed = parsePeriodKey(periodKey)
  if (!parsed?.examSuffix) return "exam1"
  if (parsed.examSuffix === "final") return "final"
  const examMatch = parsed.examSuffix.match(/^exam(\d+)$/i)
  if (examMatch?.[1] === "1") return "exam1"
  if (examMatch?.[1] === "2") return "exam2"
  if (examMatch?.[1] === "3") return "exam3"
  return "exam1"
}
