import { sql } from "@vercel/postgres"
import { parsePeriodKey } from "@/lib/exam-periods"
import { toDateOnly, totalCoinsFromDailyLog } from "@/lib/day-credits"
import { GRAND_MASTER_COIN_THRESHOLD } from "@/lib/badge-constants"
import {
  applyOverridesToDailyLog,
  buildOverridesMap,
  type DayOverrideRow,
} from "@/lib/day-overrides"
import {
  calculateStreaks,
  type StreakDay,
} from "@/lib/streaks"
import {
  HOLIDAY_BADGE_TYPES,
  HOLIDAY_BREAK_OPTIONS,
  holidayBadgeTypeForBreak,
  holidayBreakLabel,
  resolveHolidayBreak,
  type HolidayBadgeType,
  type HolidayBreakValue,
  type HolidayLabelMap,
} from "@/lib/holiday-breaks"

export { calculateStreaks, combinePeriodStreaks } from "@/lib/streaks"
export type { StreakDay, StreakResult } from "@/lib/streaks"

export type BadgeType =
  | "streak_10_day"
  | "streak_25_day"
  | "holiday"
  | HolidayBadgeType
  | "grand_master"

export { GRAND_MASTER_COIN_THRESHOLD }

export type Badge = {
  id: number
  student_id: string
  badge_type: BadgeType
  earned_at: string
  streak_count: number
  period: string
  section_number: string
  metadata?: Record<string, any>
}

export type BadgeDefinition = {
  type: BadgeType
  name: string
  description: string
  icon: string
  requirement: number
  reward?: string
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    type: "streak_10_day",
    name: "10-Day Streak",
    description: "Complete ALEKS 10 days in a row",
    icon: "🔥",
    requirement: 10,
    reward: "10 bonus coins",
  },
  {
    type: "streak_25_day",
    name: "25-Day Streak",
    description: "Complete ALEKS 25 days in a row",
    icon: "⭐",
    requirement: 25,
    reward: "2x coins from unlock day forward",
  },
  {
    type: "holiday_thanksgiving",
    name: "Thanksgiving",
    description: "Qualify on a Thanksgiving Break holiday day",
    icon: "🦃",
    requirement: 1,
    reward: "5 coins per holiday day",
  },
  {
    type: "holiday_winter",
    name: "Winter Break",
    description: "Qualify on a Winter Break holiday day",
    icon: "🎄",
    requirement: 1,
    reward: "5 coins per holiday day",
  },
  {
    type: "holiday_july4",
    name: "July 4th",
    description: "Qualify on a July 4th holiday day",
    icon: "🎆",
    requirement: 1,
    reward: "5 coins per holiday day",
  },
  {
    type: "holiday_spring",
    name: "Spring Break",
    description: "Qualify on a Spring Break holiday day",
    icon: "🌸",
    requirement: 1,
    reward: "5 coins per holiday day",
  },
  {
    type: "grand_master",
    name: "Grand Master",
    description: `Earn ${GRAND_MASTER_COIN_THRESHOLD}+ coins across an entire semester`,
    icon: "🧙",
    requirement: GRAND_MASTER_COIN_THRESHOLD,
    reward: "Wizard badge",
  },
]

/** Skip repeated DDL on warm serverless instances (egress + latency). */
let badgesSchemaReady = false

/**
 * Ensure the student_badges table exists
 */
