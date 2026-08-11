import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"
import { isAuthorized, requireImportToken } from "@/lib/import-token"
import {
  extractOverrideReason,
  isReviewedTopicsOverride,
  parseOverrideKind,
} from "@/lib/override-request"

export const dynamic = "force-dynamic"

type StudentSliceRow = {
  period: string
  section_number: string
  uploaded_at: Date | string
  student: unknown
}

/** One student's JSON slice per upload row — avoids pulling entire class blobs (Neon egress). */
async function loadStudentSlices(studentId: string): Promise<StudentSliceRow[]> {
  const normalizedId = studentId.toLowerCase().trim()
  const result = await sql`
    SELECT
      period,
      COALESCE(section_number, 'default') AS section_number,
      uploaded_at,
      data->${normalizedId} AS student
    FROM student_data
    WHERE data ? ${normalizedId}
    ORDER BY uploaded_at DESC
  `
  return result.rows as StudentSliceRow[]
}

function minutesFromSlices(
  rows: StudentSliceRow[],
  dayNumber: number | null,
  overrideDate: string | null,
  period: string | null,
): number {
  if (rows.length === 0) return 0

  const normalizedDate = (overrideDate || "").trim()
  const matchingPeriodRows = period ? rows.filter((row) => row.period === period) : []
  const rowsToSearch = matchingPeriodRows.length > 0 ? matchingPeriodRows : rows

  for (const row of rowsToSearch) {
    let student = row.student as { dailyLog?: Array<{ date?: string; day?: number; minutes?: number }> } | null
    if (typeof student === "string") {
      try {
        student = JSON.parse(student)
      } catch {
        continue
      }
    }
    if (!student?.dailyLog) continue

    if (normalizedDate) {
      const byDate = student.dailyLog.find((d) => d.date === normalizedDate)
      if (byDate && byDate.minutes !== undefined) return byDate.minutes || 0
    }

    if (dayNumber != null) {
      const byDay = student.dailyLog.find((d) => d.day === dayNumber)
      if (byDay && byDay.minutes !== undefined) return byDay.minutes || 0
    }
  }

  return 0
}

async function getMinutesForRequest(
  studentId: string,
  dayNumber: number | null,
  overrideDate: string | null,
  period: string | null,
  sliceCache?: Map<string, StudentSliceRow[]>,
): Promise<number> {
  const key = studentId.toLowerCase().trim()
  let rows = sliceCache?.get(key)
  if (!rows) {
    rows = await loadStudentSlices(key)
    sliceCache?.set(key, rows)
  }
  return minutesFromSlices(rows, dayNumber, overrideDate, period)
}

/**
 * GET /api/admin/aleks-sync/review-overrides
 * Pending override requests marked as reviewed_topics (for timeline verification).
 * Auth: Bearer IMPORT_API_TOKEN
 * Optional ?countOnly=1 — return count only (cheap probe for Actions preflight).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = requireImportToken(request)
    if (!isAuthorized(auth)) return auth

    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    const countOnly =
      request.nextUrl.searchParams.get("countOnly") === "1" ||
      request.nextUrl.searchParams.get("countOnly") === "true"

    const pending = await sql`
      SELECT
        id,
        student_id,
        student_name,
        student_email,
        period,
        section_number,
        request_details,
        day_number,
        override_date,
        submitted_at
      FROM student_requests
      WHERE status = 'pending'
        AND request_type = 'override_request'
        AND day_number IS NOT NULL
        AND override_date IS NOT NULL
      ORDER BY submitted_at ASC
    `

    const reviewedRows = pending.rows.filter((row) => isReviewedTopicsOverride(row.request_details))

    if (countOnly) {
      return NextResponse.json({
        success: true,
        count: reviewedRows.length,
      })
    }

    const sliceCache = new Map<string, StudentSliceRow[]>()
    const requests = []
    for (const row of reviewedRows) {
      const minutes = await getMinutesForRequest(
        row.student_id,
        row.day_number,
        row.override_date,
        row.period,
        sliceCache,
      )

      requests.push({
        id: row.id,
        studentId: row.student_id,
        studentName: row.student_name,
        studentEmail: row.student_email,
        period: row.period,
        sectionNumber: row.section_number,
        dayNumber: row.day_number,
        overrideDate: row.override_date,
        overrideKind: parseOverrideKind(row.request_details) || "reviewed_topics",
        reason: extractOverrideReason(row.request_details),
        minutes,
        submittedAt: row.submitted_at,
      })
    }

    const sections = [...new Set(requests.map((r) => String(r.sectionNumber || "default")))]
    const periods = [...new Set(requests.map((r) => String(r.period)))]

    return NextResponse.json({
      success: true,
      count: requests.length,
      sections,
      periods,
      requests,
    })
  } catch (error) {
    console.error("Error listing review overrides:", error)
    return NextResponse.json(
      {
        error: "Failed to list review overrides",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
      },
      { status: 500 },
    )
  }
}

type VerificationResult = {
  requestId: number
  reviewedTopics: number | null
  foundDate: boolean
  foundCheckmark: boolean
  minutes?: number
  notes?: string
  error?: string
}

/**
 * POST /api/admin/aleks-sync/review-overrides
 * Apply timeline verification results. Auto-approves when reviewedTopics >= 1 and minutes >= 31.
 * Auth: Bearer IMPORT_API_TOKEN
 */
