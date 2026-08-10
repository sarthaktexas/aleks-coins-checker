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

/**
 * GET /api/admin/aleks-sync/config
 * Optional ?period= — otherwise uses period from latest student_data upload.
 * Optional ?force=1 — sync even if outside the period date window.
 * Auth: Bearer IMPORT_API_TOKEN
 */
export async function GET(request: NextRequest) {
  try {
    const auth = requireImportToken(request)
    if (!isAuthorized(auth)) return auth

    const overridePeriod = request.nextUrl.searchParams.get("period")?.trim() || null
    const force =
      request.nextUrl.searchParams.get("force") === "1" ||
      request.nextUrl.searchParams.get("force") === "true"

    let period
    let source: string
    let latestUploadAt: string | null = null
    let knownSections: string[] = []

    if (overridePeriod) {
      period = await getPeriodDates(overridePeriod)
      if (!period) {
        return NextResponse.json({ error: `Period ${overridePeriod} not found` }, { status: 404 })
      }
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
              "No active exam period found. Upload data once, pass ?period=, or create an exam period that includes today.",
          },
          { status: 404 },
        )
      }
      period = resolved.period
      source = resolved.source
      latestUploadAt = resolved.latestUploadAt
      knownSections = resolved.knownSections
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
