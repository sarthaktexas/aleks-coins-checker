"use client"

import { useMemo, useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useHidePII } from "@/hooks/use-hide-pii"
import { getFakeDataForStudent } from "@/lib/fake-data"
import {
  AlertCircle,
  CheckCircle,
  Coins,
  Plus,
  Trash2,
  EyeOff,
  Search,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { formatLocalDateTime } from "@/lib/datetime"

type CoinAdjustment = {
  id: number
  student_id: string
  student_name: string
  period: string
  section_number: string
  adjustment_amount: number
  reason: string
  created_at: string
  created_by: string
  is_active: boolean
}

type StudentGroup = {
  studentId: string
  studentName: string
  adjustments: CoinAdjustment[]
  netAmount: number
}

const SESSION_EXPIRED = "Session expired — refresh and sign in again."

function formatPeriod(period: string) {
  if (period === "__GLOBAL__" || !period) return "Global"
  return period.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
}

export default function AdminCoinAdjustmentsPage() {
  const [adjustments, setAdjustments] = useState<CoinAdjustment[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const [showAddForm, setShowAddForm] = useState(false)
  const [studentId, setStudentId] = useState("")
  const [studentName, setStudentName] = useState("")
  const [period, setPeriod] = useState("")
  const [sectionNumber, setSectionNumber] = useState("")
  const [adjustmentAmount, setAdjustmentAmount] = useState("")
  const [reason, setReason] = useState("")
  const [isAdding, setIsAdding] = useState(false)

  const [studentData, setStudentData] = useState<any>(null)
  const [hidePII] = useHidePII()

  const loadAdjustments = async () => {
    setIsLoading(true)
    setError("")

    try {
      const response = await fetch("/api/admin/coin-adjustments", { credentials: "same-origin" })
      if (response.status === 401) {
        setError(SESSION_EXPIRED)
        return
      }
      const data = await response.json()

      if (response.ok) {
        setAdjustments(data.adjustments || [])
      } else {
        setError(data.error || "Failed to load coin adjustments")
      }
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadAdjustments()
  }, [])

  const handleAddAdjustment = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!studentId || !studentName || !period || !sectionNumber || !adjustmentAmount || !reason) {
      setError("All fields are required")
      return
    }

    const amount = parseInt(adjustmentAmount)
    if (isNaN(amount)) {
      setError("Adjustment amount must be a valid number")
      return
    }

    setIsAdding(true)
    setError("")
    setSuccess("")

    try {
      const response = await fetch("/api/admin/coin-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          studentId,
          studentName,
          period,
          sectionNumber,
          adjustmentAmount: amount,
          reason,
        }),
      })

      if (response.status === 401) {
        setError(SESSION_EXPIRED)
        return
      }

      const data = await response.json()

      if (response.ok) {
        setSuccess("Coin adjustment created successfully!")
        await loadAdjustments()
        setStudentId("")
        setStudentName("")
        setPeriod("")
        setSectionNumber("")
        setAdjustmentAmount("")
        setReason("")
        setShowAddForm(false)
        setStudentData(null)
      } else {
        setError(data.error || "Failed to create coin adjustment")
      }
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setIsAdding(false)
    }
  }

  const handleLookupStudent = async () => {
    if (!studentId) {
      setError("Please enter a student ID")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      const response = await fetch("/api/student", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId }),
      })

      const data = await response.json()

      if (response.ok && data.student) {
        setStudentData({
          ...data.student,
          totalCoinsAcrossPeriods: data.totalCoinsAcrossPeriods ?? data.student.totalCoins ?? data.student.coins ?? 0,
        })
        setStudentName(data.student.name)
        setPeriod(data.student.period || "")
        setSectionNumber(data.student.sectionNumber || "")
      } else {
        setError("Student not found")
        setStudentData(null)
      }
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteAdjustment = async (adjustmentId: number) => {
    if (!confirm("Delete this adjustment? This will recalculate the student's coins.")) {
      return
    }

    setDeletingId(adjustmentId)
    try {
      const response = await fetch("/api/admin/coin-adjustments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ adjustmentId }),
      })

      if (response.status === 401) {
        setError(SESSION_EXPIRED)
        return
      }

      const data = await response.json()

      if (response.ok) {
        setSuccess("Coin adjustment deleted successfully!")
        await loadAdjustments()
      } else {
        setError(data.error || "Failed to delete coin adjustment")
      }
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setDeletingId(null)
    }
  }

  const filteredAdjustments = useMemo(() => {
    const q = searchTerm.toLowerCase().trim()
    if (!q) return adjustments
    return adjustments.filter((adj) => {
      const displayName = hidePII ? getFakeDataForStudent(adj.student_id).name : adj.student_name
      const displayId = hidePII ? getFakeDataForStudent(adj.student_id).studentId : adj.student_id
      return (
        displayName.toLowerCase().includes(q) ||
        displayId.toLowerCase().includes(q) ||
        adj.reason.toLowerCase().includes(q) ||
        adj.created_by?.toLowerCase().includes(q) ||
        adj.section_number.includes(q) ||
        formatPeriod(adj.period).toLowerCase().includes(q)
      )
    })
  }, [adjustments, searchTerm, hidePII])

  const studentGroups = useMemo(() => {
    const map = new Map<string, StudentGroup>()
    for (const adj of filteredAdjustments) {
      let group = map.get(adj.student_id)
      if (!group) {
        group = {
          studentId: adj.student_id,
          studentName: adj.student_name,
          adjustments: [],
          netAmount: 0,
        }
        map.set(adj.student_id, group)
      }
      group.adjustments.push(adj)
      group.netAmount += adj.adjustment_amount
    }

    return Array.from(map.values()).sort((a, b) => {
      const nameA = hidePII ? getFakeDataForStudent(a.studentId).name : a.studentName
      const nameB = hidePII ? getFakeDataForStudent(b.studentId).name : b.studentName
      return nameA.localeCompare(nameB) || a.studentId.localeCompare(b.studentId)
    })
  }, [filteredAdjustments, hidePII])

  const formatDate = (dateString: string) => formatLocalDateTime(dateString)

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

  const resetForm = () => {
    setShowAddForm(false)
    setStudentId("")
    setStudentName("")
    setPeriod("")
    setSectionNumber("")
    setAdjustmentAmount("")
    setReason("")
    setStudentData(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-utsa-midnight">Coin Adjustments</h1>
          <p className="text-sm text-utsa-muted">
            {filteredAdjustments.length} adjustment{filteredAdjustments.length !== 1 ? "s" : ""} across{" "}
            {studentGroups.length} student{studentGroups.length !== 1 ? "s" : ""}
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
          <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="h-4 w-4 mr-2" />
            Add
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3">
          <CheckCircle className="h-4 w-4 shrink-0 text-green-600" />
          <p className="text-sm text-green-800">{success}</p>
        </div>
      )}

      {showAddForm && (
        <div className="space-y-4 rounded-md border border-utsa-border bg-white p-4">
          <div>
            <h2 className="text-sm font-semibold text-utsa-midnight">Add New Coin Adjustment</h2>
            <p className="mt-0.5 text-xs text-utsa-muted">
              Manual fudge points are logged and visible to students.
            </p>
          </div>
          <form onSubmit={handleAddAdjustment} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="student-id">Student ID</Label>
                <Input
                  id="student-id"
                  placeholder="Enter student ID"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  disabled={isAdding}
                  className="border-utsa-border focus-visible:ring-utsa-orange"
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  onClick={handleLookupStudent}
                  disabled={isLoading || !studentId}
                  className="w-full border-utsa-border"
                  variant="outline"
                >
                  {isLoading ? "Looking up..." : "Lookup Student"}
                </Button>
              </div>
            </div>

            {studentData && (
              <div className="rounded-md border border-utsa-border bg-utsa-surface p-3 text-sm text-utsa-muted">
                <p>
                  <strong className="text-utsa-midnight">{studentData.name}</strong>
                  {" · "}
                  {studentData.totalCoinsAcrossPeriods ?? studentData.totalCoins ?? studentData.coins ?? 0} coins total
                  {" · "}
                  Sec {studentData.sectionNumber}
                  {" · "}
                  {formatPeriod(studentData.period || "")}
                </p>
              </div>
            )}

            {!studentData && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm text-amber-800">Lookup a student first to auto-populate their info.</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="adjustment-amount">Adjustment Amount</Label>
              <Input
                id="adjustment-amount"
                type="number"
                placeholder="e.g., 5 or -3"
                value={adjustmentAmount}
                onChange={(e) => setAdjustmentAmount(e.target.value)}
                disabled={isAdding || !studentData}
                required
                className="border-utsa-border focus-visible:ring-utsa-orange"
              />
              <p className="text-xs text-utsa-muted">Positive to add coins, negative to subtract</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason for Adjustment</Label>
              <Textarea
                id="reason"
                placeholder="Explain why this adjustment is being made (visible to student)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={isAdding || !studentData}
                rows={2}
                className="resize-none border-utsa-border focus-visible:ring-utsa-orange"
                required
              />
            </div>

            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" onClick={resetForm} disabled={isAdding} className="flex-1 border-utsa-border">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isAdding || !studentData || !adjustmentAmount || !reason}
                className="flex-1"
              >
                {isAdding ? "Adding..." : "Add Adjustment"}
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="rounded-md border border-utsa-border bg-white">
        {hidePII && (
          <Alert className="rounded-none border-0 border-b border-amber-200 bg-amber-50">
            <EyeOff className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              PII is hidden. Names and IDs are replaced with placeholder data.
            </AlertDescription>
          </Alert>
        )}

        <div className="border-b border-utsa-border p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-utsa-muted" />
            <Input
              placeholder={hidePII ? "Search placeholder name, ID, reason…" : "Search name, ID, section, staff, reason…"}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 border-utsa-border pl-8 text-sm focus-visible:ring-utsa-orange"
            />
          </div>
        </div>

        {isLoading && adjustments.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-utsa-orange border-t-transparent" />
            <p className="text-sm text-utsa-muted">Loading adjustments…</p>
          </div>
        ) : studentGroups.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <Coins className="mx-auto mb-2 h-8 w-8 text-utsa-muted" />
            {adjustments.length === 0 ? (
              <>
                <p className="text-sm text-utsa-midnight">No coin adjustments yet</p>
                <p className="mt-1 text-xs text-utsa-muted">Click Add to create one</p>
              </>
            ) : (
              <p className="text-sm text-utsa-muted">No adjustments match your search.</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-utsa-border">
            {studentGroups.map((group) => {
              const display = hidePII
                ? getFakeDataForStudent(group.studentId)
                : { name: group.studentName, studentId: group.studentId }
              const expanded = expandedIds.has(group.studentId)
              const sorted = [...group.adjustments].sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
              )

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
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge
                        className={
                          group.netAmount >= 0
                            ? "h-5 bg-green-500 px-1.5 text-[10px] text-white hover:bg-green-500"
                            : "h-5 bg-red-500 px-1.5 text-[10px] text-white hover:bg-red-500"
                        }
                      >
                        {group.netAmount >= 0 ? "+" : ""}
                        {group.netAmount}
                      </Badge>
                      <span className="w-8 text-right text-xs text-utsa-muted">{group.adjustments.length}</span>
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t border-utsa-border bg-utsa-surface/40">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-utsa-muted">
                            <th className="w-16 px-3 py-1.5 font-medium">Amount</th>
                            <th className="w-28 px-2 py-1.5 font-medium">Period</th>
                            <th className="w-14 px-2 py-1.5 font-medium">Sec</th>
                            <th className="px-2 py-1.5 font-medium">Reason</th>
                            <th className="w-28 px-2 py-1.5 font-medium">By</th>
                            <th className="hidden w-28 px-2 py-1.5 font-medium sm:table-cell">Created</th>
                            <th className="w-10 px-2 py-1.5 font-medium" />
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map((adj) => (
                            <tr key={adj.id} className="border-t border-utsa-border/70 bg-white">
                              <td className="px-3 py-1.5 font-semibold whitespace-nowrap">
                                <span className={adj.adjustment_amount >= 0 ? "text-green-700" : "text-red-700"}>
                                  {adj.adjustment_amount >= 0 ? "+" : ""}
                                  {adj.adjustment_amount}
                                </span>
                              </td>
                              <td className="truncate px-2 py-1.5 text-utsa-muted max-w-[7rem]" title={formatPeriod(adj.period)}>
                                {formatPeriod(adj.period)}
                              </td>
                              <td className="px-2 py-1.5 text-utsa-muted">{adj.section_number}</td>
                              <td className="max-w-[12rem] truncate px-2 py-1.5 text-utsa-muted" title={adj.reason}>
                                {adj.reason}
                              </td>
                              <td className="max-w-[7rem] truncate px-2 py-1.5 text-utsa-muted" title={adj.created_by}>
                                {adj.created_by || "—"}
                              </td>
                              <td className="hidden whitespace-nowrap px-2 py-1.5 text-utsa-muted sm:table-cell">
                                {formatDate(adj.created_at)}
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteAdjustment(adj.id)}
                                  disabled={deletingId === adj.id}
                                  className="h-6 w-6 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                                  aria-label="Delete coin adjustment"
                                >
                                  {deletingId === adj.id ? (
                                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                                  ) : (
                                    <Trash2 className="h-3 w-3" />
                                  )}
                                </Button>
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
    </div>
  )
}
