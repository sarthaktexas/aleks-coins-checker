import { type NextRequest, NextResponse } from "next/server"
import { unstable_cache } from "next/cache"
import { sql } from "@vercel/postgres"
import { isSession, requireAdmin } from "@/lib/admin-auth"
import { bustStudentDataCache, STUDENT_DATA_CACHE_TAG } from "@/lib/student-cache"
import { summarizeDailyCoins } from "@/lib/day-credits"
import { applyOverrideToDay, buildOverridesMap, normalizeOverrideDate } from "@/lib/day-overrides"
import {
  listLatestUploadMeta,
  loadSlimStudentRoster,
} from "@/lib/student-data-queries"

export const dynamic = "force-dynamic"

type StudentData = {
  [studentId: string]: {
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
}

async function applyOverridesToStudentData(studentData: StudentData): Promise<StudentData> {
  try {
    const overridesResult = await sql`
      SELECT student_id, day_number, date, override_type, reason
      FROM student_day_overrides
    `

    const overridesMap = buildOverridesMap(overridesResult.rows)
    const updatedStudentData = { ...studentData }

    Object.keys(updatedStudentData).forEach((studentId) => {
      const student = updatedStudentData[studentId]
      const studentOverrides = overridesMap.get(studentId.toLowerCase())

      if (student.dailyLog) {
        if (studentOverrides) {
          student.dailyLog = student.dailyLog.map((day) => {
            const override = studentOverrides.get(normalizeOverrideDate(day.date))
            if (override) return applyOverrideToDay(day, override)
            return day
          })
        }

        const summary = summarizeDailyCoins(student.dailyLog)
        student.percentComplete = summary.percentComplete
        student.coins = summary.coins
        student.exemptDayCredits = summary.exemptDayCredits
        student.coinOnlyExemptCredits = summary.coinOnlyExemptCredits
        student.holidayDaysCompleted = summary.holidayDaysCompleted
        student.holidayCoinsEarned = summary.holidayCoinsEarned
        student.doubleCoinsEarned = summary.doubleCoinsEarned
      }
    })

    return updatedStudentData
  } catch (error) {
    console.error("Error applying overrides:", error)
    return studentData
  }
}

/**
 * GET /api/admin/student-data
 *
 * Always returns upload metadata without shipping JSONB blobs.
 *
 * Full class blobs (with dailyLog) are only loaded when a period is specified
 * and `slim` is not set — e.g. View Data for one section.
 *
 * `includeStudents=1` without a full detail view returns a slim roster
 * (name/email/coins/progress scalars only) for email tooling.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin(request)
    if (!isSession(session)) return session

    const { searchParams } = new URL(request.url)
    const period = searchParams.get("period")
    const sectionNumber = searchParams.get("sectionNumber")
    const includeStudents =
      searchParams.get("includeStudents") === "1" ||
      searchParams.get("includeStudents") === "true"
    const slim =
      searchParams.get("slim") === "1" ||
      searchParams.get("slim") === "true" ||
      // Email / list callers that ask for students without a concrete section
      // almost never need dailyLog — keep egress small by default.
      (includeStudents && !period)

    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json(
        {
          error: "Database not configured",
          uploadRecords: [],
          studentData: {},
          uniqueStudentCount: 0,
        },
        { status: 503 },
      )
    }

    const { uploadRecords, uniqueStudentCount } = await unstable_cache(
      () => listLatestUploadMeta(),
      ["admin-upload-meta"],
      { revalidate: 300, tags: [STUDENT_DATA_CACHE_TAG] },
    )()

    let studentData: StudentData | Record<string, any> = {}

    const wantsStudentPayload = Boolean(period) || includeStudents

    if (wantsStudentPayload) {
      if (slim || !period) {
        studentData = await loadSlimStudentRoster({ period, sectionNumber })
      } else if (sectionNumber) {
        const result = await sql`
          SELECT data, uploaded_at, section_number
          FROM student_data
          WHERE period = ${period}
            AND COALESCE(section_number, 'default') = ${sectionNumber}
          ORDER BY uploaded_at DESC
          LIMIT 1
        `
        if (result.rows.length > 0) {
          const row = result.rows[0]
          studentData =
            typeof row.data === "string" ? JSON.parse(row.data) : row.data
          studentData = await applyOverridesToStudentData(studentData as StudentData)
        }
      } else {
        // All sections for a period — latest upload per section, then merge.
        const result = await sql`
          SELECT DISTINCT ON (COALESCE(section_number, 'default'))
            data, uploaded_at, COALESCE(section_number, 'default') AS section_number
          FROM student_data
          WHERE period = ${period}
          ORDER BY COALESCE(section_number, 'default'), uploaded_at DESC
        `

        if (result.rows.length > 0) {
          const studentDataMap = new Map<string, { data: any; uploadedAt: string }>()
          for (const row of result.rows) {
            const rowData =
              typeof row.data === "string" ? JSON.parse(row.data) : row.data
            Object.keys(rowData || {}).forEach((studentId) => {
              const existing = studentDataMap.get(studentId)
              if (!existing || new Date(row.uploaded_at) > new Date(existing.uploadedAt)) {
                studentDataMap.set(studentId, {
                  data: rowData[studentId],
                  uploadedAt: row.uploaded_at,
                })
              }
            })
          }
          const merged: StudentData = {}
          studentDataMap.forEach((value, studentId) => {
            merged[studentId] = value.data
          })
          studentData = await applyOverridesToStudentData(merged)
        }
      }
    }

    return NextResponse.json({
      success: true,
      uploadRecords,
      studentData,
      uniqueStudentCount,
    })
  } catch (error) {
    console.error("Error fetching student data:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch student data",
        details:
          process.env.NODE_ENV === "development"
            ? (error as Error).message
            : undefined,
      },
      { status: 500 },
    )
  }
}

async function deleteRelatedStudentRecords(period?: string, sectionNumber?: string) {
  if (period && sectionNumber) {
    const adjustmentsResult = await sql`
      DELETE FROM coin_adjustments
      WHERE period = ${period} AND section_number = ${sectionNumber}
      RETURNING id
    `
    const requestsResult = await sql`
      DELETE FROM student_requests
      WHERE period = ${period} AND section_number = ${sectionNumber}
      RETURNING id
    `
    return {
      adjustmentsDeleted: adjustmentsResult.rows.length,
      requestsDeleted: requestsResult.rows.length,
      overridesDeleted: 0,
    }
  }

  const adjustmentsResult = await sql`DELETE FROM coin_adjustments RETURNING id`
  const requestsResult = await sql`DELETE FROM student_requests RETURNING id`
  const overridesResult = await sql`DELETE FROM student_day_overrides RETURNING id`

  return {
    adjustmentsDeleted: adjustmentsResult.rows.length,
    requestsDeleted: requestsResult.rows.length,
    overridesDeleted: overridesResult.rows.length,
  }
}

// DELETE - Delete student data (all or specific upload)
export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAdmin(request)
    if (!isSession(session)) return session

    const body = await request.json()
    const { uploadId, period, sectionNumber } = body

    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    if (uploadId) {
      // Delete specific upload by ID
      const result = await sql`
        DELETE FROM student_data
        WHERE id = ${uploadId}
        RETURNING id, period, section_number, uploaded_at
      `

      if (result.rows.length === 0) {
        return NextResponse.json({ 
          error: "Upload not found",
        }, { status: 404 })
      }

      const { period: deletedPeriod, section_number: deletedSection } = result.rows[0]
      const relatedDeleted = await deleteRelatedStudentRecords(deletedPeriod, deletedSection)
      bustStudentDataCache()

      return NextResponse.json({ 
        success: true, 
        message: `Successfully deleted upload for period ${deletedPeriod}, section ${deletedSection}`,
        deletedCount: result.rows.length,
        deletedRecord: result.rows[0],
        relatedDeleted,
      })
    }

    if (period && sectionNumber) {
      const relatedDeleted = await deleteRelatedStudentRecords(period, sectionNumber)
      const result = await sql`
        DELETE FROM student_data
        WHERE period = ${period} AND section_number = ${sectionNumber}
        RETURNING id, period, section_number, uploaded_at
      `
      bustStudentDataCache()

      if (result.rows.length === 0) {
        return NextResponse.json({
          success: true,
          message: `No student data found for period ${period}, section ${sectionNumber}`,
          deletedCount: 0,
          relatedDeleted,
        })
      }

      return NextResponse.json({
        success: true,
        message: `Deleted data for period ${period}, section ${sectionNumber} (${result.rows.length} upload${result.rows.length === 1 ? "" : "s"})`,
        deletedCount: result.rows.length,
        deletedRecords: result.rows,
        relatedDeleted,
      })
    }

    // Delete all student data and related records
    const relatedDeleted = await deleteRelatedStudentRecords()

    const result = await sql`
      DELETE FROM student_data
      RETURNING id, period, uploaded_at
    `

    bustStudentDataCache()

    const totalDeleted =
      result.rows.length +
      relatedDeleted.adjustmentsDeleted +
      relatedDeleted.requestsDeleted +
      relatedDeleted.overridesDeleted

    if (totalDeleted === 0) {
      return NextResponse.json({ 
        success: true, 
        message: "No student data found to delete",
        deletedCount: 0,
      })
    }

    return NextResponse.json({ 
      success: true, 
      message: `Successfully deleted all student data (${result.rows.length} uploads, ${relatedDeleted.requestsDeleted} requests, ${relatedDeleted.adjustmentsDeleted} coin adjustments, ${relatedDeleted.overridesDeleted} day overrides)`,
      deletedCount: result.rows.length,
      deletedRecords: result.rows.map(row => ({
        id: row.id,
        period: row.period,
        uploaded_at: row.uploaded_at
      })),
      relatedDeleted,
    })
  } catch (error) {
    console.error("Error deleting student data:", error)
    return NextResponse.json(
      { 
        error: "Failed to delete student data",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined
      },
      { status: 500 }
    )
  }
}
