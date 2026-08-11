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

type PullImportStatus = "imported" | "no_data" | "unknown"

async function fetchRunLogs(pat: string, repo: string, runId: number): Promise<string | null> {
  try {
    const jobsUrl = `https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs`
    const jobsRes = await fetch(jobsUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${pat}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    })
    if (!jobsRes.ok) return null

    const jobsData = (await jobsRes.json()) as { jobs?: Array<{ id: number }> }
    const jobs = jobsData.jobs || []
    if (jobs.length === 0) return null

    const logs: string[] = []
    for (const job of jobs) {
      const logsUrl = `https://api.github.com/repos/${repo}/actions/jobs/${job.id}/logs`
      const logsRes = await fetch(logsUrl, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${pat}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        redirect: "follow",
        cache: "no-store",
      })
      if (!logsRes.ok) continue
      const text = await logsRes.text()
      if (text) logs.push(text)
    }

    if (logs.length === 0) return null
    return logs.join("\n")
  } catch {
    return null
  }
}

function summarizeImportFromLogs(logs: string | null): {
  importStatus: PullImportStatus
  sectionsImported: number
  studentsImported: number
} {
  if (!logs) {
    return { importStatus: "unknown", sectionsImported: 0, studentsImported: 0 }
  }

  const importedMatches = [...logs.matchAll(/Imported:\s+(\d+)\s+students/gi)]
  const sectionsImported = importedMatches.length
  const studentsImported = importedMatches.reduce((sum, m) => sum + Number(m[1] || 0), 0)

  if (sectionsImported > 0) {
    return {
      importStatus: "imported",
      sectionsImported,
      studentsImported,
    }
  }

  if (/Skipping sync:/i.test(logs)) {
    return { importStatus: "no_data", sectionsImported: 0, studentsImported: 0 }
  }

  return { importStatus: "unknown", sectionsImported: 0, studentsImported: 0 }
}

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
    let bodyForceProvided = false
    try {
      const body = await request.json()
      if (typeof body?.period === "string") period = body.period.trim()
      if (typeof body?.force === "boolean") {
        force = body.force
        bodyForceProvided = true
      }
      if (body?.force === "1" || body?.force === "true") {
        force = true
        bodyForceProvided = true
      }
    } catch {
      // empty body is fine
    }

    // Manual in-app pulls always include a specific period; default those runs to force=true
    // so ended periods still import data instead of exiting as a no-op success.
    if (period && !bodyForceProvided) {
      force = true
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
    const importSummary =
      done && snapshot.conclusion === "success"
        ? summarizeImportFromLogs(await fetchRunLogs(cfg.pat, cfg.repo, snapshot.runId))
        : { importStatus: "unknown" as PullImportStatus, sectionsImported: 0, studentsImported: 0 }

    const summary = done
      ? snapshot.conclusion === "success"
        ? importSummary.importStatus === "imported"
          ? `ALEKS pull succeeded. Imported ${importSummary.sectionsImported} section${importSummary.sectionsImported === 1 ? "" : "s"} (${importSummary.studentsImported} student${importSummary.studentsImported === 1 ? "" : "s"}).`
          : importSummary.importStatus === "no_data"
            ? "ALEKS pull ran, but no new data was imported for this period."
            : "ALEKS pull succeeded."
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
      importStatus: importSummary.importStatus,
      sectionsImported: importSummary.sectionsImported,
      studentsImported: importSummary.studentsImported,
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
