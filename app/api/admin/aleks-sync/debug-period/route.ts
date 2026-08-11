import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"
import { isSession, requireAdmin, requireProfessor } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/aleks-sync/debug-period?period=...
 * Professor-only debug endpoint to compare period dates seen by server runtime.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin(request)
    if (!isSession(session)) return session
    const professorGate = requireProfessor(session)
    if (professorGate !== true) return professorGate

    const periodKey = request.nextUrl.searchParams.get("period")?.trim()
    if (!periodKey) {
      return NextResponse.json({ error: "period query param is required" }, { status: 400 })
    }

    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    const result = await sql`
      SELECT period_key, name, start_date, end_date, excluded_dates, updated_at
      FROM exam_periods
      WHERE period_key = ${periodKey}
      LIMIT 1
    `

    if (result.rows.length === 0) {
      return NextResponse.json({ error: `Period ${periodKey} not found` }, { status: 404 })
    }

    const row = result.rows[0]
    const normalizeDate = (value: unknown) => {
      if (!value) return null
      if (typeof value === "string") return value.slice(0, 10)
      return new Date(value as Date).toISOString().slice(0, 10)
    }

    return NextResponse.json({
      period: {
        key: String(row.period_key),
        name: String(row.name),
        startDate: normalizeDate(row.start_date),
        endDate: normalizeDate(row.end_date),
        excludedDates: (row.excluded_dates as string[]) || [],
        updatedAt: row.updated_at ? new Date(row.updated_at as string).toISOString() : null,
      },
      env: {
        hasPostgresUrl: Boolean(process.env.POSTGRES_URL),
        hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
      },
    })
  } catch (error) {
    console.error("Debug period lookup error:", error)
    return NextResponse.json(
      {
        error: "Failed to load debug period",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
      },
      { status: 500 },
    )
  }
}

