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
    <div className="min-h-screen bg-utsa-surface">
      <div className="h-1 w-full bg-utsa-orange" />
      <div className="container mx-auto px-4 py-6 sm:py-8 max-w-5xl">
        {/* Header */}
        <div className="mb-6">
          <div className="mb-3">
            <Link href="/">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Student Portal
              </Button>
            </Link>
          </div>
          <h1 className="text-xl font-semibold text-utsa-midnight">Class Analytics</h1>
          <p className="text-sm text-utsa-muted">Average completion rates and study times across all sections</p>
        </div>

        {/* Loading Analytics */}
        {isLoadingAnalytics && (
          <Card className="mb-6 rounded-md bg-white">
            <CardContent className="p-6 text-center">
              <div className="flex items-center justify-center gap-3">
                <div className="w-4 h-4 border-2 border-utsa-orange border-t-transparent rounded-full animate-spin" />
                <span className="text-utsa-muted font-medium text-sm">Loading class analytics...</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Analytics Section */}
        {!isLoadingAnalytics && analytics.length > 0 && (
          <Card className="mb-6 rounded-md bg-white">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-lg text-utsa-midnight">
                <BarChart3 className="h-4 w-4 text-utsa-orange" />
                Class Analytics
              </CardTitle>
              <CardDescription className="text-sm text-utsa-muted">
                Average completion rates and study times across all sections
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Period Selection Buttons */}
              {activePeriods.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {activePeriods.map((period) => (
                    <Button
                      key={period}
                      onClick={() => setSelectedPeriod(period)}
                      variant={selectedPeriod === period ? "default" : "outline"}
                      size="sm"
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
                    <div className="flex items-center justify-between p-4 bg-utsa-surface rounded-md">
                      <div>
                        <h3 className="font-semibold text-utsa-midnight">
                          {period.periodName ?? period.period.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </h3>
                        <p className="text-sm text-utsa-muted">
                          Sections {period.sections.join(', ')} • {period.totalStudents} students
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-2 text-sm text-utsa-midnight">
                          <TrendingUp className="h-4 w-4" />
                          <span className="font-medium">{period.averageCompletion}% avg completion</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-utsa-muted">
                          <Clock className="h-4 w-4" />
                          <span>{period.averageTime.toFixed(1)} min avg time</span>
                        </div>
                      </div>
                    </div>

                    {/* Line Chart */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-utsa-midnight flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Completion Trends Over Time
                      </h4>
                      <div className="w-full h-96 bg-white rounded-md p-4">
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
                            className="relative p-3 rounded-md bg-white overflow-hidden"
                            style={{
                              background: isExempt 
                                ? `linear-gradient(to right, #9AA5B5 ${completionPercent}%, #E8ECF2 ${completionPercent}%)`
                                : `linear-gradient(to right, #F15A22 ${completionPercent}%, #E8ECF2 ${completionPercent}%)`
                            }}
                          >
                            <div className="relative z-10">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-utsa-midnight">
                                  Day {day.day}
                                </span>
                                <div className="flex items-center gap-1">
                                  {isExempt && (
                                    <Badge variant="outline" className="text-xs bg-utsa-surface text-utsa-muted">
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
                                  <span className="text-utsa-muted font-medium">Completion:</span>
                                  <span className="font-bold text-utsa-midnight">
                                    {day.averageCompletion.toFixed(1)}%
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-utsa-muted">Avg Time:</span>
                                  <span className="font-medium text-utsa-midnight">
                                    {day.averageTime.toFixed(0)}m
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-utsa-muted">Students:</span>
                                  <span className="font-medium text-utsa-midnight">
                                    {day.qualifiedStudents}/{day.totalStudents}
                                  </span>
                                </div>
                                {day.sectionData.length > 1 && (
                                  <div className="pt-1 border-t border-utsa-border">
                                    <div className="text-xs text-utsa-muted">
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
          <Card className="mb-6 rounded-md bg-white">
            <CardContent className="p-6 text-center">
              <p className="text-utsa-muted text-sm">No analytics data available yet.</p>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="mt-8">
          <Link href="/">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Student Portal
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

