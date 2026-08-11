"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Search,
  User,
  Mail,
  Coins,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Clock,
  Gift,
  Target,
  Lock,
  BarChart3,
  Trophy,
  Bug,
} from "lucide-react"
import { CalendarView } from "@/components/calendar-view"
import { RedemptionModal } from "@/components/redemption-modal"
import { RequestHistory } from "@/components/request-history"
import { BugReportModal } from "@/components/bug-report-modal"
import { useHidePII } from "@/hooks/use-hide-pii"
import { getFakeDataForStudent } from "@/lib/fake-data"
import { formatLocalDateTime } from "@/lib/datetime"

type DailyLog = {
  day: number
  date: string
  qualified: boolean
  minutes: number
  topics: number
  reason: string
  isExcluded?: boolean
  wouldHaveQualified?: boolean
}

type StudentInfo = {
  name: string
  email: string
  coins: number
  coinAdjustment?: number
  totalCoins?: number
  totalDays: number
  periodDays: number
  percentComplete: number
  dailyLog: DailyLog[]
  exemptDayCredits?: number
  period?: string
  sectionNumber?: string
  uploadedAt?: string | null
}

type PeriodInfo = {
  period: string
  section: string
  periodName?: string  // Display name from exam_periods; falls back to formatted period key
  name: string
  email: string
  coins: number
  coinAdjustment?: number
  totalCoins?: number
  totalDays: number
  periodDays: number
  percentComplete: number
  dailyLog: DailyLog[]
  exemptDayCredits?: number
}

type CoinAdjustment = {
  id: number
  period: string
  section_number: string
  adjustment_amount: number
  reason: string
  created_at: string
  created_by: string
}

type DayStats = {
  day: number
  date: string
  averageCompletion: number
  averageTime: number
  totalStudents: number
  qualifiedStudents: number
  isExcluded: boolean
  sectionData: {
    sectionNumber: string
    completion: number
    time: number
    students: number
    qualified: number
  }[]
  discrepancy: number
}

type MergedPeriodStats = {
  period: string
  sections: string[]
  totalStudents: number
  averageCompletion: number
  averageTime: number
  dayStats: DayStats[]
}

