"use client"

import { useMemo, useState, useEffect } from "react"
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
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { useAdminAuth } from "@/components/admin-auth-provider"
import { useHidePII } from "@/hooks/use-hide-pii"
import { getFakeDataForStudent } from "@/lib/fake-data"
import { formatLocalDateTime } from "@/lib/datetime"

type DayOverride = {
  id: number
  student_id: string
  student_name: string
  day_number: number
  date: string
  override_type: "qualified" | "not_qualified"
  reason: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  can_modify: boolean
}

type StudentGroup = {
  studentId: string
  studentName: string
  overrides: DayOverride[]
  qualifiedCount: number
  notQualifiedCount: number
}

type TypeFilter = "all" | "qualified" | "not_qualified"

const SESSION_EXPIRED = "Session expired — refresh and sign in again."

export default function ViewOverridesPage() {
  const { user } = useAdminAuth()
  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [overrides, setOverrides] = useState<DayOverride[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [hidePII] = useHidePII()
  const isProfessor = user.role === "professor"

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
    } catch {
      setError("Failed to load overrides")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteOverride = async (override: DayOverride) => {
    if (!override.can_modify) {
      setError("You can only delete overrides you created.")
      return
    }
    if (!confirm(`Delete override for ${override.student_id}, Day ${override.day_number}?`)) {
      return
    }

    setDeletingId(override.id)
    try {
      const response = await fetch("/api/admin/day-overrides", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          studentId: override.student_id,
          dayNumber: override.day_number,
          date: override.date,
          id: override.id,
        }),
      })

      if (response.status === 401) {
        setError(SESSION_EXPIRED)
        return
      }

      const result = await response.json()

      if (response.ok && result.success) {
        setOverrides((prev) => prev.filter((o) => o.id !== override.id))
      } else {
        setError(result.error || "Failed to delete override")
      }
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setDeletingId(null)
    }
  }

  const filteredOverrides = useMemo(() => {
    const q = searchTerm.toLowerCase().trim()
    return overrides.filter((override) => {
      if (typeFilter !== "all" && override.override_type !== typeFilter) return false
      if (!q) return true
      const displayName = hidePII ? getFakeDataForStudent(override.student_id).name : override.student_name
      const displayId = hidePII ? getFakeDataForStudent(override.student_id).studentId : override.student_id
      return (
        displayId.toLowerCase().includes(q) ||
        displayName.toLowerCase().includes(q) ||
        override.reason?.toLowerCase().includes(q) ||
        override.created_by?.toLowerCase().includes(q) ||
        override.date.includes(q) ||
        String(override.day_number).includes(q)
      )
    })
  }, [overrides, searchTerm, typeFilter, hidePII])

  const studentGroups = useMemo(() => {
    const map = new Map<string, StudentGroup>()
    for (const override of filteredOverrides) {
      let group = map.get(override.student_id)
      if (!group) {
        group = {
          studentId: override.student_id,
          studentName: override.student_name,
          overrides: [],
          qualifiedCount: 0,
          notQualifiedCount: 0,
        }
        map.set(override.student_id, group)
      }
      group.overrides.push(override)
      if (override.override_type === "qualified") group.qualifiedCount += 1
      else group.notQualifiedCount += 1
    }

    return Array.from(map.values()).sort((a, b) => {
      const nameA = hidePII ? getFakeDataForStudent(a.studentId).name : a.studentName
      const nameB = hidePII ? getFakeDataForStudent(b.studentId).name : b.studentName
      return nameA.localeCompare(nameB) || a.studentId.localeCompare(b.studentId)
    })
  }, [filteredOverrides, hidePII])

  const formatDate = (dateString: string) => formatLocalDateTime(dateString)

  const formatOverrideDate = (dateString: string) => {
    if (!dateString) return ""
    const [year, month, day] = dateString.split("-").map(Number)
    const date = new Date(year, month - 1, day)
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return `${monthNames[date.getMonth()]} ${date.getDate()}`
  }

  const toggleExpanded = (studentId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(studentId)) next.delete(studentId)
      else next.add(studentId)
      return next
    })
  }

  const expandAll = () => setExpandedIds(new Set(studentGroups.map((g) => g.studentId)))
  const collapseAll = () => setExpandedIds(new Set())

  const handleExport = () => {
    if (filteredOverrides.length === 0) {
      setError("No overrides to export")
      return
    }

    const headers = ["Student Name", "Student ID", "Day Number", "Date", "Override Type", "Reason", "Created By", "Created At", "Updated At"]
    const csvData = [
      headers.join(","),
      ...filteredOverrides.map((override) =>
        [
          `"${override.student_name}"`,
          override.student_id,
          override.day_number,
          override.date,
          `"${override.override_type}"`,
          `"${override.reason || ""}"`,
          `"${override.created_by || ""}"`,
          formatDate(override.created_at),
          formatDate(override.updated_at),
        ].join(","),
      ),
    ].join("\n")

    const blob = new Blob([csvData], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `day-overrides-${new Date().toISOString().split("T")[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-utsa-midnight">Day Overrides</h1>
          <p className="text-sm text-utsa-muted">
            {filteredOverrides.length} override{filteredOverrides.length !== 1 ? "s" : ""} across{" "}
            {studentGroups.length} student{studentGroups.length !== 1 ? "s" : ""}
            {!isProfessor && " · read-only except your own"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Button
            size="sm"
            variant="outline"
            onClick={expandedIds.size === studentGroups.length ? collapseAll : expandAll}
            disabled={studentGroups.length === 0}
            className="border-utsa-border"
          >
            {expandedIds.size === studentGroups.length ? "Collapse all" : "Expand all"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExport}
            disabled={filteredOverrides.length === 0 || hidePII}
            className="border-utsa-border"
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-utsa-border bg-white">
        {hidePII && (
          <Alert className="rounded-none border-0 border-b border-amber-200 bg-amber-50">
            <EyeOff className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              PII is hidden. Names and IDs are replaced with placeholder data.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-2 border-b border-utsa-border p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-utsa-muted" />
            <Input
              placeholder={hidePII ? "Search placeholder name, ID, day, reason…" : "Search name, ID, day, staff, reason…"}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 border-utsa-border pl-8 text-sm focus-visible:ring-utsa-orange"
            />
          </div>
          <div className="flex gap-1">
            {(
              [
                ["all", "All"],
                ["qualified", "Qualified"],
                ["not_qualified", "Not qualified"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={typeFilter === value ? "default" : "outline"}
                onClick={() => setTypeFilter(value)}
                className={
                  typeFilter === value
                    ? "h-8 bg-utsa-orange hover:bg-utsa-orange/90 text-white"
                    : "h-8 border-utsa-border"
                }
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-utsa-orange border-t-transparent" />
            <p className="text-sm text-utsa-muted">Loading overrides…</p>
          </div>
        ) : studentGroups.length === 0 ? (
          <div className="px-4 py-10 text-center">
            {overrides.length === 0 ? (
              <div>
                <p className="mb-1 text-sm text-utsa-muted">No day overrides found.</p>
                <p className="text-xs text-utsa-muted">
                  Overrides appear here when applied from the calendar or requests flow.
                </p>
              </div>
            ) : (
              <p className="text-sm text-utsa-muted">No overrides match your filters.</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-utsa-border">
            {studentGroups.map((group) => {
              const display = hidePII
                ? getFakeDataForStudent(group.studentId)
                : { name: group.studentName, studentId: group.studentId }
              const expanded = expandedIds.has(group.studentId)
              const sorted = [...group.overrides].sort((a, b) => a.day_number - b.day_number)

              return (
                <div key={group.studentId}>
                  <button
                    type="button"
                    onClick={() => toggleExpanded(group.studentId)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-utsa-surface/60"
                  >
                    {expanded ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-utsa-muted" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-utsa-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="truncate text-sm font-medium text-utsa-midnight">{display.name}</span>
                      <span className="ml-2 font-mono text-xs text-utsa-muted">{display.studentId}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {group.qualifiedCount > 0 && (
                        <Badge className="h-5 bg-green-500 px-1.5 text-[10px] text-white hover:bg-green-500">
                          {group.qualifiedCount}Q
                        </Badge>
                      )}
                      {group.notQualifiedCount > 0 && (
                        <Badge className="h-5 bg-red-500 px-1.5 text-[10px] text-white hover:bg-red-500">
                          {group.notQualifiedCount}NQ
                        </Badge>
                      )}
                      <span className="w-8 text-right text-xs text-utsa-muted">{group.overrides.length}</span>
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t border-utsa-border bg-utsa-surface/40">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-utsa-muted">
                            <th className="px-3 py-1.5 font-medium w-14">Day</th>
                            <th className="px-2 py-1.5 font-medium w-20">Date</th>
                            <th className="px-2 py-1.5 font-medium w-24">Status</th>
                            <th className="px-2 py-1.5 font-medium">Reason</th>
                            <th className="px-2 py-1.5 font-medium w-28">By</th>
                            <th className="px-2 py-1.5 font-medium w-28 hidden sm:table-cell">Created</th>
                            <th className="px-2 py-1.5 font-medium w-10" />
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map((override) => (
                            <tr key={override.id} className="border-t border-utsa-border/70 bg-white">
                              <td className="px-3 py-1.5 font-semibold text-utsa-midnight">{override.day_number}</td>
                              <td className="px-2 py-1.5 text-utsa-muted whitespace-nowrap">
                                {formatOverrideDate(override.date)}
                              </td>
                              <td className="px-2 py-1.5">
                                {override.override_type === "qualified" ? (
                                  <span className="inline-flex items-center gap-1 text-green-700">
                                    <CheckCircle className="h-3 w-3" />
                                    Qual
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-red-700">
                                    <XCircle className="h-3 w-3" />
                                    NQ
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-utsa-muted max-w-[10rem] truncate" title={override.reason || undefined}>
                                {override.reason || <span className="italic text-utsa-muted/70">—</span>}
                              </td>
                              <td className="px-2 py-1.5 text-utsa-muted truncate max-w-[7rem]" title={override.created_by || undefined}>
                                {override.created_by || <span className="italic text-utsa-muted/70">—</span>}
                              </td>
                              <td className="px-2 py-1.5 text-utsa-muted whitespace-nowrap hidden sm:table-cell">
                                {formatDate(override.created_at)}
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                {override.can_modify ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDeleteOverride(override)}
                                    disabled={deletingId === override.id}
                                    className="h-6 w-6 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                                    aria-label={`Delete day ${override.day_number} override`}
                                  >
                                    {deletingId === override.id ? (
                                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                                    ) : (
                                      <Trash2 className="h-3 w-3" />
                                    )}
                                  </Button>
                                ) : (
                                  <span className="inline-block w-6" title="Read-only — created by someone else" />
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
    </div>
  )
}
