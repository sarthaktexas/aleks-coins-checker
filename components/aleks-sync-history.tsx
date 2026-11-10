"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Clock, RefreshCw, XCircle } from "lucide-react"
import type { AleksSyncHistoryDay, AleksSyncRunLogs } from "@/lib/github-actions"
import { Button } from "@/components/ui/button"

function outcomeLabel(outcome: AleksSyncHistoryDay["runs"][number]["outcome"]): string {
  switch (outcome) {
    case "success":
      return "Succeeded"
    case "failure":
      return "Failed"
    case "running":
      return "Running"
    default:
      return "Other"
  }
}


function workflowLabel(kind: AleksSyncHistoryDay["runs"][number]["workflow"]): string {
  return kind === "pull" ? "Pull" : "Reviewed topics"
}

function OutcomeIcon({
  outcome,
}: {
  outcome: AleksSyncHistoryDay["runs"][number]["outcome"]
}) {
  switch (outcome) {
    case "success":
      return <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-700" />
    case "failure":
      return <XCircle className="h-3.5 w-3.5 shrink-0 text-red-700" />
    case "running":
      return <Clock className="h-3.5 w-3.5 shrink-0 text-utsa-orange" />
    default:
      return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-utsa-muted" />
  }
}

type AleksSyncHistoryProps = {
  title: string
  description: string
  endpoint: string
  emptyMessage?: string
  showWorkflowTag?: boolean
}

type RunLogsState = {
  loading?: boolean
  error?: string
  data?: AleksSyncRunLogs
}

