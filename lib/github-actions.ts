/**
 * Shared helpers for dispatching GitHub Actions workflows and reading run status/logs.
 * Used by admin triggers so professors can see results in-app without GitHub access.
 */

export type GitHubWorkflowRun = {
  id: number
  status: string
  conclusion: string | null
  html_url: string
  created_at: string
  updated_at: string
  name: string
  display_title?: string
  event?: string
}

export type AleksSyncHistoryRun = {
  id: number
  ranAt: string
  timeLabel: string
  workflow: "pull" | "reviews"
  trigger: "nightly" | "manual"
  status: string
  conclusion: string | null
  outcome: "success" | "failure" | "running" | "other"
}

export type AleksSyncHistoryDay = {
  dateKey: string
  dayLabel: string
  runs: AleksSyncHistoryRun[]
}

export type WorkflowRunSnapshot = {
  runId: number
  status: "queued" | "in_progress" | "completed" | "waiting" | "requested" | "pending" | string
  conclusion: "success" | "failure" | "cancelled" | "timed_out" | "neutral" | "skipped" | null
  createdAt: string
  updatedAt: string
  name: string
  logExcerpt: string | null
  summary: string | null
}

const UTSA_TIME_ZONE = "America/Chicago"

function githubHeaders(pat: string, extra?: Record<string, string>) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${pat}`,
    "X-GitHub-Api-Version": "2022-11-28",
    ...extra,
  }
}

export function getGitHubPat(): string | null {
  const pat = process.env.GITHUB_SYNC_PAT || process.env.GITHUB_TOKEN
  return pat?.trim() || null
}

export function getGitHubRepo(): string | null {
  const explicit = process.env.GITHUB_REPO?.trim()
  if (explicit) return explicit
  if (process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG) {
    return `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
  }
  return null
}

export function requireGitHubConfig():
  | { ok: true; pat: string; repo: string }
  | { ok: false; error: string; status: number } {
  const pat = getGitHubPat()
  if (!pat) {
    return {
      ok: false,
      status: 503,
      error:
        "This workflow isn't configured yet (missing GitHub access token). Ask the developer to finish setup.",
    }
  }
  const repo = getGitHubRepo()
  if (!repo) {
    return {
      ok: false,
      status: 503,
      error:
        "This workflow isn't configured yet (missing repository name). Ask the developer to finish setup.",
    }
  }
  return { ok: true, pat, repo }
}

export async function dispatchWorkflow(
  workflowFile: string,
  inputs: Record<string, string | boolean> = {},
  label = "workflow",
): Promise<{ ok: true; dispatchedAt: string } | { ok: false; status: number; error: string; details?: string }> {
  const cfg = requireGitHubConfig()
  if (!cfg.ok) return cfg

  const url = `https://api.github.com/repos/${cfg.repo}/actions/workflows/${workflowFile}/dispatches`
  const res = await fetch(url, {
    method: "POST",
    headers: githubHeaders(cfg.pat, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      ref: process.env.ALEKS_SYNC_REF || "main",
      ...(Object.keys(inputs).length > 0 ? { inputs } : {}),
    }),
  })

  if (res.status === 204) {
    return { ok: true, dispatchedAt: new Date().toISOString() }
  }

  const detail = await res.text()
  return {
    ok: false,
    status: 502,
    error: `Could not start ${label} (${res.status}).`,
    details: detail.slice(0, 500),
  }
}

async function listWorkflowRuns(
  pat: string,
  repo: string,
  workflowFile: string,
  options?: { perPage?: number; event?: string },
): Promise<GitHubWorkflowRun[]> {
  const perPage = options?.perPage ?? 10
  const params = new URLSearchParams({ per_page: String(perPage) })
  if (options?.event) params.set("event", options.event)
  const url = `https://api.github.com/repos/${repo}/actions/workflows/${workflowFile}/runs?${params}`
  const res = await fetch(url, { headers: githubHeaders(pat), cache: "no-store" })
  if (!res.ok) {
    throw new Error(`Failed to list workflow runs (${res.status})`)
  }
  const data = (await res.json()) as { workflow_runs?: GitHubWorkflowRun[] }
  return data.workflow_runs || []
}

