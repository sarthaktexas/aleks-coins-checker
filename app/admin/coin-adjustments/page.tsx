"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useHidePII } from "@/hooks/use-hide-pii"
import { getFakeDataForStudent } from "@/lib/fake-data"
import { HidePIIToggle } from "@/components/hide-pii-toggle"
import { AlertCircle, CheckCircle, Coins, Plus, Trash2, User, Calendar, FileText, EyeOff } from "lucide-react"

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

type StudentData = {
  name: string
  email: string
  coins: number
  totalDays: number
  periodDays: number
  percentComplete: number
}

const SESSION_EXPIRED = "Session expired — refresh and sign in again."

export default function AdminCoinAdjustmentsPage() {
  const [adjustments, setAdjustments] = useState<CoinAdjustment[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  
  // For adding new adjustment
  const [showAddForm, setShowAddForm] = useState(false)
  const [studentId, setStudentId] = useState("")
  const [studentName, setStudentName] = useState("")
  const [period, setPeriod] = useState("")
  const [sectionNumber, setSectionNumber] = useState("")
  const [adjustmentAmount, setAdjustmentAmount] = useState("")
  const [reason, setReason] = useState("")
  const [isAdding, setIsAdding] = useState(false)
  
  // For student lookup
  const [studentData, setStudentData] = useState<any>(null)
  const [uploadRecords, setUploadRecords] = useState<any[]>([])
  const [hidePII, setHidePII] = useHidePII()

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
    } catch (err) {
      setError("Network error. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const loadUploadRecords = async () => {
    try {
      const response = await fetch('/api/admin/student-data', { credentials: "same-origin" })
      if (response.status === 401) {
        setError(SESSION_EXPIRED)
        return
      }
      const data = await response.json()
      if (response.ok) {
        setUploadRecords(data.uploadRecords || [])
      }
    } catch (err) {
      console.error("Error loading upload records:", err)
    }
  }

  useEffect(() => {
    loadAdjustments()
    loadUploadRecords()
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
      const response = await fetch('/api/admin/coin-adjustments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: "same-origin",
        body: JSON.stringify({
          studentId,
          studentName,
          period,
          sectionNumber,
          adjustmentAmount: amount,
          reason,
        })
      })

      if (response.status === 401) {
        setError(SESSION_EXPIRED)
        return
      }

      const data = await response.json()

      if (response.ok) {
        setSuccess("Coin adjustment created successfully!")
        // Reload adjustments
        await loadAdjustments()
        // Clear form
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
    } catch (err) {
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
      const response = await fetch('/api/student', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ studentId })
      })

      const data = await response.json()

      if (response.ok && data.student) {
        // Add totalCoinsAcrossPeriods to student data for display
        const enrichedStudentData = {
          ...data.student,
          totalCoinsAcrossPeriods: data.totalCoinsAcrossPeriods ?? data.student.totalCoins ?? data.student.coins ?? 0
        }
        setStudentData(enrichedStudentData)
        setStudentName(data.student.name)
        setPeriod(data.student.period || '')
        setSectionNumber(data.student.sectionNumber || '')
      } else {
        setError("Student not found")
        setStudentData(null)
      }
    } catch (err) {
      setError("Network error. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteAdjustment = async (adjustmentId: number) => {
    if (!confirm("Are you sure you want to delete this adjustment? This will recalculate the student's coins.")) {
      return
    }

    try {
      const response = await fetch('/api/admin/coin-adjustments', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: "same-origin",
        body: JSON.stringify({
          adjustmentId
        })
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
    } catch (err) {
      setError("Network error. Please try again.")
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-utsa-midnight">Coin Adjustments</h1>
          <p className="text-sm text-utsa-muted">
            Manage manual coin adjustments (fudge points) for students
          </p>
        </div>
        <Button
          onClick={() => setShowAddForm(!showAddForm)}
          className=""
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Adjustment
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}
      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-md flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
          <p className="text-green-800 text-sm">{success}</p>
        </div>
      )}

      {showAddForm && (
        <div className="rounded-md border border-utsa-border bg-white p-4 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-utsa-midnight">Add New Coin Adjustment</h2>
            <p className="text-xs text-utsa-muted mt-0.5">
              Add manual coin adjustments (fudge points) for a student. These will be logged and visible to students.
            </p>
          </div>
          <form onSubmit={handleAddAdjustment} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              <div className="bg-utsa-surface p-4 rounded-md border border-utsa-border">
                <p className="text-sm font-medium text-utsa-midnight mb-2">Student Found:</p>
                <div className="space-y-1 text-sm text-utsa-muted">
                  <p><strong className="text-utsa-midnight">Name:</strong> {studentData.name}</p>
                  <p><strong className="text-utsa-midnight">Email:</strong> {studentData.email}</p>
                  <p><strong className="text-utsa-midnight">Total Coins (All Periods):</strong> {studentData.totalCoinsAcrossPeriods ?? studentData.totalCoins ?? studentData.coins ?? 0}</p>
                  <p><strong className="text-utsa-midnight">Current Period:</strong> {studentData.period?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</p>
                  <p><strong className="text-utsa-midnight">Section:</strong> {studentData.sectionNumber}</p>
                </div>
              </div>
            )}

            {!studentData && (
              <div className="bg-amber-50 p-4 rounded-md border border-amber-200">
                <p className="text-sm text-amber-800">
                  Please lookup a student first to auto-populate their information.
                </p>
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
              <p className="text-xs text-utsa-muted">Use positive numbers to add coins, negative to subtract</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason for Adjustment</Label>
              <Textarea
                id="reason"
                placeholder="Explain why this adjustment is being made (visible to student)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={isAdding || !studentData}
                rows={3}
                className="resize-none border-utsa-border focus-visible:ring-utsa-orange"
                required
              />
              <p className="text-xs text-utsa-muted">This reason will be visible to the student and logged</p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowAddForm(false)
                  setStudentId("")
                  setStudentName("")
                  setPeriod("")
                  setSectionNumber("")
                  setAdjustmentAmount("")
                  setReason("")
                  setStudentData(null)
                }}
                disabled={isAdding}
                className="flex-1 border-utsa-border"
              >
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
        <div className="flex items-center justify-between flex-wrap gap-4 border-b border-utsa-border bg-utsa-surface px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-utsa-midnight">All Coin Adjustments</h2>
            <p className="text-xs text-utsa-muted">
              {adjustments.length} adjustment{adjustments.length !== 1 ? 's' : ''} logged
            </p>
          </div>
          <HidePIIToggle hidePII={hidePII} onToggle={setHidePII} showAlert={false} />
        </div>
        <div className="p-4">
          {hidePII && (
            <Alert className="mb-4 border-amber-200 bg-amber-50">
              <EyeOff className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                PII is hidden. Names and IDs are replaced with placeholder data.
              </AlertDescription>
            </Alert>
          )}
          {adjustments.length === 0 ? (
            <div className="p-12 text-center">
              <Coins className="h-8 w-12 text-utsa-muted mx-auto mb-4" />
              <p className="text-utsa-midnight text-lg">No coin adjustments yet</p>
              <p className="text-utsa-muted text-sm mt-2">Click &quot;Add Adjustment&quot; to create one</p>
            </div>
          ) : (
            <div className="space-y-3">
              {adjustments.map((adjustment) => (
                <div
                  key={adjustment.id}
                  className="border border-utsa-border rounded-md p-4 hover:bg-utsa-surface/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <User className="h-5 w-5 text-utsa-orange" />
                        <h3 className="text-base font-semibold text-utsa-midnight">
                          {hidePII ? getFakeDataForStudent(adjustment.student_id).name : adjustment.student_name}
                        </h3>
                        <Badge 
                          className={adjustment.adjustment_amount >= 0 ? "bg-green-500 hover:bg-green-600" : "bg-red-500 hover:bg-red-600"}
                        >
                          {adjustment.adjustment_amount >= 0 ? '+' : ''}{adjustment.adjustment_amount} coins
                        </Badge>
                      </div>
                      <div className="space-y-1 text-sm text-utsa-muted ml-8">
                        <p className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Student ID: {hidePII ? getFakeDataForStudent(adjustment.student_id).studentId : adjustment.student_id}
                        </p>
                        <p className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Section {adjustment.section_number} • {adjustment.period === '__GLOBAL__' || !adjustment.period
                            ? 'Total (Global - affects all periods)'
                            : adjustment.period.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </p>
                        <p className="text-xs text-utsa-muted">
                          Created: {formatDate(adjustment.created_at)} by {adjustment.created_by}
                        </p>
                      </div>
                      <div className="mt-3 ml-8 p-3 bg-utsa-surface rounded-md border border-utsa-border">
                        <p className="text-sm font-medium text-utsa-midnight mb-1">Reason:</p>
                        <p className="text-sm text-utsa-muted whitespace-pre-wrap">{adjustment.reason}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDeleteAdjustment(adjustment.id)}
                      className="ml-4"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

