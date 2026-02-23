"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  BarChart3,
  TrendingUp,
  Clock,
  ArrowLeft,
} from "lucide-react"
import { CompletionChart } from "@/components/completion-chart"
import Link from "next/link"

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
  periodName?: string  // Display name from exam_periods
  sections: string[]
  totalStudents: number
  averageCompletion: number
  averageTime: number
  dayStats: DayStats[]
}

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<MergedPeriodStats[]>([])
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null)
  const [activePeriods, setActivePeriods] = useState<string[]>([])

  // Load analytics on component mount
  useEffect(() => {
    loadAnalytics()
  }, [])

  const loadAnalytics = async () => {
    setIsLoadingAnalytics(true)
    try {
      const response = await fetch("/api/analytics")
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          const periods = data.periods || []
          setAnalytics(periods)
          
          // Get the 3 most recent active periods (periods with data)
          // Analytics API already returns periods sorted by latest upload date (most recent first)
          const activePeriodKeys = periods.slice(0, 3).map((p: MergedPeriodStats) => p.period)
          setActivePeriods(activePeriodKeys)
          
          // Set the first (latest) period as selected by default
          if (activePeriodKeys.length > 0 && !selectedPeriod) {
            setSelectedPeriod(activePeriodKeys[0])
          }
        }
      }
    } catch (error) {
      console.error("Error loading analytics:", error)
    } finally {
      setIsLoadingAnalytics(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8 sm:py-12 max-w-5xl">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Link href="/">
              <Button variant="ghost" size="sm" className="text-slate-600 hover:text-slate-900">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Student Portal
              </Button>
            </Link>
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold text-slate-900 mb-4 tracking-tight">Class Analytics</h1>
          <p className="text-slate-600 text-base sm:text-lg">Average completion rates and study times across all sections</p>
        </div>

        {/* Loading Analytics */}
        {isLoadingAnalytics && (
          <Card className="mb-6 sm:mb-8 shadow-lg border-0 bg-white/80 backdrop-blur-sm">
            <CardContent className="p-6 text-center">
              <div className="flex items-center justify-center gap-3">
                <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-purple-700 font-medium">Loading class analytics...</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Analytics Section */}
        {!isLoadingAnalytics && analytics.length > 0 && (
          <Card className="mb-6 sm:mb-8 shadow-lg border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-lg sm:text-xl">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
                </div>
                Class Analytics
              </CardTitle>
              <CardDescription className="text-sm sm:text-base">
                Average completion rates and study times across all sections
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Period Selection Buttons */}
              {activePeriods.length > 0 && (
                <div className="flex flex-wrap justify-center gap-3">
                  {activePeriods.map((period) => (
                    <Button
                      key={period}
                      onClick={() => setSelectedPeriod(period)}
                      variant={selectedPeriod === period ? "default" : "outline"}
                      className={
                        selectedPeriod === period
                          ? "bg-purple-600 hover:bg-purple-700 text-white"
                          : "border-purple-200 text-purple-700 hover:bg-purple-50"
                      }
                    >
                      {analytics.find(p => p.period === period)?.periodName ?? period.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </Button>
                  ))}
                </div>
              )}

              {/* Selected Period Analytics */}
              {selectedPeriod && (() => {
                const period = analytics.find(p => p.period === selectedPeriod)
                if (!period) return null
                
                return (
                  <div className="space-y-4">
                    {/* Period Header */}
                    <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-200">
                      <div>
                        <h3 className="font-semibold text-purple-900">
                          {period.periodName ?? period.period.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </h3>
                        <p className="text-sm text-purple-700">
                          Sections {period.sections.join(', ')} • {period.totalStudents} students
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-2 text-sm text-purple-700">
                          <TrendingUp className="h-4 w-4" />
                          <span className="font-medium">{period.averageCompletion}% avg completion</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-purple-600">
                          <Clock className="h-4 w-4" />
                          <span>{period.averageTime.toFixed(1)} min avg time</span>
                        </div>
                      </div>
                    </div>

                    {/* Line Chart */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-purple-800 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Completion Trends Over Time
                      </h4>
                      <div className="w-full h-96 bg-white rounded-lg p-4">
                        <CompletionChart data={[period]} />
                      </div>
                    </div>

                    {/* Day-by-day stats as bar charts */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                      {period.dayStats.map((day) => {
                        const completionPercent = Math.min(100, Math.max(0, day.averageCompletion))
                        const isExempt = day.isExcluded
                        
                        return (
                          <div
                            key={day.day}
                            className="relative p-3 rounded-lg border border-gray-200 bg-white overflow-hidden"
                            style={{
                              background: isExempt 
                                ? `linear-gradient(to right, #6b7280 ${completionPercent}%, #f3f4f6 ${completionPercent}%)`
                                : `linear-gradient(to right, #8b5cf6 ${completionPercent}%, #f3f4f6 ${completionPercent}%)`
                            }}
                          >
                            <div className="relative z-10">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-gray-800">
                                  Day {day.day}
                                </span>
                                <div className="flex items-center gap-1">
                                  {isExempt && (
                                    <Badge variant="outline" className="text-xs bg-gray-100 text-gray-700 border-gray-300">
                                      Exempt
                                    </Badge>
                                  )}
                                  {day.discrepancy > 10 && (
                                    <Badge variant="outline" className="text-xs bg-orange-100 text-orange-700 border-orange-300">
                                      ±{day.discrepancy.toFixed(0)}%
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-gray-700 font-medium">Completion:</span>
                                  <span className="font-bold text-gray-800">
                                    {day.averageCompletion.toFixed(1)}%
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-gray-700">Avg Time:</span>
                                  <span className="font-medium text-gray-800">
                                    {day.averageTime.toFixed(0)}m
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-gray-700">Students:</span>
                                  <span className="font-medium text-gray-800">
                                    {day.qualifiedStudents}/{day.totalStudents}
                                  </span>
                                </div>
                                {day.sectionData.length > 1 && (
                                  <div className="pt-1 border-t border-gray-300">
                                    <div className="text-xs text-gray-600">
                                      {day.sectionData.map((section, idx) => (
                                        <div key={section.sectionNumber} className="flex justify-between">
                                          <span>Sec {section.sectionNumber}:</span>
                                          <span className="font-medium">{section.completion.toFixed(0)}%</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </CardContent>
          </Card>
        )}

        {/* No Analytics Data */}
        {!isLoadingAnalytics && analytics.length === 0 && (
          <Card className="mb-6 sm:mb-8 shadow-lg border-0 bg-white/80 backdrop-blur-sm">
            <CardContent className="p-6 text-center">
              <p className="text-slate-600">No analytics data available yet.</p>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="mt-8 sm:mt-12 text-center">
          <Link href="/">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Student Portal
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

