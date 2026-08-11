import { type NextRequest, NextResponse } from "next/server"
import { isSession, requireAdmin, requireProfessor } from "@/lib/admin-auth"
import { getAleksSyncRunHistory, type AleksSyncHistoryDay, requireGitHubConfig } from "@/lib/github-actions"

export const dynamic = "force-dynamic"

const PULL_WORKFLOW = process.env.ALEKS_SYNC_WORKFLOW || "aleks-sync.yml"
const REVIEWS_WORKFLOW = process.env.ALEKS_REVIEW_WORKFLOW || "aleks-review-overrides.yml"

/**
 * GET /api/admin/aleks-sync/history-timeline
 * Combined timeline of pull + reviewed-topics workflows grouped by day. Professors only.
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

    const [pullDays, reviewDays] = await Promise.all([
      getAleksSyncRunHistory(PULL_WORKFLOW, limit, "pull"),
      getAleksSyncRunHistory(REVIEWS_WORKFLOW, limit, "reviews"),
    ])

    const map = new Map<string, AleksSyncHistoryDay>()
    for (const src of [pullDays, reviewDays]) {
      for (const day of src) {
        const existing = map.get(day.dateKey)
        if (!existing) {
          map.set(day.dateKey, { ...day, runs: [...day.runs] })
        } else {
          existing.runs.push(...day.runs)
        }
      }
    }

    const days = [...map.values()]
      .map((day) => ({
        ...day,
        runs: [...day.runs].sort((a, b) => +new Date(b.ranAt) - +new Date(a.ranAt)),
      }))
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey))

    return NextResponse.json({ days })
  } catch (error) {
    console.error("ALEKS timeline history error:", error)
    return NextResponse.json(
      {
        error: "Failed to load workflow timeline",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
      },
      { status: 500 },
    )
  }
}
