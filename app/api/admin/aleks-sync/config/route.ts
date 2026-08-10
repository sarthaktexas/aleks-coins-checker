import { type NextRequest, NextResponse } from "next/server"
import { computeReportWindow, getPeriodDates, resolveActivePeriod } from "@/lib/aleks-excel"
import { isAuthorized, requireImportToken } from "@/lib/import-token"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/aleks-sync/config
 * Optional ?period= — otherwise uses period from latest student_data upload.
 * Auth: Bearer IMPORT_API_TOKEN
 */
export async function GET(request: NextRequest) {
  try {
    const auth = requireImportToken(request)
    if (!isAuthorized(auth)) return auth

    const overridePeriod = request.nextUrl.searchParams.get("period")

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
      const resolved = await resolveActivePeriod()
      if (resolved?.period.periodKey === overridePeriod) {
        knownSections = resolved.knownSections
        latestUploadAt = resolved.latestUploadAt
      }
    } else {
      const resolved = await resolveActivePeriod()
      if (!resolved) {
        return NextResponse.json(
          {
            error:
              "No active exam period found. Upload data once or create an exam period that includes today.",
          },
          { status: 404 },
        )
      }
      period = resolved.period
      source = resolved.source
      latestUploadAt = resolved.latestUploadAt
      knownSections = resolved.knownSections
    }

    const window = computeReportWindow(period.startDate, period.endDate)

    return NextResponse.json({
      success: true,
      source,
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
