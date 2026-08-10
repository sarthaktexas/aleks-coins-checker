import { type NextRequest, NextResponse } from "next/server"
import { computeReportWindow, getPeriodDates } from "@/lib/aleks-excel"
import { isAuthorized, requireImportToken } from "@/lib/import-token"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/aleks-sync/config?period=<period_key>
 * Auth: Bearer IMPORT_API_TOKEN
 */
export async function GET(request: NextRequest) {
  try {
    const auth = requireImportToken(request)
    if (!isAuthorized(auth)) return auth

    const periodKey = request.nextUrl.searchParams.get("period")
    if (!periodKey) {
      return NextResponse.json({ error: "period query param is required" }, { status: 400 })
    }

    const period = await getPeriodDates(periodKey)
    if (!period) {
      return NextResponse.json({ error: `Period ${periodKey} not found` }, { status: 404 })
    }

    const window = computeReportWindow(period.startDate, period.endDate)

    return NextResponse.json({
      success: true,
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
