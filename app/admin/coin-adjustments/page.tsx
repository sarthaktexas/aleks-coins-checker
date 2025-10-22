"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, CheckCircle, Coins, Plus, Trash2, User, Calendar, FileText, ArrowLeft } from "lucide-react"

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

export default function AdminCoinAdjustmentsPage() {
  const [password, setPassword] = useState("")
  const [adjustments, setAdjustments] = useState<CoinAdjustment[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
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

  // Load saved password from localStorage
  useEffect(() => {
    const savedPassword = localStorage.getItem('adminPassword')
    if (savedPassword) {
      setPassword(savedPassword)
    }
  }, [])

  const loadAdjustments = async () => {
    if (!password) {
      setError("Please enter admin password")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      const response = await fetch(`/api/admin/coin-adjustments`)
      const data = await response.json()

      if (response.ok) {
        setAdjustments(data.adjustments || [])
        setIsAuthenticated(true)
        // Save password
        localStorage.setItem('adminPassword', password)
      } else {
        setError(data.error || "Failed to load coin adjustments")
        setIsAuthenticated(false)
      }
    } catch (err) {
      setError("Network error. Please try again.")
      setIsAuthenticated(false)
    } finally {
      setIsLoading(false)
    }
  }

  const loadUploadRecords = async () => {
    try {
      const response = await fetch('/api/admin/student-data')
      const data = await response.json()
      if (response.ok) {
        setUploadRecords(data.uploadRecords || [])
      }
    } catch (err) {
      console.error("Error loading upload records:", err)
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      loadUploadRecords()
    }
  }, [isAuthenticated])

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
        body: JSON.stringify({
          password,
          studentId,
          studentName,
          period,
          sectionNumber,
          adjustmentAmount: amount,
          reason,
          createdBy: 'admin'
        })
      })

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
          totalCoinsAcrossPeriods: data.totalCoinsAcrossPeriods || data.student.totalCoins || data.student.coins
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
        body: JSON.stringify({
          password,
          adjustmentId
        })
      })

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

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
        <div className="container mx-auto px-4 py-12 max-w-md">
          <Card className="shadow-xl border-0 bg-white/90 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <Coins className="h-5 w-5 text-amber-600" />
                Coin Adjustments - Admin Access
              </CardTitle>
              <CardDescription>Enter admin password to manage coin adjustments</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Admin Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter admin password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && loadAdjustments()}
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}

              <Button
                onClick={loadAdjustments}
                disabled={isLoading || !password}
                className="w-full bg-amber-600 hover:bg-amber-700"
              >
                {isLoading ? "Loading..." : "Access Coin Adjustments"}
              </Button>

              <Button variant="outline" asChild className="w-full">
                <a href="/admin/dashboard">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">Coin Adjustments</h1>
              <p className="text-slate-600">
                Manage manual coin adjustments (fudge points) for students
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => setShowAddForm(!showAddForm)}
                className="bg-amber-600 hover:bg-amber-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Adjustment
              </Button>
              <Button variant="outline" asChild>
                <a href="/admin/dashboard">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </a>
              </Button>
            </div>
          </div>

          {/* Success/Error Messages */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
              <p className="text-green-800 text-sm">{success}</p>
            </div>
          )}

          {/* Add Adjustment Form */}
          {showAddForm && (
            <Card className="mb-6 shadow-lg">
              <CardHeader>
                <CardTitle>Add New Coin Adjustment</CardTitle>
                <CardDescription>
                  Add manual coin adjustments (fudge points) for a student. These will be logged and visible to students.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddAdjustment} className="space-y-4">
                  {/* Student Lookup */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="student-id">Student ID</Label>
                      <Input
                        id="student-id"
                        placeholder="Enter student ID"
                        value={studentId}
                        onChange={(e) => setStudentId(e.target.value)}
                        disabled={isAdding}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        onClick={handleLookupStudent}
                        disabled={isLoading || !studentId}
                        className="w-full"
                        variant="outline"
                      >
                        {isLoading ? "Looking up..." : "Lookup Student"}
                      </Button>
                    </div>
                  </div>

                  {/* Student Data Display */}
                  {studentData && (
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                      <p className="text-sm font-medium text-blue-900 mb-2">Student Found:</p>
                      <div className="space-y-1 text-sm text-blue-800">
                        <p><strong>Name:</strong> {studentData.name}</p>
                        <p><strong>Email:</strong> {studentData.email}</p>
                        <p><strong>Total Coins (All Periods):</strong> {studentData.totalCoinsAcrossPeriods || studentData.totalCoins || studentData.coins}</p>
                        <p><strong>Current Period:</strong> {studentData.period?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</p>
                        <p><strong>Section:</strong> {studentData.sectionNumber}</p>
                      </div>
                    </div>
                  )}

                  {!studentData && (
                    <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                      <p className="text-sm text-amber-800">
                        Please lookup a student first to auto-populate their information.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="adjustment-amount">Adjustment Amount</Label>
                    <Input
                      id="adjustment-amount"
                      type="number"
                      placeholder="e.g., 5 or -3"
                      value={adjustmentAmount}
                      onChange={(e) => setAdjustmentAmount(e.target.value)}
                      disabled={isAdding || !studentData}
                      required
                    />
                    <p className="text-xs text-slate-500">Use positive numbers to add coins, negative to subtract</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reason">Reason for Adjustment</Label>
                    <Textarea
                      id="reason"
                      placeholder="Explain why this adjustment is being made (visible to student)"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      disabled={isAdding || !studentData}
                      rows={3}
                      className="resize-none"
                      required
                    />
                    <p className="text-xs text-slate-500">This reason will be visible to the student and logged</p>
                  </div>

                  <div className="flex gap-3 pt-4">
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
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={isAdding || !studentData || !adjustmentAmount || !reason}
                      className="flex-1 bg-amber-600 hover:bg-amber-700"
                    >
                      {isAdding ? "Adding..." : "Add Adjustment"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Adjustments List */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>All Coin Adjustments</CardTitle>
            <CardDescription>
              {adjustments.length} adjustment{adjustments.length !== 1 ? 's' : ''} logged
            </CardDescription>
          </CardHeader>
          <CardContent>
            {adjustments.length === 0 ? (
              <div className="p-12 text-center">
                <Coins className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-600 text-lg">No coin adjustments yet</p>
                <p className="text-slate-500 text-sm mt-2">Click "Add Adjustment" to create one</p>
              </div>
            ) : (
              <div className="space-y-4">
                {adjustments.map((adjustment) => (
                  <div
                    key={adjustment.id}
                    className="border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <User className="h-5 w-5 text-blue-600" />
                          <h3 className="text-lg font-semibold text-slate-900">{adjustment.student_name}</h3>
                          <Badge 
                            className={adjustment.adjustment_amount >= 0 ? "bg-green-500 hover:bg-green-600" : "bg-red-500 hover:bg-red-600"}
                          >
                            {adjustment.adjustment_amount >= 0 ? '+' : ''}{adjustment.adjustment_amount} coins
                          </Badge>
                        </div>
                        <div className="space-y-1 text-sm text-slate-600 ml-8">
                          <p className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Student ID: {adjustment.student_id}
                          </p>
                          <p className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            Section {adjustment.section_number} • {adjustment.period.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </p>
                          <p className="text-xs text-slate-500">
                            Created: {formatDate(adjustment.created_at)} by {adjustment.created_by}
                          </p>
                        </div>
                        <div className="mt-3 ml-8 p-3 bg-slate-50 rounded-lg">
                          <p className="text-sm font-medium text-slate-700 mb-1">Reason:</p>
                          <p className="text-sm text-slate-900 whitespace-pre-wrap">{adjustment.reason}</p>
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
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

