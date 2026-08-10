import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"
import { isSession, requireAdmin } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

async function ensureBugReportsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS bug_reports (
      id SERIAL PRIMARY KEY,
      student_id TEXT,
      contact_email TEXT,
      page_url TEXT,
      description TEXT NOT NULL,
      user_agent TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      admin_notes TEXT,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    )
  `
}

export async function GET(request: NextRequest) {
  try {
    const session = requireAdmin(request)
    if (!isSession(session)) return session

    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json(
        { error: "Database not configured", reports: [] },
        { status: 503 }
      )
    }

    await ensureBugReportsTable()

    const result = await sql`
      SELECT
        id,
        student_id,
        contact_email,
        page_url,
        description,
        user_agent,
        status,
        admin_notes,
        submitted_at,
        resolved_at
      FROM bug_reports
      ORDER BY
        CASE WHEN status = 'open' THEN 0 ELSE 1 END,
        submitted_at DESC
    `

    return NextResponse.json({
      success: true,
      reports: result.rows,
    })
  } catch (error) {
    console.error("Error fetching bug reports:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch bug reports",
        details:
          process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
      },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = requireAdmin(request)
    if (!isSession(session)) return session

    const body = await request.json()
    const { reportId, status, adminNotes } = body

    if (!reportId || !status) {
      return NextResponse.json(
        { error: "Report ID and status are required" },
        { status: 400 }
      )
    }

    const allowed = ["open", "resolved", "ignored"]
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }

    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    await ensureBugReportsTable()

    await sql`
      UPDATE bug_reports
      SET
        status = ${status},
        admin_notes = ${adminNotes ?? null},
        resolved_at = CASE
          WHEN ${status} = 'open' THEN NULL
          ELSE COALESCE(resolved_at, NOW())
        END
      WHERE id = ${reportId}
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating bug report:", error)
    return NextResponse.json(
      {
        error: "Failed to update bug report",
        details:
          process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
      },
      { status: 500 }
    )
  }
}