export async function ensureBadgesSchema() {
  if (badgesSchemaReady) return
  await sql`
    CREATE TABLE IF NOT EXISTS student_badges (
      id SERIAL PRIMARY KEY,
      student_id VARCHAR(255) NOT NULL,
      badge_type VARCHAR(50) NOT NULL,
      earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      streak_count INTEGER NOT NULL,
      period VARCHAR(100) NOT NULL,
      section_number VARCHAR(50) NOT NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      UNIQUE(student_id, badge_type, period, section_number)
    )
  `

  // Add index for faster lookups
  await sql`
    CREATE INDEX IF NOT EXISTS idx_student_badges_student_id 
    ON student_badges(student_id)
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_student_badges_badge_type 
    ON student_badges(badge_type)
  `

  // Once per exam period, even if the student changes section.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_student_badges_ten_day_period
    ON student_badges (student_id, period)
    WHERE badge_type = 'streak_10_day'
  `

  // The 25-day multiplier unlocks once, ever.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_student_badges_25_once
    ON student_badges (student_id)
    WHERE badge_type = 'streak_25_day'
  `

  // Legacy generic holiday badge (kept for older rows).
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_student_badges_holiday_once
    ON student_badges (student_id)
    WHERE badge_type = 'holiday'
  `

  // One unlock per holiday design, ever.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_student_badges_holiday_thanksgiving_once
    ON student_badges (student_id)
    WHERE badge_type = 'holiday_thanksgiving'
  `
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_student_badges_holiday_winter_once
    ON student_badges (student_id)
    WHERE badge_type = 'holiday_winter'
  `
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_student_badges_holiday_july4_once
    ON student_badges (student_id)
    WHERE badge_type = 'holiday_july4'
  `
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_student_badges_holiday_spring_once
    ON student_badges (student_id)
    WHERE badge_type = 'holiday_spring'
  `

  // Grand Master unlocks once, ever (100+ coins in any single semester).
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_student_badges_grand_master_once
    ON student_badges (student_id)
    WHERE badge_type = 'grand_master'
  `
  badgesSchemaReady = true
}

/**
 * Coins are only for a streak that just landed on 10.
 * A longer or already-broken streak is retroactive: badge only, no coins.
 */
export function shouldAwardTenDayCoins(dailyLog: StreakDay[]): boolean {
  return calculateStreaks(dailyLog).currentStreak === 10
}

/** A student can earn the 10-day reward once per exam period, at most this many periods. */
export const TEN_DAY_REWARD_LIMIT = 3

/**
 * True when this exam period has not already unlocked the 10-day reward
 * and the student is still under the 3-period cap.
 */
export function canGrantTenDayUnlock(existingPeriods: string[], period: string): boolean {
  const periods = new Set(existingPeriods.filter(Boolean))
  if (periods.has(period)) return false
  return periods.size < TEN_DAY_REWARD_LIMIT
}

/**
 * Check if a student has earned a badge
 */
export async function hasEarnedBadge(
  studentId: string,
  badgeType: BadgeType,
  period: string,
  sectionNumber: string
): Promise<boolean> {
  try {
    const result = await sql`
      SELECT id FROM student_badges
      WHERE student_id = ${studentId.toLowerCase()}
        AND badge_type = ${badgeType}
        AND period = ${period}
        AND section_number = ${sectionNumber}
      LIMIT 1
    `
    return result.rows.length > 0
  } catch (error) {
    console.error("Error checking badge:", error)
    return false
  }
}

/**
 * Calendar date (YYYY-MM-DD) of the day a streak first hit `milestone`.
 */
export function findStreakMilestoneDate(
  dailyLog: Array<{ qualified: boolean; isExcluded?: boolean; date?: string }>,
  milestone: number,
): string | null {
  let streak = 0
  for (const day of dailyLog) {
    if (day.isExcluded) continue
    if (day.qualified) {
      streak++
      if (streak === milestone) {
        return toDateOnly(day.date)
      }
    } else {
      streak = 0
    }
  }
  return null
}

/**
 * Check if a student has the 25-day badge (for 2x multiplier)
 * Checks across ALL periods - once earned, it's permanent
 */
export async function hasStreakMultiplier(studentId: string): Promise<boolean> {
  try {
    const result = await sql`
      SELECT id FROM student_badges
      WHERE student_id = ${studentId.toLowerCase()}
        AND badge_type = 'streak_25_day'
      LIMIT 1
    `
    return result.rows.length > 0
  } catch (error) {
    console.error("Error checking multiplier badge:", error)
    return false
  }
}

