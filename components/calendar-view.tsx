"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar } from "lucide-react"

type DailyLog = {
  day: number
  date: string
  qualified: boolean
  minutes: number
  topics: number
  reason: string
  isExcluded?: boolean
}

type CalendarViewProps = {
  dailyLog: DailyLog[]
  totalDays: number
  periodDays: number
}

export function CalendarView({ dailyLog, totalDays, periodDays }: CalendarViewProps) {
  // Create a map for quick lookup
  const logMap = new Map(dailyLog.map((log) => [log.day, log]))

  // Generate all days for the period (we'll show all days from the dailyLog)
  const allDays = dailyLog.length > 0 ? dailyLog : []

  const getDayColor = (day: DailyLog, dayNumber: number) => {
    // Exempt days are always gray
    if (day.isExcluded) {
      return "bg-gray-200 border-gray-300 text-gray-500 cursor-default"
    }

    // Future days (beyond totalDays but not exempt)
    if (dayNumber > totalDays) {
      return "bg-gray-100 border-gray-200 text-gray-400"
    }

    // Regular days
    if (day.qualified) {
      return "bg-green-100 border-green-300 text-green-800 hover:bg-green-200"
    } else {
      return "bg-red-100 border-red-300 text-red-800 hover:bg-red-200"
    }
  }

  const getDayIcon = (day: DailyLog, dayNumber: number) => {
    if (day.isExcluded) {
      return "📅" // Calendar emoji for exempt days
    }
    if (dayNumber > totalDays) {
      return "⏳"
    }
    return day.qualified ? "✅" : "❌"
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return ""
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const formatShortDate = (dateString: string) => {
    if (!dateString) return ""
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", {
      month: "numeric",
      day: "numeric",
    })
  }

  return (
    <Card className="shadow-xl border-0 bg-white/90 backdrop-blur-sm">
      <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100">
        <CardTitle className="flex items-center gap-3 text-lg sm:text-xl text-blue-900">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
          </div>
          Daily Progress Calendar
        </CardTitle>
      </CardHeader>

      <CardContent className="p-4 sm:p-6">
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 xl:grid-cols-10 gap-2 sm:gap-3">
          {allDays.map((day) => (
            <div
              key={day.day}
              className={`
                relative aspect-square rounded-lg border-2 p-1 sm:p-2 cursor-pointer transition-all duration-200
                ${getDayColor(day, day.day)}
                group
              `}
              title={`${formatDate(day.date)} - ${day.reason}`}
            >
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="text-lg sm:text-xl mb-1">{getDayIcon(day, day.day)}</div>
                <div className="text-xs sm:text-sm font-bold mb-1">Day {day.day}</div>
                <div className="text-xs text-center leading-tight">{formatShortDate(day.date)}</div>
              </div>

              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 whitespace-nowrap">
                <div className="font-semibold">Day {day.day}</div>
                <div className="text-gray-300">{formatDate(day.date)}</div>
                <div className="mt-1">{day.reason}</div>
                {!day.isExcluded && (
                  <div className="text-gray-300 text-xs mt-1">
                    {day.minutes} mins • {day.topics} topics
                  </div>
                )}
                {day.isExcluded && <div className="text-gray-300 text-xs mt-1">Exempt - Not counted in progress</div>}
                {/* Arrow */}
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-6 flex flex-wrap justify-center gap-4 sm:gap-6 text-xs sm:text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-100 border-2 border-green-300 rounded"></div>
            <span className="text-green-800 font-medium">Qualified (✅)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-100 border-2 border-red-300 rounded"></div>
            <span className="text-red-800 font-medium">Not Qualified (❌)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-200 border-2 border-gray-300 rounded"></div>
            <span className="text-gray-600 font-medium">Exempt Days (📅)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-100 border-2 border-gray-200 rounded"></div>
            <span className="text-gray-600 font-medium">Future Days (⏳)</span>
          </div>
        </div>

        {/* Summary */}
        <div className="mt-4 text-center text-sm text-slate-600">
          <div className="space-y-1">
            <div>
              <span className="font-medium">{totalDays}</span> of <span className="font-medium">{periodDays}</span>{" "}
              working days completed
            </div>
            {allDays.filter((d) => d.isExcluded).length > 0 && (
              <div className="text-xs text-gray-500">
                ({allDays.filter((d) => d.isExcluded).length} exempt days not counted)
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
