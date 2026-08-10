"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { 
  Trophy,
  ChevronLeft,
  ChevronRight,
  Coins,
  EyeOff,
} from "lucide-react"
import { useHidePII } from "@/hooks/use-hide-pii"
import { getFakeDataForStudent } from "@/lib/fake-data"
import { HidePIIToggle } from "@/components/hide-pii-toggle"
import { Alert, AlertDescription } from "@/components/ui/alert"

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

const SESSION_EXPIRED = "Session expired — refresh and sign in again."

export default function AdminLeaderboardPage() {
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
  const [hidePII, setHidePII] = useHidePII()

  useEffect(() => {
    loadUploadRecords()
  }, [])

  useEffect(() => {
    if (selectedPeriod && selectedSection) {
      loadLeaderboard(1)
    }
  }, [selectedPeriod, selectedSection])

  const loadUploadRecords = async () => {
    setIsLoading(true)
    setError("")
    try {
      const response = await fetch("/api/admin/student-data", { credentials: "same-origin" })
      if (response.status === 401) {
        setError(SESSION_EXPIRED)
        return
      }
      const result = await response.json()

      if (response.ok) {
        const records = result.uploadRecords || []
        setUploadRecords(records)
        
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
    if (!selectedPeriod || !selectedSection) {
      return
    }

    setIsLoading(true)
    setError("")
    setCurrentPage(page)

    try {
      const response = await fetch(
        `/api/admin/leaderboard?period=${encodeURIComponent(selectedPeriod)}&sectionNumber=${encodeURIComponent(selectedSection)}&page=${page}&pageSize=${pageSize}`,
        { credentials: "same-origin" },
      )
      if (response.status === 401) {
        setError(SESSION_EXPIRED)
        setStudents([])
        return
      }
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
    return "bg-utsa-orange"
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-utsa-midnight">Leaderboard</h1>
        <p className="text-sm text-utsa-muted">View student rankings by period and section</p>
      </div>

      <div className="rounded-md border border-utsa-border bg-white p-4 space-y-4">
        <h2 className="text-sm font-semibold text-utsa-midnight flex items-center gap-2">
          <Trophy className="h-4 w-4 text-utsa-orange" />
          Select Period & Section
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="period">Period</Label>
            <Select
              value={selectedPeriod || undefined}
              onValueChange={(value) => {
                setSelectedPeriod(value)
                const sections = getAvailableSections(value)
                if (sections.length > 0) {
                  setSelectedSection(sections[0])
                } else {
                  setSelectedSection("")
                }
              }}
            >
              <SelectTrigger id="period">
                <SelectValue placeholder="Select a period" />
              </SelectTrigger>
              <SelectContent>
                {getAvailablePeriods().map(period => (
                  <SelectItem key={period} value={period}>
                    {period.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="section">Section</Label>
            <Select
              value={selectedSection || undefined}
              onValueChange={setSelectedSection}
              disabled={!selectedPeriod}
            >
              <SelectTrigger id="section">
                <SelectValue placeholder="Select a section" />
              </SelectTrigger>
              <SelectContent>
                {selectedPeriod && getAvailableSections(selectedPeriod).map(section => (
                  <SelectItem key={section} value={section}>
                    Section {section}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-red-800 text-sm font-medium">{error}</p>
        </div>
      )}

      {selectedPeriod && selectedSection && (
        <div className="rounded-md border border-utsa-border bg-white">
          <div className="flex items-center justify-between flex-wrap gap-4 border-b border-utsa-border bg-utsa-surface px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-utsa-midnight flex items-center gap-2">
                <Trophy className="h-4 w-4 text-yellow-500" />
                Leaderboard
              </h2>
              <p className="text-xs text-utsa-muted mt-0.5">
                {selectedPeriod.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} • Section {selectedSection}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <HidePIIToggle hidePII={hidePII} onToggle={setHidePII} showAlert={false} />
              <div className="text-right">
                <p className="text-xs text-utsa-muted">Total Students: {totalStudents}</p>
                <p className="text-xs text-utsa-muted">Page {currentPage} of {totalPages}</p>
              </div>
            </div>
          </div>
          <div className="p-4">
            {hidePII && (
              <Alert className="mb-4 border-amber-200 bg-amber-50">
                <EyeOff className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800">
                  PII is hidden. Names, emails, and IDs are replaced with placeholder data.
                </AlertDescription>
              </Alert>
            )}
            {isLoading ? (
              <div className="py-12 text-center">
                <p className="text-utsa-muted">Loading leaderboard...</p>
              </div>
            ) : students.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-utsa-muted">No students found for this period and section.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-utsa-border">
                        <th className="text-left py-3 px-4 font-semibold text-utsa-muted text-sm">Rank</th>
                        {!hidePII && <th className="text-left py-3 px-4 font-semibold text-utsa-muted text-sm">Student ID</th>}
                        <th className="text-left py-3 px-4 font-semibold text-utsa-muted text-sm">Name</th>
                        <th className="text-left py-3 px-4 font-semibold text-utsa-muted text-sm">Email</th>
                        <th className="text-right py-3 px-4 font-semibold text-utsa-muted text-sm">Total Coins</th>
                        <th className="text-right py-3 px-4 font-semibold text-utsa-muted text-sm">Avg Mins/Day</th>
                        <th className="text-right py-3 px-4 font-semibold text-utsa-muted text-sm">Progress</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((student) => {
                        const display = hidePII ? getFakeDataForStudent(student.studentId) : { name: student.name, email: student.email, studentId: student.studentId }
                        return (
                        <tr key={student.studentId} className="border-b border-utsa-border hover:bg-utsa-surface/50">
                          <td className="py-3 px-4">
                            <Badge className={getRankBadgeColor(student.rank)}>
                              #{student.rank}
                            </Badge>
                          </td>
                          {!hidePII && (
                            <td className="py-3 px-4 text-sm text-utsa-muted font-mono">
                              {display.studentId}
                            </td>
                          )}
                          <td className="py-3 px-4 font-medium text-utsa-midnight">
                            {display.name}
                          </td>
                          <td className="py-3 px-4 text-sm text-utsa-muted">
                            {display.email}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-utsa-midnight">
                            <div className="flex items-center justify-end gap-1">
                              <Coins className="h-4 w-4 text-yellow-500" />
                              {student.totalCoins}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right text-sm text-utsa-muted">
                            {Math.round(student.avgMinutesPerDay)} mins
                          </td>
                          <td className="py-3 px-4 text-right text-sm">
                            <Badge variant="outline" className="bg-utsa-surface border-utsa-border">
                              {student.percentComplete.toFixed(1)}%
                            </Badge>
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="mt-6 flex items-center justify-between">
                    <div className="text-sm text-utsa-muted">
                      Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalStudents)} of {totalStudents} students
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1 || isLoading}
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
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