/**
 * Date (YYYY-MM-DD) when the 25-day 2x multiplier starts for this student.
 * Prefer stored metadata, then the day streak hit 25 in the award period's log,
 * then earned_at. Backfills metadata when resolved from the log.
 */
export async function getStreakMultiplierStartDate(studentId: string): Promise<string | null> {
  const normalizedId = studentId.toLowerCase()
  try {
    const result = await sql`
      SELECT id, earned_at, period, section_number, metadata
      FROM student_badges
      WHERE student_id = ${normalizedId}
        AND badge_type = 'streak_25_day'
      LIMIT 1
    `
    if (result.rows.length === 0) return null

    const badge = result.rows[0]
    let metadata: Record<string, any> = {}
    if (badge.metadata) {
      metadata =
        typeof badge.metadata === "string" ? JSON.parse(badge.metadata) : badge.metadata
    }
    if (metadata.multiplierStartsOn) {
      return toDateOnly(metadata.multiplierStartsOn)
    }

    // Resolve from the period/section where the badge was awarded
    let startDate: string | null = null
    try {
      const dataResult = await sql`
        SELECT data
        FROM student_data
        WHERE period = ${badge.period}
          AND COALESCE(section_number, 'default') = ${badge.section_number || "default"}
        ORDER BY uploaded_at DESC
        LIMIT 1
      `
      if (dataResult.rows.length > 0) {
        let studentData: any = dataResult.rows[0].data
        if (typeof studentData === "string") {
          studentData = JSON.parse(studentData)
        }
        const student = studentData?.[normalizedId]
        if (student?.dailyLog) {
          const overrides = await fetchDayOverridesForStudent(normalizedId)
          const effectiveLog = dailyLogWithOverrides(normalizedId, student.dailyLog, overrides)
          startDate = findStreakMilestoneDate(effectiveLog, 25)
        }
      }
    } catch (resolveError) {
      console.error("Error resolving multiplier start from daily log:", resolveError)
    }

    if (!startDate) {
      startDate = toDateOnly(badge.earned_at)
    }

    if (startDate) {
      try {
        const nextMeta = { ...metadata, multiplierStartsOn: startDate }
        await sql`
          UPDATE student_badges
          SET metadata = ${JSON.stringify(nextMeta)}::jsonb
          WHERE id = ${badge.id}
        `
      } catch (backfillError) {
        console.error("Error backfilling multiplierStartsOn:", backfillError)
      }
    }

    return startDate
  } catch (error) {
    console.error("Error getting multiplier start date:", error)
    return null
  }
}

/**
 * Map of student_id -> multiplier start date for all students with the 25-day badge.
 * Uses metadata.multiplierStartsOn when present, otherwise earned_at (YYYY-MM-DD).
 */
export async function getStreakMultiplierStartDates(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const result = await sql`
      SELECT student_id, earned_at, metadata
      FROM student_badges
      WHERE badge_type = 'streak_25_day'
    `
    for (const row of result.rows) {
      const id = String(row.student_id || "")
        .toLowerCase()
        .trim()
      if (!id) continue
      let metadata: Record<string, any> = {}
      if (row.metadata) {
        metadata = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata
      }
      const start =
        toDateOnly(metadata.multiplierStartsOn) || toDateOnly(row.earned_at)
      if (start) map.set(id, start)
    }
  } catch (error) {
    console.error("Error fetching multiplier start dates:", error)
  }
  return map
}

/**
 * Check if a student already has a specific holiday design badge (once, ever).
 * Also treats legacy generic `holiday` as unlocking winter.
 */
