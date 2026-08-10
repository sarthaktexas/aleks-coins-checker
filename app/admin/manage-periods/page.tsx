"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Calendar, 
  Save, 
  Edit, 
  Plus, 
  Trash2, 
  CheckCircle, 
  AlertTriangle,
} from "lucide-react"
import { EXAM_PERIODS } from "@/lib/exam-periods"

type ExamPeriodData = {
  name: string
  startDate: string
  endDate: string
  excludedDates: readonly string[]
}

export default function ManagePeriodsPage() {
  const [periods, setPeriods] = useState<Record<string, ExamPeriodData>>({})
  const [editingPeriod, setEditingPeriod] = useState<string | null>(null)
  const [editingPeriodNewKey, setEditingPeriodNewKey] = useState<string>("")
  const [newExcludedDate, setNewExcludedDate] = useState("")
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
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
    const newKey = editingPeriodNewKey.trim()
    if (!newKey) {
      setMessage({
        type: "error",
        text: "Period key cannot be empty"
      })
      return
    }

    setIsLoading(true)
    setMessage(null)

    try {
      const period = periods[periodKey]

      // If period key was changed, rename it first (updates all tables)
      if (newKey !== periodKey) {
        const renameResponse = await fetch('/api/admin/exam-periods', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: "same-origin",
          body: JSON.stringify({
            oldPeriodKey: periodKey,
            newPeriodKey: newKey,
          }),
        })
        if (renameResponse.status === 401) {
          setMessage({ type: "error", text: "Session expired — refresh and sign in again." })
          setIsLoading(false)
          return
        }
        const renameData = await renameResponse.json()

        if (!renameResponse.ok) {
          setMessage({
            type: "error",
            text: renameData.error || "Failed to change period key. It may already exist."
          })
          setIsLoading(false)
          return
        }
      }

      // Save period details (name, dates, excluded dates)
      const response = await fetch('/api/admin/exam-periods', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: "same-origin",
        body: JSON.stringify({
          periodKey: newKey,
          name: period.name,
          startDate: period.startDate,
          endDate: period.endDate,
          excludedDates: period.excludedDates,
        }),
      })

      if (response.status === 401) {
        setMessage({ type: "error", text: "Session expired — refresh and sign in again." })
        return
      }

      const data = await response.json()

      if (response.ok) {
        setMessage({
          type: "success",
          text: data.message || `Successfully updated ${period.name}`
        })
        setEditingPeriod(null)
        setEditingPeriodNewKey("")
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
        credentials: "same-origin",
        body: JSON.stringify({
          periodKey: newPeriod.periodKey,
          name: newPeriod.name,
          startDate: newPeriod.startDate,
          endDate: newPeriod.endDate,
          excludedDates: newPeriod.excludedDates,
        }),
      })

      if (response.status === 401) {
        setMessage({ type: "error", text: "Session expired — refresh and sign in again." })
        return
      }

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
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-utsa-midnight">Manage Exam Periods</h1>
        <p className="text-sm text-utsa-muted">Edit exam period dates and excluded dates</p>
      </div>

      <div className="mb-0 flex flex-wrap gap-2">
        <Button
          onClick={() => setShowAddForm(!showAddForm)}
          variant="outline"
          className="border-utsa-border"
        >
          {showAddForm ? "Cancel" : "Add New Period"}
        </Button>
        <Button
          onClick={async () => {
            setIsLoading(true)
            try {
              const response = await fetch('/api/admin/init-periods', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: "same-origin",
                body: JSON.stringify({}),
              })
              if (response.status === 401) {
                setMessage({ type: "error", text: "Session expired — refresh and sign in again." })
                return
              }
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
          className="border-utsa-border"
        >
          Initialize
        </Button>
      </div>

      {message && (
        <Alert className={`${message.type === "success" ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
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

      {showAddForm && (
        <div className="rounded-md border border-utsa-border bg-white p-4 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-utsa-midnight">Add New Exam Period</h2>
            <p className="text-xs text-utsa-muted">Create a new exam period with custom dates</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-period-key">Period Key</Label>
              <Input
                id="new-period-key"
                value={newPeriod.periodKey}
                onChange={(e) => setNewPeriod(prev => ({ ...prev, periodKey: e.target.value }))}
                placeholder="e.g., spring2026_exam1"
                className="border-utsa-border focus-visible:ring-utsa-orange"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-period-name">Period Name</Label>
              <Input
                id="new-period-name"
                value={newPeriod.name}
                onChange={(e) => setNewPeriod(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Spring 2026 - Exam 1 Period"
                className="border-utsa-border focus-visible:ring-utsa-orange"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-start-date">Start Date</Label>
              <Input
                id="new-start-date"
                type="date"
                value={newPeriod.startDate}
                onChange={(e) => setNewPeriod(prev => ({ ...prev, startDate: e.target.value }))}
                className="border-utsa-border focus-visible:ring-utsa-orange"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-end-date">End Date</Label>
              <Input
                id="new-end-date"
                type="date"
                value={newPeriod.endDate}
                onChange={(e) => setNewPeriod(prev => ({ ...prev, endDate: e.target.value }))}
                className="border-utsa-border focus-visible:ring-utsa-orange"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAddNewPeriod} disabled={isLoading} className="">
              {isLoading ? "Adding..." : "Add Period"}
            </Button>
            <Button 
              variant="outline" 
              className="border-utsa-border"
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
        </div>
      )}

      <div className="space-y-4">
        {Object.entries(periods).map(([periodKey, period]) => (
          <div key={periodKey} className="rounded-md border border-utsa-border bg-white overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-utsa-border bg-utsa-surface px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <Calendar className="h-4 w-4 text-utsa-orange shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-utsa-midnight truncate">{period.name}</h2>
                  <p className="text-xs text-utsa-muted">
                    {formatDateRange(period.startDate, period.endDate)} • {period.excludedDates.length} exempt days
                  </p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                {editingPeriod === periodKey ? (
                  <>
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() => handleSavePeriod(periodKey)}
                      disabled={isLoading}
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {isLoading ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingPeriod(null)
                        setEditingPeriodNewKey("")
                      }}
                      disabled={isLoading}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingPeriod(periodKey)
                      setEditingPeriodNewKey(periodKey)
                    }}
                    className=""
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                )}
              </div>
            </div>

            <div className="p-4">
              {editingPeriod === periodKey ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor={`name-${periodKey}`}>Period Name</Label>
                      <Input
                        id={`name-${periodKey}`}
                        value={period.name}
                        onChange={(e) => setPeriods(prev => ({
                          ...prev,
                          [periodKey]: { ...prev[periodKey], name: e.target.value }
                        }))}
                        className="border-utsa-border focus-visible:ring-utsa-orange"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`key-${periodKey}`}>Period Key</Label>
                      <Input
                        id={`key-${periodKey}`}
                        value={editingPeriodNewKey}
                        onChange={(e) => setEditingPeriodNewKey(e.target.value)}
                        placeholder="e.g., spring2026_exam1"
                        className="font-mono border-utsa-border focus-visible:ring-utsa-orange"
                      />
                      <p className="text-xs text-utsa-muted">
                        Changing the key updates student_data, coin_adjustments, and student_requests. Use lowercase letters, numbers, and underscores.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor={`start-${periodKey}`}>Start Date</Label>
                      <Input
                        id={`start-${periodKey}`}
                        type="date"
                        value={formatDateForInput(period.startDate)}
                        onChange={(e) => setPeriods(prev => ({
                          ...prev,
                          [periodKey]: { ...prev[periodKey], startDate: e.target.value }
                        }))}
                        className="border-utsa-border focus-visible:ring-utsa-orange"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`end-${periodKey}`}>End Date</Label>
                      <Input
                        id={`end-${periodKey}`}
                        type="date"
                        value={formatDateForInput(period.endDate)}
                        onChange={(e) => setPeriods(prev => ({
                          ...prev,
                          [periodKey]: { ...prev[periodKey], endDate: e.target.value }
                        }))}
                        className="border-utsa-border focus-visible:ring-utsa-orange"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
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
                            className="flex-1 border-utsa-border focus-visible:ring-utsa-orange"
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
                          className="flex-1 border-utsa-border focus-visible:ring-utsa-orange"
                        />
                        <Button
                          size="sm"
                          onClick={() => handleAddExcludedDate(periodKey)}
                          disabled={!newExcludedDate}
                          className=""
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
                      <Label className="text-xs font-medium text-utsa-muted">Start Date</Label>
                      <p className="text-base font-semibold text-utsa-midnight">
                        {formatDateForDisplay(period.startDate, { 
                          year: "numeric", 
                          month: "long", 
                          day: "numeric"
                        })}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-utsa-muted">End Date</Label>
                      <p className="text-base font-semibold text-utsa-midnight">
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
                      <Label className="text-xs font-medium text-utsa-muted">Excluded Dates</Label>
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
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-md border border-utsa-border bg-utsa-surface p-4 text-xs text-utsa-muted">
        <h3 className="font-medium text-utsa-midnight mb-2 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-utsa-orange" />
          Important Notes
        </h3>
        <div className="space-y-1">
          <p>• Changes to exam periods will affect all future data uploads</p>
          <p>• You can change the period key when editing—it will update all related student_data, coin_adjustments, and student_requests</p>
          <p>• The period name (not the key) is shown to students on their lookup page</p>
          <p>• Excluded dates are automatically excluded from progress calculations</p>
          <p>• Make sure to coordinate changes with the academic calendar</p>
        </div>
      </div>
    </div>
  )
}
