import { type NextRequest, NextResponse } from "next/server"
import { isSession, requireAdmin, requireProfessor } from "@/lib/admin-auth"
import {
  dispatchWorkflow,
  findWorkflowRunSince,
  getWorkflowRunSnapshot,
  requireGitHubConfig,
} from "@/lib/github-actions"

export const dynamic = "force-dynamic"

const WORKFLOW_FILE = process.env.ALEKS_CHECK_LOGIN_WORKFLOW || "aleks-check-login.yml"

/**
 * POST /api/admin/aleks-sync/check-login
 * Dispatches the ALEKS check-login workflow. Professors only.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin(request)
    if (!isSession(session)) return session
    const professorGate = requireProfessor(session)
    if (professorGate !== true) return professorGate

    const result = await dispatchWorkflow(WORKFLOW_FILE)
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, details: "details" in result ? result.details : undefined },
        { status: result.status },
      )
    }

    return NextResponse.json({
      success: true,
      message: "Login check started. Status will appear below.",
      workflow: WORKFLOW_FILE,
      dispatchedAt: result.dispatchedAt,
      runId: null,
    })
  } catch (error) {
    console.error("ALEKS check-login trigger error:", error)
    return NextResponse.json(
      {
        error: "Failed to start ALEKS login check",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
      },
      { status: 500 },
    )
  }
}

/**
 * GET /api/admin/aleks-sync/check-login?runId=… | ?since=…
 * Poll workflow status + log excerpt for the Start Here UI. Professors only.
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
        return NextResponse.json(
          { error: "Provide runId or since to check status" },
          { status: 400 },
        )
      }
      const run = await findWorkflowRunSince(WORKFLOW_FILE, since)
      if (!run) {
        return NextResponse.json({
          waiting: true,
          status: "waiting",
          summary: "Starting login check…",
          runId: null,
          conclusion: null,
          logExcerpt: null,
        })
      }
      runId = run.id
    }

    const snapshot = await getWorkflowRunSnapshot(runId)
    return NextResponse.json({
      waiting: snapshot.status !== "completed",
      runId: snapshot.runId,
      status: snapshot.status,
      conclusion: snapshot.conclusion,
      summary: snapshot.summary,
      logExcerpt: snapshot.logExcerpt,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
    })
  } catch (error) {
    console.error("ALEKS check-login status error:", error)
    return NextResponse.json(
      {
        error: "Failed to load login check status",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
      },
      { status: 500 },
    )
  }
}
