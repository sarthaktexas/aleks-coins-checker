import { type NextRequest, NextResponse } from "next/server"
import { isSession, requireAdmin, requireProfessor } from "@/lib/admin-auth"
import { getAleksSyncRunHistory, requireGitHubConfig } from "@/lib/github-actions"

export const dynamic = "force-dynamic"

const WORKFLOW_FILE = process.env.ALEKS_REVIEW_WORKFLOW || "aleks-review-overrides.yml"

/**
 * GET /api/admin/aleks-sync/history-reviews
 * Recent reviewed-topics verification workflow runs grouped by day. Professors only.
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

    const limitParam = request.nextUrl.searchParams.get("limit")
    const limit = limitParam ? Math.min(Math.max(Number(limitParam) || 90, 1), 100) : 90

    const days = await getAleksSyncRunHistory(WORKFLOW_FILE, limit, "reviews")

    return NextResponse.json({
      days,
      workflow: WORKFLOW_FILE,
    })
  } catch (error) {
    console.error("ALEKS review history error:", error)
    return NextResponse.json(
      {
        error: "Failed to load reviewed-topics verification history",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
      },
      { status: 500 },
    )
  }
}
