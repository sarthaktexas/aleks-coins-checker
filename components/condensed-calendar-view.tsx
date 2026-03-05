"use client"

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

type CondensedCalendarViewProps = {
  dailyLog: DailyLog[]
  totalDays: number
  periodDays: number
}

export function CondensedCalendarView({ dailyLog, totalDays, periodDays }: CondensedCalendarViewProps) {
  const logMap = new Map(dailyLog.map((log) => [log.day, log]))

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

  const getDayColor = (day: DailyLog) => {
    if (day.isExcluded) {
      return day.wouldHaveQualified
        ? "bg-amber-100 border-amber-300 text-amber-800"
        : "bg-gray-200 border-gray-300 text-gray-500"
    }
    if (day.reason === "⏳ No data available") {
      return "bg-gray-100 border-gray-200 text-gray-400"
    }
    return day.qualified ? "bg-green-100 border-green-300 text-green-800" : "bg-red-100 border-red-300 text-red-800"
  }

  const getDayIcon = (day: DailyLog) => {
    if (day.isExcluded) return day.wouldHaveQualified ? "🎁" : "📅"
    if (day.reason === "⏳ No data available") return "⏳"
    return day.qualified ? "✅" : "❌"
  }

  const formatShortDate = (dateString: string) => {
    if (!dateString) return ""
    const [year, month, day] = dateString.split("-").map(Number)
    const date = new Date(year, month - 1, day)
    return `${date.getMonth() + 1}/${date.getDate()}`
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return ""
    const [year, month, day] = dateString.split("-").map(Number)
    const date = new Date(year, month - 1, day)
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
  }

  const exemptCount = allDays.filter((d) => d.isExcluded).length

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">Daily Progress</span>
        <span className="text-xs text-slate-500">
          {totalDays} / {periodDays} days
          {exemptCount > 0 && ` (${exemptCount} exempt)`}
        </span>
      </div>
      <div className="max-w-full overflow-x-auto pb-1">
        <div className="flex gap-1.5">
          {allDays.map((day) => {
            const colorClass = getDayColor(day)
            const icon = getDayIcon(day)
            const shortDate = formatShortDate(day.date)
            const fullDate = formatDate(day.date)
            const title = `${fullDate} - ${day.reason}${day.minutes > 0 ? ` (${day.minutes} min, ${day.topics} topics)` : ""}`

            return (
              <div
                key={day.day}
                className={`flex min-w-[3.5rem] flex-shrink-0 flex-col items-center justify-center rounded border-2 py-1.5 px-1 transition-colors ${colorClass}`}
                title={title}
              >
                <span className="text-base leading-none">{icon}</span>
                <span className="mt-1 text-[10px] font-bold">Day {day.day}</span>
                <span className="text-[9px] text-current/80">{shortDate}</span>
              </div>
            )
          })}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded border-2 border-green-300 bg-green-100" />
          Qualified
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded border-2 border-red-300 bg-red-100" />
          Not qualified
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded border-2 border-amber-300 bg-amber-100" />
          Exempt
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded border-2 border-gray-200 bg-gray-100" />
          No data
        </span>
      </div>
    </div>
  )
}
