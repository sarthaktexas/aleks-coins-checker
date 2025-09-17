"use client"

import type React from "react"

import { useState } from "react"
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
} from "lucide-react"
import { CalendarView } from "@/components/calendar-view"
import { RedemptionModal } from "@/components/redemption-modal"

type DailyLog = {
  day: number
  date: string
  qualified: boolean
  minutes: number
  topics: number
  reason: string
}

type StudentInfo = {
  name: string
  email: string
  coins: number
  totalDays: number
  periodDays: number
  percentComplete: number
  dailyLog: DailyLog[]
}

export default function StudentLookup() {
  const [studentId, setStudentId] = useState("")
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null)
  const [error, setError] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [isDemoStudent, setIsDemoStudent] = useState(false)
  const [redemptionModal, setRedemptionModal] = useState<{
    isOpen: boolean
    type: "assignment" | "quiz"
  }>({ isOpen: false, type: "assignment" })

  const handleSearch = async () => {
    if (!studentId.trim()) {
      setError("Please enter a student ID")
      return
    }

    setIsSearching(true)
    setError("")
    setStudentInfo(null)

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
        setIsDemoStudent(studentId.trim().toLowerCase() === "abc123")
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
    const daysMissed = workingDaysWithData.length - qualifiedDaysWithData
    const daysRemaining = periodDays - totalDays
    const { requiredQualifiedDays, maxMissableDays } = calculateMaxMissableDays(periodDays)

    if (daysMissed <= maxMissableDays - 1) {
      return {
        status: "eligible",
        message: "You're on track for extra credit!",
        icon: CheckCircle,
        color: "text-emerald-600",
        bgColor: "bg-emerald-50 border-emerald-200",
        detail: `You've missed ${daysMissed} day${daysMissed !== 1 ? "s" : ""} and can miss up to ${maxMissableDays} total (need ${requiredQualifiedDays}/${periodDays} qualified days for 90%).`,
      }
    } else if (daysMissed === maxMissableDays) {
      return {
        status: "warning",
        message: "You're at your limit for extra credit!",
        icon: AlertTriangle,
        color: "text-amber-600",
        bgColor: "bg-amber-50 border-amber-200",
        detail: `You've missed ${maxMissableDays} days (the maximum allowed). Missing one more day will put you in recovery mode. You need ${requiredQualifiedDays}/${periodDays} qualified days for 90%.`,
      }
    } else if (daysMissed === maxMissableDays + 1) {
      return {
        status: "recovery",
        message: "You can still recover extra credit!",
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

                  {/* Coins and Redemption Section */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Coins Card */}
                    <Card className="bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200 shadow-lg">
                      <CardContent className="p-6 text-center">
                        <div className="flex items-center justify-center gap-3 mb-4">
                          <div className="p-2 sm:p-3 bg-amber-100 rounded-full">
                            <Coins className="h-6 w-6 sm:h-8 sm:w-8 text-amber-600" />
                          </div>
                          <span className="text-lg sm:text-xl font-semibold text-amber-800">Coins Earned</span>
                        </div>
                        <p className="text-4xl sm:text-5xl font-bold text-amber-900 mb-2">{studentInfo.coins}</p>
                        <p className="text-xs sm:text-sm text-amber-700 font-medium">Total coins collected</p>
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

                        {(() => {
                          const redemptionInfo = getRedemptionInfo(studentInfo.coins)

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
                        })()}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Progress Section - Only prominent if student has good chance */}
                  {studentInfo.percentComplete >= 60 && (
                    <>
                      {/* Extra Credit Status */}
                      {(() => {
                        const extraCreditStatus = calculateExtraCreditStatus(
                          studentInfo.dailyLog,
                          studentInfo.totalDays,
                          studentInfo.periodDays,
                        )
                        const IconComponent = extraCreditStatus.icon

                        return (
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
                        )
                      })()}

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
                          {studentInfo.percentComplete}% of days completed in extra credit period
                        </p>

                      </div>
                    </>
                  )}

                  {/* Compact progress for low performers */}
                  {studentInfo.percentComplete < 60 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-700">Period Progress</span>
                        <span className="text-sm font-semibold text-slate-900">{studentInfo.percentComplete}%</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className={`h-full rounded-full ${getProgressColor(studentInfo.percentComplete)}`}
                          style={{ width: `${studentInfo.percentComplete}%` }}
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
                  )}

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

            {/* Calendar View */}
            <CalendarView
              dailyLog={studentInfo.dailyLog}
              totalDays={studentInfo.totalDays}
              periodDays={studentInfo.periodDays}
              studentInfo={{
                studentId: studentId,
                name: studentInfo.name
              }}
            />
          </div>
        )}

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
            redemptionType={redemptionModal.type}
            studentName={studentInfo.name}
            studentEmail={studentInfo.email}
          />
        )}
      </div>
    </div>
  )
}
