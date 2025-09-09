"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Database, 
  Search, 
  Users, 
  Calendar,
  ArrowLeft,
  Download,
  Eye,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Shield,
  AlertTriangle
} from "lucide-react"
import Link from "next/link"

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

export default function ViewDataPage() {
  const [password, setPassword] = useState("")
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authError, setAuthError] = useState("")
  const [isLoadingAuth, setIsLoadingAuth] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedPeriod, setSelectedPeriod] = useState("")
  const [selectedSection, setSelectedSection] = useState("")
  const [uploadRecords, setUploadRecords] = useState<UploadRecord[]>([])
  const [studentData, setStudentData] = useState<Record<string, StudentData>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [sortField, setSortField] = useState<keyof StudentData | "studentId" | "status">("name")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")

  // Load saved password from localStorage on component mount
  useEffect(() => {
    const savedPassword = localStorage.getItem('adminPassword')
    if (savedPassword) {
      setPassword(savedPassword)
    }
  }, [])

  // Save password to localStorage when it changes
  useEffect(() => {
    if (password) {
      localStorage.setItem('adminPassword', password)
    }
  }, [password])

  useEffect(() => {
    if (isAuthenticated) {
      loadUploadRecords()
    }
  }, [isAuthenticated])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoadingAuth(true)
    setAuthError("")

    try {
      const response = await fetch("/api/admin/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      })

      const result = await response.json()

      if (response.ok && result.success) {
        setIsAuthenticated(true)
      } else {
        setAuthError(result.error || "Authentication failed")
      }
    } catch (error) {
      setAuthError("Network error. Please try again.")
    } finally {
      setIsLoadingAuth(false)
    }
  }

  const loadUploadRecords = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/admin/student-data")
      const result = await response.json()

      if (response.ok) {
        setUploadRecords(result.uploadRecords || [])
      } else {
        setError(result.error || "Failed to load upload records")
      }
    } catch (error) {
      setError("Failed to load upload records")
    } finally {
      setIsLoading(false)
    }
  }

  const loadStudentData = async (period: string, sectionNumber: string) => {
    setIsLoading(true)
    setError("")
    try {
      const response = await fetch(`/api/admin/student-data?period=${encodeURIComponent(period)}&sectionNumber=${encodeURIComponent(sectionNumber)}`)
      const result = await response.json()

      if (response.ok) {
        setStudentData(result.studentData || {})
      } else {
        setError(result.error || "Failed to load student data")
      }
    } catch (error) {
      setError("Failed to load student data")
    } finally {
      setIsLoading(false)
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
      return <ArrowUpDown className="h-4 w-4 text-slate-400" />
    }
    return sortDirection === "asc" ? 
      <ArrowUp className="h-4 w-4 text-slate-600" /> : 
      <ArrowDown className="h-4 w-4 text-slate-600" />
  }

  const getStatusValue = (percentComplete: number) => {
    // For status sorting: 0 = worst, 1 = best
    if (percentComplete >= 90) return 1
    if (percentComplete >= 70) return 0.5
    return 0
  }

  const filteredAndSortedStudents = Object.entries(studentData)
    .filter(([studentId, data]) => {
      const matchesSearch = searchTerm === "" || 
        data.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        data.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        studentId.toLowerCase().includes(searchTerm.toLowerCase())
      
      return matchesSearch
    })
    .sort(([studentIdA, dataA], [studentIdB, dataB]) => {
      let aValue: any
      let bValue: any

      switch (sortField) {
        case "studentId":
          aValue = studentIdA.toLowerCase()
          bValue = studentIdB.toLowerCase()
          break
        case "name":
          aValue = dataA.name.toLowerCase()
          bValue = dataB.name.toLowerCase()
          break
        case "email":
          aValue = dataA.email.toLowerCase()
          bValue = dataB.email.toLowerCase()
          break
        case "coins":
          aValue = dataA.coins
          bValue = dataB.coins
          break
        case "percentComplete":
          aValue = dataA.percentComplete
          bValue = dataB.percentComplete
          break
        case "totalDays":
          aValue = dataA.totalDays
          bValue = dataB.totalDays
          break
        case "periodDays":
          aValue = dataA.periodDays
          bValue = dataB.periodDays
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

  const formatDate = (dateString: string) => {
    // Convert UTC timestamp to Central Time - show date
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "America/Chicago" // Central Time
    }
    
    return new Date(dateString).toLocaleString("en-US", options)
  }

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
    const headers = ["Student ID", "Name", "Email", "Coins", "Total Days", "Period Days", "Percent Complete", "Status"]
    const csvData = [
      headers.join(","),
      ...Object.entries(studentData).map(([studentId, data]) => [
        studentId,
        `"${data.name}"`,
        `"${data.email}"`,
        data.coins,
        data.totalDays,
        data.periodDays,
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

  // Show authentication form if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
        <div className="container mx-auto px-4 py-8 max-w-md">
          <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Shield className="h-5 w-5 text-blue-600" />
                </div>
                Admin Authentication
              </CardTitle>
              <CardDescription>
                Enter admin password to view student data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium text-slate-700">
                    Admin Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoadingAuth}
                    className="h-12 border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                    placeholder="Enter admin password"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isLoadingAuth || !password}
                  className="w-full h-12 bg-blue-600 hover:bg-blue-700"
                >
                  {isLoadingAuth ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Authenticating...
                    </div>
                  ) : (
                    "Authenticate"
                  )}
                </Button>
                {authError && (
                  <Alert className="border-red-200 bg-red-50">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-800">
                      {authError}
                    </AlertDescription>
                  </Alert>
                )}
              </form>
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/dashboard" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">View Student Data</h1>
            <p className="text-slate-600">Browse and search through uploaded student data</p>
          </div>
        </div>

        {/* Upload Records */}
        <Card className="mb-8 bg-white/90 backdrop-blur-sm border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Database className="h-5 w-5 text-green-600" />
              </div>
              Data Upload History
            </CardTitle>
            <CardDescription>
              Select a period to view student data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {uploadRecords.map((record) => (
                <Card key={record.id} className="border border-slate-200 hover:border-green-300 transition-colors">
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className="text-xs">
                            {record.period}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            Section {record.section_number || 'default'}
                          </Badge>
                        </div>
                        <span className="text-xs text-slate-500">
                          {record.student_count} students
                        </span>
                      </div>
                      <p className="text-sm text-slate-600">
                        {formatDate(record.uploaded_at)}
                      </p>
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedPeriod(record.period)
                          setSelectedSection(record.section_number || 'default')
                          loadStudentData(record.period, record.section_number || 'default')
                        }}
                        className="w-full bg-green-600 hover:bg-green-700"
                        disabled={isLoading}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Data
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Student Data */}
        {(selectedPeriod && selectedSection) && (
          <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Users className="h-5 w-5 text-blue-600" />
                    </div>
                    Student Data - {selectedPeriod} - Section {selectedSection}
                  </CardTitle>
                  <CardDescription>
                    {Object.keys(studentData).length} students found
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={handleExport}>
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Search */}
              <div className="mb-6">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-slate-500" />
                  <Input
                    placeholder="Search by name, email, or student ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="max-w-md"
                  />
                </div>
              </div>

              {/* Students Table - Condensed Layout */}
              <div className="space-y-2">
                {/* Header Row */}
                <div className="flex items-center gap-4 p-3 bg-slate-100 border border-slate-200 rounded-lg text-sm font-medium text-slate-600">
                  <button 
                    onClick={() => handleSort("name")}
                    className="flex-1 flex items-center gap-1 hover:text-slate-800 transition-colors"
                  >
                    Student {getSortIcon("name")}
                  </button>
                  <button 
                    onClick={() => handleSort("coins")}
                    className="flex items-center gap-2 hover:text-slate-800 transition-colors"
                  >
                    Coins {getSortIcon("coins")}
                  </button>
                  <button 
                    onClick={() => handleSort("percentComplete")}
                    className="w-12 text-center flex items-center justify-center gap-1 hover:text-slate-800 transition-colors"
                  >
                    Progress {getSortIcon("percentComplete")}
                  </button>
                  <div className="text-center min-w-0 flex items-center justify-center gap-1 text-slate-600">
                    Days
                  </div>
                  <button 
                    onClick={() => handleSort("status")}
                    className="min-w-0 flex items-center gap-1 hover:text-slate-800 transition-colors"
                  >
                    Status {getSortIcon("status")}
                  </button>
                  <button 
                    onClick={() => handleSort("email")}
                    className="hidden lg:flex min-w-0 flex-1 items-center gap-1 hover:text-slate-800 transition-colors"
                  >
                    Email {getSortIcon("email")}
                  </button>
                </div>
                
                {filteredAndSortedStudents.map(([studentId, data]) => (
                  <div key={studentId} className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                    {/* Name - Primary */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{data.name}</p>
                      <p className="text-xs text-slate-500 font-mono">{studentId}</p>
                    </div>

                    {/* Coins - Secondary */}
                    <div className="flex items-center gap-2">
                      <div className="text-2xl">🪙</div>
                      <span className="text-xl font-bold text-amber-600">{data.coins}</span>
                    </div>

                    {/* Circular Progress */}
                    <div className="relative w-12 h-12">
                      <svg className="w-12 h-12 transform -rotate-90" viewBox="0 0 36 36">
                        <path
                          className="text-slate-200"
                          stroke="currentColor"
                          strokeWidth="3"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <path
                          className={getProgressColor(data.percentComplete)}
                          stroke="currentColor"
                          strokeWidth="3"
                          fill="none"
                          strokeDasharray={`${data.percentComplete}, 100`}
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs font-bold text-slate-700">{data.percentComplete}%</span>
                      </div>
                    </div>

                    {/* Days Completed */}
                    <div className="text-center min-w-0">
                      <p className="text-sm font-medium text-slate-900">{data.totalDays}/{data.periodDays}</p>
                      <p className="text-xs text-slate-500">days</p>
                    </div>

                    {/* Status Badge */}
                    <div className="min-w-0">
                      <Badge 
                        className={
                          data.percentComplete >= 90 
                            ? "bg-emerald-500 hover:bg-emerald-600 text-white" 
                            : data.percentComplete >= 70 
                            ? "bg-amber-500 hover:bg-amber-600 text-white"
                            : "bg-rose-500 hover:bg-rose-600 text-white"
                        }
                      >
                        {data.percentComplete >= 90 ? "Excellent" : 
                         data.percentComplete >= 70 ? "Good" : "Needs Work"}
                      </Badge>
                    </div>

                    {/* Email - Collapsible */}
                    <div className="hidden lg:block min-w-0 flex-1">
                      <p className="text-sm text-slate-600 truncate">{data.email}</p>
                    </div>
                  </div>
                ))}
              </div>

              {filteredAndSortedStudents.length === 0 && !isLoading && (
                <div className="text-center py-8">
                  {Object.keys(studentData).length === 0 ? (
                    <div>
                      <p className="text-slate-500 mb-2">No student data found for this period.</p>
                      <p className="text-sm text-slate-400">
                        Upload student data using the "Upload Student Data" tool first.
                      </p>
                    </div>
                  ) : (
                    <p className="text-slate-500">No students found matching your search criteria.</p>
                  )}
                </div>
              )}

              {isLoading && (
                <div className="text-center py-8">
                  <div className="inline-flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-slate-500">Loading student data...</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {error && (
          <Card className="mt-6 border-red-200 bg-red-50">
            <CardContent className="p-4">
              <p className="text-red-800">{error}</p>
            </CardContent>
          </Card>
        )}

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