export function AleksSyncHistory({
  title,
  description,
  endpoint,
  emptyMessage = "No workflow history found yet.",
  showWorkflowTag = false,
}: AleksSyncHistoryProps) {
  const [days, setDays] = useState<AleksSyncHistoryDay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null)
  const [runLogs, setRunLogs] = useState<Record<number, RunLogsState>>({})

  const load = async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch(endpoint, {
        credentials: "same-origin",
        cache: "no-store",
      })
      const data = await response.json()
      if (response.status === 401) {
        setError("Session expired — refresh and sign in again.")
        return
      }
      if (!response.ok) {
        setError(data.error || "Failed to load pull history")
        return
      }
      setDays(data.days || [])
    } catch {
      setError("Network error loading pull history")
    } finally {
      setLoading(false)
    }
  }

  const loadRunLogs = async (runId: number) => {
    setRunLogs((prev) => ({ ...prev, [runId]: { ...prev[runId], loading: true, error: undefined } }))
    try {
      const response = await fetch(`/api/admin/aleks-sync/history-run-logs?runId=${runId}`, {
        credentials: "same-origin",
        cache: "no-store",
      })
      const data = await response.json()
      if (!response.ok) {
        setRunLogs((prev) => ({
          ...prev,
          [runId]: { loading: false, error: data.error || "Failed to load run logs" },
        }))
        return
      }
      setRunLogs((prev) => ({
        ...prev,
        [runId]: { loading: false, data: data as AleksSyncRunLogs },
      }))
    } catch {
      setRunLogs((prev) => ({
        ...prev,
        [runId]: { loading: false, error: "Network error loading run logs" },
      }))
    }
  }

  const toggleRun = (runId: number) => {
    if (expandedRunId === runId) {
      setExpandedRunId(null)
      return
    }
    setExpandedRunId(runId)
    if (!runLogs[runId]?.data && !runLogs[runId]?.loading) {
      void loadRunLogs(runId)
    }
  }

  useEffect(() => {
    load()
    // endpoint determines which workflow history this card loads
  }, [endpoint])

  return (
    <div className="space-y-3 rounded-md border border-utsa-border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-utsa-midnight">{title}</h2>
          <p className="text-xs text-utsa-muted">
            {description}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Loading…
            </>
          ) : (
            "Refresh"
          )}
        </Button>
      </div>


      {error && (
        <div className="rounded-md border border-utsa-orange/30 bg-utsa-orange/10 px-3 py-2 text-xs text-utsa-accessible">
          {error}
        </div>
      )}

      {!error && !loading && days.length === 0 && (
        <p className="text-sm text-utsa-muted">{emptyMessage}</p>
      )}

      {days.length > 0 && (
        <div className="space-y-4">
          {days.map((day) => (
            <div key={day.dateKey} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-utsa-muted">
                {day.dayLabel}
              </h3>
              <ul className="divide-y divide-utsa-border rounded-md border border-utsa-border">
                {day.runs.map((run) => {
                  const expanded = expandedRunId === run.id
                  const logs = runLogs[run.id]
                  return (
                    <li key={run.id} className="text-sm">
                      <button
                        type="button"
                        onClick={() => toggleRun(run.id)}
                        className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left hover:bg-utsa-surface/60"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {expanded ? (
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-utsa-muted" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-utsa-muted" />
                          )}
                          <OutcomeIcon outcome={run.outcome} />
                          <span className="text-utsa-midnight">{run.timeLabel}</span>
                          <span className="text-xs text-utsa-muted">
                            {run.trigger === "nightly" ? "Nightly" : "Manual"}
                          </span>
                          {showWorkflowTag && (
                            <span className="text-xs text-utsa-muted">
                              {workflowLabel(run.workflow)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={
                              run.outcome === "success"
                                ? "text-xs font-medium text-green-700"
                                : run.outcome === "failure"
                                  ? "text-xs font-medium text-red-700"
                                  : "text-xs font-medium text-utsa-muted"
                            }
                          >
                            {outcomeLabel(run.outcome)}
                          </span>
                          {run.outcome === "failure" && (
                            <span className="text-xs text-red-700">Contact developer</span>
                          )}
                        </div>
                      </button>

                      {expanded && (
                        <div className="space-y-2 border-t border-utsa-border bg-utsa-surface/40 px-3 py-2">
                          {logs?.loading && (
                            <p className="flex items-center gap-2 text-xs text-utsa-muted">
                              <RefreshCw className="h-3 w-3 animate-spin" />
                              Loading badge / sync logs…
                            </p>
                          )}
                          {logs?.error && (
                            <p className="text-xs text-red-700">{logs.error}</p>
                          )}
                          {logs?.data && (
                            <>
                              {logs.data.badgeSummary && (
                                <p
                                  className={
                                    logs.data.badgeHadError
                                      ? "text-xs font-medium text-red-800"
                                      : "text-xs text-utsa-midnight"
                                  }
                                >
                                  {logs.data.badgeSummary}
                                </p>
                              )}
                              {!logs.data.badgeSummary && logs.data.summary && (
                                <p className="text-xs text-utsa-midnight">{logs.data.summary}</p>
                              )}
                              {logs.data.badgeResults.length > 0 && (
                                <ul className="space-y-1 text-xs text-utsa-muted">
                                  {logs.data.badgeResults.map((badge, idx) => (
                                    <li key={`${run.id}-badge-${idx}`}>
                                      {badge.ok ? (
                                        <>
                                          Section {badge.section || "?"}: awarded{" "}
                                          {badge.badgesAwarded || 0} badge(s),{" "}
                                          {badge.coinsAwarded || 0} bonus coin(s)
                                          {badge.studentsProcessed != null
                                            ? ` · ${badge.studentsProcessed} students`
                                            : ""}
                                        </>
                                      ) : (
                                        <span className="text-red-700">
                                          Section {badge.section || "?"}:{" "}
                                          {badge.error || "badge processing failed"}
                                        </span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {logs.data.logExcerpt && (
                                <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-utsa-border bg-white p-2 font-mono text-[11px] leading-relaxed text-utsa-midnight">
                                  {logs.data.logExcerpt}
                                </pre>
                              )}
                              {!logs.data.logExcerpt && !logs.data.badgeSummary && !logs.data.summary && (
                                <p className="text-xs text-utsa-muted">No log excerpt available.</p>
                              )}
                            </>
                          )}
                          {!logs?.loading && !logs?.error && !logs?.data && (
                            <p className="text-xs text-utsa-muted">Expand to load badge logs.</p>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