export async function POST(request: NextRequest) {
  try {
    const auth = requireImportToken(request)
    if (!isAuthorized(auth)) return auth

    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    const body = await request.json()
    const results: VerificationResult[] = Array.isArray(body?.results) ? body.results : []
    if (results.length === 0) {
      return NextResponse.json({ error: "results array is required" }, { status: 400 })
    }

    // Check overrides enabled
    try {
      const settingsResult = await sql`
        SELECT setting_value
        FROM admin_settings
        WHERE setting_key = 'overrides_enabled'
      `
      let overridesEnabled = true
      if (settingsResult.rows.length > 0) {
        const value = settingsResult.rows[0].setting_value
        overridesEnabled =
          typeof value === "boolean" ? value : value === true || value === "true" || value === "t" || value === 1
      }
      if (!overridesEnabled) {
        return NextResponse.json(
          { error: "Day overrides are currently disabled. Cannot approve override requests." },
          { status: 403 },
        )
      }
    } catch {
      /* allow if settings missing */
    }

    let approvedCount = 0
    let notedCount = 0
    let skippedCount = 0
    const details: Array<Record<string, unknown>> = []
    const sliceCache = new Map<string, StudentSliceRow[]>()

    for (const result of results) {
      const requestId = Number(result.requestId)
      if (!Number.isFinite(requestId)) {
        skippedCount++
        details.push({ requestId: result.requestId, status: "skipped", reason: "invalid requestId" })
        continue
      }

      const pendingResult = await sql`
        SELECT
          id,
          student_id,
          student_name,
          period,
          section_number,
          request_type,
          request_details,
          day_number,
          override_date,
          status
        FROM student_requests
        WHERE id = ${requestId}
      `

      if (pendingResult.rows.length === 0) {
        skippedCount++
        details.push({ requestId, status: "skipped", reason: "not found" })
        continue
      }

      const row = pendingResult.rows[0]
      if (row.status !== "pending" || row.request_type !== "override_request") {
        skippedCount++
        details.push({ requestId, status: "skipped", reason: `status=${row.status}` })
        continue
      }

      if (!isReviewedTopicsOverride(row.request_details)) {
        skippedCount++
        details.push({ requestId, status: "skipped", reason: "not a reviewed_topics override" })
        continue
      }

      const minutes =
        typeof result.minutes === "number"
          ? result.minutes
          : await getMinutesForRequest(
              row.student_id,
              row.day_number,
              row.override_date,
              row.period,
              sliceCache,
            )

      const reviewedTopics =
        typeof result.reviewedTopics === "number" && Number.isFinite(result.reviewedTopics)
          ? Math.max(0, Math.floor(result.reviewedTopics))
          : null

      const noteParts = [
        result.notes?.trim(),
        result.error ? `Verification error: ${result.error}` : null,
        `Timeline: date=${result.foundDate ? "found" : "missing"}, checkmark=${result.foundCheckmark ? "found" : "missing"}, reviewedTopics=${reviewedTopics ?? "n/a"}, minutes=${minutes}`,
      ].filter(Boolean)
      const verificationNote = noteParts.join(" | ")

      const canApprove = reviewedTopics != null && reviewedTopics >= 1 && minutes >= 31

      if (canApprove) {
        const reasonText =
          extractOverrideReason(row.request_details) ||
          `Auto-verified: ${reviewedTopics} reviewed topic(s), ${minutes} minutes`

        const normalizedDate = (row.override_date || "").trim()

        await sql`
          INSERT INTO student_day_overrides (
            student_id,
            day_number,
            date,
            override_type,
            reason
          )
          VALUES (
            ${row.student_id},
            ${row.day_number},
            ${normalizedDate},
            'qualified',
            ${reasonText}
          )
          ON CONFLICT (student_id, date)
          DO UPDATE SET
            day_number = EXCLUDED.day_number,
            override_type = EXCLUDED.override_type,
            reason = EXCLUDED.reason,
            updated_at = NOW()
        `

        await sql`
          UPDATE student_requests
          SET
            status = 'approved',
            admin_notes = ${`ALEKS timeline auto-approved: ${reviewedTopics} reviewed topic(s), ${minutes} minutes`},
            processed_at = CURRENT_TIMESTAMP,
            processed_by = 'aleks-review-verify'
          WHERE id = ${requestId}
        `

        approvedCount++
        details.push({
          requestId,
          status: "approved",
          reviewedTopics,
          minutes,
        })
      } else {
        // Leave pending but attach verification notes for the instructor
        await sql`
          UPDATE student_requests
          SET admin_notes = ${verificationNote}
          WHERE id = ${requestId}
        `
        notedCount++
        details.push({
          requestId,
          status: "noted",
          reviewedTopics,
          minutes,
          reason:
            reviewedTopics != null && reviewedTopics >= 1 && minutes < 31
              ? "reviews found but minutes < 31"
              : reviewedTopics === 0
                ? "no reviewed topics found"
                : "incomplete verification",
        })
      }
    }

    return NextResponse.json({
      success: true,
      approvedCount,
      notedCount,
      skippedCount,
      details,
    })
  } catch (error) {
    console.error("Error applying review override results:", error)
    return NextResponse.json(
      {
        error: "Failed to apply review override results",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
      },
      { status: 500 },
    )
  }
}