export async function hasHolidayBadge(
  studentId: string,
  badgeType: HolidayBadgeType | "holiday" = "holiday",
): Promise<boolean> {
  try {
    if (badgeType === "holiday" || badgeType === "holiday_winter") {
      const result = await sql`
        SELECT id FROM student_badges
        WHERE student_id = ${studentId.toLowerCase()}
          AND badge_type IN ('holiday', 'holiday_winter')
        LIMIT 1
      `
      return result.rows.length > 0
    }

    const result = await sql`
      SELECT id FROM student_badges
      WHERE student_id = ${studentId.toLowerCase()}
        AND badge_type = ${badgeType}
      LIMIT 1
    `
    return result.rows.length > 0
  } catch (error) {
    console.error("Error checking holiday badge:", error)
    return false
  }
}

/** Count holiday days the student qualified on. */
export function countHolidayDaysCompleted(
  dailyLog: Array<{ isHoliday?: boolean; wouldHaveQualified?: boolean }>,
): number {
  return dailyLog.filter((day) => day.isHoliday && day.wouldHaveQualified).length
}

type HolidayDay = {
  date?: string
  isHoliday?: boolean
  wouldHaveQualified?: boolean
  holidayBreak?: string
}

/** Which holiday designs were unlocked by qualifying days in this log. */
export function holidayBadgeTypesEarnedFromLog(
  dailyLog: HolidayDay[],
  holidayLabels?: HolidayLabelMap,
): Map<HolidayBadgeType, number> {
  const counts = new Map<HolidayBadgeType, number>()

  for (const day of dailyLog) {
    if (!day.isHoliday || !day.wouldHaveQualified) continue
    const breakValue =
      (day.holidayBreak as HolidayBreakValue | undefined) ||
      (day.date ? resolveHolidayBreak(day.date, holidayLabels) : "winter_break")
    const badgeType = holidayBadgeTypeForBreak(breakValue)
    counts.set(badgeType, (counts.get(badgeType) || 0) + 1)
  }

  return counts
}

/**
 * Check if a student already has the Grand Master badge (once, ever)
 */
export async function hasGrandMasterBadge(studentId: string): Promise<boolean> {
  try {
    const result = await sql`
      SELECT id FROM student_badges
      WHERE student_id = ${studentId.toLowerCase()}
        AND badge_type = 'grand_master'
      LIMIT 1
    `
    return result.rows.length > 0
  } catch (error) {
    console.error("Error checking grand master badge:", error)
    return false
  }
}

/**
 * Sum a student's coins across every period in the same semester as `periodKey`.
 * Matches the student-facing total: override-aware daily coins, 2x only on days
 * on/after the 25-day unlock date, plus period-specific adjustments (not redemptions).
 */
