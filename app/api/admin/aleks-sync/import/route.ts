import { type NextRequest, NextResponse } from "next/server"
import { parseAleksWorkbook, processExcelData, saveStudentData } from "@/lib/aleks-excel"
import { isAuthorized, requireImportToken } from "@/lib/import-token"
import { ensureBadgesSchema, processBadgesForStudent } from "@/lib/badges"
import { sendBadgeErrorEmail } from "@/lib/email"
import type { DayOverrideRow } from "@/lib/day-overrides"
import { sql } from "@vercel/postgres"

export const dynamic = "force-dynamic"

/**
 * POST /api/admin/aleks-sync/import
 * Auth: Bearer IMPORT_API_TOKEN
 * Form fields: file, examPeriod, sectionNumber
 */
export async function POST(request: NextRequest) {
  try {
    const auth = requireImportToken(request)
    if (!isAuthorized(auth)) return auth

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const examPeriod = String(formData.get("examPeriod") || "")
    const sectionNumber = String(formData.get("sectionNumber") || "")

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
    }
    if (!examPeriod) {
      return NextResponse.json({ error: "examPeriod is required" }, { status: 400 })
    }
    if (!sectionNumber) {
      return NextResponse.json({ error: "sectionNumber is required" }, { status: 400 })
    }

    const fileBuffer = await file.arrayBuffer()
    const rawData = parseAleksWorkbook(fileBuffer)

    if (rawData.length === 0) {
      return NextResponse.json({ error: "No data found in Excel file" }, { status: 400 })
    }

    const studentData = await processExcelData(rawData, examPeriod)
    const studentCount = Object.keys(studentData).length

    if (studentCount === 0) {
      return NextResponse.json({ error: "No valid student data found in file" }, { status: 400 })
    }

    await saveStudentData(studentData, examPeriod, sectionNumber)

    // Process badges for all students after data import
    let badgesAwarded = 0
    let coinsAwarded = 0
    let studentsProcessed = 0
    const badgeErrors: string[] = []
    let badgeError: string | undefined

    try {
      await ensureBadgesSchema()

      // Load day overrides once so streak badges include overridden days
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

      // Holiday break labels so holiday badge designs can be awarded
      let holidayLabels: Record<string, string> = {}
      try {
        const labelsResult = await sql`
          SELECT holiday_labels FROM exam_periods WHERE period_key = ${examPeriod} LIMIT 1
        `
        const raw = labelsResult.rows[0]?.holiday_labels
        if (raw && typeof raw === "object" && !Array.isArray(raw)) {
          holidayLabels = raw as Record<string, string>
        }
      } catch (labelError) {
        console.error("Could not load holiday labels for badge processing:", labelError)
      }

      for (const [studentId, studentRaw] of Object.entries(studentData)) {
        try {
          const student = studentRaw as { name: string; dailyLog: any[] }
          const dayOverrides = overridesByStudent.get(studentId.toLowerCase()) || []
          const { badgesEarned, coinsAwarded: coins, error } = await processBadgesForStudent(
            studentId,
            student.name,
            student.dailyLog,
            examPeriod,
            sectionNumber,
            "aleks-sync-import",
            { dayOverrides, holidayLabels },
          )
          badgesAwarded += badgesEarned.length
          coinsAwarded += coins
          studentsProcessed++
          if (error) {
            badgeErrors.push(`${studentId}: ${error}`)
          }
        } catch (studentError) {
          const message =
            studentError instanceof Error ? studentError.message : String(studentError)
          console.error(`Badge processing error for ${studentId}:`, studentError)
          badgeErrors.push(`${studentId}: ${message}`)
        }
      }

      const badgePayload = {
        ok: badgeErrors.length === 0,
        section: sectionNumber,
        period: examPeriod,
        badgesAwarded,
        coinsAwarded,
        studentsProcessed,
        ...(badgeErrors.length > 0
          ? { error: badgeErrors[0], errors: badgeErrors.slice(0, 20) }
          : {}),
      }
      console.log(`##BADGE_RESULT## ${JSON.stringify(badgePayload)}`)
      console.log(
        `Badge processing: awarded ${badgesAwarded} badge(s) and ${coinsAwarded} bonus coins ` +
          `(${studentsProcessed} students, section ${sectionNumber})` +
          (badgeErrors.length > 0 ? ` — ${badgeErrors.length} error(s)` : ""),
      )

      if (badgeErrors.length > 0) {
        badgeError = `Badge processing completed with ${badgeErrors.length} error(s)`
        await sendBadgeErrorEmail({
          source: "aleks-sync-import",
          period: examPeriod,
          sectionNumber,
          error: badgeError,
          details: badgeErrors,
        })
      }
    } catch (err) {
      // Don't fail the import if badge processing fails
      badgeError = err instanceof Error ? err.message : String(err)
      console.error("Badge processing error (non-fatal):", err)
      console.log(
        `##BADGE_RESULT## ${JSON.stringify({
          ok: false,
          section: sectionNumber,
          period: examPeriod,
          badgesAwarded,
          coinsAwarded,
          studentsProcessed,
          error: badgeError,
        })}`,
      )
      await sendBadgeErrorEmail({
        source: "aleks-sync-import",
        period: examPeriod,
        sectionNumber,
        error: badgeError,
      })
    }

    console.log(
      `✅ ALEKS sync imported period=${examPeriod} section=${sectionNumber} students=${studentCount}`,
    )

    return NextResponse.json({
      success: true,
      message: "ALEKS report imported successfully",
      studentCount,
      examPeriod,
      sectionNumber,
      badgesAwarded,
      coinsAwarded,
      studentsProcessed,
      badgeError,
      badgeErrors: badgeErrors.length > 0 ? badgeErrors : undefined,
    })
  } catch (error) {
    console.error("ALEKS sync import error:", error)
    return NextResponse.json(
      {
        error: "Failed to import ALEKS report",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
      },
      { status: 500 },
    )
  }
}
