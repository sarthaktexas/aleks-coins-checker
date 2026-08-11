"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Database, 
  Search, 
  Users, 
  Download,
  Eye,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Copy,
  CheckCircle,
  Trash2,
  EyeOff,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Calendar,
} from "lucide-react"
import { getFakeDataForStudent } from "@/lib/fake-data"
import { useHidePII } from "@/hooks/use-hide-pii"
import { CondensedCalendarView } from "@/components/condensed-calendar-view"
import { groupBySemester, getExamLabel } from "@/lib/exam-periods"
import { formatLocalDateTime } from "@/lib/datetime"

type StudentData = {
  name: string
  email: string
  coins: number
  totalDays: number
  periodDays: number
  percentComplete: number
  dailyLog: any[]
}

type UploadRecord = {
  id: number
  period: string
  section_number: string
  uploaded_at: string
  student_count: number
}

const SESSION_EXPIRED = "Session expired — refresh and sign in again."

export default function ViewDataPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedPeriod, setSelectedPeriod] = useState("")
  const [selectedSection, setSelectedSection] = useState("")
  const [uploadRecords, setUploadRecords] = useState<UploadRecord[]>([])
  const [studentData, setStudentData] = useState<Record<string, StudentData>>({})
  const [isLoadingUploads, setIsLoadingUploads] = useState(true)
  const [isLoadingStudents, setIsLoadingStudents] = useState(false)
  const [error, setError] = useState("")
  const [sortField, setSortField] = useState<keyof StudentData | "studentId" | "status">("name")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [isPeriodComplete, setIsPeriodComplete] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState("")
  const [deletingUploadId, setDeletingUploadId] = useState<number | null>(null)
  const [showExportDropdown, setShowExportDropdown] = useState(false)
  const [hideStudentData] = useHidePII()
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null)
  const [collapsedSemesters, setCollapsedSemesters] = useState<Set<string>>(new Set())

  const semesterGroups = useMemo(
    () => groupBySemester(uploadRecords, (record) => record.period),
    [uploadRecords],
  )

  useEffect(() => {
    loadUploadRecords()
  }, [])

  const toggleSemester = (semesterKey: string) => {
    setCollapsedSemesters((prev) => {
      const next = new Set(prev)
      if (next.has(semesterKey)) next.delete(semesterKey)
      else next.add(semesterKey)
      return next
    })
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showExportDropdown) {
        const target = event.target as HTMLElement
        if (!target.closest('.export-dropdown-container')) {
          setShowExportDropdown(false)
        }
      }
    }

    if (showExportDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showExportDropdown])

  const loadUploadRecords = async () => {
    setIsLoadingUploads(true)
    try {
      const response = await fetch("/api/admin/student-data", { credentials: "same-origin" })
      if (response.status === 401) {
        setError(SESSION_EXPIRED)
        return
      }
      const result = await response.json()

      if (response.ok) {
        setUploadRecords(result.uploadRecords || [])
      } else {
        setError(result.error || "Failed to load upload records")
      }
    } catch (error) {
      setError("Failed to load upload records")
    } finally {
      setIsLoadingUploads(false)
    }
  }

  const loadStudentData = async (period: string, sectionNumber: string) => {
    setIsLoadingStudents(true)
    setStudentData({})
    setExpandedStudentId(null)
    setError("")
    try {
      const response = await fetch(
        `/api/admin/student-data?period=${encodeURIComponent(period)}&sectionNumber=${encodeURIComponent(sectionNumber)}`,
        { credentials: "same-origin" },
      )
      if (response.status === 401) {
        setError(SESSION_EXPIRED)
        return
      }
      const result = await response.json()

      if (response.ok) {
        setStudentData(result.studentData || {})
        
        // Check if period is complete - look for students who have reached the end of the period
        const studentDataObj = result.studentData || {}
        const isComplete = Object.values(studentDataObj).some((student: any) => {
          // A period is complete if any student has data for all working days
          // This means totalDays (days with data) >= periodDays (total working days)
          return student.totalDays >= student.periodDays
        })
        setIsPeriodComplete(isComplete)
      } else {
        setError(result.error || "Failed to load student data")
        setIsPeriodComplete(false)
      }
    } catch (error) {
      setError("Failed to load student data")
    } finally {
      setIsLoadingStudents(false)
    }
  }

  const deleteUpload = async (uploadId: number) => {
    if (!confirm("Are you sure you want to delete this upload? This action cannot be undone.")) {
      return
    }

    setDeletingUploadId(uploadId)
    setError("")

    try {
      const response = await fetch("/api/admin/student-data", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ uploadId }),
      })

      if (response.status === 401) {
        setError(SESSION_EXPIRED)
        return
      }

      const result = await response.json()

      if (response.ok) {
        // Reload upload records to reflect the deletion
        await loadUploadRecords()
        
        // Clear selected data if it was from the deleted upload
        setSelectedPeriod("")
        setSelectedSection("")
        setStudentData({})
        
        setToastMessage("Upload deleted successfully!")
        setShowToast(true)
        setTimeout(() => setShowToast(false), 3000)
      } else {
        setError(result.error || "Failed to delete upload")
      }
    } catch (error) {
      setError("Failed to delete upload")
    } finally {
      setDeletingUploadId(null)
    }
  }

  const getExtraCreditStudents = () => {
    // Get extra credit students (≥90% completion)
    const extraCreditStudents = Object.entries(studentData)
      .filter(([_, data]) => data.percentComplete >= 90)
      .map(([studentId, data]) => ({
        name: data.name,
        email: data.email,
        studentId: studentId,
        percentComplete: data.percentComplete
      }))
      .sort((a, b) => b.percentComplete - a.percentComplete) // Sort by completion percentage

    return extraCreditStudents
  }

  const exportExtraCreditToCSV = async () => {
    setIsExporting(true)
    setError("")
    setShowExportDropdown(false)

    try {
      const extraCreditStudents = getExtraCreditStudents()

      if (extraCreditStudents.length === 0) {
        setError("No students qualify for extra credit (≥90% completion)")
        return
      }

      // Create CSV format
      const headers = ["Student ID", "Name", "Email", "Percent Complete"]
      const csvRows = [
        headers.join(","),
        ...extraCreditStudents.map((student) => [
          student.studentId,
          `"${student.name}"`,
          `"${student.email}"`,
          student.percentComplete.toFixed(1)
        ].join(","))
      ]

      const csvContent = csvRows.join("\n")

      // Create and download file
      const blob = new Blob([csvContent], { type: "text/csv" })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `extra-credit-students-${selectedPeriod}-${selectedSection}-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      // Show toast notification
      setToastMessage("Extra credit list exported as CSV! 🎉")
      setShowToast(true)
      setTimeout(() => setShowToast(false), 3000)

      // Clear any previous errors
      setError("")

    } catch (error) {
      setError("Failed to export CSV. Please try again.")
    } finally {
      setIsExporting(false)
    }
  }

  const copyExtraCreditToClipboard = async () => {
    setIsExporting(true)
    setError("")
    setShowExportDropdown(false)

    try {
      const extraCreditStudents = getExtraCreditStudents()

      if (extraCreditStudents.length === 0) {
        setError("No students qualify for extra credit (≥90% completion)")
        return
      }

      // Format the list for email
      const formattedList = extraCreditStudents
        .map((student, index) => `${index + 1}. ${student.name} (${student.studentId})`)
        .join('\n')

      const emailText = `Extra Credit Students - ${selectedPeriod} - Section ${selectedSection}

Students who achieved ≥90% completion:

${formattedList}

Total: ${extraCreditStudents.length} students`

      // Copy to clipboard
      await navigator.clipboard.writeText(emailText)
      
      // Show toast notification
      setToastMessage("Extra credit list copied to clipboard! 🎉")
      setShowToast(true)
      setTimeout(() => setShowToast(false), 3000)

      // Clear any previous errors
      setError("")

    } catch (error) {
      setError("Failed to copy to clipboard. Please try again.")
    } finally {
      setIsExporting(false)
    }
  }

  const handleSort = (field: keyof StudentData | "studentId" | "status") => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("asc")
    }
  }

  const getSortIcon = (field: keyof StudentData | "studentId" | "status") => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 text-utsa-muted" />
    }
    return sortDirection === "asc" ? 
      <ArrowUp className="h-3 w-3 text-utsa-midnight" /> : 
      <ArrowDown className="h-3 w-3 text-utsa-midnight" />
  }

  const getStatusValue = (percentComplete: number) => {
    // For status sorting: 0 = worst, 1 = best
    if (percentComplete >= 90) return 1
    if (percentComplete >= 70) return 0.5
    return 0
  }

  // Helper to get display values (real or anonymized)
  const getDisplayData = (studentId: string, data: StudentData) => {
    if (hideStudentData) {
      const fake = getFakeDataForStudent(studentId)
      return { name: fake.name, email: fake.email, studentId: fake.studentId }
    }
    return { name: data.name, email: data.email, studentId }
  }

  const filteredAndSortedStudents = Object.entries(studentData)
    .filter(([studentId, data]) => {
      const display = getDisplayData(studentId, data)
      const matchesSearch = searchTerm === "" || 
        display.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        display.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        display.studentId.toLowerCase().includes(searchTerm.toLowerCase())
      
      return matchesSearch
    })
    .sort(([studentIdA, dataA], [studentIdB, dataB]) => {
      const displayA = getDisplayData(studentIdA, dataA)
      const displayB = getDisplayData(studentIdB, dataB)
      let aValue: any
      let bValue: any

      switch (sortField) {
        case "studentId":
          aValue = displayA.studentId.toLowerCase()
          bValue = displayB.studentId.toLowerCase()
          break
        case "name":
          aValue = displayA.name.toLowerCase()
          bValue = displayB.name.toLowerCase()
          break
        case "email":
          aValue = displayA.email.toLowerCase()
          bValue = displayB.email.toLowerCase()
          break
        case "coins":
          aValue = dataA.coins
          bValue = dataB.coins
          break
        case "percentComplete":
          aValue = dataA.percentComplete
          bValue = dataB.percentComplete
          break
        default:
          // For status sorting, use percentComplete with custom logic
          aValue = getStatusValue(dataA.percentComplete)
          bValue = getStatusValue(dataB.percentComplete)
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1
      return 0
    })

  const formatDate = (dateString: string) => formatLocalDateTime(dateString)

  const getProgressColor = (percent: number) => {
    if (percent >= 90) return "bg-emerald-500"
    if (percent >= 70) return "bg-amber-500"
    return "bg-rose-500"
  }

  const handleExport = () => {
    if (Object.keys(studentData).length === 0) {
      setError("No data to export")
      return
    }

    // Convert student data to CSV format
    const headers = ["Student ID", "Name", "Email", "Coins", "Percent Complete", "Status"]
    const csvData = [
      headers.join(","),
      ...Object.entries(studentData).map(([studentId, data]) => [
        studentId,
        `"${data.name}"`,
        `"${data.email}"`,
        data.coins,
        data.percentComplete,
        `"${data.percentComplete >= 90 ? "Excellent" : data.percentComplete >= 70 ? "Good" : "Needs Work"}"`
      ].join(","))
    ].join("\n")

    // Create and download file
    const blob = new Blob([csvData], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `student-data-${selectedPeriod}-${selectedSection}-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-utsa-midnight">View Student Data</h1>
        <p className="text-sm text-utsa-muted">Browse and search through uploaded student data</p>
      </div>

      <div className="rounded-md border border-utsa-border bg-white overflow-hidden">
        <div className="border-b border-utsa-border bg-utsa-surface px-4 py-3">
          <h2 className="text-sm font-semibold text-utsa-midnight flex items-center gap-2">
            <Database className="h-4 w-4 text-utsa-orange" />
            Available Data Sets
          </h2>
          <p className="text-xs text-utsa-muted mt-0.5">
            Organized by semester — select a period to view student data (latest upload only)
          </p>
        </div>
        <div className="p-4">
          {isLoadingUploads ? (
            <div className="flex items-center gap-2 py-3 text-sm text-utsa-muted">
              <div className="w-3.5 h-3.5 border-2 border-utsa-orange border-t-transparent rounded-full animate-spin" />
              Loading data sets…
            </div>
          ) : uploadRecords.length === 0 ? (
            <p className="text-sm text-utsa-muted py-3">No data sets uploaded yet.</p>
          ) : (
            <div className="space-y-3">
              {semesterGroups.map((group) => {
                const isCollapsed = collapsedSemesters.has(group.semesterKey)
                const isSelectedInGroup = group.items.some(
                  (r) =>
                    selectedPeriod === r.period &&
                    selectedSection === (r.section_number || "default"),
                )
                return (
                  <div
                    key={group.semesterKey}
                    className={`rounded-md border overflow-hidden ${
                      isSelectedInGroup ? "border-utsa-orange/40" : "border-utsa-border"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSemester(group.semesterKey)}
                      className="w-full flex items-center justify-between gap-3 bg-utsa-surface px-3 py-2.5 text-left hover:bg-utsa-surface/80 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isCollapsed ? (
                          <ChevronRight className="h-4 w-4 text-utsa-muted shrink-0" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-utsa-muted shrink-0" />
                        )}
                        <Calendar className="h-3.5 w-3.5 text-utsa-orange shrink-0" />
                        <span className="text-sm font-semibold text-utsa-midnight truncate">
                          {group.semesterLabel}
                        </span>
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {group.items.length} {group.items.length === 1 ? "dataset" : "datasets"}
                        </Badge>
                      </div>
                    </button>

                    {!isCollapsed && (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-3 border-t border-utsa-border">
                        {group.items.map((record) => {
                          const section = record.section_number || "default"
                          const isSelected =
                            selectedPeriod === record.period && selectedSection === section
                          return (
                            <div
                              key={record.id}
                              className={`rounded-md border p-4 transition-colors ${
                                isSelected
                                  ? "border-utsa-orange bg-orange-50/40"
                                  : "border-utsa-border hover:border-utsa-orange/50"
                              }`}
                            >
                              <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex flex-col gap-1 min-w-0">
                                    <Badge variant="outline" className="text-xs border-utsa-border w-fit">
                                      {getExamLabel(record.period)}
                                    </Badge>
                                    <Badge variant="secondary" className="text-xs w-fit">
                                      Section {section}
                                    </Badge>
                                  </div>
                                  <span className="text-xs text-utsa-muted shrink-0">
                                    {record.student_count} students
                                  </span>
                                </div>
                                <p className="text-xs font-mono text-utsa-muted truncate">
                                  {record.period}
                                </p>
                                <p className="text-sm text-utsa-muted">
                                  {formatDate(record.uploaded_at)}
                                </p>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      setSelectedPeriod(record.period)
                                      setSelectedSection(section)
                                      loadStudentData(record.period, section)
                                    }}
                                    className="flex-1"
                                    disabled={isLoadingStudents}
                                    variant={isSelected ? "default" : "outline"}
                                  >
                                    {isLoadingStudents && isSelected ? (
                                      <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                                        Loading…
                                      </>
                                    ) : (
                                      <>
                                        <Eye className="h-4 w-4 mr-2" />
                                        {isSelected ? "Viewing" : "View Data"}
                                      </>
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => deleteUpload(record.id)}
                                    disabled={isLoadingStudents || deletingUploadId === record.id}
                                    className="px-3"
                                  >
                                    {deletingUploadId === record.id ? (
                                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                      <Trash2 className="h-4 w-4" />
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {(selectedPeriod && selectedSection) && (
        <div className="rounded-md border border-utsa-border bg-white overflow-hidden">
          <div className="border-b border-utsa-border bg-utsa-surface px-4 py-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-sm font-semibold text-utsa-midnight flex items-center gap-2">
                  <Users className="h-4 w-4 text-utsa-orange" />
                  Student Data — {getExamLabel(selectedPeriod)} ({selectedPeriod}) — Section {selectedSection}
                </h2>
                <p className="text-xs text-utsa-muted mt-0.5">
                  {isLoadingStudents
                    ? "Loading students…"
                    : `${Object.keys(studentData).length} students found`}
                </p>
              </div>
              
              <div className="flex gap-2 items-center flex-wrap">
                {isPeriodComplete && (
                  <div className="relative export-dropdown-container">
                    <Button
                      onClick={() => setShowExportDropdown(!showExportDropdown)}
                      disabled={isExporting || hideStudentData}
                      variant="success"
                    >
                      {isExporting ? (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Exporting...
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Download className="h-4 w-4" />
                          Export Extra Credit
                          <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      )}
                    </Button>
                    {showExportDropdown && !isExporting && (
                      <div className="absolute right-0 mt-2 w-48 bg-white rounded border border-[rgba(3,32,68,0.12)] shadow-[0_4px_16px_rgba(3,32,68,0.12)] z-50 overflow-hidden">
                        <div className="py-1">
                          <button
                            onClick={exportExtraCreditToCSV}
                            className="w-full text-left px-3 py-1.5 text-xs font-medium text-utsa-midnight hover:bg-utsa-surface flex items-center gap-2"
                          >
                            <Download className="h-3.5 w-3.5 text-utsa-muted" />
                            Export as CSV
                          </button>
                          <button
                            onClick={copyExtraCreditToClipboard}
                            className="w-full text-left px-3 py-1.5 text-xs font-medium text-utsa-midnight hover:bg-utsa-surface flex items-center gap-2"
                          >
                            <Copy className="h-3.5 w-3.5 text-utsa-muted" />
                            Copy to Clipboard
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <Button size="sm" variant="outline" onClick={handleExport} disabled={hideStudentData}>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </div>
          </div>
          <div className="p-4">
            {isLoadingStudents ? (
              <div className="flex items-center gap-2 py-3 text-sm text-utsa-muted">
                <div className="w-3.5 h-3.5 border-2 border-utsa-orange border-t-transparent rounded-full animate-spin" />
                Loading student data…
              </div>
            ) : (
              <>
            <div className="mb-3 flex flex-col gap-2">
              {hideStudentData && (
                <Alert className="border-amber-200 bg-amber-50 py-2">
                  <EyeOff className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800 text-xs">
                    PII is hidden. Names, emails, and IDs are replaced with placeholders.
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-utsa-muted" />
                <Input
                  placeholder={hideStudentData ? "Search placeholders…" : "Search name, email, or ID…"}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-8 max-w-sm text-sm border-utsa-border focus-visible:ring-utsa-orange"
                />
              </div>
            </div>

            {filteredAndSortedStudents.length === 0 ? (
              <div className="text-center py-6">
                {Object.keys(studentData).length === 0 ? (
                  <p className="text-sm text-utsa-muted">No student data found for this period.</p>
                ) : (
                  <p className="text-sm text-utsa-muted">No students match your search.</p>
                )}
              </div>
            ) : (
            <div className="rounded-md border border-utsa-border overflow-hidden">
              <div className="flex items-center gap-3 px-3 py-2 bg-utsa-surface text-xs font-medium text-utsa-muted border-b border-utsa-border">
                <div className="w-4 flex-shrink-0" />
                <button
                  onClick={() => handleSort("name")}
                  className="flex-1 min-w-0 flex items-center gap-1 hover:text-utsa-midnight transition-colors text-left"
                >
                  Name {getSortIcon("name")}
                </button>
                <button
                  onClick={() => handleSort("coins")}
                  className="w-14 flex-shrink-0 flex items-center justify-end gap-1 hover:text-utsa-midnight transition-colors"
                >
                  Coins {getSortIcon("coins")}
                </button>
                <button
                  onClick={() => handleSort("percentComplete")}
                  className="w-28 flex-shrink-0 flex items-center gap-1 hover:text-utsa-midnight transition-colors"
                >
                  Progress {getSortIcon("percentComplete")}
                </button>
                <button
                  onClick={() => handleSort("status")}
                  className="w-20 flex-shrink-0 flex items-center gap-1 hover:text-utsa-midnight transition-colors"
                >
                  Status {getSortIcon("status")}
                </button>
                <button
                  onClick={() => handleSort("email")}
                  className="hidden md:flex flex-1 min-w-0 items-center gap-1 hover:text-utsa-midnight transition-colors text-left"
                >
                  Email {getSortIcon("email")}
                </button>
              </div>

              <div className="divide-y divide-utsa-border">
                {filteredAndSortedStudents.map(([studentId, data]) => {
                  const display = getDisplayData(studentId, data)
                  const isExpanded = expandedStudentId === studentId
                  const workingDays = (data.dailyLog || []).filter((d: any) => !d.isExcluded)
                  const qualifiedDays = workingDays.filter((d: any) => d.qualified).length
                  const exemptCredits = (data.dailyLog || []).filter((d: any) => d.isExcluded && d.wouldHaveQualified).length
                  const avgMins = data.dailyLog && data.dailyLog.length > 0
                    ? Math.round(
                        data.dailyLog.filter((d: any) => d.minutes > 0).reduce((s: number, d: any) => s + d.minutes, 0) /
                        (data.dailyLog.filter((d: any) => d.minutes > 0).length || 1)
                      )
                    : null
                  const statusLabel = data.percentComplete >= 90 ? "Extra credit" : data.percentComplete >= 70 ? "Good" : "Needs work"
                  const statusClass = data.percentComplete >= 90
                    ? "text-emerald-700"
                    : data.percentComplete >= 70
                    ? "text-amber-700"
                    : "text-rose-700"

                  return (
                    <div key={studentId}>
                      <div
                        className="flex items-center gap-3 px-3 py-2 hover:bg-utsa-surface/60 transition-colors cursor-pointer"
                        onClick={() => setExpandedStudentId(isExpanded ? null : studentId)}
                      >
                        <div className="w-4 flex-shrink-0 text-utsa-muted">
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-utsa-midnight truncate leading-tight">{display.name}</p>
                          <p className="text-[11px] text-utsa-muted font-mono truncate">{display.studentId}</p>
                        </div>
                        <div className="w-14 flex-shrink-0 text-right text-sm font-semibold text-amber-600 tabular-nums">
                          {data.coins}
                        </div>
                        <div className="w-28 flex-shrink-0 flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-utsa-border rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${getProgressColor(data.percentComplete)}`}
                              style={{ width: `${Math.min(data.percentComplete, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-utsa-midnight tabular-nums w-9 text-right">
                            {data.percentComplete.toFixed(0)}%
                          </span>
                        </div>
                        <div className={`w-20 flex-shrink-0 text-xs font-medium ${statusClass}`}>
                          {statusLabel}
                        </div>
                        <div className="hidden md:block flex-1 min-w-0">
                          <p className="text-xs text-utsa-muted truncate">{display.email}</p>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-utsa-border bg-utsa-surface/50 px-3 py-3 space-y-3">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-utsa-muted">
                            <span><span className="font-medium text-utsa-midnight">{data.coins}</span> coins</span>
                            <span>
                              <span className="font-medium text-utsa-midnight">
                                {qualifiedDays}{exemptCredits > 0 ? ` + ${exemptCredits}` : ""}
                              </span>
                              {" "}/ {workingDays.length} days
                            </span>
                            {avgMins !== null && (
                              <span><span className="font-medium text-utsa-midnight">{avgMins}</span> avg min/day</span>
                            )}
                            <a
                              href={`/?studentId=${encodeURIComponent(studentId)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-utsa-orange hover:underline ml-auto"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-3 w-3" />
                              Student view
                            </a>
                          </div>

                          {data.dailyLog && data.dailyLog.length > 0 && (
                            <div onClick={(e) => e.stopPropagation()}>
                              <CondensedCalendarView
                                dailyLog={data.dailyLog}
                                totalDays={data.totalDays}
                                periodDays={data.periodDays}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
            )}
              </>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {showToast && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2 duration-300">
          <Alert className="border-emerald-200 bg-emerald-50 shadow-lg">
            <CheckCircle className="h-4 w-4 text-emerald-600" />
            <AlertDescription className="text-emerald-800 font-medium">
              {toastMessage}
            </AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  )
}