export async function getStudentSemesterCoins(studentId: string, periodKey: string): Promise<number> {
  const parsed = parsePeriodKey(periodKey)
  if (!parsed) return 0

  const semesterKey = parsed.semesterKey
  const likePattern = `${semesterKey}%`
  const normalizedId = studentId.toLowerCase()

  try {
    const overrides = await fetchDayOverridesForStudent(normalizedId)
    const multiplierFromDate = await getStreakMultiplierStartDate(normalizedId)

    const result = await sql`
      SELECT data, period, COALESCE(section_number, 'default') as section_number, uploaded_at
      FROM student_data
      WHERE period LIKE ${likePattern}
      ORDER BY uploaded_at DESC
    `

    const latestByPeriodSection = new Map<string, any>()
    for (const row of result.rows) {
      const key = `${row.period}_${row.section_number}`
      if (!latestByPeriodSection.has(key)) {
        latestByPeriodSection.set(key, row)
      }
    }

    // Period-specific adjustments keyed by period_section (exclude redemptions)
    const adjustmentsByPeriodSection = new Map<string, number>()
    try {
      const adjustmentsResult = await sql`
        SELECT period, COALESCE(section_number, 'default') as section_number, adjustment_amount
        FROM coin_adjustments
        WHERE student_id = ${normalizedId}
          AND is_active = true
          AND period IS NOT NULL
          AND period != '__GLOBAL__'
          AND period LIKE ${likePattern}
      `
      for (const adj of adjustmentsResult.rows) {
        const key = `${adj.period}_${adj.section_number}`
        adjustmentsByPeriodSection.set(
          key,
          (adjustmentsByPeriodSection.get(key) || 0) + Number(adj.adjustment_amount || 0),
        )
      }
    } catch (adjError) {
      console.error("Error fetching adjustments for semester coins:", adjError)
    }

    // One contribution per exam period: best section by (multiplied coins + adjustments)
    const coinsByPeriod = new Map<string, number>()

    for (const row of latestByPeriodSection.values()) {
      let studentData: any = row.data
      if (typeof studentData === "string") {
        try {
          studentData = JSON.parse(studentData)
        } catch {
          continue
        }
      }
      const student = studentData?.[normalizedId]
      if (!student?.dailyLog) continue

      const effectiveLog = dailyLogWithOverrides(normalizedId, student.dailyLog, overrides)
      const periodCoins = totalCoinsFromDailyLog(effectiveLog, multiplierFromDate)
      const adjustment =
        adjustmentsByPeriodSection.get(`${row.period}_${row.section_number}`) || 0
      const periodTotal = periodCoins + adjustment
      const existing = coinsByPeriod.get(row.period) || 0
      if (periodTotal > existing) coinsByPeriod.set(row.period, periodTotal)
    }

    let total = 0
    for (const coins of coinsByPeriod.values()) total += coins
    return total
  } catch (error) {
    console.error("Error computing semester coins:", error)
    return 0
  }
}

/**
 * Award a badge to a student
 */
export async function awardBadge(
  studentId: string,
  badgeType: BadgeType,
  streakCount: number,
  period: string,
  sectionNumber: string,
  metadata?: Record<string, any>
): Promise<Badge | null> {
  try {
    const result = await sql`
      INSERT INTO student_badges (
        student_id,
        badge_type,
        streak_count,
        period,
        section_number,
        metadata
      )
      VALUES (
        ${studentId.toLowerCase()},
        ${badgeType},
        ${streakCount},
        ${period},
        ${sectionNumber},
        ${JSON.stringify(metadata || {})}
      )
      ON CONFLICT (student_id, badge_type, period, section_number)
      DO NOTHING
      RETURNING *
    `

    if (result.rows.length === 0) {
      return null // Badge already exists
    }

    return result.rows[0] as Badge
  } catch (error) {
    console.error("Error awarding badge:", error)
    return null
  }
}

/**
 * Get all badges for a student
 */
export async function getStudentBadges(studentId: string): Promise<Badge[]> {
  try {
    const result = await sql`
      SELECT * FROM student_badges
      WHERE student_id = ${studentId.toLowerCase()}
      ORDER BY earned_at DESC
    `
    return result.rows as Badge[]
  } catch (error) {
    console.error("Error fetching student badges:", error)
    return []
  }
}

/**
 * Get badges for a specific period
 */
export async function getStudentBadgesForPeriod(
  studentId: string,
  period: string,
  sectionNumber: string
): Promise<Badge[]> {
  try {
    const result = await sql`
      SELECT * FROM student_badges
      WHERE student_id = ${studentId.toLowerCase()}
        AND period = ${period}
        AND section_number = ${sectionNumber}
      ORDER BY earned_at DESC
    `
    return result.rows as Badge[]
  } catch (error) {
    console.error("Error fetching period badges:", error)
    return []
  }
}

/**
 * Load day overrides for a student (best-effort; empty on failure).
 */
export async function fetchDayOverridesForStudent(studentId: string): Promise<DayOverrideRow[]> {
  try {
    const result = await sql`
      SELECT student_id, day_number, date, override_type, reason
      FROM student_day_overrides
      WHERE student_id = ${studentId.toLowerCase().trim()}
    `
    return result.rows as DayOverrideRow[]
  } catch (error) {
    console.error("Error fetching day overrides for badges:", error)
    return []
  }
}

