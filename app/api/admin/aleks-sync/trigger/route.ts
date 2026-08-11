import { type NextRequest, NextResponse } from "next/server"
import { isSession, requireAdmin, requireProfessor } from "@/lib/admin-auth"
import {
  dispatchWorkflow,
  findWorkflowRunSince,
  getWorkflowRunSnapshot,
  requireGitHubConfig,
} from "@/lib/github-actions"

export const dynamic = "force-dynamic"
const WORKFLOW_FILE = process.env.ALEKS_SYNC_WORKFLOW || "aleks-sync.yml"

/**
 * POST /api/admin/aleks-sync/trigger
 * Body (optional JSON):
 *   { period?: string, force?: boolean }
 *
 * Dispatches the GitHub Actions "ALEKS daily sync" workflow (workflow_dispatch).
 * Professors only.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin(request)
    if (!isSession(session)) return session
    const professorGate = requireProfessor(session)
    if (professorGate !== true) return professorGate

    let period = ""
    let force = false
    try {
      const body = await request.json()
      if (typeof body?.period === "string") period = body.period.trim()
      if (typeof body?.force === "boolean") force = body.force
      if (body?.force === "1" || body?.force === "true") force = true
    } catch {
      // empty body is fine
    }

    const result = await dispatchWorkflow(
      WORKFLOW_FILE,
      { period: period || "", force: force ? "true" : "false" },
      "ALEKS pull",
    )
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, details: "details" in result ? result.details : undefined },
        { status: result.status },
      )
    }

    return NextResponse.json({
      success: true,
      message: "ALEKS pull started. Status will appear below.",
      workflow: WORKFLOW_FILE,
      dispatchedAt: result.dispatchedAt,
      runId: null,
      period: period || null,
      force,
    })
  } catch (error) {
    console.error("ALEKS sync trigger error:", error)
    return NextResponse.json(
      {
        error: "Failed to trigger ALEKS sync",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
      },
      { status: 500 },
    )
  }
}

/**
 * GET /api/admin/aleks-sync/trigger?runId=… | ?since=…
 * Poll ALEKS pull workflow status for in-app professor UI.
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
    const since = request.nextUrl.searchParams.get("since")
    let runId = runIdParam ? Number(runIdParam) : NaN

    if (!Number.isFinite(runId)) {
      if (!since) {
        return NextResponse.json({ error: "Provide runId or since to check status" }, { status: 400 })
      }
      const run = await findWorkflowRunSince(WORKFLOW_FILE, since)
      if (!run) {
        return NextResponse.json({
          waiting: true,
          status: "waiting",
          summary: "Starting ALEKS pull…",
          runId: null,
          conclusion: null,
        })
      }
      runId = run.id
    }

    const snapshot = await getWorkflowRunSnapshot(runId, { includeLogs: false })
    const done = snapshot.status === "completed"
    const summary = done
      ? snapshot.conclusion === "success"
        ? "ALEKS pull succeeded."
        : "ALEKS pull did not succeed. Please contact the developer to fix it."
      : snapshot.status === "queued" || snapshot.status === "waiting" || snapshot.status === "requested" || snapshot.status === "pending"
        ? "Queued — waiting to start ALEKS pull…"
        : "Running ALEKS pull…"

    return NextResponse.json({
      waiting: !done,
      runId: snapshot.runId,
      status: snapshot.status,
      conclusion: snapshot.conclusion,
      summary,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
    })
  } catch (error) {
    console.error("ALEKS sync status error:", error)
    return NextResponse.json(
      {
        error: "Failed to load ALEKS pull status",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
      },
      { status: 500 },
    )
  }
}
