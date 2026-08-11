"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2 } from "lucide-react"
import { formatLocalDateTime } from "@/lib/datetime"

type BugReport = {
  id: number
  student_id: string | null
  contact_email: string | null
  page_url: string | null
  description: string
  user_agent: string | null
  status: string
  admin_notes: string | null
  submitted_at: string
  resolved_at: string | null
}

const SESSION_EXPIRED = "Session expired — refresh and sign in again."

export default function AdminBugReportsPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [reports, setReports] = useState<BugReport[]>([])
  const [statusFilter, setStatusFilter] = useState("open")
  const [editingId, setEditingId] = useState<number | null>(null)
  const [adminNotes, setAdminNotes] = useState("")
  const [newStatus, setNewStatus] = useState("resolved")
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    loadReports()
  }, [])

  const loadReports = async () => {
    setIsLoading(true)
    setError("")

    try {
      const response = await fetch("/api/admin/bug-reports", { credentials: "same-origin" })
      if (response.status === 401) {
        setError(SESSION_EXPIRED)
        return
      }
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Failed to load bug reports")
        return
      }

      setReports(data.reports || [])
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const filtered = useMemo(() => {
    if (statusFilter === "all") return reports
    return reports.filter((r) => r.status === statusFilter)
  }, [reports, statusFilter])

  const updateReport = async (reportId: number) => {
    setIsUpdating(true)
    setError("")

    try {
      const response = await fetch("/api/admin/bug-reports", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          reportId,
          status: newStatus,
          adminNotes,
        }),
      })
      if (response.status === 401) {
        setError(SESSION_EXPIRED)
        return
      }
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Failed to update report")
        return
      }

      setEditingId(null)
      setAdminNotes("")
      await loadReports()
    } catch {
      setError("Network error while updating.")
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-utsa-midnight">Bug Reports</h1>
          <p className="text-sm text-utsa-muted">
            {filtered.length} report{filtered.length === 1 ? "" : "s"}
            {statusFilter !== "all" ? ` · status: ${statusFilter}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] border-utsa-border">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="ignored">Ignored</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={loadReports} disabled={isLoading} className="border-utsa-border">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
          </Button>
        </div>
      </div>

      {error ? (
        <Alert className="border-red-200 bg-red-50">
          <AlertDescription className="text-red-800">{error}</AlertDescription>
        </Alert>
      ) : null}

      {filtered.length === 0 ? (
        <div className="rounded-md border border-utsa-border bg-white py-10 text-center text-sm text-utsa-muted">
          {isLoading ? "Loading…" : "No bug reports in this filter."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((report) => (
            <div key={report.id} className="rounded-md border border-utsa-border bg-white">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-utsa-border bg-utsa-surface px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-utsa-midnight">Report #{report.id}</h2>
                  <p className="text-xs text-utsa-muted">
                    {formatLocalDateTime(report.submitted_at)}
                    {report.student_id ? ` · student ${report.student_id}` : ""}
                    {report.contact_email ? ` · ${report.contact_email}` : ""}
                  </p>
                </div>
                <Badge
                  variant={report.status === "open" ? "default" : "secondary"}
                  className={
                    report.status === "open"
                      ? "bg-amber-100 text-amber-900 hover:bg-amber-100"
                      : undefined
                  }
                >
                  {report.status}
                </Badge>
              </div>
              <div className="space-y-3 p-4">
                <p className="whitespace-pre-wrap text-sm text-utsa-midnight">{report.description}</p>
                {report.page_url ? (
                  <p className="truncate text-xs text-utsa-muted">Page: {report.page_url}</p>
                ) : null}
                {report.admin_notes ? (
                  <p className="rounded border border-utsa-border bg-utsa-surface p-2 text-xs text-utsa-muted">
                    Notes: {report.admin_notes}
                  </p>
                ) : null}

                {editingId === report.id ? (
                  <div className="space-y-3 rounded-md border border-utsa-border p-3">
                    <div className="space-y-1.5">
                      <Label>Status</Label>
                      <Select value={newStatus} onValueChange={setNewStatus}>
                        <SelectTrigger className="border-utsa-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                          <SelectItem value="ignored">Ignored</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Admin notes</Label>
                      <Textarea
                        value={adminNotes}
                        onChange={(e) => setAdminNotes(e.target.value)}
                        rows={3}
                        className="border-utsa-border focus-visible:ring-utsa-orange"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => updateReport(report.id)}
                        disabled={isUpdating}
                        className=""
                      >
                        {isUpdating ? "Saving…" : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingId(null)}
                        disabled={isUpdating}
                        className="border-utsa-border"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-utsa-border"
                    onClick={() => {
                      setEditingId(report.id)
                      setAdminNotes(report.admin_notes || "")
                      setNewStatus(report.status === "open" ? "resolved" : report.status)
                    }}
                  >
                    Update status
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
