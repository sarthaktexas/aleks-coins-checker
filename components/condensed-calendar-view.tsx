"use client"

import { useState, useEffect } from "react"

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

type DayOverride = {
  id: number
  student_id: string
  day_number: number
  date: string
  override_type: "qualified" | "not_qualified"
  reason: string | null
  created_at: string
  updated_at: string
}

type CondensedCalendarViewProps = {
  dailyLog: DailyLog[]
  totalDays: number
  periodDays: number
  studentId?: string
}

export function CondensedCalendarView({ dailyLog, totalDays, periodDays, studentId }: CondensedCalendarViewProps) {
  const [overrides, setOverrides] = useState<DayOverride[]>([])
  const logMap = new Map(dailyLog.map((log) => [log.day, log]))

  useEffect(() => {
    if (studentId) {
      fetch(`/api/admin/day-overrides?studentId=${encodeURIComponent(studentId)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) setOverrides(data.overrides || [])
        })
        .catch(() => {})
    }
  }, [studentId, dailyLog.length])

  const periodDateStrings = dailyLog.length > 0 ? dailyLog.map((log) => log.date).sort() : []
  const minDate = periodDateStrings[0] ?? null
  const maxDate = periodDateStrings[periodDateStrings.length - 1] ?? null

  const overrideMap = new Map<number, DayOverride>()
  if (minDate && maxDate) {
    overrides
      .filter((o) => o.date >= minDate && o.date <= maxDate)
      .forEach((override) => {
        const match = dailyLog.find((log) => log.date === override.date)
        if (match) overrideMap.set(match.day, override)
      })
  }

  const generateAllDays = (): DailyLog[] => {
    if (dailyLog.length === 0 || periodDays === 0) return []

    const firstDay = dailyLog[0]
    const [startYear, startMonth, startDay] = firstDay.date.split("-").map(Number)
    const maxDayNumber = Math.max(...dailyLog.map((log) => log.day), totalDays || 0)
    const daysToGenerate = Math.max(periodDays, maxDayNumber)
    const allDays: DailyLog[] = []

    let currentYear = startYear
    let currentMonth = startMonth
    let currentDay = startDay
    let dayNumber = 1

    const incrementDate = () => {
      const daysInMonth = new Date(currentYear, currentMonth, 0).getDate()
      if (currentDay < daysInMonth) {
        currentDay++
      } else {
        currentDay = 1
        if (currentMonth < 12) {
          currentMonth++
        } else {
          currentMonth = 1
          currentYear++
        }
      }
    }

    for (let i = 0; i < daysToGenerate; i++) {
      const dateString = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(currentDay).padStart(2, "0")}`
      const existingLog = logMap.get(dayNumber)

      if (existingLog) {
        allDays.push(existingLog)
      } else {
        allDays.push({
          day: dayNumber,
          date: dateString,
          qualified: false,
          minutes: 0,
          topics: 0,
          reason: "⏳ No data available",
          isExcluded: false,
        })
      }
      dayNumber++
      incrementDate()
    }
    return allDays
  }

  const allDays = generateAllDays()

  const getDayState = (day: DailyLog) => {
    if (day.reason === "⏳ No data available") {
      return { emoji: "⏳", className: "bg-gray-50 border-gray-200 text-gray-400", hasOverride: false }
    }
    if (day.isExcluded) {
      return day.wouldHaveQualified
        ? { emoji: "🎁", className: "bg-amber-50 border-amber-300 text-amber-800 ring-1 ring-amber-200", hasOverride: false }
        : { emoji: "📅", className: "bg-slate-100 border-slate-300 text-slate-600", hasOverride: false }
    }

    const override = overrideMap.get(day.day)
    if (override) {
      const isQualified = override.override_type === "qualified"
      return {
        emoji: isQualified ? "✅🔧" : "❌🔧",
        className: "bg-blue-50 border-blue-300 text-blue-800 ring-1 ring-blue-200",
        hasOverride: true,
      }
    }

    return day.qualified
      ? { emoji: "✅", className: "bg-emerald-50 border-emerald-300 text-emerald-800", hasOverride: false }
      : { emoji: "❌", className: "bg-rose-50 border-rose-300 text-rose-800", hasOverride: false }
  }

  const formatShortDate = (dateString: string) => {
    if (!dateString) return ""
    const [, month, day] = dateString.split("-").map(Number)
    return `${month}/${day}`
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return ""
    const [year, month, day] = dateString.split("-").map(Number)
    const date = new Date(year, month - 1, day)
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
  }

  const stats = allDays.reduce(
    (acc, day) => {
      const state = getDayState(day)
      if (state.hasOverride) acc.overrides += 1
      else if (state.emoji === "✅") acc.qualified += 1
      else if (state.emoji === "❌") acc.notQualified += 1
      else if (state.emoji === "🎁" || state.emoji === "📅") acc.exempt += 1
      else acc.future += 1
      return acc
    },
    { qualified: 0, notQualified: 0, exempt: 0, future: 0, overrides: 0 },
  )

  const uploadedCount = allDays.filter((d) => d.reason !== "⏳ No data available").length

  return (
    <div className="rounded-md border border-[rgba(3,32,68,0.12)] bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-utsa-midnight">Daily Progress</span>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="text-utsa-muted">{uploadedCount}/{allDays.length} uploaded</span>
          <span className="text-utsa-muted">·</span>
          <span className="inline-flex items-center gap-0.5 text-emerald-800">✅ {stats.qualified}</span>
          <span className="inline-flex items-center gap-0.5 text-rose-800">❌ {stats.notQualified}</span>
          {stats.exempt > 0 && (
            <span className="inline-flex items-center gap-0.5 text-amber-800">🎁 {stats.exempt}</span>
          )}
          {stats.overrides > 0 && (
            <span className="inline-flex items-center gap-0.5 text-blue-800">🔧 {stats.overrides}</span>
          )}
        </div>
      </div>
      <div className="max-w-full overflow-x-auto pb-1">
        <div className="flex gap-1">
          {allDays.map((day) => {
            const state = getDayState(day)
            const override = overrideMap.get(day.day)
            const title = `${formatDate(day.date)} - ${day.reason}${day.minutes > 0 ? ` (${day.minutes} min, ${day.topics} topics)` : ""}${override ? ` [Override: ${override.override_type === "qualified" ? "Qualified" : "Not Qualified"}]` : ""}`

            return (
              <div
                key={day.day}
                className={`flex min-w-[2.75rem] flex-shrink-0 flex-col items-center justify-between rounded-md border py-1 px-0.5 transition-colors group relative ${state.className}`}
                title={title}
              >
                <span className="text-sm leading-none">{state.emoji}</span>
                <span className="mt-0.5 text-[10px] font-semibold leading-none">D{day.day}</span>
                <span className="text-[9px] leading-none opacity-80">{formatShortDate(day.date)}</span>
              </div>
            )
          })}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-utsa-muted">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 shrink-0 rounded border border-emerald-300 bg-emerald-50" />
          ✅ Qualified
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 shrink-0 rounded border border-rose-300 bg-rose-50" />
          ❌ Not Qualified
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 shrink-0 rounded border border-amber-300 bg-amber-50" />
          🎁/📅 Exempt
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 shrink-0 rounded border border-gray-200 bg-gray-50" />
          ⏳ Future
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 shrink-0 rounded border border-blue-300 bg-blue-50" />
          🔧 Override
        </span>
      </div>
    </div>
  )
}
