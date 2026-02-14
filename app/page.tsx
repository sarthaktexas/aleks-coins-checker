"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
} from "lucide-react"
import { CalendarView } from "@/components/calendar-view"
import { RedemptionModal } from "@/components/redemption-modal"
import { RequestHistory } from "@/components/request-history"

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
  const [selectedPeriodHistory, setSelectedPeriodHistory] = useState<number | null>(null)
  const [leaderboardData, setLeaderboardData] = useState<{
    rank: number | null
    topStudentCoins: number
    totalStudents: number
  } | null>(null)
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  const [redemptionRequestsEnabled, setRedemptionRequestsEnabled] = useState(true)

  const handleSearch = async () => {
    if (!studentId.trim()) {
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
        body: JSON.stringify({ studentId: studentId.trim() }),
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
        setIsDemoStudent(studentId.trim().toLowerCase() === "abc123")
        
        // Fetch leaderboard data for current period
        if (data.student.period && data.student.sectionNumber) {
          loadLeaderboardData(studentId.trim(), data.student.period, data.student.sectionNumber)
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
    fetch("/api/settings")
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
          bgColor: "bg-gradient-to-r from-emerald-50 to-green-50 border-emerald-300",
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

  const today = (() => {
    const now = new Date()
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    return `${monthNames[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`
  })()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8 sm:py-12 max-w-5xl">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-5xl font-bold text-slate-900 mb-4 tracking-tight">ALEKS Points Portal</h1>
          <p className="text-slate-600 text-base sm:text-lg">Enter your student ID to view your progress and points</p>
        </div>

        {/* Search Card */}
        <Card className="mb-6 sm:mb-8 shadow-lg border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-3 text-lg sm:text-xl">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Search className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
              </div>
              Student Lookup
            </CardTitle>
            <CardDescription className="text-sm sm:text-base">
              Enter your student ID to check your ALEKS coins and completion progress.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-6">
            <div className="space-y-3">
              <Label htmlFor="studentId" className="text-sm font-medium text-slate-700">
                Student ID
              </Label>
              <div className="flex gap-3">
                <Input
                  id="studentId"
                  placeholder="Enter your student ID"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="flex-1 h-10 sm:h-12 text-sm sm:text-base border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                  disabled={isSearching}
                />
                <Button
                  onClick={handleSearch}
                  disabled={isSearching}
                  className="px-4 sm:px-8 h-10 sm:h-12 bg-blue-600 hover:bg-blue-700 text-sm sm:text-base font-medium"
                >
                  {isSearching ? "Searching..." : "Search"}
                </Button>
              </div>
            </div>

            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStudentId("abc123")}
                className="text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-300 transition-colors text-xs sm:text-sm"
              >
                🎯 Try Demo (abc123)
              </Button>
            </div>

            {error && (
              <div className="p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700 text-sm font-medium">{error}</p>
              </div>
            )}
          </CardContent>
        </Card>


        {/* Results Card */}
        {studentInfo && (
          <div className="space-y-6 sm:space-y-8">
            <Card className="shadow-xl border-0 bg-white/90 backdrop-blur-sm overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100">
                <CardTitle className="flex items-center gap-3 text-lg sm:text-xl text-blue-900">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <User className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                  </div>
                  Student Information
                </CardTitle>
                {isDemoStudent && (
                  <div className="bg-blue-100 border border-blue-200 rounded-lg p-3 mt-3">
                    <p className="text-blue-800 text-xs sm:text-sm font-medium flex items-center gap-2">
                      🎯 <span>Demo Student - This is sample data for testing purposes</span>
                    </p>
                  </div>
                )}
              </CardHeader>

              <CardContent className="p-4 sm:p-8">
                <div className="space-y-6 sm:space-y-8">
                  {/* Student Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                        <User className="h-4 w-4" />
                        Name
                      </div>
                      <p className="text-lg sm:text-xl font-semibold text-slate-900">{studentInfo.name}</p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                        <Mail className="h-4 w-4" />
                        Email
                      </div>
                      <p className="text-base sm:text-lg font-medium text-slate-700">{studentInfo.email}</p>
                    </div>
                  </div>

                  {/* Total Coins Across All Periods */}
                  {studentPeriods.length > 0 && (
                    <Card className="bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200 shadow-lg">
                      <CardContent className="p-6 text-center">
                        <div className="flex items-center justify-center gap-3 mb-4">
                          <div className="p-2 sm:p-3 bg-purple-100 rounded-full">
                            <Coins className="h-6 w-6 sm:h-8 sm:w-8 text-purple-600" />
                          </div>
                          <span className="text-lg sm:text-xl font-semibold text-purple-800">Total Coins (All Periods)</span>
                        </div>
                        <p className="text-4xl sm:text-5xl font-bold text-purple-900 mb-2">{totalCoinsAcrossPeriods}</p>
                        <p className="text-xs sm:text-sm text-purple-700 font-medium">Accumulated across {studentPeriods.length} exam period{studentPeriods.length !== 1 ? 's' : ''}</p>
                        {coinAdjustments.length > 0 && (
                          <div className="mt-3 p-2 bg-purple-100 rounded-lg border border-purple-200">
                            <p className="text-xs text-purple-800 font-medium">
                              ⭐ Includes {coinAdjustments.reduce((sum, adj) => sum + adj.adjustment_amount, 0)} adjustment coin{coinAdjustments.reduce((sum, adj) => sum + adj.adjustment_amount, 0) !== 1 ? 's' : ''}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Coins and Redemption Section */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Coins Card */}
                    <Card className="bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200 shadow-lg">
                      <CardContent className="p-6 text-center">
                        <div className="flex items-center justify-center gap-3 mb-4">
                          <div className="p-2 sm:p-3 bg-amber-100 rounded-full">
                            <Coins className="h-6 w-6 sm:h-8 sm:w-8 text-amber-600" />
                          </div>
                          <span className="text-lg sm:text-xl font-semibold text-amber-800">Current Period Coins</span>
                        </div>
                        <p className="text-4xl sm:text-5xl font-bold text-amber-900 mb-2">{studentInfo.totalCoins !== undefined ? studentInfo.totalCoins : studentInfo.coins}</p>
                        <p className="text-xs sm:text-sm text-amber-700 font-medium">
                          {studentInfo.period?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} • Section {studentInfo.sectionNumber}
                        </p>
                        {studentInfo.exemptDayCredits !== undefined && studentInfo.exemptDayCredits > 0 && (
                          <div className="mt-3 p-2 bg-amber-100 rounded-lg border border-amber-200">
                            <p className="text-xs text-amber-800 font-medium">
                              🎁 {studentInfo.exemptDayCredits} extra credit coin{studentInfo.exemptDayCredits !== 1 ? 's' : ''} from exempt days
                            </p>
                          </div>
                        )}
                        {studentInfo.coinAdjustment !== undefined && studentInfo.coinAdjustment !== 0 && (
                          <div className="mt-3 p-2 bg-blue-100 rounded-lg border border-blue-200">
                            <p className="text-xs text-blue-800 font-medium">
                              ⭐ {studentInfo.coinAdjustment > 0 ? '+' : ''}{studentInfo.coinAdjustment} adjustment coin{Math.abs(studentInfo.coinAdjustment) !== 1 ? 's' : ''}
                            </p>
                          </div>
                        )}
                        {/* Leaderboard Rank */}
                        {leaderboardData && leaderboardData.rank !== null && (
                          <div className="mt-4 p-3 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-200">
                            <div className="flex items-center justify-center gap-2 mb-2">
                              <Trophy className="h-4 w-4 text-purple-600" />
                              <span className="text-sm font-semibold text-purple-800">Your Rank</span>
                            </div>
                            <p className="text-2xl font-bold text-purple-900 mb-1">
                              #{leaderboardData.rank}
                            </p>
                            <p className="text-xs text-purple-700">
                              out of {leaderboardData.totalStudents} students
                            </p>
                            {leaderboardData.topStudentCoins > 0 && (
                              <p className="text-xs text-purple-600 mt-2">
                                #1 has {leaderboardData.topStudentCoins} coin{leaderboardData.topStudentCoins !== 1 ? 's' : ''}
                              </p>
                            )}
                          </div>
                        )}
                        {leaderboardLoading && (
                          <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                            <p className="text-xs text-gray-600">Loading rank...</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Redemption Options */}
                    <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200 shadow-lg">
                      <CardContent className="p-6">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 bg-green-100 rounded-full">
                            <Gift className="h-6 w-6 text-green-600" />
                          </div>
                          <span className="text-lg font-semibold text-green-800">Redemption Options</span>
                        </div>

                        {!redemptionRequestsEnabled ? (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <AlertTriangle className="h-4 w-4 text-amber-600" />
                              <p className="text-sm font-medium text-amber-800">Redemption Requests Disabled</p>
                            </div>
                            <p className="text-xs text-amber-700">
                              Redemption requests are currently disabled. Please contact your instructor if you need assistance.
                            </p>
                          </div>
                        ) : (
                          (() => {
                            // Use total coins across all periods for redemption calculations
                            const coinsForRedemption = totalCoinsAcrossPeriods ?? studentInfo.totalCoins ?? studentInfo.coins ?? 0
                            const redemptionInfo = getRedemptionInfo(coinsForRedemption)

                            return (
                              <div className="space-y-4">
                                {/* Assignment Redemption */}
                                <div className="bg-white/60 rounded-lg p-4 border border-green-200">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="text-sm font-medium text-green-800">Assignment/Video Replacement</div>
                                    <Badge variant="outline" className="text-xs">
                                      10 coins
                                    </Badge>
                                  </div>
                                  {redemptionInfo.assignmentRedemptions > 0 ? (
                                    <div className="space-y-2">
                                      <p className="text-sm text-green-700">
                                        Available: <strong>{redemptionInfo.assignmentRedemptions}</strong> redemption
                                        {redemptionInfo.assignmentRedemptions !== 1 ? "s" : ""}
                                      </p>
                                      <Button
                                        size="sm"
                                        onClick={() => setRedemptionModal({ isOpen: true, type: "assignment" })}
                                        className="w-full bg-green-600 hover:bg-green-700"
                                      >
                                        Redeem Assignment
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <Target className="h-4 w-4 text-green-600" />
                                      <p className="text-sm text-green-700">
                                        {redemptionInfo.coinsToNextAssignment} more coin
                                        {redemptionInfo.coinsToNextAssignment !== 1 ? "s" : ""} needed
                                      </p>
                                    </div>
                                  )}
                                </div>

                                {/* Quiz Redemption */}
                                <div className="bg-white/60 rounded-lg p-4 border border-green-200">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="text-sm font-medium text-green-800">Attendance Quiz Replacement</div>
                                    <Badge variant="outline" className="text-xs">
                                      20 coins
                                    </Badge>
                                  </div>
                                  {redemptionInfo.quizRedemptions > 0 ? (
                                    <div className="space-y-2">
                                      <p className="text-sm text-green-700">
                                        Available: <strong>{redemptionInfo.quizRedemptions}</strong> redemption
                                        {redemptionInfo.quizRedemptions !== 1 ? "s" : ""}
                                      </p>
                                      <Button
                                        size="sm"
                                        onClick={() => setRedemptionModal({ isOpen: true, type: "quiz" })}
                                        className="w-full bg-green-600 hover:bg-green-700"
                                      >
                                        Redeem Quiz
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <Target className="h-4 w-4 text-green-600" />
                                      <p className="text-sm text-green-700">
                                        {redemptionInfo.coinsToNextQuiz} more coin
                                        {redemptionInfo.coinsToNextQuiz !== 1 ? "s" : ""} needed
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })()
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Pending Requests */}
                  {pendingRequests && pendingRequests.length > 0 && (
                    <div className="mb-6">
                      <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200 shadow-lg">
                        <CardContent className="p-6">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-amber-100 rounded-full">
                              <Clock className="h-6 w-6 text-amber-600" />
                            </div>
                            <span className="text-lg font-semibold text-amber-800">Pending Requests</span>
                          </div>
                          
                          <div className="space-y-3">
                            {pendingRequests.map((request: any) => (
                              <div key={request.id} className="bg-white/60 rounded-lg p-4 border border-amber-200">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="text-sm font-medium text-amber-800">
                                    {request.request_type === 'assignment_replacement' 
                                      ? 'Assignment/Video Replacement' 
                                      : request.request_type === 'quiz_replacement'
                                      ? 'Quiz Replacement'
                                      : 'Override Request'}
                                  </div>
                                  <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-800">
                                    Pending
                                  </Badge>
                                </div>
                                <p className="text-sm text-amber-700 mb-2">{request.request_details}</p>
                                <p className="text-xs text-amber-600">
                                  Submitted: {new Date(request.submitted_at).toLocaleDateString()}
                                  {request.request_type !== 'override_request' && (
                                    <span className="ml-2">
                                      • {request.request_type === 'assignment_replacement' ? '10' : '20'} coins deducted
                                    </span>
                                  )}
                                </p>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {/* Request History - Approved and Rejected */}
                  {(approvedRequests.length > 0 || rejectedRequests.length > 0) && (
                    <div className="mb-6">
                      <RequestHistory 
                        approvedRequests={approvedRequests}
                        rejectedRequests={rejectedRequests}
                      />
                    </div>
                  )}

                  {/* Achievement Banner - Only show at end of period */}
                  {(() => {
                    const workingDays = studentInfo.dailyLog.filter((d) => !d.isExcluded)
                    const workingDaysWithData = workingDays.filter((d) => d.day <= studentInfo.totalDays)
                    const qualifiedDaysWithData = workingDaysWithData.filter((d) => d.qualified).length
                    // Calculate exempt day credits (from days that would have qualified on exempt days)
                    const exemptDayCredits = studentInfo.dailyLog.filter((d) => d.isExcluded && d.wouldHaveQualified && d.day <= studentInfo.totalDays).length
                    // Include exempt day credits in percentage to allow over 100% for extra credit
                    const qualificationPercentage = workingDaysWithData.length > 0 ? ((qualifiedDaysWithData + exemptDayCredits) / workingDaysWithData.length) * 100 : 0
                    const isProgressComplete = studentInfo.percentComplete >= 100
                    const isExtraCreditQualified = qualificationPercentage >= 90
                    const isPeriodComplete = studentInfo.totalDays >= studentInfo.periodDays

                    // Only show achievement banners at END of period
                    if (!isPeriodComplete) {
                      return null
                    }

                    // End of period with perfect achievement - Yellow card
                    if (isProgressComplete && isExtraCreditQualified) {
                      return (
                        <div className="bg-gradient-to-r from-yellow-50 via-amber-50 to-orange-50 border-2 border-yellow-300 rounded-xl p-4 sm:p-6 text-center">
                          <div className="text-4xl sm:text-5xl mb-3">🏆</div>
                          <h3 className="text-xl sm:text-2xl font-bold text-amber-800 mb-2">
                            PERFECT ACHIEVEMENT!
                          </h3>
                          <p className="text-sm sm:text-base text-amber-700 font-medium">
                            You've achieved 100% progress AND qualified for extra credit!
                          </p>
                          <p className="text-xs sm:text-sm text-amber-600 mt-2">
                            Outstanding dedication to your ALEKS studies! 🎉
                          </p>
                        </div>
                      )
                    }
                    
                    // End of period with extra credit - Green card
                    if (isExtraCreditQualified) {
                      return (
                        <div className="bg-gradient-to-r from-emerald-50 to-green-50 border-2 border-emerald-300 rounded-xl p-4 sm:p-6 text-center">
                          <div className="text-3xl sm:text-4xl mb-3">🎉</div>
                          <h3 className="text-lg sm:text-xl font-bold text-emerald-800 mb-2">
                            Extra Credit Qualified!
                          </h3>
                          <p className="text-sm sm:text-base text-emerald-700 font-medium">
                            Congratulations on qualifying for extra credit!
                          </p>
                          <p className="text-xs sm:text-sm text-emerald-600 mt-2">
                            Excellent work! 🌟
                          </p>
                        </div>
                      )
                    }
                    
                    // End of period but didn't qualify
                    return (
                      <div className="bg-gradient-to-r from-slate-50 to-gray-50 border border-slate-200 rounded-xl p-4 sm:p-6 text-center">
                        <div className="text-2xl mb-3">📊</div>
                        <h3 className="text-lg font-bold text-slate-800 mb-2">
                          Period Complete
                        </h3>
                        <p className="text-sm text-slate-700 font-medium">
                          You completed {qualificationPercentage.toFixed(1)}% of the period
                          {exemptDayCredits > 0 && ` (${qualifiedDaysWithData} regular + ${exemptDayCredits} exempt day credit${exemptDayCredits !== 1 ? 's' : ''})`}.
                        </p>
                      </div>
                    )
                  })()}

                  {/* Extra Credit Status and Progress - Only show during period */}
                  {(() => {
                    const isPeriodComplete = studentInfo.totalDays >= studentInfo.periodDays
                    
                    // Hide these sections at end of period (achievement banner shows instead)
                    if (isPeriodComplete || studentInfo.percentComplete < 60) {
                      return null
                    }

                    const extraCreditStatus = calculateExtraCreditStatus(
                      studentInfo.dailyLog,
                      studentInfo.totalDays,
                      studentInfo.periodDays,
                    )
                    const IconComponent = extraCreditStatus.icon

                    return (
                      <>
                        {/* Extra Credit Status */}
                        <div className={`p-3 sm:p-4 rounded-xl border ${extraCreditStatus.bgColor}`}>
                          <div className="flex items-center gap-2 mb-2">
                            <IconComponent className={`h-4 w-4 sm:h-5 sm:w-5 ${extraCreditStatus.color}`} />
                            <span className={`text-sm sm:text-base font-semibold ${extraCreditStatus.color}`}>
                              Extra Credit Status
                            </span>
                          </div>
                          <p className={`text-xs sm:text-sm font-medium ${extraCreditStatus.color} mb-1`}>
                            {extraCreditStatus.message}
                          </p>
                          <p className={`text-xs sm:text-sm ${extraCreditStatus.color}`}>
                            {extraCreditStatus.detail}
                          </p>
                        </div>

                        {/* Progress Section */}
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-sm sm:text-base font-semibold text-slate-700">Period Progress</span>
                            <Badge
                              className={`${getProgressBadgeColor(studentInfo.percentComplete)} text-white border-0 px-2 sm:px-3 py-1 text-xs sm:text-sm font-medium`}
                            >
                              {getProgressBadge(studentInfo.percentComplete)}
                            </Badge>
                          </div>

                          <div className="relative">
                            <div className="w-full bg-slate-200 rounded-full h-3 sm:h-4 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-700 ease-out ${getProgressColor(studentInfo.percentComplete)}`}
                                style={{ width: `${studentInfo.percentComplete}%` }}
                              />
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-xs font-bold text-white drop-shadow-sm">
                                {studentInfo.percentComplete}%
                              </span>
                            </div>
                          </div>

                          <p className="text-xs sm:text-sm text-slate-600 text-center font-medium">
                            {studentInfo.percentComplete.toFixed(1)}% of days completed in extra credit period
                          </p>
                        </div>
                      </>
                    )
                  })()}

                  {/* Compact progress for low performers - Only during period */}
                  {(() => {
                    const isPeriodComplete = studentInfo.totalDays >= studentInfo.periodDays
                    
                    // Hide at end of period
                    if (isPeriodComplete || studentInfo.percentComplete >= 60) {
                      return null
                    }

                    return (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-slate-700">Period Progress</span>
                          <span className="text-sm font-semibold text-slate-900">{studentInfo.percentComplete}%</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                          <div
                            className={`h-full rounded-full ${getProgressColor(studentInfo.percentComplete)}`}
                            style={{ width: `${Math.min(studentInfo.percentComplete, 100)}%` }}
                          />
                        </div>
                        <p className="text-xs text-slate-600 mt-2">
                          Focus on earning coins! Extra credit requires{" "}
                          {Math.round(
                            (calculateMaxMissableDays(studentInfo.periodDays).requiredQualifiedDays /
                              studentInfo.periodDays) *
                              100,
                          )}
                          %+ completion.
                        </p>
                      </div>
                    )
                  })()}

                  {/* Footer */}
                  <div className="text-center pt-4 sm:pt-6 border-t border-slate-200">
                    <div className="flex items-center justify-center gap-2 text-xs sm:text-sm text-slate-500">
                      <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span>Data updated: {today}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Multiple Exam Periods Section */}
            {studentPeriods.length > 0 && (
              <Card className="shadow-xl border-0 bg-white/90 backdrop-blur-sm overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-purple-100">
                  <CardTitle className="flex items-center gap-3 text-lg sm:text-xl text-purple-900">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
                    </div>
                    Exam Period History
                  </CardTitle>
                  <CardDescription className="text-sm sm:text-base">
                    Your performance across {studentPeriods.length} exam period{studentPeriods.length !== 1 ? 's' : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 space-y-6">
                  {/* Period Selection Buttons */}
                  {studentPeriods.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-3">
                      {studentPeriods.slice(0, 3).map((periodData, index) => (
                        <Button
                          key={`${periodData.period}-${periodData.section}`}
                          onClick={() => setSelectedPeriodHistory(index)}
                          variant={selectedPeriodHistory === index ? "default" : "outline"}
                          className={
                            selectedPeriodHistory === index
                              ? "bg-purple-600 hover:bg-purple-700 text-white"
                              : "border-purple-200 text-purple-700 hover:bg-purple-50"
                          }
                        >
                          {periodData.periodName ?? periodData.period.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          {index === 0 && (
                            <span className="ml-2 px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">Latest</span>
                          )}
                        </Button>
                      ))}
                    </div>
                  )}

                  {/* Selected Period Details */}
                  {selectedPeriodHistory !== null && studentPeriods[selectedPeriodHistory] && (() => {
                    const periodData = studentPeriods[selectedPeriodHistory]
                    const isLatest = selectedPeriodHistory === 0
                    return (
                      <div className="space-y-4">
                        {/* Period Header */}
                        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-200">
                          <div>
                            <h3 className="font-semibold text-purple-900 flex items-center gap-2">
                              {periodData.periodName ?? periodData.period.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                              {isLatest && (
                                <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">Latest</span>
                              )}
                            </h3>
                            <p className="text-sm text-purple-700">
                              Section {periodData.section}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center gap-2">
                              <Coins className="h-5 w-5 text-yellow-500" />
                              <span className="text-2xl font-bold text-purple-900">{periodData.totalCoins || periodData.coins}</span>
                            </div>
                            <p className="text-sm text-purple-600">{periodData.percentComplete}% complete</p>
                            {periodData.coinAdjustment !== undefined && periodData.coinAdjustment !== 0 && (
                              <p className="text-xs text-blue-600 mt-1">
                                {periodData.coinAdjustment > 0 ? '+' : ''}{periodData.coinAdjustment} adjustment
                              </p>
                            )}
                            {/* Leaderboard Rank for this period */}
                            {leaderboardData && leaderboardData.rank !== null && (
                              <div className="mt-2 pt-2 border-t border-purple-200">
                                <div className="flex items-center justify-end gap-1 mb-1">
                                  <Trophy className="h-3 w-3 text-purple-600" />
                                  <span className="text-xs font-semibold text-purple-800">Rank #{leaderboardData.rank}</span>
                                </div>
                                {leaderboardData.topStudentCoins > 0 && (
                                  <p className="text-xs text-purple-600">
                                    #1: {leaderboardData.topStudentCoins} coins
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Period Stats */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                            <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
                              <Target className="h-4 w-4" />
                              Progress
                            </div>
                            <p className="text-xl font-bold text-blue-900 mt-1">
                              {periodData.totalDays}/{periodData.periodDays}
                            </p>
                            <p className="text-xs text-blue-600">days completed</p>
                          </div>

                          <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                            <div className="flex items-center gap-2 text-sm font-medium text-green-700">
                              <CheckCircle className="h-4 w-4" />
                              Qualified
                            </div>
                            <p className="text-xl font-bold text-green-900 mt-1">
                              {periodData.dailyLog.filter(d => d.qualified && !d.isExcluded).length}
                            </p>
                            <p className="text-xs text-green-600">working days</p>
                          </div>

                          {periodData.exemptDayCredits !== undefined && periodData.exemptDayCredits > 0 && (
                            <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                              <div className="flex items-center gap-2 text-sm font-medium text-purple-700">
                                <Gift className="h-4 w-4" />
                                Exempt Bonus
                              </div>
                              <p className="text-xl font-bold text-purple-900 mt-1">
                                {periodData.exemptDayCredits}
                              </p>
                              <p className="text-xs text-purple-600">extra coins</p>
                            </div>
                          )}

                          <div className="bg-amber-50 p-3 rounded-lg border border-amber-100">
                            <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
                              <Clock className="h-4 w-4" />
                              Avg Time
                            </div>
                            <p className="text-xl font-bold text-amber-900 mt-1">
                              {Math.round(periodData.dailyLog.reduce((sum, d) => sum + d.minutes, 0) / periodData.dailyLog.filter(d => d.minutes > 0).length || 0)}
                            </p>
                            <p className="text-xs text-amber-600">minutes/day</p>
                          </div>
                        </div>

                        {/* Calendar View for this period */}
                        <div className="mt-4">
                          <h4 className="text-sm font-semibold text-purple-800 mb-3 flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            Daily Progress
                          </h4>
                          <CalendarView
                            dailyLog={periodData.dailyLog}
                            totalDays={periodData.totalDays}
                            periodDays={periodData.periodDays}
                            studentInfo={{
                              studentId: studentId,
                              name: periodData.name,
                              email: periodData.email,
                              period: periodData.period,
                              sectionNumber: periodData.section
                            }}
                          />
                        </div>
                      </div>
                    )
                  })()}
                </CardContent>
              </Card>
            )}

            {/* Calendar View - Show only if no multiple periods */}
            {studentPeriods.length === 0 && (
              <CalendarView
                dailyLog={studentInfo.dailyLog}
                totalDays={studentInfo.totalDays}
                periodDays={studentInfo.periodDays}
                studentInfo={{
                  studentId: studentId,
                  name: studentInfo.name,
                  email: studentInfo.email,
                  period: studentInfo.period,
                  sectionNumber: studentInfo.sectionNumber
                }}
              />
            )}
          </div>
        )}

        {/* Analytics Link - Moved to separate page to reduce database load */}
        <div className="mt-8 sm:mt-12">
          <Card className="mb-6 sm:mb-8 shadow-lg border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-lg sm:text-xl">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
                </div>
                Class Analytics
              </CardTitle>
              <CardDescription className="text-sm sm:text-base">
                View average completion rates and study times across all sections
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                asChild
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              >
                <a href="/analytics">
                  View Class Analytics
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="mt-8 sm:mt-12 text-center space-y-4">
          <p className="text-sm sm:text-base text-slate-600">
            Questions? Contact Sarthak at{" "}
            <a
              href="mailto:sarthak.mohanty@utsa.edu"
              className="text-blue-600 hover:text-blue-700 font-medium hover:underline transition-colors"
            >
              sarthak.mohanty@utsa.edu
            </a>
          </p>
          <p className="text-xs sm:text-sm text-slate-500">
            🔒 Your data is secure and only accessible with your student ID
          </p>

          {/* Admin Access */}
          <div className="pt-2 border-t border-slate-200">
            <Button variant="ghost" size="sm" asChild className="text-slate-400 hover:text-slate-600 text-xs">
              <a href="/admin/dashboard" className="flex items-center gap-1">
                <Lock className="h-3 w-3" />
                Admin Dashboard
              </a>
            </Button>
          </div>
        </div>

        {/* Redemption Modal */}
        {studentInfo && (
          <RedemptionModal
            isOpen={redemptionModal.isOpen}
            onClose={() => setRedemptionModal({ ...redemptionModal, isOpen: false })}
            onSuccess={handleSearch}
            redemptionType={redemptionModal.type}
            studentName={studentInfo.name}
            studentEmail={studentInfo.email}
            studentId={studentId}
            period={studentInfo.period || 'Unknown'}
            sectionNumber={studentInfo.sectionNumber || 'default'}
          />
        )}

      </div>
    </div>
  )
}
