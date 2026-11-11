import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"
import { isSession, requireAdmin } from "@/lib/admin-auth"
import { summarizeDailyCoins } from "@/lib/day-credits"
import { applyOverrideToDay, buildOverridesMap, normalizeOverrideDate } from "@/lib/day-overrides"
import { loadStudentSlicesByIds } from "@/lib/student-data-queries"

type StudentRecord = {
  name: string
  email: string
  coins: number
  totalDays: number
  periodDays: number
  percentComplete: number
  dailyLog: any[]
  exemptDayCredits?: number
  coinOnlyExemptCredits?: number
  doubleCoinsEarned?: number
  holidayDaysCompleted?: number
  holidayCoinsEarned?: number
}

function applyOverridesToStudent(
  studentId: string,
  student: StudentRecord,
  overridesMap: ReturnType<typeof buildOverridesMap>,
): StudentRecord {
  const updated = { ...student, dailyLog: student.dailyLog ? [...student.dailyLog] : [] }
  const studentOverrides = overridesMap.get(studentId.toLowerCase())

  if (updated.dailyLog) {
    if (studentOverrides) {
      updated.dailyLog = updated.dailyLog.map((day) => {
        const override = studentOverrides.get(normalizeOverrideDate(day.date))
        if (override) return applyOverrideToDay(day, override)
        return day
      })
    }

    const summary = summarizeDailyCoins(updated.dailyLog)
    updated.percentComplete = summary.percentComplete
    updated.coins = summary.coins
    updated.exemptDayCredits = summary.exemptDayCredits
    updated.coinOnlyExemptCredits = summary.coinOnlyExemptCredits
    updated.holidayDaysCompleted = summary.holidayDaysCompleted
    updated.holidayCoinsEarned = summary.holidayCoinsEarned
    updated.doubleCoinsEarned = summary.doubleCoinsEarned
  }

  return updated
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin(request)
    if (!isSession(session)) return session

    const body = await request.json()
    const { studentIds } = body

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json({ error: "studentIds array is required" }, { status: 400 })
    }

    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    const normalizedIds = studentIds.map((id: string) => id.toLowerCase())
    const studentIdsSet = new Set(normalizedIds)

    // Only pull matching student objects from latest period/section uploads
    const slices = await loadStudentSlicesByIds(normalizedIds)

    const studentPeriods = new Map<
      string,
      Array<{ period: string; section: string; data: StudentRecord; uploadedAt: string }>
    >()

    for (const slice of slices) {
      if (!slice.student || typeof slice.student !== "object") continue
      if (!studentPeriods.has(slice.studentId)) studentPeriods.set(slice.studentId, [])
      studentPeriods.get(slice.studentId)!.push({
        period: slice.period,
        section: slice.section,
        data: slice.student as StudentRecord,
        uploadedAt: slice.uploadedAt,
      })
    }

    // One overrides query for all requested students (not per-period N+1)
    let overridesMap = buildOverridesMap([] as any[])
    try {
      const overridesResult = await sql`
        SELECT student_id, day_number, date, override_type, reason
        FROM student_day_overrides
        WHERE LOWER(student_id) = ANY(${normalizedIds as any}::text[])
      `
      overridesMap = buildOverridesMap(overridesResult.rows as any[])
    } catch (error) {
      console.error("Error fetching overrides for balances:", error)
      try {
        const allOverrides = await sql`
          SELECT student_id, day_number, date, override_type, reason
          FROM student_day_overrides
        `
        overridesMap = buildOverridesMap(
          allOverrides.rows.filter((row) =>
            studentIdsSet.has(String(row.student_id).toLowerCase()),
          ) as any[],
        )
      } catch (fallbackError) {
        console.error("Error in overrides fallback:", fallbackError)
      }
    }

    let coinAdjustments: any[] = []
    try {
      const adjustmentsResult = await sql`
        SELECT
          student_id,
          period,
          section_number,
          adjustment_amount
        FROM coin_adjustments
        WHERE LOWER(student_id) = ANY(${normalizedIds as any}::text[]) AND is_active = true
      `
      coinAdjustments = adjustmentsResult.rows
    } catch (error) {
      console.error("Error fetching coin adjustments:", error)
      try {
        const allAdjustmentsResult = await sql`
          SELECT
            student_id,
            period,
            section_number,
            adjustment_amount
          FROM coin_adjustments
          WHERE is_active = true
        `
        coinAdjustments = allAdjustmentsResult.rows.filter((adj) =>
          studentIdsSet.has(adj.student_id.toLowerCase()),
        )
      } catch (fallbackError) {
        console.error("Error in fallback query:", fallbackError)
      }
    }

    const adjustmentsByStudent = new Map<
      string,
      { byPeriod: Map<string, number>; global: number }
    >()

    coinAdjustments.forEach((adj) => {
      const normalizedId = adj.student_id.toLowerCase()
      if (!adjustmentsByStudent.has(normalizedId)) {
        adjustmentsByStudent.set(normalizedId, { byPeriod: new Map(), global: 0 })
      }

      const studentAdjustments = adjustmentsByStudent.get(normalizedId)!

      if (adj.period === "__GLOBAL__" || adj.period === null || adj.period === undefined) {
        studentAdjustments.global += adj.adjustment_amount
      } else {
        const periodKey = `${adj.period}_${adj.section_number || "default"}`
        const current = studentAdjustments.byPeriod.get(periodKey) || 0
        studentAdjustments.byPeriod.set(periodKey, current + adj.adjustment_amount)
      }
    })

    const balances: Record<string, number> = {}

    for (const studentId of normalizedIds) {
      const periods = studentPeriods.get(studentId) || []
      const studentAdjustments = adjustmentsByStudent.get(studentId) || {
        byPeriod: new Map(),
        global: 0,
      }

      let totalCoinsFromPeriods = 0

      for (const periodData of periods) {
        const studentWithOverrides = applyOverridesToStudent(
          studentId,
          periodData.data,
          overridesMap,
        )
        const periodKey = `${periodData.period}_${periodData.section}`
        const periodAdjustment = studentAdjustments.byPeriod.get(periodKey) || 0
        totalCoinsFromPeriods += (studentWithOverrides.coins || 0) + periodAdjustment
      }

      balances[studentId] = Math.max(0, totalCoinsFromPeriods + studentAdjustments.global)
    }

    return NextResponse.json({
      success: true,
      balances,
    })
  } catch (error) {
    console.error("Error calculating student balances:", error)
    return NextResponse.json(
      {
        error: "Failed to calculate student balances",
        details:
          process.env.NODE_ENV === "development"
            ? (error as Error).message
            : undefined,
      },
      { status: 500 },
    )
  }
}
