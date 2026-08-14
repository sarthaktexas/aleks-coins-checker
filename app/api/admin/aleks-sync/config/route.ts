import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"
import { computeReportWindow, resolveActivePeriod, type PeriodDateInfo } from "@/lib/aleks-excel"
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

function normalizeDate(value: unknown): string | null {
  if (!value) return null
  if (typeof value === "string") return value.slice(0, 10)
  return new Date(value as Date).toISOString().slice(0, 10)
}

async function fetchPeriodFromDb(periodKey: string): Promise<PeriodDateInfo | null> {
  try {
    const row = await sql`
      SELECT period_key, name, start_date, end_date, excluded_dates, coin_only_exempt_dates, updated_at
      FROM exam_periods
      WHERE period_key = ${periodKey}
      LIMIT 1
    `
    if (row.rows.length === 0) {
      return null
    }

    const r = row.rows[0]

    const startDate = normalizeDate(r.start_date)
    const endDate = normalizeDate(r.end_date)
    if (!startDate || !endDate) {
      throw new Error(`Invalid period dates for ${periodKey}`)
    }

    return {
      periodKey: String(r.period_key),
      name: String(r.name),
      startDate,
      endDate,
      excludedDates: (r.excluded_dates as string[]) || [],
      coinOnlyExemptDates: (r.coin_only_exempt_dates as string[]) || [],
    }
  } catch (err) {
    console.error("Failed to read exam_periods row:", err)
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

    if (overridePeriod) {
      const dbPeriod = await fetchPeriodFromDb(overridePeriod)
      if (!dbPeriod) {
        return NextResponse.json({ error: `Period ${overridePeriod} not found` }, { status: 404 })
      }
      period = dbPeriod
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
      const dbPeriod = await fetchPeriodFromDb(resolved.period.periodKey)
      if (!dbPeriod) {
        return NextResponse.json(
          { error: `Resolved period ${resolved.period.periodKey} was not found in exam_periods` },
          { status: 404 },
        )
      }
      period = dbPeriod
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
        coinOnlyExemptDates: period.coinOnlyExemptDates,
      },
      today: window.today,
      shouldSync: window.shouldSync,
      reason: window.reason,
      reportStartDate: window.reportStartDate,
      reportEndDate: window.reportEndDate,
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
