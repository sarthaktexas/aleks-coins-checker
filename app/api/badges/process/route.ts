import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"
import { ensureBadgesSchema, fetchDayOverridesForStudent, processBadgesForStudent } from "@/lib/badges"
import { isSession, requireAdmin } from "@/lib/admin-auth"
import { bustStudentDataCache } from "@/lib/student-cache"
import { sendBadgeErrorEmail } from "@/lib/email"
import type { DayOverrideRow } from "@/lib/day-overrides"

export const dynamic = "force-dynamic"
/** Allow long-running bulk badge processing on Vercel. */
export const maxDuration = 300

/**
 * Process badges for all students or a specific student
 * This is an admin-only route for retroactive badge processing
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin(request)
    if (!isSession(session)) return session

    // Empty body / missing JSON should still mean "process everyone"
    let body: any = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }
    const { studentId, period, sectionNumber } = body || {}
    const processedBy = session.displayName || session.username || "system"

    // Ensure the badges schema exists
    await ensureBadgesSchema()

    let processedCount = 0
    let badgesAwarded = 0
    let coinsAwarded = 0
    const errors: string[] = []

    if (studentId) {
      // Process a specific student
      try {
        const result = await sql`
          SELECT data, period, section_number
          FROM student_data
          WHERE period = ${period} AND COALESCE(section_number, 'default') = ${sectionNumber}
          ORDER BY uploaded_at DESC
          LIMIT 1
        `

        if (result.rows.length === 0) {
          return NextResponse.json({ error: "No data found for this period and section" }, { status: 404 })
        }

        const row = result.rows[0]
        let studentData: any
        if (typeof row.data === "string") {
          studentData = JSON.parse(row.data)
        } else {
          studentData = row.data
        }

        const student = studentData[studentId.toLowerCase()]
        if (!student) {
          return NextResponse.json({ error: "Student not found" }, { status: 404 })
        }

        const dayOverrides = await fetchDayOverridesForStudent(studentId)
        let holidayLabels: Record<string, string> = {}
        try {
          const labelsResult = await sql`
            SELECT holiday_labels FROM exam_periods WHERE period_key = ${period} LIMIT 1
          `
          const raw = labelsResult.rows[0]?.holiday_labels
          if (raw && typeof raw === "object" && !Array.isArray(raw)) {
            holidayLabels = raw as Record<string, string>
          }
        } catch (labelError) {
          console.error("Could not load holiday labels for student badge processing:", labelError)
        }
        const { badgesEarned, coinsAwarded: coins, error: badgeError } = await processBadgesForStudent(
          studentId,
          student.name,
          student.dailyLog || [],
          period,
          sectionNumber,
          processedBy,
          { awardCoins: false, dayOverrides, holidayLabels }
        )

        processedCount = 1
        badgesAwarded = badgesEarned.length
        coinsAwarded = coins
        if (badgeError) {
          errors.push(`Error processing student ${studentId}: ${badgeError}`)
        }

        // Bust the cache so the student sees the update immediately
        bustStudentDataCache()
      } catch (error) {
        console.error("Error processing student:", error)
        errors.push(
          `Error processing student ${studentId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    } else {
      // Process all students across all periods
      try {
        const result = await sql`
          SELECT data, period, COALESCE(section_number, 'default') as section_number
          FROM student_data
          ORDER BY uploaded_at DESC
        `

        // Group by period and section to get the latest data for each
        const latestData = new Map<string, any>()
        for (const row of result.rows) {
          const key = `${row.period}_${row.section_number}`
          if (!latestData.has(key)) {
            latestData.set(key, row)
          }
        }

        // Load all day overrides once so streak badges include overridden days
        let allOverrides: DayOverrideRow[] = []
        try {
          const overridesResult = await sql`
            SELECT student_id, day_number, date, override_type, reason
            FROM student_day_overrides
          `
          allOverrides = overridesResult.rows as DayOverrideRow[]
        } catch (overrideError) {
          console.error("Could not load day overrides for badge processing:", overrideError)
        }

        const overridesByStudent = new Map<string, DayOverrideRow[]>()
        for (const override of allOverrides) {
          const key = (override.student_id || "").toLowerCase().trim()
          if (!key) continue
          if (!overridesByStudent.has(key)) overridesByStudent.set(key, [])
          overridesByStudent.get(key)!.push(override)
        }

        // Load holiday break labels per period so holiday badge designs can be awarded
        const holidayLabelsByPeriod = new Map<string, Record<string, string>>()
        try {
          const labelsResult = await sql`
            SELECT period_key, holiday_labels
            FROM exam_periods
          `
          for (const row of labelsResult.rows) {
            const labels =
              row.holiday_labels && typeof row.holiday_labels === "object" && !Array.isArray(row.holiday_labels)
                ? (row.holiday_labels as Record<string, string>)
                : {}
            holidayLabelsByPeriod.set(String(row.period_key), labels)
          }
        } catch (labelError) {
          console.error("Could not load holiday labels for badge processing:", labelError)
        }

        for (const [, row] of latestData.entries()) {
          let studentData: any
          if (typeof row.data === "string") {
            studentData = JSON.parse(row.data)
          } else {
            studentData = row.data
          }

          if (!studentData || typeof studentData !== "object") continue

          const periodLabels = holidayLabelsByPeriod.get(String(row.period)) || {}

          // Process each student in this period
          for (const [id, student] of Object.entries(studentData)) {
            try {
              const dayOverrides = overridesByStudent.get(id.toLowerCase()) || []
              const { badgesEarned, coinsAwarded: coins, error: badgeError } =
                await processBadgesForStudent(
                  id,
                  (student as any).name || id,
                  (student as any).dailyLog || [],
                  row.period,
                  row.section_number,
                  processedBy,
                  {
                    awardCoins: false,
                    dayOverrides,
                    holidayLabels: periodLabels,
                  }
                )

              processedCount++
              badgesAwarded += badgesEarned.length
              coinsAwarded += coins
              if (badgeError) {
                errors.push(`Error processing student ${id}: ${badgeError}`)
              }
            } catch (error) {
              console.error(`Error processing student ${id}:`, error)
              errors.push(`Error processing student ${id}: ${(error as Error).message || error}`)
            }
          }
        }

        // Bust the cache after processing all students
        bustStudentDataCache()
      } catch (error) {
        console.error("Error processing all students:", error)
        const details = (error as Error).message
        await sendBadgeErrorEmail({
          source: "admin-process-all",
          error: details || "Error processing students",
        })
        return NextResponse.json(
          { error: "Error processing students", details },
          { status: 500 }
        )
      }
    }

    if (errors.length > 0) {
      await sendBadgeErrorEmail({
        source: studentId ? "admin-process-student" : "admin-process-all",
        period,
        sectionNumber,
        error: `Badge processing finished with ${errors.length} error(s)`,
        details: errors,
      })
    }

    return NextResponse.json({
      success: true,
      processedCount,
      badgesAwarded,
      coinsAwarded,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error("Error processing badges:", error)
    const details = (error as Error).message
    await sendBadgeErrorEmail({
      source: "admin-process",
      error: details || "Internal server error",
    })
    return NextResponse.json(
      { error: "Internal server error", details },
      { status: 500 }
    )
  }
}
