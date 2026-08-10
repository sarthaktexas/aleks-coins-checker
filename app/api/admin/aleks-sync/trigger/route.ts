import { type NextRequest, NextResponse } from "next/server"
import { isSession, requireAdmin } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

/**
 * POST /api/admin/aleks-sync/trigger
 * Body (optional JSON):
 *   { period?: string, force?: boolean }
 *
 * Dispatches the GitHub Actions "ALEKS daily sync" workflow (workflow_dispatch).
 */
export async function POST(request: NextRequest) {
  try {
    const session = requireAdmin(request)
    if (!isSession(session)) return session

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

    const pat = process.env.GITHUB_SYNC_PAT || process.env.GITHUB_TOKEN
    if (!pat) {
      return NextResponse.json(
        {
          error:
            "GITHUB_SYNC_PAT is not configured. Add a GitHub PAT with Actions write access to Vercel env, or run the workflow from the Actions tab.",
        },
        { status: 503 },
      )
    }

    const repo =
      process.env.GITHUB_REPO ||
      (process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
        ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
        : null)

    if (!repo) {
      return NextResponse.json(
        { error: "GITHUB_REPO is not configured (expected owner/repo)" },
        { status: 503 },
      )
    }

    const workflowFile = process.env.ALEKS_SYNC_WORKFLOW || "aleks-sync.yml"
    const url = `https://api.github.com/repos/${repo}/actions/workflows/${workflowFile}/dispatches`

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${pat}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: process.env.ALEKS_SYNC_REF || "main",
        inputs: {
          period: period || "",
          force: force ? "true" : "false",
        },
      }),
    })

    if (res.status === 204) {
      const bits = [
        force ? "forced" : null,
        period ? `period=${period}` : "auto period",
      ].filter(Boolean)
      return NextResponse.json({
        success: true,
        message: `ALEKS sync workflow dispatched on ${repo} (${bits.join(", ")}). Check GitHub → Actions for progress.`,
        repo,
        workflow: workflowFile,
        period: period || null,
        force,
        actionsUrl: `https://github.com/${repo}/actions/workflows/${workflowFile}`,
      })
    }

    const detail = await res.text()
    return NextResponse.json(
      {
        error: `GitHub dispatch failed (${res.status})`,
        details: detail.slice(0, 500),
      },
      { status: 502 },
    )
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
