"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Textarea } from "@/components/ui/textarea"
import { 
  Calendar, 
  Save, 
  Edit, 
  Plus, 
  Trash2, 
  CheckCircle, 
  AlertTriangle,
  ArrowLeft
} from "lucide-react"
import Link from "next/link"
import { EXAM_PERIODS, type ExamPeriodKey } from "@/lib/exam-periods"

type ExamPeriodData = {
  name: string
  startDate: string
  endDate: string
  excludedDates: readonly string[]
}

export default function ManagePeriodsPage() {
  const [periods, setPeriods] = useState<Record<string, ExamPeriodData>>({})
  const [editingPeriod, setEditingPeriod] = useState<string | null>(null)
  const [newExcludedDate, setNewExcludedDate] = useState("")
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [password, setPassword] = useState("")
  const [showAddForm, setShowAddForm] = useState(false)
  const [newPeriod, setNewPeriod] = useState({
    periodKey: "",
    name: "",
    startDate: "",
    endDate: "",
    excludedDates: [] as string[]
  })

  // Load periods from database
  const loadPeriods = async () => {
    try {
      const response = await fetch('/api/admin/exam-periods')
      const data = await response.json()
      
      if (response.ok) {
        setPeriods(data.periods || {})
      } else {
        console.error("Failed to load periods:", data.error)
        // Fallback to hardcoded periods if database fails
        setPeriods(EXAM_PERIODS)
      }
    } catch (error) {
      console.error("Error loading periods:", error)
      // Fallback to hardcoded periods if database fails
      setPeriods(EXAM_PERIODS)
    }
  }

  useEffect(() => {
    loadPeriods()
  }, [])

  const handleSavePeriod = async (periodKey: string) => {
    if (!password) {
      setMessage({
        type: "error",
        text: "Please enter admin password in the Admin Controls section above to save changes"
      })
      // Scroll to the top to show the password input
      setTimeout(() => {
        const adminControls = document.getElementById('admin-controls')
        if (adminControls) {
          adminControls.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 100)
      return
    }

    setIsLoading(true)
    setMessage(null)

    try {
      const period = periods[periodKey]
      
      const response = await fetch('/api/admin/exam-periods', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password,
          periodKey,
          name: period.name,
          startDate: period.startDate,
          endDate: period.endDate,
          excludedDates: period.excludedDates,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setMessage({
          type: "success",
          text: data.message || `Successfully updated ${period.name}`
        })
        setEditingPeriod(null)
        // Reload periods to get updated data
        await loadPeriods()
      } else {
        setMessage({
          type: "error",
          text: data.error || "Failed to save changes. Please try again."
        })
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: "Failed to save changes. Please try again."
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddExcludedDate = (periodKey: string) => {
    if (!newExcludedDate) return

    setPeriods(prev => ({
      ...prev,
      [periodKey]: {
        ...prev[periodKey],
        excludedDates: [...prev[periodKey].excludedDates, newExcludedDate]
      }
    }))
    setNewExcludedDate("")
  }

  const handleRemoveExcludedDate = (periodKey: string, dateIndex: number) => {
    setPeriods(prev => ({
      ...prev,
      [periodKey]: {
        ...prev[periodKey],
        excludedDates: prev[periodKey].excludedDates.filter((_, index) => index !== dateIndex)
      }
    }))
  }

  const handleAddNewPeriod = async () => {
    if (!password) {
      setMessage({
        type: "error",
        text: "Please enter admin password in the Admin Controls section above to add new period"
      })
      // Scroll to the top to show the password input
      setTimeout(() => {
        const adminControls = document.getElementById('admin-controls')
        if (adminControls) {
          adminControls.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 100)
      return
    }

    if (!newPeriod.periodKey || !newPeriod.name || !newPeriod.startDate || !newPeriod.endDate) {
      setMessage({
        type: "error",
        text: "Please fill in all required fields"
      })
      return
    }

    setIsLoading(true)
    setMessage(null)

    try {
      const response = await fetch('/api/admin/exam-periods', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password,
          periodKey: newPeriod.periodKey,
          name: newPeriod.name,
          startDate: newPeriod.startDate,
          endDate: newPeriod.endDate,
          excludedDates: newPeriod.excludedDates,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setMessage({
          type: "success",
          text: data.message || `Successfully added ${newPeriod.name}`
        })
        setShowAddForm(false)
        setNewPeriod({
          periodKey: "",
          name: "",
          startDate: "",
          endDate: "",
          excludedDates: []
        })
        // Reload periods to get updated data
        await loadPeriods()
      } else {
        setMessage({
          type: "error",
          text: data.error || "Failed to add new period. Please try again."
        })
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: "Failed to add new period. Please try again."
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Format date for HTML date input (YYYY-MM-DD)
  const formatDateForInput = (date: string) => {
    try {
      if (!date) return ""
      
      // If already in YYYY-MM-DD format, return as-is
      if (date.includes('-') && date.length === 10) {
        return date
      }
      
      // Try to parse and format
      const d = new Date(date)
      if (isNaN(d.getTime())) return ""
      
      return d.toISOString().split('T')[0]
    } catch (error) {
      console.error("Date input formatting error:", error, "date:", date)
      return ""
    }
  }

  // Format date for display without timezone issues
  const formatDateForDisplay = (date: string, options: { month?: "short" | "long", day?: "numeric", year?: "numeric" } = {}) => {
    const monthNamesShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                           "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const monthNamesLong = ["January", "February", "March", "April", "May", "June",
                           "July", "August", "September", "October", "November", "December"]
    
    try {
      if (!date) return "Invalid Date"
      
      // If already in YYYY-MM-DD format, parse it manually
      if (date.includes('-') && date.length === 10) {
        const [year, month, day] = date.split('-').map(Number)
        
        let result = ""
        
        if (options.month === "long") {
          result += monthNamesLong[month - 1]
        } else {
          result += monthNamesShort[month - 1]
        }
        
        if (options.day === "numeric") {
          result += ` ${day}`
        }
        
        if (options.year === "numeric") {
          result += `, ${year}`
        }
        
        return result
      }
      
      // Fallback to Date object parsing - format without timezone conversion
      const d = new Date(date)
      if (isNaN(d.getTime())) return "Invalid Date"
      
      // Format manually to avoid timezone conversion
      const year = d.getFullYear()
      const month = d.getMonth() + 1
      const day = d.getDate()
      
      let result = ""
      
      if (options.month === "long") {
        result += monthNamesLong[month - 1]
      } else {
        result += monthNamesShort[month - 1]
      }
      
      if (options.day === "numeric") {
        result += ` ${day}`
      }
      
      if (options.year === "numeric") {
        result += `, ${year}`
      }
      
      return result
    } catch (error) {
      console.error("Date display formatting error:", error, "date:", date)
      return "Invalid Date"
    }
  }

  const formatDateRange = (startDate: string, endDate: string) => {
    try {
      const startFormatted = formatDateForDisplay(startDate, { month: "short", day: "numeric" })
      const endFormatted = formatDateForDisplay(endDate, { month: "short", day: "numeric" })
      
      return `${startFormatted} - ${endFormatted}`
    } catch (error) {
      console.error("Date parsing error:", error, "startDate:", startDate, "endDate:", endDate)
      return "Invalid Date"
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/dashboard" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Manage Exam Periods</h1>
            <p className="text-slate-600">Edit exam period dates and excluded dates</p>
          </div>
        </div>

        {/* Admin Controls */}
        <Card id="admin-controls" className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Admin Controls</CardTitle>
            <CardDescription>Enter admin password to save changes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <Label htmlFor="admin-password">Admin Password</Label>
                <Input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  className={message?.type === "error" && !password ? "border-red-500 focus:border-red-500" : ""}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowAddForm(!showAddForm)}
                  variant="outline"
                >
                  {showAddForm ? "Cancel" : "Add New Period"}
                </Button>
                <Button
                  onClick={async () => {
                    if (!password) {
                      setMessage({ type: "error", text: "Please enter admin password" })
                      return
                    }
                    setIsLoading(true)
                    try {
                      const response = await fetch('/api/admin/init-periods', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ password }),
                      })
                      const data = await response.json()
                      if (response.ok) {
                        setMessage({ type: "success", text: data.message })
                        await loadPeriods()
                      } else {
                        setMessage({ type: "error", text: data.error })
                      }
                    } catch (error) {
                      setMessage({ type: "error", text: "Failed to initialize periods" })
                    } finally {
                      setIsLoading(false)
                    }
                  }}
                  disabled={isLoading}
                  variant="outline"
                  size="sm"
                >
                  Initialize
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Message */}
        {message && (
          <Alert className={`mb-6 ${message.type === "success" ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
            <div className="flex items-center gap-2">
              {message.type === "success" ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-red-600" />
              )}
              <AlertDescription className={message.type === "success" ? "text-green-800" : "text-red-800"}>
                {message.text}
              </AlertDescription>
            </div>
          </Alert>
        )}

        {/* Add New Period Form */}
        {showAddForm && (
          <Card className="mb-6 border-2 border-blue-200 bg-blue-50/50">
            <CardHeader>
              <CardTitle className="text-lg text-blue-900">Add New Exam Period</CardTitle>
              <CardDescription>Create a new exam period with custom dates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="new-period-key">Period Key</Label>
                  <Input
                    id="new-period-key"
                    value={newPeriod.periodKey}
                    onChange={(e) => setNewPeriod(prev => ({ ...prev, periodKey: e.target.value }))}
                    placeholder="e.g., spring2026_exam1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-period-name">Period Name</Label>
                  <Input
                    id="new-period-name"
                    value={newPeriod.name}
                    onChange={(e) => setNewPeriod(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Spring 2026 - Exam 1 Period"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="new-start-date">Start Date</Label>
                  <Input
                    id="new-start-date"
                    type="date"
                    value={newPeriod.startDate}
                    onChange={(e) => setNewPeriod(prev => ({ ...prev, startDate: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-end-date">End Date</Label>
                  <Input
                    id="new-end-date"
                    type="date"
                    value={newPeriod.endDate}
                    onChange={(e) => setNewPeriod(prev => ({ ...prev, endDate: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAddNewPeriod} disabled={isLoading}>
                  {isLoading ? "Adding..." : "Add Period"}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowAddForm(false)
                    setNewPeriod({
                      periodKey: "",
                      name: "",
                      startDate: "",
                      endDate: "",
                      excludedDates: []
                    })
                  }}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Periods List */}
        <div className="space-y-6">
          {Object.entries(periods).map(([periodKey, period]) => (
            <Card key={periodKey} className="bg-white/90 backdrop-blur-sm border-0 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-purple-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Calendar className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <CardTitle className="text-lg text-purple-900">{period.name}</CardTitle>
                      <CardDescription>
                        {formatDateRange(period.startDate, period.endDate)} • {period.excludedDates.length} exempt days
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {editingPeriod === periodKey ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleSavePeriod(periodKey)}
                          disabled={isLoading}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <Save className="h-4 w-4 mr-2" />
                          {isLoading ? "Saving..." : "Save"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingPeriod(null)}
                          disabled={isLoading}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => setEditingPeriod(periodKey)}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-6">
                {editingPeriod === periodKey ? (
                  <div className="space-y-6">
                    {/* Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`name-${periodKey}`}>Period Name</Label>
                        <Input
                          id={`name-${periodKey}`}
                          value={period.name}
                          onChange={(e) => setPeriods(prev => ({
                            ...prev,
                            [periodKey]: { ...prev[periodKey], name: e.target.value }
                          }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Period Key</Label>
                        <Input value={periodKey} disabled className="bg-slate-100" />
                      </div>
                    </div>

                    {/* Date Range */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`start-${periodKey}`}>Start Date</Label>
                        <Input
                          id={`start-${periodKey}`}
                          type="date"
                          value={formatDateForInput(period.startDate)}
                          onChange={(e) => setPeriods(prev => ({
                            ...prev,
                            [periodKey]: { ...prev[periodKey], startDate: e.target.value }
                          }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`end-${periodKey}`}>End Date</Label>
                        <Input
                          id={`end-${periodKey}`}
                          type="date"
                          value={formatDateForInput(period.endDate)}
                          onChange={(e) => setPeriods(prev => ({
                            ...prev,
                            [periodKey]: { ...prev[periodKey], endDate: e.target.value }
                          }))}
                        />
                      </div>
                    </div>

                    {/* Excluded Dates */}
                    <div className="space-y-4">
                      <Label>Excluded Dates</Label>
                      <div className="space-y-2">
                        {period.excludedDates.map((date, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <Input
                              type="date"
                              value={date}
                              onChange={(e) => {
                                const newExcludedDates = [...period.excludedDates]
                                newExcludedDates[index] = e.target.value
                                setPeriods(prev => ({
                                  ...prev,
                                  [periodKey]: { ...prev[periodKey], excludedDates: newExcludedDates }
                                }))
                              }}
                              className="flex-1"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRemoveExcludedDate(periodKey, index)}
                              className="text-red-600 border-red-200 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <div className="flex items-center gap-2">
                          <Input
                            type="date"
                            value={newExcludedDate}
                            onChange={(e) => setNewExcludedDate(e.target.value)}
                            placeholder="Add excluded date"
                            className="flex-1"
                          />
                          <Button
                            size="sm"
                            onClick={() => handleAddExcludedDate(periodKey)}
                            disabled={!newExcludedDate}
                            className="bg-purple-600 hover:bg-purple-700"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium text-slate-600">Start Date</Label>
                        <p className="text-lg font-semibold text-slate-900">
                          {formatDateForDisplay(period.startDate, { 
                            year: "numeric", 
                            month: "long", 
                            day: "numeric"
                          })}
                        </p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-slate-600">End Date</Label>
                        <p className="text-lg font-semibold text-slate-900">
                          {formatDateForDisplay(period.endDate, { 
                            year: "numeric", 
                            month: "long", 
                            day: "numeric"
                          })}
                        </p>
                      </div>
                    </div>
                    
                    {period.excludedDates.length > 0 && (
                      <div>
                        <Label className="text-sm font-medium text-slate-600">Excluded Dates</Label>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {period.excludedDates.map((date, index) => (
                            <span
                              key={index}
                              className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium"
                            >
                              {formatDateForDisplay(date, { 
                                month: "short", 
                                day: "numeric"
                              })}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Info Card */}
        <Card className="mt-8 bg-blue-50 border-blue-200">
          <CardContent className="p-6">
            <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Important Notes
            </h3>
            <div className="space-y-2 text-sm text-blue-800">
              <p>• Changes to exam periods will affect all future data uploads</p>
              <p>• Existing student data will not be automatically updated</p>
              <p>• Excluded dates are automatically excluded from progress calculations</p>
              <p>• Make sure to coordinate changes with the academic calendar</p>
            </div>
          </CardContent>
        </Card>

        {/* Back to Student Portal */}
        <div className="text-center mt-8">
          <Button variant="outline" asChild>
            <Link href="/">← Back to Student Portal</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