/**
 * Apply overrides onto a daily log so streak/badge math matches coin/calendar views.
 */
export function dailyLogWithOverrides(
  studentId: string,
  dailyLog: StreakDay[],
  overrides: DayOverrideRow[],
): StreakDay[] {
  if (!dailyLog?.length || !overrides?.length) return dailyLog
  const byStudent = buildOverridesMap(overrides)
  const forStudent = byStudent.get(studentId.toLowerCase().trim())
  return applyOverridesToDailyLog(dailyLog, forStudent)
}

/**
 * Process badges for a student based on their daily log
 * Awards badges and coin bonuses as needed.
 * Day overrides (qualified / double_coins / not_qualified) are included in streak math.
 */
export async function processBadgesForStudent(
  studentId: string,
  studentName: string,
  dailyLog: StreakDay[],
  period: string,
  sectionNumber: string,
  adminEmail: string = "system",
  options: {
    awardCoins?: boolean
    dayOverrides?: DayOverrideRow[]
    semesterCoinTotal?: number
    holidayLabels?: HolidayLabelMap
  } = {}
): Promise<{ badgesEarned: Badge[]; coinsAwarded: number; error?: string }> {
  const badgesEarned: Badge[] = []
  let coinsAwarded = 0

  try {
    if (!Array.isArray(dailyLog)) {
      return { badgesEarned, coinsAwarded }
    }

    // Include overridden days so 10/25-day badges match calendar/coin qualification
    const overrides =
      options.dayOverrides !== undefined
        ? options.dayOverrides
        : await fetchDayOverridesForStudent(studentId)
    const effectiveLog = dailyLogWithOverrides(studentId, dailyLog, overrides)

    // Calculate streaks from the override-aware log
    const { maxStreak } = calculateStreaks(effectiveLog)
    const payTenDayCoins = options.awardCoins !== false && shouldAwardTenDayCoins(effectiveLog)
    const holidayDesignCounts = holidayBadgeTypesEarnedFromLog(effectiveLog, options.holidayLabels)

    // Check for 10-day streak badge: once per exam period, up to 3 periods.
    if (maxStreak >= 10) {
      const existing = await sql`
        SELECT DISTINCT period
        FROM student_badges
        WHERE student_id = ${studentId.toLowerCase()}
          AND badge_type = 'streak_10_day'
      `
      const existingPeriods = existing.rows.map((row) => String(row.period))

      if (canGrantTenDayUnlock(existingPeriods, period)) {
        const badge = await awardBadge(studentId, "streak_10_day", maxStreak, period, sectionNumber, {
          maxStreak,
          coinsAwarded: payTenDayCoins,
        })

        if (badge) {
          badgesEarned.push(badge)

          // Live 10-day streaks pay 10 coins once for this period. Retroactive awards are badges only.
          if (payTenDayCoins) {
            await sql`
              INSERT INTO coin_adjustments (
                student_id,
                student_name,
                period,
                section_number,
                adjustment_amount,
                reason,
                created_by,
                is_active
              )
              VALUES (
                ${studentId.toLowerCase()},
                ${studentName},
                ${period},
                ${sectionNumber},
                10,
                'Badge earned: 10-Day Streak',
                ${adminEmail},
                true
              )
            `
            coinsAwarded += 10
          }
        }
      }
    }

    // Check for 25-day streak badge
    const hasTwentyFive = await hasStreakMultiplier(studentId)
    if (maxStreak >= 25 && !hasTwentyFive) {
      const multiplierStartsOn = findStreakMilestoneDate(effectiveLog, 25)
      const badge = await awardBadge(studentId, "streak_25_day", maxStreak, period, sectionNumber, {
        maxStreak,
        multiplierActive: true,
        multiplierStartsOn,
      })

      if (badge) {
        badgesEarned.push(badge)
        // No immediate coins awarded; 2x applies from multiplierStartsOn forward
      }
    } else if (hasTwentyFive) {
      // Backfill unlock date on existing badges so coin math is not retroactive
      await getStreakMultiplierStartDate(studentId)
    }

    // Holiday design badges: one unlock per break type (turkey / tree / fireworks / flower).
    // The 5 coins per holiday day are paid via daily coin math, not a coin adjustment.
    for (const [badgeType, daysCompleted] of holidayDesignCounts.entries()) {
      if (daysCompleted < 1) continue
      const hasIt = await hasHolidayBadge(studentId, badgeType)
      if (hasIt) continue

      const badge = await awardBadge(studentId, badgeType, daysCompleted, period, sectionNumber, {
        holidayDaysCompleted: daysCompleted,
        holidayBreak: HOLIDAY_BREAK_OPTIONS.find((o) => o.badgeType === badgeType)?.value,
        holidayLabel: holidayBreakLabel(
          HOLIDAY_BREAK_OPTIONS.find((o) => o.badgeType === badgeType)?.value,
        ),
      })
      if (badge) {
        badgesEarned.push(badge)
      }
    }

    // Grand Master: 100+ coins across the whole semester (multiple exam periods).
    const alreadyGrandMaster = await hasGrandMasterBadge(studentId)
    if (!alreadyGrandMaster) {
      const semesterCoins =
        typeof options.semesterCoinTotal === "number"
          ? options.semesterCoinTotal
          : await getStudentSemesterCoins(studentId, period)

      if (semesterCoins >= GRAND_MASTER_COIN_THRESHOLD) {
        const badge = await awardBadge(
          studentId,
          "grand_master",
          semesterCoins,
          period,
          sectionNumber,
          {
            semesterCoins,
            threshold: GRAND_MASTER_COIN_THRESHOLD,
          },
        )
        if (badge) {
          badgesEarned.push(badge)
        }
      }
    }
  } catch (error) {
    console.error("Error processing badges:", error)
    return {
      badgesEarned,
      coinsAwarded,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  return { badgesEarned, coinsAwarded }
}

/**
 * Re-run badge processing for one student across every period/section they appear in.
 * Used after day overrides change so newly qualified days can unlock 10/25-day badges.
 */
export async function reprocessBadgesForStudent(
  studentId: string,
  adminEmail: string = "system",
  options: { awardCoins?: boolean } = {}
): Promise<{ badgesEarned: Badge[]; coinsAwarded: number; processedCount: number }> {
  const normalizedId = studentId.toLowerCase().trim()
  const badgesEarned: Badge[] = []
  let coinsAwarded = 0
  let processedCount = 0

  try {
    await ensureBadgesSchema()

    const overrides = await fetchDayOverridesForStudent(normalizedId)

    const result = await sql`
      SELECT
        data->${normalizedId} as student,
        period,
        COALESCE(section_number, 'default') as section_number,
        uploaded_at
      FROM student_data
      WHERE data ? ${normalizedId}
      ORDER BY uploaded_at DESC
    `

    const seen = new Set<string>()
    for (const row of result.rows) {
      const key = `${row.period}_${row.section_number}`
      if (seen.has(key)) continue
      seen.add(key)

      let student = row.student
      if (typeof student === "string") {
        try {
          student = JSON.parse(student)
        } catch {
          continue
        }
      }
      if (!student?.dailyLog) continue

      const processed = await processBadgesForStudent(
        normalizedId,
        student.name || normalizedId,
        student.dailyLog,
        row.period,
        row.section_number,
        adminEmail,
        { ...options, dayOverrides: overrides }
      )

      badgesEarned.push(...processed.badgesEarned)
      coinsAwarded += processed.coinsAwarded
      processedCount++
    }
  } catch (error) {
    console.error("Error reprocessing badges for student:", error)
  }

  return { badgesEarned, coinsAwarded, processedCount }
}
