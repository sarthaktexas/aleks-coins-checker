"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
  Shield, 
  Trophy,
  ChevronLeft,
  ChevronRight,
  Coins,
  BarChart3
} from "lucide-react"
import Link from "next/link"

type UploadRecord = {
  id: number
  period: string
  section_number: string
  uploaded_at: string
  student_count: number
}

type LeaderboardStudent = {
  rank: number
  studentId: string
  name: string
  email: string
  totalCoins: number
  baseCoins: number
  adjustments: number
  exemptDayCredits: number
  avgMinutesPerDay: number
  percentComplete: number
}

export default function AdminLeaderboardPage() {
  const [password, setPassword] = useState("")
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authError, setAuthError] = useState("")
  const [isLoadingAuth, setIsLoadingAuth] = useState(false)
  const [uploadRecords, setUploadRecords] = useState<UploadRecord[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState("")
  const [selectedSection, setSelectedSection] = useState("")
  const [students, setStudents] = useState<LeaderboardStudent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalStudents, setTotalStudents] = useState(0)
  const pageSize = 20

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

  useEffect(() => {
    if (isAuthenticated && selectedPeriod && selectedSection) {
      loadLeaderboard(1)
    }
  }, [selectedPeriod, selectedSection, isAuthenticated])

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
        const records = result.uploadRecords || []
        setUploadRecords(records)
        
        // Set default to first available period/section if none selected
        if (!selectedPeriod && records.length > 0) {
          const firstRecord = records[0]
          setSelectedPeriod(firstRecord.period)
          setSelectedSection(firstRecord.section_number || 'default')
        }
      } else {
        setError(result.error || "Failed to load upload records")
      }
    } catch (error) {
      setError("Failed to load upload records")
    } finally {
      setIsLoading(false)
    }
  }

  const loadLeaderboard = async (page: number) => {
    if (!selectedPeriod || !selectedSection || !password) {
      return
    }

    setIsLoading(true)
    setError("")
    setCurrentPage(page)

    try {
      const response = await fetch(
        `/api/admin/leaderboard?password=${encodeURIComponent(password)}&period=${encodeURIComponent(selectedPeriod)}&sectionNumber=${encodeURIComponent(selectedSection)}&page=${page}&pageSize=${pageSize}`
      )
      const result = await response.json()

      if (response.ok && result.success) {
        setStudents(result.students || [])
        setTotalPages(result.totalPages || 1)
        setTotalStudents(result.totalStudents || 0)
      } else {
        setError(result.error || "Failed to load leaderboard")
        setStudents([])
      }
    } catch (error) {
      setError("Failed to load leaderboard")
      setStudents([])
    } finally {
      setIsLoading(false)
    }
  }

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      loadLeaderboard(newPage)
    }
  }

  // Get unique periods and sections from upload records
  const getAvailablePeriods = () => {
    const periods = new Set<string>()
    uploadRecords.forEach(record => {
      periods.add(record.period)
    })
    return Array.from(periods).sort()
  }

  const getAvailableSections = (period: string) => {
    const sections = new Set<string>()
    uploadRecords.forEach(record => {
      if (record.period === period) {
        sections.add(record.section_number || 'default')
      }
    })
    return Array.from(sections).sort()
  }

  const getRankBadgeColor = (rank: number) => {
    if (rank === 1) return "bg-yellow-500 hover:bg-yellow-600"
    if (rank === 2) return "bg-gray-400 hover:bg-gray-500"
    if (rank === 3) return "bg-amber-600 hover:bg-amber-700"
    return "bg-blue-500 hover:bg-blue-600"
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
                Enter admin password to view leaderboard
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
                {authError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-700 text-sm font-medium">{authError}</p>
                  </div>
                )}
                <Button
                  type="submit"
                  disabled={isLoadingAuth}
                  className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isLoadingAuth ? "Authenticating..." : "Authenticate"}
                </Button>
              </form>
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
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Leaderboard</h1>
            <p className="text-slate-600">View student rankings by period and section</p>
          </div>
          <Link href="/admin/dashboard">
            <Button variant="outline" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>

        {/* Period and Section Selection */}
        <Card className="mb-6 shadow-lg border-0 bg-white/90 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-lg">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Trophy className="h-5 w-5 text-blue-600" />
              </div>
              Select Period & Section
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="period" className="text-sm font-medium text-slate-700">
                  Period
                </Label>
                <select
                  id="period"
                  value={selectedPeriod}
                  onChange={(e) => {
                    setSelectedPeriod(e.target.value)
                    // Reset section when period changes
                    const sections = getAvailableSections(e.target.value)
                    if (sections.length > 0) {
                      setSelectedSection(sections[0])
                    } else {
                      setSelectedSection("")
                    }
                  }}
                  className="w-full h-10 px-3 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select a period</option>
                  {getAvailablePeriods().map(period => (
                    <option key={period} value={period}>
                      {period.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="section" className="text-sm font-medium text-slate-700">
                  Section
                </Label>
                <select
                  id="section"
                  value={selectedSection}
                  onChange={(e) => setSelectedSection(e.target.value)}
                  disabled={!selectedPeriod}
                  className="w-full h-10 px-3 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                >
                  <option value="">Select a section</option>
                  {selectedPeriod && getAvailableSections(selectedPeriod).map(section => (
                    <option key={section} value={section}>
                      Section {section}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error Message */}
        {error && (
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <p className="text-red-700 font-medium">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Leaderboard Table */}
        {selectedPeriod && selectedSection && (
          <Card className="shadow-lg border-0 bg-white/90 backdrop-blur-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-3 text-lg">
                    <Trophy className="h-5 w-5 text-yellow-500" />
                    Leaderboard
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {selectedPeriod.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} • Section {selectedSection}
                  </CardDescription>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-600">Total Students: {totalStudents}</p>
                  <p className="text-sm text-slate-600">Page {currentPage} of {totalPages}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="py-12 text-center">
                  <p className="text-slate-600">Loading leaderboard...</p>
                </div>
              ) : students.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-slate-600">No students found for this period and section.</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left py-3 px-4 font-semibold text-slate-700">Rank</th>
                          <th className="text-left py-3 px-4 font-semibold text-slate-700">Student ID</th>
                          <th className="text-left py-3 px-4 font-semibold text-slate-700">Name</th>
                          <th className="text-left py-3 px-4 font-semibold text-slate-700">Email</th>
                          <th className="text-right py-3 px-4 font-semibold text-slate-700">Total Coins</th>
                          <th className="text-right py-3 px-4 font-semibold text-slate-700">Avg Mins/Day</th>
                          <th className="text-right py-3 px-4 font-semibold text-slate-700">Progress</th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.map((student) => (
                          <tr key={student.studentId} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-3 px-4">
                              <Badge className={getRankBadgeColor(student.rank)}>
                                #{student.rank}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-sm text-slate-600 font-mono">
                              {student.studentId}
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-900">
                              {student.name}
                            </td>
                            <td className="py-3 px-4 text-sm text-slate-600">
                              {student.email}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-slate-900">
                              <div className="flex items-center justify-end gap-1">
                                <Coins className="h-4 w-4 text-yellow-500" />
                                {student.totalCoins}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right text-sm text-slate-600">
                              {Math.round(student.avgMinutesPerDay)} mins
                            </td>
                            <td className="py-3 px-4 text-right text-sm">
                              <Badge variant="outline" className="bg-slate-50">
                                {student.percentComplete.toFixed(1)}%
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="mt-6 flex items-center justify-between">
                      <div className="text-sm text-slate-600">
                        Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalStudents)} of {totalStudents} students
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePageChange(currentPage - 1)}
                          disabled={currentPage === 1 || isLoading}
                          className="flex items-center gap-1"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </Button>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNum: number
                            if (totalPages <= 5) {
                              pageNum = i + 1
                            } else if (currentPage <= 3) {
                              pageNum = i + 1
                            } else if (currentPage >= totalPages - 2) {
                              pageNum = totalPages - 4 + i
                            } else {
                              pageNum = currentPage - 2 + i
                            }
                            return (
                              <Button
                                key={pageNum}
                                variant={currentPage === pageNum ? "default" : "outline"}
                                size="sm"
                                onClick={() => handlePageChange(pageNum)}
                                disabled={isLoading}
                                className={currentPage === pageNum ? "bg-blue-600 hover:bg-blue-700" : ""}
                              >
                                {pageNum}
                              </Button>
                            )
                          })}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePageChange(currentPage + 1)}
                          disabled={currentPage === totalPages || isLoading}
                          className="flex items-center gap-1"
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