export default function StudentLookup() {
  const [studentId, setStudentId] = useState("")
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null)
  const [studentPeriods, setStudentPeriods] = useState<PeriodInfo[]>([])
  const [coinAdjustments, setCoinAdjustments] = useState<CoinAdjustment[]>([])
  const [totalCoinsAcrossPeriods, setTotalCoinsAcrossPeriods] = useState(0)
  const [pendingRequests, setPendingRequests] = useState<any[]>([])
  const [approvedRequests, setApprovedRequests] = useState<any[]>([])
  const [rejectedRequests, setRejectedRequests] = useState<any[]>([])
  const [error, setError] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [isDemoStudent, setIsDemoStudent] = useState(false)
  const [redemptionModal, setRedemptionModal] = useState<{
    isOpen: boolean
    type: "assignment" | "quiz"
  }>({ isOpen: false, type: "assignment" })
  const [bugReportOpen, setBugReportOpen] = useState(false)
  const [selectedPeriodHistory, setSelectedPeriodHistory] = useState<number | null>(null)
  const [leaderboardData, setLeaderboardData] = useState<{
    rank: number | null
    topStudentCoins: number
    totalStudents: number
  } | null>(null)
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  const [redemptionRequestsEnabled, setRedemptionRequestsEnabled] = useState(true)
  const [hidePII, _setHidePII] = useHidePII() // Read-only: syncs from localStorage when admin toggles on admin pages

  const searchParams = useSearchParams()
  const hasAutoSearchedFromUrl = useRef(false)

  const performSearch = async (idOverride?: string) => {
    const id = (idOverride ?? studentId).trim()
    if (!id) {
      setError("Please enter a student ID")
      return
    }

    setIsSearching(true)
    setError("")
    setStudentInfo(null)
    setSelectedPeriodHistory(null)
    setLeaderboardData(null)

    try {
      const response = await fetch("/api/student", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ studentId: id }),
      })


      if (!response.ok) {
        const errorData = await response.json()
        console.error("API Error:", errorData)
        setError(errorData.error || `Server error (${response.status})`)
        return
      }

      const data = await response.json()

      if (data.success && data.student) {
        setStudentInfo(data.student)
        const periods = data.periods || []
        setStudentPeriods(periods)
        // Always set the default selected period history to the latest (index 0) when new data is loaded
        setSelectedPeriodHistory(periods.length > 0 ? 0 : null)
        setCoinAdjustments(data.coinAdjustments || [])
        setTotalCoinsAcrossPeriods(data.totalCoinsAcrossPeriods ?? data.student.totalCoins ?? data.student.coins ?? 0)
        setPendingRequests(data.pendingRequests || [])
        setApprovedRequests(data.approvedRequests || [])
        setRejectedRequests(data.rejectedRequests || [])
        setIsDemoStudent(id.toLowerCase() === "abc123")
        
        // Fetch leaderboard data for current period
        if (data.student.period && data.student.sectionNumber) {
          loadLeaderboardData(id, data.student.period, data.student.sectionNumber)
        }
      } else {
        setError(data.error || "Student ID not found. Please check your ID and try again.")
      }
    } catch (err) {
      console.error("Search error:", err)

      if (err instanceof Error) {
        if (err.message.includes("Failed to fetch")) {
          setError("Unable to connect to the server. Please check your internet connection and try again.")
        } else {
          setError(`Connection error: ${err.message}`)
        }
      } else {
        setError("An unexpected error occurred. Please try again later.")
      }
    } finally {
      setIsSearching(false)
    }
  }

  const handleSearch = () => performSearch()

  // Soft refresh after submitting a request from a historical period calendar —
  // updates pending/history without resetting the selected period tab.
  const refreshStudentRequests = async () => {
    const id = studentId.trim()
    if (!id) return

    try {
      const response = await fetch("/api/student", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ studentId: id }),
      })

      if (!response.ok) return

      const data = await response.json()
      if (data.success) {
        setPendingRequests(data.pendingRequests || [])
        setApprovedRequests(data.approvedRequests || [])
        setRejectedRequests(data.rejectedRequests || [])
        setTotalCoinsAcrossPeriods(data.totalCoinsAcrossPeriods ?? data.student?.totalCoins ?? data.student?.coins ?? 0)
        if (data.student) {
          setStudentInfo(data.student)
        }
        if (data.periods) {
          setStudentPeriods(data.periods)
        }
      }
    } catch (err) {
      console.error("Error refreshing student requests:", err)
    }
  }

  // Auto-load student when ?studentId=xxx is in URL (e.g. from admin view-data "Open in new tab")
  useEffect(() => {
    const idFromUrl = searchParams.get("studentId")
    if (idFromUrl && idFromUrl.trim() && !hasAutoSearchedFromUrl.current) {
      hasAutoSearchedFromUrl.current = true
      setStudentId(idFromUrl.trim())
      performSearch(idFromUrl.trim())
    }
  }, [searchParams])

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch()
    }
  }

  const loadLeaderboardData = async (studentId: string, period: string, sectionNumber: string) => {
    setLeaderboardLoading(true)
    try {
      const response = await fetch(
        `/api/student/leaderboard?studentId=${encodeURIComponent(studentId)}&period=${encodeURIComponent(period)}&sectionNumber=${encodeURIComponent(sectionNumber)}`
      )
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setLeaderboardData({
            rank: data.rank,
            topStudentCoins: data.topStudentCoins,
            totalStudents: data.totalStudents
          })
        }
      }
    } catch (error) {
      console.error("Error loading leaderboard data:", error)
      // Silently fail - leaderboard is not critical
    } finally {
      setLeaderboardLoading(false)
    }
  }

  // Load leaderboard data when period selection changes
  useEffect(() => {
    if (selectedPeriodHistory !== null && studentPeriods.length > 0 && studentId) {
      const periodData = studentPeriods[selectedPeriodHistory]
      if (periodData && periodData.period && periodData.section) {
        loadLeaderboardData(studentId, periodData.period, periodData.section)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriodHistory])

  // Load redemption settings when component mounts
  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        setRedemptionRequestsEnabled(data.redemptionRequestsEnabled ?? true)
      })
      .catch((err) => {
        console.error("Error loading redemption settings:", err)
        // Default to enabled on error
        setRedemptionRequestsEnabled(true)
      })
  }, [])


  const getProgressColor = (percent: number) => {
    if (percent >= 90) return "bg-emerald-500"
    if (percent >= 70) return "bg-amber-500"
    return "bg-rose-500"
  }

  const getProgressBadge = (percent: number) => {
    if (percent >= 90) return "Top Performer"
    if (percent >= 70) return "Solid Effort"
    return "Almost There"
  }

  const getProgressBadgeColor = (percent: number) => {
    if (percent >= 90) return "bg-emerald-500 hover:bg-emerald-600"
    if (percent >= 70) return "bg-amber-500 hover:bg-amber-600"
    return "bg-rose-500 hover:bg-rose-600"
  }

  const calculateMaxMissableDays = (periodDays: number) => {
    const requiredQualifiedDays = Math.ceil(periodDays * 0.9)
    const maxMissableDays = periodDays - requiredQualifiedDays
    return { requiredQualifiedDays, maxMissableDays }
  }

  const calculateExtraCreditStatus = (dailyLog: DailyLog[], totalDays: number, periodDays: number) => {
    // Filter out exempt days from calculations
    const workingDays = dailyLog.filter((d) => !d.isExcluded)
    const workingDaysWithData = workingDays.filter((d) => d.day <= totalDays)
    const qualifiedDaysWithData = workingDaysWithData.filter((d) => d.qualified).length
    
    // Calculate exempt day credits (from days that would have qualified on exempt days)
    const exemptDayCredits = dailyLog.filter((d) => d.isExcluded && d.wouldHaveQualified && d.day <= totalDays).length
    
    const daysMissed = workingDaysWithData.length - qualifiedDaysWithData
    const daysRemaining = periodDays - totalDays
    const { requiredQualifiedDays, maxMissableDays } = calculateMaxMissableDays(periodDays)
    // Include exempt day credits in percentage to allow over 100% for extra credit
    const qualificationPercentage = workingDaysWithData.length > 0 ? ((qualifiedDaysWithData + exemptDayCredits) / workingDaysWithData.length) * 100 : 0

    // Check if student has qualified for extra credit (>=90% days qualified)
    if (qualificationPercentage >= 90) {
      const isProgressComplete = ((qualifiedDaysWithData + exemptDayCredits) / workingDaysWithData.length) * 100 >= 100
      
      if (isProgressComplete) {
        const totalQualified = qualifiedDaysWithData + exemptDayCredits
        const completionText = qualificationPercentage > 100 
          ? `${qualificationPercentage.toFixed(1)}% completion (with ${exemptDayCredits} exempt day credit${exemptDayCredits !== 1 ? 's' : ''})`
          : "100% completion"
        return {
          status: "qualified",
          message: "Extra credit qualified",
          icon: CheckCircle,
          color: "text-emerald-600",
          bgColor: "bg-emerald-50 border-emerald-300",
          detail: `You've completed ${totalQualified}/${workingDaysWithData.length} days (${completionText}) and qualified for extra credit.`,
        }
      } else {
        return {
          status: "qualified",
          message: "Extra credit qualified",
          icon: CheckCircle,
          color: "text-emerald-600",
          bgColor: "bg-emerald-50 border-emerald-200",
          detail: `You've qualified for extra credit with ${qualificationPercentage.toFixed(1)}% completion (${qualifiedDaysWithData} regular + ${exemptDayCredits} exempt = ${qualifiedDaysWithData + exemptDayCredits}/${workingDaysWithData.length} qualified days).`,
        }
      }
    } else if (daysMissed <= maxMissableDays - 1) {
      return {
        status: "eligible",
        message: "On track for extra credit",
        icon: CheckCircle,
        color: "text-emerald-600",
        bgColor: "bg-emerald-50 border-emerald-200",
        detail: `You've missed ${daysMissed} day${daysMissed !== 1 ? "s" : ""} and can miss up to ${maxMissableDays} total (need ${requiredQualifiedDays}/${periodDays} qualified days for 90%).`,
      }
    } else if (daysMissed === maxMissableDays) {
      return {
        status: "warning",
        message: "At the limit for extra credit",
        icon: AlertTriangle,
        color: "text-amber-600",
        bgColor: "bg-amber-50 border-amber-200",
        detail: `You've missed ${maxMissableDays} days (the maximum allowed). Missing one more day will put you in recovery mode. You need ${requiredQualifiedDays}/${periodDays} qualified days for 90%.`,
      }
    } else if (daysMissed === maxMissableDays + 1) {
      return {
        status: "recovery",
        message: "Can still recover extra credit",
        icon: Clock,
        color: "text-amber-600",
        bgColor: "bg-amber-50 border-amber-200",
        detail: `You've missed ${daysMissed} days. Complete ALEKS every day for the next ${daysRemaining} days to get extra credit back (need ${requiredQualifiedDays}/${periodDays} qualified days). Missing one more day will make you ineligible.`,
      }
    } else {
      return {
        status: "ineligible",
        message: "Extra credit is no longer available",
        icon: AlertTriangle,
        color: "text-red-600",
        bgColor: "bg-red-50 border-red-200",
        detail: `You've missed ${daysMissed} days. Maximum allowed is ${maxMissableDays + 1} days with full recovery (need ${requiredQualifiedDays}/${periodDays} qualified days for 90%).`,
      }
    }
  }

  const getRedemptionInfo = (coins: number) => {
    const assignmentRedemptions = Math.floor(coins / 10)
    const quizRedemptions = Math.floor(coins / 20)
    const coinsToNextAssignment = coins < 10 ? 10 - coins : coins % 10 === 0 ? 0 : 10 - (coins % 10)
    const coinsToNextQuiz = coins < 20 ? 20 - coins : coins % 20 === 0 ? 0 : 20 - (coins % 20)

    return {
      assignmentRedemptions,
      quizRedemptions,
      coinsToNextAssignment,
      coinsToNextQuiz,
    }
  }

  return (
    <div className="min-h-screen bg-utsa-surface">
      <div className="h-1 w-full bg-utsa-orange" />
      <div className="container mx-auto px-4 py-6 sm:py-8 max-w-5xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-utsa-midnight">ALEKS Points Portal</h1>
          <p className="text-sm text-utsa-muted">Enter your student ID to view your progress and points</p>
          <div className="mt-3 flex gap-2.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <p className="text-sm text-amber-900">
              <span className="font-medium">ALEKS data</span> starts pulling on day 7 of each exam period, then updates daily at 7am.{" "}
              <span className="font-medium">Override requests</span> are updated daily at 8am.
            </p>
          </div>
        </div>

        {/* Hide PII Warning - shown when admin has toggled PII hiding (e.g., for screen sharing) */}
        {hidePII && (
          <Alert className="mb-6 border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              <span className="font-medium">Privacy mode is on.</span> Names and emails are shown as placeholders. To turn this off, go to the{" "}
              <a href="/admin/dashboard" className="underline font-medium hover:text-amber-900">
                Admin Dashboard
              </a>
              .
            </AlertDescription>
          </Alert>
        )}

        {/* Search Card */}
        <Card className="mb-6 rounded-md bg-white">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-3 text-lg text-utsa-midnight">
              <Search className="h-4 w-4 text-utsa-orange" />
              Student Lookup
            </CardTitle>
            <CardDescription className="text-sm text-utsa-muted">
              Enter your student ID to check your ALEKS coins and completion progress.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="studentId" className="text-sm font-medium text-utsa-midnight">
                Student ID
              </Label>
              <div className="flex gap-3">
                <Input
                  id="studentId"
                  placeholder="Enter your student ID"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="flex-1"
                  disabled={isSearching}
                />
                <Button
                  onClick={handleSearch}
                  disabled={isSearching}
                >
                  {isSearching ? "Searching..." : "Search"}
                </Button>
              </div>
            </div>

            <div className="flex pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStudentId("abc123")}
              >
                Try Demo (abc123)
              </Button>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-red-700 text-sm font-medium">{error}</p>
              </div>
            )}
          </CardContent>
        </Card>


        {/* Results */}
        {studentInfo && (
          <div className="space-y-4">
            {/* Student Header — compact identity + coins row */}
            <Card className="rounded-md bg-white overflow-hidden">
              <CardContent className="p-4 sm:p-5">
                {isDemoStudent && (
                  <div className="bg-utsa-surface rounded-md px-3 py-2 mb-4 text-xs font-medium text-utsa-midnight">
                    Demo Student — sample data for testing
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  {/* Identity */}
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-utsa-midnight truncate">
                      {hidePII ? getFakeDataForStudent(studentId).name : studentInfo.name}
                    </h2>
                    <p className="text-sm text-utsa-muted truncate">
                      {hidePII ? getFakeDataForStudent(studentId).email : studentInfo.email}
                    </p>
                    <p className="text-xs text-utsa-muted mt-1">
                      {studentInfo.period?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} · Section {studentInfo.sectionNumber}
                    </p>
                  </div>

                  {/* Coins + Rank cluster */}
                  <div className="flex items-center gap-5 shrink-0">
                    {/* Total coins */}
                    <div className="text-center">
                      <div className="flex items-center gap-1.5 justify-center">
                        <Coins className="h-4 w-4 text-utsa-orange" />
                        <span className="text-2xl font-bold text-utsa-midnight">{totalCoinsAcrossPeriods}</span>
                      </div>
                      <p className="text-[11px] text-utsa-muted font-medium mt-0.5">
                        {studentPeriods.length > 1 ? 'total coins' : 'coins'}
                      </p>
                    </div>

                    {/* Current period coins (only if multiple periods) */}
                    {studentPeriods.length > 1 && (
                      <div className="text-center border-l border-utsa-border pl-5">
                        <div className="flex items-center gap-1.5 justify-center">
                          <Coins className="h-4 w-4 text-amber-500" />
                          <span className="text-2xl font-bold text-utsa-midnight">{studentInfo.totalCoins !== undefined ? studentInfo.totalCoins : studentInfo.coins}</span>
                        </div>
                        <p className="text-[11px] text-utsa-muted font-medium mt-0.5">this period</p>
                      </div>
                    )}

                    {/* Rank */}
                    {leaderboardData && leaderboardData.rank !== null && (
                      <div className="text-center border-l border-utsa-border pl-5">
                        <div className="flex items-center gap-1 justify-center">
                          <Trophy className="h-4 w-4 text-utsa-orange" />
                          <span className="text-2xl font-bold text-utsa-midnight">#{leaderboardData.rank}</span>
                        </div>
                        <p className="text-[11px] text-utsa-muted font-medium mt-0.5">of {leaderboardData.totalStudents}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Inline metadata chips */}
                {(coinAdjustments.length > 0 || (studentInfo.exemptDayCredits !== undefined && studentInfo.exemptDayCredits > 0)) && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {coinAdjustments.length > 0 && (
                      <span className="inline-flex items-center text-xs bg-utsa-surface text-utsa-midnight rounded-full px-2.5 py-1 font-medium">
                        {coinAdjustments.reduce((sum, adj) => sum + adj.adjustment_amount, 0) > 0 ? '+' : ''}{coinAdjustments.reduce((sum, adj) => sum + adj.adjustment_amount, 0)} adjustment coins
                      </span>
                    )}
                    {studentInfo.exemptDayCredits !== undefined && studentInfo.exemptDayCredits > 0 && (
                      <span className="inline-flex items-center text-xs bg-amber-50 text-amber-800 border border-amber-200 rounded-full px-2.5 py-1 font-medium">
                        {studentInfo.exemptDayCredits} exempt day credit{studentInfo.exemptDayCredits !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                )}

                {/* Data freshness */}
                {studentInfo.uploadedAt && (
                  <p className="text-[11px] text-utsa-muted mt-3 flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Updated {formatLocalDateTime(studentInfo.uploadedAt)}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Achievement Banner — end of period only */}
            {(() => {
              const workingDays = studentInfo.dailyLog.filter((d) => !d.isExcluded)
              const workingDaysWithData = workingDays.filter((d) => d.day <= studentInfo.totalDays)
              const qualifiedDaysWithData = workingDaysWithData.filter((d) => d.qualified).length
              const exemptDayCredits = studentInfo.dailyLog.filter((d) => d.isExcluded && d.wouldHaveQualified && d.day <= studentInfo.totalDays).length
              const qualificationPercentage = workingDaysWithData.length > 0 ? ((qualifiedDaysWithData + exemptDayCredits) / workingDaysWithData.length) * 100 : 0
              const isProgressComplete = studentInfo.percentComplete >= 100
              const isExtraCreditQualified = qualificationPercentage >= 90
              const isPeriodComplete = studentInfo.totalDays >= studentInfo.periodDays

              if (!isPeriodComplete) return null

              if (isProgressComplete && isExtraCreditQualified) {
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-md p-4 text-center">
                    <h3 className="text-base font-semibold text-amber-800">PERFECT ACHIEVEMENT!</h3>
                    <p className="text-sm text-amber-700 mt-1">100% progress AND extra credit qualified.</p>
                  </div>
                )
              }
              if (isExtraCreditQualified) {
                return (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-md p-4 text-center">
                    <h3 className="text-base font-semibold text-emerald-800">Extra Credit Qualified!</h3>
                    <p className="text-sm text-emerald-700 mt-1">Congratulations on qualifying for extra credit!</p>
                  </div>
                )
              }
              return (
                <div className="bg-utsa-surface rounded-md p-4 text-center">
                  <h3 className="text-base font-semibold text-utsa-midnight">Period Complete</h3>
                  <p className="text-sm text-utsa-muted mt-1">
                    {qualificationPercentage.toFixed(1)}% completed
                    {exemptDayCredits > 0 && ` (${qualifiedDaysWithData} regular + ${exemptDayCredits} exempt credit${exemptDayCredits !== 1 ? 's' : ''})`}.
                  </p>
                </div>
              )
            })()}

            {/* Extra Credit Status + Progress — mid-period only */}
            {(() => {
              const isPeriodComplete = studentInfo.totalDays >= studentInfo.periodDays
              if (isPeriodComplete) return null

              const extraCreditStatus = calculateExtraCreditStatus(studentInfo.dailyLog, studentInfo.totalDays, studentInfo.periodDays)
              const IconComponent = extraCreditStatus.icon
              const showFull = studentInfo.percentComplete >= 60

              return (
                <div className={`p-3 rounded-md border ${extraCreditStatus.bgColor}`}>
                  <div className="flex items-center gap-2">
                    <IconComponent className={`h-4 w-4 ${extraCreditStatus.color}`} />
                    <span className={`text-sm font-semibold ${extraCreditStatus.color}`}>{extraCreditStatus.message}</span>
                    <Badge className={`${getProgressBadgeColor(studentInfo.percentComplete)} text-white border-0 text-xs ml-auto`}>
                      {studentInfo.percentComplete}%
                    </Badge>
                  </div>
                  <p className={`text-xs mt-1.5 ${extraCreditStatus.color}`}>{extraCreditStatus.detail}</p>
                  {showFull && (
                    <div className="relative mt-2">
                      <div className="w-full bg-white/50 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ease-out ${getProgressColor(studentInfo.percentComplete)}`}
                          style={{ width: `${studentInfo.percentComplete}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {!showFull && (
                    <p className="text-xs text-utsa-muted mt-1">
                      Extra credit requires {Math.round((calculateMaxMissableDays(studentInfo.periodDays).requiredQualifiedDays / studentInfo.periodDays) * 100)}%+ completion.
                    </p>
                  )}
                </div>
              )
            })()}

            {/* Redemption + Pending Requests row */}
            <Card className="rounded-md bg-white overflow-hidden">
              <CardContent className="p-4 sm:p-5">
                {!redemptionRequestsEnabled ? (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-md p-3">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <p className="text-sm text-amber-800">Redemption requests are currently disabled.</p>
                  </div>
                ) : (() => {
                  const coinsForRedemption = totalCoinsAcrossPeriods ?? studentInfo.totalCoins ?? studentInfo.coins ?? 0
                  const redemptionInfo = getRedemptionInfo(coinsForRedemption)

                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Assignment */}
                      <div className="flex items-center justify-between bg-utsa-surface rounded-md p-3">
                        <div>
                          <p className="text-sm font-medium text-utsa-midnight">Assignment/Video Replacement</p>
                          {redemptionInfo.assignmentRedemptions > 0 ? (
                            <p className="text-xs text-utsa-muted">{redemptionInfo.assignmentRedemptions} available</p>
                          ) : (
                            <p className="text-xs text-utsa-muted">{redemptionInfo.coinsToNextAssignment} coins needed</p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant={redemptionInfo.assignmentRedemptions > 0 ? "success" : "outline"}
                          disabled={redemptionInfo.assignmentRedemptions === 0}
                          onClick={() => setRedemptionModal({ isOpen: true, type: "assignment" })}
                        >
                          10 coins
                        </Button>
                      </div>

                      {/* Quiz */}
                      <div className="flex items-center justify-between bg-utsa-surface rounded-md p-3">
                        <div>
                          <p className="text-sm font-medium text-utsa-midnight">Attendance Quiz Replacement</p>
                          {redemptionInfo.quizRedemptions > 0 ? (
                            <p className="text-xs text-utsa-muted">{redemptionInfo.quizRedemptions} available</p>
                          ) : (
                            <p className="text-xs text-utsa-muted">{redemptionInfo.coinsToNextQuiz} coins needed</p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant={redemptionInfo.quizRedemptions > 0 ? "success" : "outline"}
                          disabled={redemptionInfo.quizRedemptions === 0}
                          onClick={() => setRedemptionModal({ isOpen: true, type: "quiz" })}
                        >
                          20 coins
                        </Button>
                      </div>
                    </div>
                  )
                })()}

                {/* Pending Requests — compact list */}
                {pendingRequests && pendingRequests.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <h3 className="text-xs font-semibold text-utsa-muted uppercase tracking-wider">Pending Requests</h3>
                    {pendingRequests.map((request: any) => (
                      <div key={request.id} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-amber-800 truncate">
                            {request.request_type === 'assignment_replacement' ? 'Assignment Replacement'
                              : request.request_type === 'quiz_replacement' ? 'Quiz Replacement'
                              : 'Override Request'}
                          </p>
                          <p className="text-xs text-amber-600 truncate">{request.request_details}</p>
                        </div>
                        <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-800 shrink-0 ml-2">Pending</Badge>
                      </div>
                    ))}
                  </div>
                )}

                {/* Request History */}
                {(approvedRequests.length > 0 || rejectedRequests.length > 0) && (
                  <div className="mt-4">
                    <RequestHistory approvedRequests={approvedRequests} rejectedRequests={rejectedRequests} />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Exam Period History */}
            {studentPeriods.length > 0 && (
              <Card className="rounded-md bg-white overflow-hidden">
                <CardContent className="p-4 sm:p-5 space-y-4">
                  {/* Period tabs */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <BarChart3 className="h-4 w-4 text-utsa-orange" />
                    {studentPeriods.slice(0, 3).map((periodData, index) => (
                      <Button
                        key={`${periodData.period}-${periodData.section}`}
                        onClick={() => setSelectedPeriodHistory(index)}
                        variant={selectedPeriodHistory === index ? "default" : "outline"}
                        size="sm"
                      >
                        {periodData.periodName ?? periodData.period.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        {index === 0 && <span className="ml-1.5 text-[10px] opacity-70">Latest</span>}
                      </Button>
                    ))}
                  </div>

                  {/* Selected Period */}
                  {selectedPeriodHistory !== null && studentPeriods[selectedPeriodHistory] && (() => {
                    const periodData = studentPeriods[selectedPeriodHistory]
                    return (
                      <div className="space-y-4">
                        {/* Compact stats row */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="bg-utsa-surface px-3 py-2 rounded-md">
                            <p className="text-xs text-utsa-muted">Coins</p>
                            <p className="text-lg font-bold text-utsa-midnight">{periodData.totalCoins || periodData.coins}</p>
                            {periodData.coinAdjustment !== undefined && periodData.coinAdjustment !== 0 && (
                              <p className="text-[11px] text-utsa-muted">{periodData.coinAdjustment > 0 ? '+' : ''}{periodData.coinAdjustment} adj</p>
                            )}
                          </div>
                          <div className="bg-utsa-surface px-3 py-2 rounded-md">
                            <p className="text-xs text-utsa-muted">Progress</p>
                            <p className="text-lg font-bold text-utsa-midnight">{periodData.totalDays}/{periodData.periodDays}</p>
                            <p className="text-[11px] text-utsa-muted">{periodData.percentComplete}%</p>
                          </div>
                          <div className="bg-utsa-surface px-3 py-2 rounded-md">
                            <p className="text-xs text-utsa-muted">Qualified</p>
                            <p className="text-lg font-bold text-utsa-midnight">{periodData.dailyLog.filter(d => d.qualified && !d.isExcluded).length}</p>
                            <p className="text-[11px] text-utsa-muted">days</p>
                          </div>
                          <div className="bg-utsa-surface px-3 py-2 rounded-md">
                            <p className="text-xs text-utsa-muted">Avg Time</p>
                            <p className="text-lg font-bold text-utsa-midnight">
                              {Math.round(periodData.dailyLog.reduce((sum, d) => sum + d.minutes, 0) / periodData.dailyLog.filter(d => d.minutes > 0).length || 0)}
                            </p>
                            <p className="text-[11px] text-utsa-muted">min/day</p>
                          </div>
                        </div>

                        {/* Rank + Section info */}
                        <div className="flex items-center gap-3 text-xs text-utsa-muted">
                          <span>Section {periodData.section}</span>
                          {leaderboardData && leaderboardData.rank !== null && (
                            <>
                              <span>·</span>
                              <span className="flex items-center gap-1">
                                <Trophy className="h-3 w-3 text-utsa-orange" />
                                Rank #{leaderboardData.rank} of {leaderboardData.totalStudents}
                                {leaderboardData.topStudentCoins > 0 && ` (#1: ${leaderboardData.topStudentCoins} coins)`}
                              </span>
                            </>
                          )}
                          {periodData.exemptDayCredits !== undefined && periodData.exemptDayCredits > 0 && (
                            <>
                              <span>·</span>
                              <span>{periodData.exemptDayCredits} exempt bonus coin{periodData.exemptDayCredits !== 1 ? 's' : ''}</span>
                            </>
                          )}
                        </div>

                        {/* Calendar */}
                        <CalendarView
                          dailyLog={periodData.dailyLog}
                          totalDays={periodData.totalDays}
                          periodDays={periodData.periodDays}
                          studentInfo={{
                            studentId: studentId,
                            name: hidePII ? getFakeDataForStudent(studentId).name : (periodData.name || studentInfo.name),
                            email: hidePII ? getFakeDataForStudent(studentId).email : (periodData.email || studentInfo.email),
                            period: periodData.period,
                            sectionNumber: periodData.section
                          }}
                          onRequestSubmitted={refreshStudentRequests}
                        />
                      </div>
                    )
                  })()}
                </CardContent>
              </Card>
            )}

            {/* Calendar View — single period fallback */}
            {studentPeriods.length === 0 && (
              <CalendarView
                dailyLog={studentInfo.dailyLog}
                totalDays={studentInfo.totalDays}
                periodDays={studentInfo.periodDays}
                studentInfo={{
                  studentId: studentId,
                  name: hidePII ? getFakeDataForStudent(studentId).name : studentInfo.name,
                  email: hidePII ? getFakeDataForStudent(studentId).email : studentInfo.email,
                  period: studentInfo.period,
                  sectionNumber: studentInfo.sectionNumber
                }}
                onRequestSubmitted={refreshStudentRequests}
              />
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 flex items-center justify-between text-xs text-utsa-muted">
          <div className="flex items-center gap-3">
            <a href="/analytics" className="hover:text-utsa-midnight transition-colors flex items-center gap-1">
              <BarChart3 className="h-3 w-3" />
              Class Analytics
            </a>
            <span className="text-utsa-border">·</span>
            <button
              type="button"
              onClick={() => setBugReportOpen(true)}
              className="text-utsa-orange hover:text-utsa-accessible font-medium hover:underline transition-colors inline-flex items-center gap-1"
            >
              <Bug className="h-3 w-3" />
              Report a bug
            </button>
          </div>
          <Button variant="ghost" size="sm" asChild className="text-utsa-muted hover:text-utsa-midnight text-xs h-auto py-1 px-2">
            <a href="/admin/dashboard" className="flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Admin
            </a>
          </Button>
        </div>

        {/* Redemption Modal */}
        {studentInfo && (
          <RedemptionModal
            isOpen={redemptionModal.isOpen}
            onClose={() => setRedemptionModal({ ...redemptionModal, isOpen: false })}
            onSuccess={handleSearch}
            redemptionType={redemptionModal.type}
            studentName={hidePII ? getFakeDataForStudent(studentId).name : studentInfo.name}
            studentEmail={hidePII ? getFakeDataForStudent(studentId).email : studentInfo.email}
            studentId={studentId}
            period={studentInfo.period || 'Unknown'}
            sectionNumber={studentInfo.sectionNumber || 'default'}
          />
        )}

        <BugReportModal
          isOpen={bugReportOpen}
          onClose={() => setBugReportOpen(false)}
          studentId={studentId}
          studentEmail={!hidePII && studentInfo ? studentInfo.email : ""}
        />
      </div>
    </div>
  )
}
