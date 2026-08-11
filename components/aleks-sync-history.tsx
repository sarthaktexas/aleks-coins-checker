"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle, Clock, RefreshCw, XCircle } from "lucide-react"
import type { AleksSyncHistoryDay } from "@/lib/github-actions"
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


function localTimeLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  })
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
                {day.runs.map((run) => (
                  <li
                    key={run.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <OutcomeIcon outcome={run.outcome} />
                      <span className="text-utsa-midnight">{localTimeLabel(run.ranAt) || run.timeLabel}</span>
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
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
