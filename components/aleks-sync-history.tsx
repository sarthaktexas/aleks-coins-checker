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

export function AleksSyncHistory() {
  const [days, setDays] = useState<AleksSyncHistoryDay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [hasFailure, setHasFailure] = useState(false)

  const load = async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/admin/aleks-sync/history", {
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
      setHasFailure(Boolean(data.hasFailure))
    } catch {
      setError("Network error loading pull history")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="space-y-3 rounded-md border border-utsa-border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-utsa-midnight">ALEKS pull history</h2>
          <p className="text-xs text-utsa-muted">
            Nightly automatic pulls and manual pulls, grouped by day.
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

      {hasFailure && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          At least one recent pull failed. Please contact the developer.
        </div>
      )}

      {error && (
        <div className="rounded-md border border-utsa-orange/30 bg-utsa-orange/10 px-3 py-2 text-xs text-utsa-accessible">
          {error}
        </div>
      )}

      {!error && !loading && days.length === 0 && (
        <p className="text-sm text-utsa-muted">No pull history found yet.</p>
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
                      <span className="text-utsa-midnight">{run.timeLabel}</span>
                      <span className="text-xs text-utsa-muted">
                        {run.trigger === "nightly" ? "Nightly" : "Manual"}
                      </span>
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
