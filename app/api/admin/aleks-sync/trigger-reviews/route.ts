import { type NextRequest, NextResponse } from "next/server"
import { isSession, requireAdmin, requireProfessor } from "@/lib/admin-auth"
import {
  dispatchWorkflow,
  findWorkflowRunSince,
  getWorkflowRunSnapshot,
  requireGitHubConfig,
} from "@/lib/github-actions"

export const dynamic = "force-dynamic"
const WORKFLOW_FILE = process.env.ALEKS_REVIEW_WORKFLOW || "aleks-review-overrides.yml"

/**
 * POST /api/admin/aleks-sync/trigger-reviews
 * Dispatches the GitHub Actions "ALEKS review overrides" workflow (workflow_dispatch).
 * Professors only.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin(request)
    if (!isSession(session)) return session
    const professorGate = requireProfessor(session)
    if (professorGate !== true) return professorGate

    const result = await dispatchWorkflow(WORKFLOW_FILE, {}, "reviewed-topics verification")
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, details: "details" in result ? result.details : undefined },
        { status: result.status },
      )
    }

    return NextResponse.json({
      success: true,
      message: "Reviewed-topics verification started. Status will appear below.",
      workflow: WORKFLOW_FILE,
      dispatchedAt: result.dispatchedAt,
      runId: null,
    })
  } catch (error) {
    console.error("ALEKS review-overrides trigger error:", error)
    return NextResponse.json(
      {
        error: "Failed to trigger ALEKS review verification",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
      },
      { status: 500 },
    )
  }
}

/**
 * GET /api/admin/aleks-sync/trigger-reviews?runId=… | ?since=…
 * Poll reviewed-topics verification workflow status for in-app professor UI.
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
          summary: "Starting reviewed-topics verification…",
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
        ? "Reviewed-topics verification succeeded."
        : "Reviewed-topics verification did not succeed. Please contact the developer to fix it."
      : snapshot.status === "queued" || snapshot.status === "waiting" || snapshot.status === "requested" || snapshot.status === "pending"
        ? "Queued — waiting to start verification…"
        : "Running reviewed-topics verification…"

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
    console.error("ALEKS review-overrides status error:", error)
    return NextResponse.json(
      {
        error: "Failed to load reviewed-topics verification status",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
      },
      { status: 500 },
    )
  }
}