function runOutcome(
  status: string,
  conclusion: string | null,
): AleksSyncHistoryRun["outcome"] {
  if (status !== "completed") return "running"
  if (conclusion === "success") return "success"
  if (conclusion === "failure") return "failure"
  return "other"
}

function dayLabelFromIso(iso: string): { dateKey: string; dayLabel: string } {
  const d = new Date(iso)
  const dayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: UTSA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d)
  const year = dayParts.find((p) => p.type === "year")?.value
  const month = dayParts.find((p) => p.type === "month")?.value
  const day = dayParts.find((p) => p.type === "day")?.value
  const dateKey = year && month && day ? `${year}-${month}-${day}` : d.toISOString().slice(0, 10)
  const dayLabel = d.toLocaleDateString("en-US", {
    timeZone: UTSA_TIME_ZONE,
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  return { dateKey, dayLabel }
}

function timeLabelFromIso(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString("en-US", {
    timeZone: UTSA_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  })
}

/** Recent ALEKS daily sync runs grouped by local calendar day. */
export async function getAleksSyncRunHistory(
  workflowFile = process.env.ALEKS_SYNC_WORKFLOW || "aleks-sync.yml",
  perPage = 90,
  workflow: "pull" | "reviews" = "pull",
): Promise<AleksSyncHistoryDay[]> {
  const cfg = requireGitHubConfig()
  if (!cfg.ok) throw new Error(cfg.error)

  const runs = await listWorkflowRuns(cfg.pat, cfg.repo, workflowFile, { perPage })
  const byDay = new Map<string, AleksSyncHistoryDay>()

  for (const run of runs) {
    const { dateKey, dayLabel } = dayLabelFromIso(run.created_at)
    const entry: AleksSyncHistoryRun = {
      id: run.id,
      ranAt: run.created_at,
      timeLabel: timeLabelFromIso(run.created_at),
      workflow,
      trigger: run.event === "schedule" ? "nightly" : "manual",
      status: run.status,
      conclusion: run.conclusion,
      outcome: runOutcome(run.status, run.conclusion),
    }
    const existing = byDay.get(dateKey)
    if (existing) {
      existing.runs.push(entry)
    } else {
      byDay.set(dateKey, { dateKey, dayLabel, runs: [entry] })
    }
  }

  return [...byDay.values()].sort((a, b) => b.dateKey.localeCompare(a.dateKey))
}

export async function findWorkflowRunSince(
  workflowFile: string,
  sinceIso: string,
): Promise<GitHubWorkflowRun | null> {
  const cfg = requireGitHubConfig()
  if (!cfg.ok) throw new Error(cfg.error)

  const sinceMs = new Date(sinceIso).getTime() - 15_000
  const runs = await listWorkflowRuns(cfg.pat, cfg.repo, workflowFile, {
    perPage: 10,
    event: "workflow_dispatch",
  })
  return (
    runs.find((run) => {
      const created = new Date(run.created_at).getTime()
      return Number.isFinite(created) && created >= sinceMs
    }) || null
  )
}

export async function getWorkflowRun(
  runId: number,
): Promise<GitHubWorkflowRun> {
  const cfg = requireGitHubConfig()
  if (!cfg.ok) throw new Error(cfg.error)

  const url = `https://api.github.com/repos/${cfg.repo}/actions/runs/${runId}`
  const res = await fetch(url, { headers: githubHeaders(cfg.pat), cache: "no-store" })
  if (!res.ok) {
    throw new Error(`Failed to load run ${runId} (${res.status})`)
  }
  return (await res.json()) as GitHubWorkflowRun
}

function stripGithubLogLine(line: string): string {
  // GitHub job logs: "2024-01-01T12:00:00.0000000Z message" or "##[group]..."
  let s = line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/, "")
  s = s.replace(/^##\[[^\]]+\]\s*/, "")
  return s.trimEnd()
}

function extractRelevantLogLines(raw: string, maxLines = 40): string {
  const lines = raw.split(/\r?\n/).map(stripGithubLogLine)
  const interestingIdx: number[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (
      /ALEKS login|Checking ALEKS|check credentials|login succeeded|login failed|"ok":\s*true|"ok":\s*false|Error:|##ALEKS_LOGIN_RESULT##/i.test(
        line,
      )
    ) {
      interestingIdx.push(i)
    }
  }

  if (interestingIdx.length === 0) {
    const nonempty = lines.filter((l) => l.trim().length > 0)
    return nonempty.slice(-maxLines).join("\n").trim()
  }

  const start = Math.max(0, interestingIdx[0] - 2)
  const end = Math.min(lines.length, interestingIdx[interestingIdx.length - 1] + 3)
  return lines
    .slice(start, end)
    .filter((l) => l.trim().length > 0)
    .slice(-maxLines)
    .join("\n")
    .trim()
}

