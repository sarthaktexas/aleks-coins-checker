"use client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Calendar } from "lucide-react"

type DailyLog = {
  day: number
  date: string
  qualified: boolean
  minutes: number
  topics: number
  reason: string
}

type CalendarViewProps = {
  dailyLog: DailyLog[]
  totalDays: number
  periodDays: number
}

export function CalendarView({ dailyLog, totalDays, periodDays }: CalendarViewProps) {
  const getDayColor = (day: DailyLog | undefined, dayNumber: number) => {
    if (!day || dayNumber > totalDays) return "bg-gray-100 border-gray-200"
    if (day.qualified) return "bg-green-500 hover:bg-green-600 border-green-600"
    return "bg-red-500 hover:bg-red-600 border-red-600"
  }

  const getDayTextColor = (day: DailyLog | undefined, dayNumber: number) => {
    if (!day || dayNumber > totalDays) return "text-gray-400"
    return "text-white"
  }

  const formatDate = (dateString: string) => {
    // Parse YYYY-MM-DD manually to avoid timezone issues
    const [year, month, day] = dateString.split("-").map(Number)
    const date = new Date(year, month - 1, day) // month is 0-indexed
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  const formatDateLong = (dateString: string) => {
    // Parse YYYY-MM-DD manually to avoid timezone issues
    const [year, month, day] = dateString.split("-").map(Number)
    const date = new Date(year, month - 1, day) // month is 0-indexed
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  // Generate future dates based on the actual dates from dailyLog
  const generateFutureDate = (dayNumber: number) => {
    if (dailyLog.length === 0) return ""

    // Find the first date in the dailyLog
    const firstDate = new Date(dailyLog[0].date)

    // Calculate the future date by adding (dayNumber - 1) days to the first date
    const futureDate = new Date(firstDate)
    futureDate.setDate(firstDate.getDate() + (dayNumber - 1))

    return futureDate.toISOString().split("T")[0]
  }

  // Calculate optimal grid dimensions based on periodDays
  const getGridDimensions = (days: number) => {
    if (days <= 12) return { cols: 4, rows: Math.ceil(days / 4) }
    if (days <= 20) return { cols: 5, rows: Math.ceil(days / 5) }
    if (days <= 30) return { cols: 6, rows: Math.ceil(days / 6) }
    if (days <= 42) return { cols: 7, rows: Math.ceil(days / 7) }
    return { cols: 8, rows: Math.ceil(days / 8) }
  }

  const { cols } = getGridDimensions(periodDays)

  // Create grid array for all period days
  const grid = []
  for (let i = 0; i < periodDays; i++) {
    const dayNumber = i + 1
    const dayData = dailyLog.find((d) => d.day === dayNumber)

    // For days without data (either past days missing data or future days)
    let displayDate = ""
    if (dayData) {
      displayDate = dayData.date
    } else {
      // Generate date based on the first date in dailyLog
      if (dailyLog.length > 0) {
        const [year, month, day] = dailyLog[0].date.split("-").map(Number)
        const firstDate = new Date(year, month - 1, day) // month is 0-indexed
        const calculatedDate = new Date(firstDate)
        calculatedDate.setDate(firstDate.getDate() + (dayNumber - 1))

        // Format back to YYYY-MM-DD
        const calcYear = calculatedDate.getFullYear()
        const calcMonth = String(calculatedDate.getMonth() + 1).padStart(2, "0")
        const calcDay = String(calculatedDate.getDate()).padStart(2, "0")
        displayDate = `${calcYear}-${calcMonth}-${calcDay}`
      }
    }

    grid.push({ dayNumber, dayData, displayDate })
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Daily Progress Calendar
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Showing {totalDays} of {periodDays} days completed
        </p>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          <div className={`grid gap-1.5 sm:gap-2`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {grid.map(({ dayNumber, dayData, displayDate }) => (
              <Tooltip key={dayNumber}>
                <TooltipTrigger asChild>
                  <div
                    className={`
                      aspect-square rounded-lg border-2 flex flex-col items-center justify-center p-1 sm:p-2 cursor-pointer transition-colors
                      ${getDayColor(dayData, dayNumber)}
                    `}
                  >
                    <div className={`text-xs sm:text-sm font-bold ${getDayTextColor(dayData, dayNumber)}`}>
                      {dayNumber}
                    </div>
                    {dayData && (
                      <div
                        className={`text-[10px] sm:text-xs ${getDayTextColor(dayData, dayNumber)} text-center leading-tight`}
                      >
                        {formatDate(dayData.date)}
                      </div>
                    )}
                    {!dayData && displayDate && (
                      <div
                        className={`text-[10px] sm:text-xs ${getDayTextColor(dayData, dayNumber)} text-center leading-tight`}
                      >
                        {formatDate(displayDate)}
                      </div>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  {dayData ? (
                    <div className="space-y-1">
                      <div className="font-semibold">
                        Day {dayNumber} - {formatDateLong(dayData.date)}
                      </div>
                      <div className="text-sm">
                        <div>Minutes: {dayData.minutes}</div>
                        <div>Topics: {dayData.topics}</div>
                        <div className="mt-1 font-medium">{dayData.reason}</div>
                      </div>
                    </div>
                  ) : dayNumber > totalDays ? (
                    <div>
                      <div className="font-semibold">
                        Day {dayNumber} - {displayDate ? formatDateLong(displayDate) : "Future"}
                      </div>
                      <div className="text-sm text-muted-foreground">No data yet - day hasn't occurred</div>
                    </div>
                  ) : (
                    <div>
                      <div className="font-semibold">
                        Day {dayNumber} - {displayDate ? formatDateLong(displayDate) : "No date"}
                      </div>
                      <div className="text-sm text-muted-foreground">No data available</div>
                    </div>
                  )}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 sm:gap-6 mt-4 pt-4 border-t flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 sm:w-4 sm:h-4 bg-green-500 rounded border"></div>
            <span className="text-xs sm:text-sm text-gray-600">Qualified</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 sm:w-4 sm:h-4 bg-red-500 rounded border"></div>
            <span className="text-xs sm:text-sm text-gray-600">Not Qualified</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 sm:w-4 sm:h-4 bg-gray-100 border border-gray-200 rounded"></div>
            <span className="text-xs sm:text-sm text-gray-600">Future/No Data</span>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="mt-4 pt-4 border-t">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-lg sm:text-xl font-bold text-green-600">
                {dailyLog.filter((d) => d.qualified).length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600">Qualified Days</div>
            </div>
            <div>
              <div className="text-lg sm:text-xl font-bold text-red-600">
                {dailyLog.filter((d) => !d.qualified).length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600">Missed Days</div>
            </div>
            <div>
              <div className="text-lg sm:text-xl font-bold text-blue-600">
                {Math.round(dailyLog.reduce((sum, d) => sum + d.minutes, 0) / dailyLog.length) || 0}
              </div>
              <div className="text-xs sm:text-sm text-gray-600">Avg Minutes</div>
            </div>
            <div>
              <div className="text-lg sm:text-xl font-bold text-purple-600">{periodDays - totalDays}</div>
              <div className="text-xs sm:text-sm text-gray-600">Days Remaining</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
