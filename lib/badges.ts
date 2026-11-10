import { sql } from "@vercel/postgres"
import {
  applyOverridesToDailyLog,
  buildOverridesMap,
  type DayOverrideRow,
} from "@/lib/day-overrides"

export type BadgeType = "streak_10_day" | "streak_25_day"

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
    reward: "Permanent 2x coin multiplier",
  },
]

/**
 * Ensure the student_badges table exists
 */
export async function ensureBadgesSchema() {
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
}

/**
 * Calculate the longest streak from a daily log
 * Returns an object with current streak and max streak
 */
export function calculateStreaks(dailyLog: Array<{ qualified: boolean; isExcluded?: boolean }>): {
  currentStreak: number
  maxStreak: number
  maxStreakEndIndex: number
} {
  let currentStreak = 0
  let maxStreak = 0
  let maxStreakEndIndex = -1

  // Work through the daily log from start to end
  for (let i = 0; i < dailyLog.length; i++) {
    const day = dailyLog[i]

    // Skip excluded days (they don't break or contribute to streaks)
    if (day.isExcluded) {
      continue
    }

    if (day.qualified) {
      currentStreak++
      if (currentStreak > maxStreak) {
        maxStreak = currentStreak
        maxStreakEndIndex = i
      }
    } else {
      currentStreak = 0
    }
  }

  return { currentStreak, maxStreak, maxStreakEndIndex }
}

/**
 * Coins are only for a streak that just landed on 10.
 * A longer or already-broken streak is retroactive: badge only, no coins.
 */
export function shouldAwardTenDayCoins(dailyLog: Array<{ qualified: boolean; isExcluded?: boolean }>): boolean {
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

type StreakDay = { date?: string; qualified: boolean; isExcluded?: boolean }

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
  options: { awardCoins?: boolean; dayOverrides?: DayOverrideRow[] } = {}
): Promise<{ badgesEarned: Badge[]; coinsAwarded: number }> {
  const badgesEarned: Badge[] = []
  let coinsAwarded = 0

  try {
    // Include overridden days so 10/25-day badges match calendar/coin qualification
    const overrides =
      options.dayOverrides !== undefined
        ? options.dayOverrides
        : await fetchDayOverridesForStudent(studentId)
    const effectiveLog = dailyLogWithOverrides(studentId, dailyLog, overrides)

    // Calculate streaks
    const { maxStreak } = calculateStreaks(effectiveLog)
    const payTenDayCoins = options.awardCoins !== false && shouldAwardTenDayCoins(effectiveLog)

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
    if (maxStreak >= 25) {
      const hasIt = await hasStreakMultiplier(studentId)
      if (!hasIt) {
        const badge = await awardBadge(studentId, "streak_25_day", maxStreak, period, sectionNumber, {
          maxStreak,
          multiplierActive: true,
        })

        if (badge) {
          badgesEarned.push(badge)
          // No immediate coins awarded, but 2x multiplier is now active
        }
      }
    }
  } catch (error) {
    console.error("Error processing badges:", error)
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
