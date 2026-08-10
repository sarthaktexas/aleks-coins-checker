"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Search, 
  Download,
  Trash2,
  CheckCircle,
  XCircle,
  EyeOff,
} from "lucide-react"
import { useHidePII } from "@/hooks/use-hide-pii"
import { getFakeDataForStudent } from "@/lib/fake-data"
import { HidePIIToggle } from "@/components/hide-pii-toggle"

type DayOverride = {
  id: number
  student_id: string
  student_name: string
  day_number: number
  date: string
  override_type: "qualified" | "not_qualified"
  reason: string | null
  created_at: string
  updated_at: string
}

const SESSION_EXPIRED = "Session expired — refresh and sign in again."

export default function ViewOverridesPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [overrides, setOverrides] = useState<DayOverride[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [hidePII, setHidePII] = useHidePII()

  useEffect(() => {
    loadOverrides()
  }, [])

  const loadOverrides = async () => {
    setIsLoading(true)
    setError("")
    try {
      const response = await fetch("/api/admin/day-overrides", { credentials: "same-origin" })
      if (response.status === 401) {
        setError(SESSION_EXPIRED)
        return
      }
      const result = await response.json()

      if (response.ok) {
        setOverrides(result.overrides || [])
      } else {
        setError(result.error || "Failed to load overrides")
      }
    } catch (error) {
      setError("Failed to load overrides")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteOverride = async (override: DayOverride) => {
    if (!confirm(`Are you sure you want to delete the override for ${override.student_id}, Day ${override.day_number}?`)) {
      return
    }

    setDeletingId(override.id)
    try {
      const response = await fetch("/api/admin/day-overrides", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          studentId: override.student_id,
          dayNumber: override.day_number,
        }),
      })

      if (response.status === 401) {
        setError(SESSION_EXPIRED)
        return
      }

      const result = await response.json()

      if (response.ok && result.success) {
        setOverrides(prev => prev.filter(o => o.id !== override.id))
      } else {
        setError(result.error || "Failed to delete override")
      }
    } catch (error) {
      setError("Network error. Please try again.")
    } finally {
      setDeletingId(null)
    }
  }

  const filteredOverrides = overrides.filter((override) => {
    const displayName = hidePII ? getFakeDataForStudent(override.student_id).name : override.student_name
    const displayId = hidePII ? getFakeDataForStudent(override.student_id).studentId : override.student_id
    const matchesSearch = searchTerm === "" || 
      displayId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      override.reason?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      override.date.includes(searchTerm)
    
    return matchesSearch
  })

  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "America/Chicago"
    }
    
    return new Date(dateString).toLocaleString("en-US", options)
  }

  const formatOverrideDate = (dateString: string) => {
    if (!dateString) return ""
    const [year, month, day] = dateString.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
  }

  const handleExport = () => {
    if (filteredOverrides.length === 0) {
      setError("No overrides to export")
      return
    }

    const headers = ["Student Name", "Student ID", "Day Number", "Date", "Override Type", "Reason", "Created At", "Updated At"]
    const csvData = [
      headers.join(","),
      ...filteredOverrides.map((override) => [
        `"${override.student_name}"`,
        override.student_id,
        override.day_number,
        override.date,
        `"${override.override_type}"`,
        `"${override.reason || ''}"`,
        formatDate(override.created_at),
        formatDate(override.updated_at)
      ].join(","))
    ].join("\n")

    const blob = new Blob([csvData], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `day-overrides-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-utsa-midnight">Day Overrides</h1>
          <p className="text-sm text-utsa-muted">
            {filteredOverrides.length} override{filteredOverrides.length !== 1 ? "s" : ""} found
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <HidePIIToggle hidePII={hidePII} onToggle={setHidePII} showAlert={false} />
          <Button size="sm" variant="outline" onClick={handleExport} disabled={filteredOverrides.length === 0 || hidePII} className="border-utsa-border">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-utsa-border bg-white p-4 space-y-4">
        {hidePII && (
          <Alert className="border-amber-200 bg-amber-50">
            <EyeOff className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              PII is hidden. Names and IDs are replaced with placeholder data.
            </AlertDescription>
          </Alert>
        )}
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-utsa-muted" />
          <Input
            placeholder={hidePII ? "Search by placeholder name, ID, reason, or date..." : "Search by student name, ID, reason, or date..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md border-utsa-border focus-visible:ring-utsa-orange"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-4 p-3 bg-utsa-surface border border-utsa-border rounded-md text-sm font-medium text-utsa-muted">
            <div className="flex-1">Student</div>
            <div className="w-20 text-center">Day</div>
            <div className="flex-1">Date</div>
            <div className="w-24 text-center">Status</div>
            <div className="flex-1">Reason</div>
            <div className="w-32 text-center">Created</div>
            <div className="w-20 text-center">Actions</div>
          </div>
          
          {filteredOverrides.map((override) => {
            const display = hidePII ? getFakeDataForStudent(override.student_id) : { name: override.student_name, studentId: override.student_id }
            return (
            <div key={override.id} className="flex items-center gap-4 p-4 bg-white border border-utsa-border rounded-md hover:bg-utsa-surface/50 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-utsa-midnight truncate">{display.name}</p>
                <p className="font-mono text-xs text-utsa-muted truncate">{display.studentId}</p>
              </div>

              <div className="w-20 text-center">
                <span className="text-lg font-bold text-utsa-midnight">Day {override.day_number}</span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm text-utsa-muted">{formatOverrideDate(override.date)}</p>
              </div>

              <div className="w-24 text-center">
                <Badge 
                  className={
                    override.override_type === "qualified" 
                      ? "bg-green-500 hover:bg-green-600 text-white" 
                      : "bg-red-500 hover:bg-red-600 text-white"
                  }
                >
                  {override.override_type === "qualified" ? (
                    <div className="flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Qualified
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <XCircle className="h-3 w-3" />
                      Not Qualified
                    </div>
                  )}
                </Badge>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm text-utsa-muted truncate">
                  {override.reason || <span className="text-utsa-muted/70 italic">No reason provided</span>}
                </p>
              </div>

              <div className="w-32 text-center">
                <p className="text-xs text-utsa-muted">{formatDate(override.created_at)}</p>
              </div>

              <div className="w-20 text-center">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDeleteOverride(override)}
                  disabled={deletingId === override.id}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 border-utsa-border"
                >
                  {deletingId === override.id ? (
                    <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )})}
        </div>

        {filteredOverrides.length === 0 && !isLoading && (
          <div className="text-center py-8">
            {overrides.length === 0 ? (
              <div>
                <p className="text-utsa-muted mb-2">No day overrides found.</p>
                <p className="text-sm text-utsa-muted">
                  Overrides will appear here when students use the day override feature.
                </p>
              </div>
            ) : (
              <p className="text-utsa-muted">No overrides found matching your search criteria.</p>
            )}
          </div>
        )}

        {isLoading && (
          <div className="text-center py-8">
            <div className="inline-flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-utsa-orange border-t-transparent rounded-full animate-spin" />
              <p className="text-utsa-muted">Loading overrides...</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}
    </div>
  )
}
