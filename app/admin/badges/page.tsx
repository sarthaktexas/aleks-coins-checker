"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Trophy, CheckCircle, AlertTriangle, Loader2 } from "lucide-react"
import { BadgeShield } from "@/components/badge-shield"

type BadgeStats = {
  totalBadges: number
  streak10: number
  streak25: number
  uniqueStudents: number
  byPeriod: Array<{
    period: string
    streak10: number
    streak25: number
    total: number
  }>
}

const emptyStats: BadgeStats = {
  totalBadges: 0,
  streak10: 0,
  streak25: 0,
  uniqueStudents: 0,
  byPeriod: [],
}

export default function BadgesAdmin() {
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState("")
  const [stats, setStats] = useState<BadgeStats>(emptyStats)
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState("")

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    setStatsError("")
    try {
      const response = await fetch("/api/admin/badge-stats", {
        credentials: "same-origin",
      })
      const data = await response.json()
      if (!response.ok) {
        setStatsError(data.error || "Failed to load badge statistics")
        return
      }
      setStats({
        totalBadges: data.totalBadges ?? 0,
        streak10: data.streak10 ?? 0,
        streak25: data.streak25 ?? 0,
        uniqueStudents: data.uniqueStudents ?? 0,
        byPeriod: data.byPeriod ?? [],
      })
    } catch {
      setStatsError("Network error while loading badge statistics.")
    } finally {
      setStatsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  const processAllBadges = async () => {
    if (!confirm("Process badges for all students across all periods? This may take a while.")) {
      return
    }

    setProcessing(true)
    setError("")
    setResult(null)

    try {
      const response = await fetch("/api/badges/process", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Failed to process badges")
        return
      }

      setResult(data)
      await loadStats()
    } catch (err) {
      console.error("Error processing badges:", err)
      setError("Failed to process badges. Please try again.")
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-utsa-midnight">Badge Management</h1>
        <p className="text-sm text-utsa-muted mt-1">Manage student badges and rewards</p>
      </div>

      {/* Badge Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-utsa-orange" />
            Badge System
          </CardTitle>
          <CardDescription>
            Badges are automatically awarded based on student streaks
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 10-Day Streak Badge */}
            <div className="border border-orange-200 bg-orange-50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <BadgeShield kind="streak_10_day" unlocked className="h-16 w-14 shrink-0" />
                <div className="flex-1">
                  <h3 className="font-semibold text-orange-900">10-Day Streak Badge</h3>
                  <p className="text-sm text-orange-800 mt-1">
                    Complete ALEKS 10 days in a row
                  </p>
                  <div className="mt-2 pt-2 border-t border-orange-200">
                    <p className="text-sm font-medium text-orange-900">Reward:</p>
                    <p className="text-sm text-orange-800">+10 coins once per exam period, up to 3 periods</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 25-Day Streak Badge */}
            <div className="border border-yellow-200 bg-yellow-50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <BadgeShield kind="streak_25_day" unlocked className="h-16 w-14 shrink-0" />
                <div className="flex-1">
                  <h3 className="font-semibold text-yellow-900">25-Day Streak Badge</h3>
                  <p className="text-sm text-yellow-800 mt-1">
                    Complete ALEKS 25 days in a row
                  </p>
                  <div className="mt-2 pt-2 border-t border-yellow-200">
                    <p className="text-sm font-medium text-yellow-900">Reward:</p>
                    <p className="text-sm text-yellow-800">
                      Permanent 2x multiplier on ALL future daily coins
                    </p>
                    <p className="text-xs text-yellow-700 mt-1">
                      (Even if the streak breaks, the multiplier stays forever)
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Badge Statistics */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Badge Statistics</CardTitle>
            <CardDescription>
              Awarded badges across all students
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadStats()}
            disabled={statsLoading}
            className="border-utsa-border shrink-0"
          >
            {statsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {statsError ? (
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">{statsError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total badges", value: stats.totalBadges },
              { label: "10-day awards", value: stats.streak10 },
              { label: "25-day (2×)", value: stats.streak25 },
              { label: "Students", value: stats.uniqueStudents },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-md border border-utsa-border bg-utsa-surface px-3 py-3 text-center"
              >
                <p className="text-2xl font-semibold text-utsa-midnight">
                  {statsLoading ? "…" : item.value}
                </p>
                <p className="text-xs text-utsa-muted mt-1">{item.label}</p>
              </div>
            ))}
          </div>

          {!statsLoading && stats.byPeriod.length > 0 ? (
            <div className="overflow-x-auto rounded-md border border-utsa-border">
              <table className="w-full text-sm">
                <thead className="bg-utsa-surface text-left text-xs uppercase tracking-wide text-utsa-muted">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Period</th>
                    <th className="px-3 py-2 font-semibold text-right">10-day</th>
                    <th className="px-3 py-2 font-semibold text-right">25-day</th>
                    <th className="px-3 py-2 font-semibold text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byPeriod.map((row) => (
                    <tr key={row.period} className="border-t border-utsa-border">
                      <td className="px-3 py-2 text-utsa-midnight">{row.period}</td>
                      <td className="px-3 py-2 text-right text-utsa-midnight">{row.streak10}</td>
                      <td className="px-3 py-2 text-right text-utsa-midnight">{row.streak25}</td>
                      <td className="px-3 py-2 text-right font-medium text-utsa-midnight">{row.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {!statsLoading && !statsError && stats.totalBadges === 0 ? (
            <p className="text-sm text-utsa-muted text-center py-2">
              No badges awarded yet. Run processing below to award retroactive badges.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Process Badges */}
      <Card>
        <CardHeader>
          <CardTitle>Process Badges</CardTitle>
          <CardDescription>
            Run badge processing to check all students and award badges retroactively
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
            <div className="flex gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-900">
                <p className="font-medium">How badge processing works:</p>
                <ul className="mt-2 space-y-1 list-disc list-inside">
                  <li>Scans all student data across all periods</li>
                  <li>Calculates streak data from daily logs</li>
                  <li>Awards badges to students who already qualify</li>
                  <li>Does not add coins. The +10 is paid once per exam period, up to 3 periods, on the daily pull the day a streak first hits 10</li>
                  <li>Enables 2x multiplier for 25-day streak badge</li>
                  <li>Safe to run multiple times (no duplicate awards)</li>
                </ul>
              </div>
            </div>
          </div>

          <Button
            type="button"
            onClick={processAllBadges}
            disabled={processing}
            size="lg"
            className="w-full sm:w-auto"
          >
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Trophy className="h-4 w-4 mr-2" />
                Process All Badges
              </>
            )}
          </Button>

          {error && (
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">{error}</AlertDescription>
            </Alert>
          )}

          {result && (
            <Alert className="border-emerald-200 bg-emerald-50">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              <AlertDescription className="text-emerald-800">
                <p className="font-medium">Badge processing complete!</p>
                <ul className="mt-2 space-y-1 text-sm">
                  <li>• Processed {result.processedCount} students</li>
                  <li>• Awarded {result.badgesAwarded} new badges</li>
                  <li>• Awarded {result.coinsAwarded} bonus coins</li>
                </ul>
                {result.errors && result.errors.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-emerald-200">
                    <p className="text-xs text-emerald-700 font-medium">Errors:</p>
                    <ul className="text-xs text-emerald-700 mt-1 space-y-1">
                      {result.errors.map((err: string, i: number) => (
                        <li key={i}>• {err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
