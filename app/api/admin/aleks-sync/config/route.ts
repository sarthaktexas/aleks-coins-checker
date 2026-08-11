import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"
import { computeReportWindow, getPeriodDates, resolveActivePeriod } from "@/lib/aleks-excel"
import { isAuthorized, requireImportToken } from "@/lib/import-token"

export const dynamic = "force-dynamic"

async function knownSectionsForPeriod(periodKey: string): Promise<string[]> {
  try {
    const sections = await sql`
      SELECT DISTINCT COALESCE(section_number, 'default') as section_number
      FROM student_data
      WHERE period = ${periodKey}
      ORDER BY section_number
    `
    return sections.rows.map((r) => String(r.section_number))
  } catch {
    return []
  }
}

type PeriodRowDebug = {
  periodKey: string
  startDate: string | null
  endDate: string | null
  updatedAt: string | null
} | null

async function debugLogPeriodRow(periodKey: string): Promise<PeriodRowDebug> {
  try {
    const row = await sql`
      SELECT period_key, start_date, end_date, updated_at
      FROM exam_periods
      WHERE period_key = ${periodKey}
      LIMIT 1
    `
    if (row.rows.length === 0) {
      console.log(`[ALEKS config debug] period=${periodKey} row not found`)
      return null
    }

    const r = row.rows[0]
    const normalizeDate = (value: unknown) => {
      if (!value) return null
      if (typeof value === "string") return value.slice(0, 10)
      return new Date(value as Date).toISOString().slice(0, 10)
    }

    const debugRow = {
      periodKey: String(r.period_key),
      startDate: normalizeDate(r.start_date),
      endDate: normalizeDate(r.end_date),
      updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : null,
    }

    console.log(
      `[ALEKS config debug] period=${String(r.period_key)} start=${normalizeDate(r.start_date)} end=${normalizeDate(r.end_date)} updatedAt=${
        r.updated_at ? new Date(r.updated_at as string).toISOString() : "null"
      }`,
    )
    return debugRow
  } catch (err) {
    console.error("[ALEKS config debug] failed to read exam_periods row:", err)
    return null
  }
}

/**
 * GET /api/admin/aleks-sync/config
 * Optional ?period= — otherwise picks the exam period containing today (Central),
 * or the most recent period that ended before today (backwards fallback).
 * Optional ?force=1 — sync even if outside the period date window.
 * Auth: Bearer IMPORT_API_TOKEN
 */
export async function GET(request: NextRequest) {
  try {
    const auth = requireImportToken(request)
    if (!isAuthorized(auth)) return auth

    const overridePeriod = request.nextUrl.searchParams.get("period")?.trim() || null
    let force =
      request.nextUrl.searchParams.get("force") === "1" ||
      request.nextUrl.searchParams.get("force") === "true"

    let period
    let source: string
    let latestUploadAt: string | null = null
    let knownSections: string[] = []
    let debugPeriodRow: PeriodRowDebug = null

    if (overridePeriod) {
      period = await getPeriodDates(overridePeriod)
      if (!period) {
        return NextResponse.json({ error: `Period ${overridePeriod} not found` }, { status: 404 })
      }
      debugPeriodRow = await debugLogPeriodRow(overridePeriod)
      source = "query"
      knownSections = await knownSectionsForPeriod(overridePeriod)
      const resolved = await resolveActivePeriod()
      if (resolved?.period.periodKey === overridePeriod) {
        latestUploadAt = resolved.latestUploadAt
      }
    } else {
      const resolved = await resolveActivePeriod()
      if (!resolved) {
        return NextResponse.json(
          {
            error:
              "No exam period found for today. Create a period that includes today, or one that ended before today.",
          },
          { status: 404 },
        )
      }
      period = resolved.period
      debugPeriodRow = await debugLogPeriodRow(period.periodKey)
      source = resolved.source
      latestUploadAt = resolved.latestUploadAt
      knownSections = resolved.knownSections
      // Past-period fallback is outside the date window — still sync it.
      if (resolved.source === "previous_period") force = true
    }

    const window = computeReportWindow(period.startDate, period.endDate, undefined, { force })

    return NextResponse.json({
      success: true,
      source,
      force,
      latestUploadAt,
      knownSections,
      period: {
        key: period.periodKey,
        name: period.name,
        startDate: period.startDate,
        endDate: period.endDate,
        excludedDates: period.excludedDates,
      },
      today: window.today,
      shouldSync: window.shouldSync,
      reason: window.reason,
      reportStartDate: window.reportStartDate,
      reportEndDate: window.reportEndDate,
      debugPeriodRow,
    })
  } catch (error) {
    console.error("ALEKS sync config error:", error)
    return NextResponse.json(
      {
        error: "Failed to load sync config",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
      },
      { status: 500 },
    )
  }
}