async function fetchJobLogs(pat: string, repo: string, jobId: number): Promise<string | null> {
  const url = `https://api.github.com/repos/${repo}/actions/jobs/${jobId}/logs`
  const res = await fetch(url, {
    headers: githubHeaders(pat, { Accept: "application/vnd.github+json" }),
    redirect: "follow",
    cache: "no-store",
  })
  if (!res.ok) return null
  const text = await res.text()
  return text || null
}

export async function getWorkflowRunSnapshot(
  runId: number,
  options?: { includeLogs?: boolean },
): Promise<WorkflowRunSnapshot> {
  const cfg = requireGitHubConfig()
  if (!cfg.ok) throw new Error(cfg.error)

  const run = await getWorkflowRun(runId)
  const snapshot: WorkflowRunSnapshot = {
    runId: run.id,
    status: run.status,
    conclusion: run.conclusion as WorkflowRunSnapshot["conclusion"],
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    name: run.name || run.display_title || "Workflow",
    logExcerpt: null,
    summary: null,
  }

  if (run.status !== "completed") {
    if (run.status === "queued" || run.status === "waiting" || run.status === "requested" || run.status === "pending") {
      snapshot.summary = "Queued — waiting to start…"
    } else {
      snapshot.summary = "Running — checking ALEKS login…"
    }
    return snapshot
  }

  if (run.conclusion === "success") {
    snapshot.summary = "ALEKS login succeeded. The stored credentials still work."
  } else if (run.conclusion === "failure") {
    snapshot.summary =
      "ALEKS login failed. The stored username or password may be wrong or expired — update them and try again."
  } else if (run.conclusion === "cancelled") {
    snapshot.summary = "Login check was cancelled."
  } else if (run.conclusion === "timed_out") {
    snapshot.summary = "Login check timed out. Try again in a few minutes."
  } else {
    snapshot.summary = `Login check finished with status: ${run.conclusion || "unknown"}.`
  }

  if (options?.includeLogs !== false) {
    try {
      const jobsUrl = `https://api.github.com/repos/${cfg.repo}/actions/runs/${runId}/jobs`
      const jobsRes = await fetch(jobsUrl, {
        headers: githubHeaders(cfg.pat),
        cache: "no-store",
      })
      if (jobsRes.ok) {
        const jobsData = (await jobsRes.json()) as {
          jobs?: Array<{ id: number; name: string; conclusion: string | null }>
        }
        const jobs = jobsData.jobs || []
        const job =
          jobs.find((j) => j.conclusion === "failure") ||
          jobs.find((j) => j.conclusion === "success") ||
          jobs[0]
        if (job) {
          const raw = await fetchJobLogs(cfg.pat, cfg.repo, job.id)
          if (raw) {
            snapshot.logExcerpt = extractRelevantLogLines(raw)
            // Prefer an explicit result marker if present
            const marker = snapshot.logExcerpt.match(/##ALEKS_LOGIN_RESULT##\s*(\{.*\})/)
            if (marker) {
              try {
                const parsed = JSON.parse(marker[1]) as { ok?: boolean; error?: string }
                if (parsed.ok === true) {
                  snapshot.summary = "ALEKS login succeeded. The stored credentials still work."
                } else if (parsed.ok === false) {
                  snapshot.summary = parsed.error
                    ? `ALEKS login failed: ${parsed.error}`
                    : snapshot.summary
                }
              } catch {
                /* ignore */
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch workflow logs:", err)
    }
  }

  return snapshot
}
