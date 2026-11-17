import { type NextRequest, NextResponse } from "next/server"
import { isSession, requireAdmin, requireProfessor } from "@/lib/admin-auth"
import { getAleksSyncRunLogs, requireGitHubConfig } from "@/lib/github-actions"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/aleks-sync/history-run-logs?runId=…
 * Lazy-load badge / import log excerpts for a Sync History row. Professors only.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin(request)
    if (!isSession(session)) return session
    const professorGate = requireProfessor(session)
    if (professorGate !== true) return professorGate

    const cfg = requireGitHubConfig()
    if (!cfg.ok) {
      return NextResponse.json({ error: cfg.error }, { status: cfg.status })
    }

    const runIdParam = request.nextUrl.searchParams.get("runId")
    const runId = runIdParam ? Number(runIdParam) : NaN
    if (!Number.isFinite(runId)) {
      return NextResponse.json({ error: "Provide a valid runId" }, { status: 400 })
    }

    const logs = await getAleksSyncRunLogs(runId)
    return NextResponse.json(logs)
  } catch (error) {
    console.error("ALEKS sync run logs error:", error)
    return NextResponse.json(
      {
        error: "Failed to load run logs",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
      },
      { status: 500 },
    )
  }
}
