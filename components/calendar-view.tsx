"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react"
import { DayOverrideModal } from "@/components/day-override-modal"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

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
  student_name?: string
  day_number: number
  date: string
  override_type: "qualified" | "not_qualified"
  reason: string | null
  created_at: string
  updated_at: string
}

type CalendarViewProps = {
  dailyLog: DailyLog[]
  totalDays: number
  periodDays: number
  studentInfo?: {
    studentId: string
    name: string
    email?: string
    period?: string
    sectionNumber?: string
  }
  /** Called after a successful override request so the parent can refresh pending requests */
  onRequestSubmitted?: () => void
}

export function CalendarView({ dailyLog, totalDays, periodDays, studentInfo, onRequestSubmitted }: CalendarViewProps) {
  const [overrides, setOverrides] = useState<DayOverride[]>([])
  const [isMobileView, setIsMobileView] = useState(false)
  const [overrideModal, setOverrideModal] = useState<{
    isOpen: boolean
    dayInfo: any
  }>({
    isOpen: false,
    dayInfo: null
  })
  const [mobileDayDetail, setMobileDayDetail] = useState<{
    isOpen: boolean
    day: DailyLog | null
  }>({ isOpen: false, day: null })


  // Create a map for quick lookup
  const logMap = new Map(dailyLog.map((log) => [log.day, log]))
  
  // Filter overrides by date range to match only this period's dates
  // Get the date range from dailyLog (using string comparison to avoid timezone issues)
  const periodDateStrings = dailyLog.length > 0 
    ? dailyLog.map(log => log.date).sort()
    : []
  
  const minDate = periodDateStrings.length > 0 ? periodDateStrings[0] : null
  const maxDate = periodDateStrings.length > 0 ? periodDateStrings[periodDateStrings.length - 1] : null
  
  // Filter overrides to only include those whose dates fall within this period's date range
  // Use string comparison since dates are stored as 'YYYY-MM-DD' strings
  const filteredOverrides = minDate && maxDate
    ? overrides.filter(override => {
        return override.date >= minDate && override.date <= maxDate
      })
    : []
  
  // Create override map using day_number from the filtered overrides
  // Match by date to ensure we're using the right override for this period
  const overrideMap = new Map<number, DayOverride>()
  filteredOverrides.forEach(override => {
    // Find the day in dailyLog that matches this override's date
    const matchingDay = dailyLog.find(log => log.date === override.date)
    if (matchingDay) {
      overrideMap.set(matchingDay.day, override)
    }
  })

  // Load overrides when studentInfo is available or when dailyLog changes
  useEffect(() => {
    if (studentInfo?.studentId) {
      loadOverrides()
    }
  }, [studentInfo, dailyLog.length]) // Reload when dailyLog changes (e.g., period switch)

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 639px)")
    const updateViewport = () => setIsMobileView(mediaQuery.matches)
    updateViewport()
    mediaQuery.addEventListener("change", updateViewport)
    return () => mediaQuery.removeEventListener("change", updateViewport)
  }, [])

  const loadOverrides = async () => {
    if (!studentInfo) return
    
    try {
      const response = await fetch(
        `/api/admin/day-overrides?studentId=${encodeURIComponent(studentInfo.studentId)}`
      )
      const result = await response.json()
      
      if (response.ok && result.success) {
        setOverrides(result.overrides || [])
      }
    } catch (error) {
      console.error("Failed to load overrides:", error)
    }
  }

  // Function to generate all days of the period with correct dates
  const generateAllDays = () => {
    if (dailyLog.length === 0 || periodDays === 0) {
      return []
    }

    // Get start date from first day in dailyLog
    const firstDay = dailyLog[0]
    const [startYear, startMonth, startDay] = firstDay.date.split('-').map(Number)
    
    // Find the maximum day number from dailyLog to include all days (including exempt days)
    const maxDayNumber = Math.max(...dailyLog.map(log => log.day), totalDays || 0)
    // Use the maximum of periodDays and maxDayNumber to ensure we show all days
    const daysToGenerate = Math.max(periodDays, maxDayNumber)
    
    const allDays: DailyLog[] = []

    // Create current date object manually
    let currentYear = startYear
    let currentMonth = startMonth
    let currentDay = startDay
    let dayNumber = 1

    // Helper function to increment date
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

    // Generate days up to the maximum day number found in dailyLog
    // This includes all days (working days + exempt days)
    for (let i = 0; i < daysToGenerate; i++) {
      // Create date string manually
      const dateString = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(currentDay).padStart(2, "0")}`

      // Check if this day has data in dailyLog
      const existingLog = logMap.get(dayNumber)

      if (existingLog) {
        // Use existing data from dailyLog
        allDays.push(existingLog)
      } else {
        // Create placeholder for days without data
        allDays.push({
          day: dayNumber,
          date: dateString,
          qualified: false,
          minutes: 0,
          topics: 0,
          reason: "⏳ No data available",
          isExcluded: false
        })
      }

      dayNumber++
      incrementDate()
    }

    return allDays
  }

  const allDays = generateAllDays()

  // Find the latest day with data (not "No data available")
  const daysWithData = dailyLog
    .filter(day => day.reason !== "⏳ No data available" && !day.isExcluded)
    .map(day => day.day)
  const latestDayWithData = daysWithData.length > 0 ? Math.max(...daysWithData) : 0
  
  // Find the last day of the period
  const lastDayOfPeriod = allDays.length > 0 ? allDays[allDays.length - 1].day : 0

  const getDayState = (day: DailyLog, dayNumber: number) => {
    const override = overrideMap.get(dayNumber)
    const hasOverride = !!override
    const isQualified = override ? override.override_type === "qualified" : day.qualified

    if (day.reason === "⏳ No data available") {
      return {
        label: "Future",
        symbol: "—",
        className: "bg-gray-50 border-gray-200 text-gray-400",
      }
    }

    if (day.isExcluded) {
      if (day.wouldHaveQualified) {
        return {
          label: "Exempt (earned)",
          symbol: "E+",
          className: "bg-amber-50 border-amber-300 text-amber-800 ring-1 ring-amber-200",
        }
      }
      return {
        label: "Exempt",
        symbol: "E",
        className: "bg-slate-100 border-slate-300 text-slate-600",
      }
    }

    if (hasOverride) {
      return {
        label: isQualified ? "Override: Qualified" : "Override: Not qualified",
        symbol: isQualified ? "O+" : "O-",
        className: "bg-blue-50 border-blue-300 text-blue-800 ring-1 ring-blue-200",
      }
    }

    if (isQualified) {
      return {
        label: "Qualified",
        symbol: "Q",
        className: "bg-emerald-50 border-emerald-300 text-emerald-800",
      }
    }

    return {
      label: "Not qualified",
      symbol: "NQ",
      className: "bg-rose-50 border-rose-300 text-rose-800",
    }
  }

  const getDayEmoji = (symbol: string) => {
    switch (symbol) {
      case "Q":
        return "✅"
      case "NQ":
        return "❌"
      case "E":
        return "📅"
      case "E+":
        return "🎁"
      case "O+":
        return "✅🔧"
      case "O-":
        return "❌🔧"
      case "—":
      default:
        return "⏳"
    }
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return ""
    // Parse dates as local dates to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
  }

  const formatShortDate = (dateString: string) => {
    if (!dateString) return ""
    // Parse dates as local dates to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    return `${date.getMonth() + 1}/${date.getDate()}`
  }

  const canRequestOverride = (day: DailyLog) => {
    if (!studentInfo || day.reason === "⏳ No data available") return false
    const override = overrideMap.get(day.day)
    const isQualified = override ? override.override_type === "qualified" : day.qualified
    const isLatestDay = day.day === latestDayWithData && latestDayWithData > 0
    // Latest day overrides are intentionally disabled.
    if (isLatestDay) return false
    return !(isQualified && !override)
  }

  const buildOverrideDayInfo = (day: DailyLog) => {
    const override = overrideMap.get(day.day)
    const isQualified = override ? override.override_type === "qualified" : day.qualified
    const isLatestDay = day.day === latestDayWithData && latestDayWithData > 0
    const isLastDay = day.day === lastDayOfPeriod && lastDayOfPeriod > 0
    return {
      dayNumber: day.day,
      date: day.date,
      currentQualified: isQualified,
      currentReason: override ? override.reason || day.reason : day.reason,
      isLatestDay,
      isLastDay,
    }
  }

  const handleDayClick = (day: DailyLog) => {
    if (day.reason === "⏳ No data available") {
      return
    }

    if (isMobileView) {
      setMobileDayDetail({ isOpen: true, day })
      return
    }

    if (!canRequestOverride(day)) {
      return
    }

    setOverrideModal({
      isOpen: true,
      dayInfo: buildOverrideDayInfo(day),
    })
  }

  const handleOverrideSuccess = () => {
    loadOverrides() // Reload overrides after successful save
    onRequestSubmitted?.() // Refresh pending requests (incl. other periods) in parent
  }

  const dayStats = allDays.reduce(
    (acc, day) => {
      const state = getDayState(day, day.day)
      if (state.symbol === "Q") acc.qualified += 1
      if (state.symbol === "NQ") acc.notQualified += 1
      if (state.symbol === "E" || state.symbol === "E+") acc.exempt += 1
      if (state.symbol === "—") acc.future += 1
      return acc
    },
    { qualified: 0, notQualified: 0, exempt: 0, future: 0 },
  )
  const mobileNavigableDays = allDays.filter((day) => day.reason !== "⏳ No data available")

  return (
    <Card className="rounded-md bg-white">
      <CardContent className="p-4 sm:p-5">
        {/* Header + summary chips */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-utsa-midnight">
            <div className="p-1.5 bg-utsa-surface rounded-md">
              <Calendar className="h-4 w-4 text-utsa-orange" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-semibold">Daily Progress</h3>
              <p className="text-xs text-utsa-muted">
                {totalDays} of {periodDays} working days completed
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 text-[11px] sm:text-xs">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
              ✅ {dayStats.qualified}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200">
              ❌ {dayStats.notQualified}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
              🎁/📅 {dayStats.exempt}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-50 text-gray-600 border border-gray-200">
              ⏳ {dayStats.future}
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-1.5 sm:gap-2">
          {allDays.map((day) => {
            const override = overrideMap.get(day.day)
            const hasOverride = !!override
            const isQualified = override ? override.override_type === "qualified" : day.qualified
            const currentReason = override ? override.reason || day.reason : day.reason
            const isLatestDay = day.day === latestDayWithData && latestDayWithData > 0
            const canClick = studentInfo && day.reason !== "⏳ No data available"
            const state = getDayState(day, day.day)
            const requestable = canRequestOverride(day)

            return (
              <div
                key={day.day}
                className={`
                  relative aspect-square rounded-md border p-1.5 transition-all duration-150
                  ${state.className}
                  ${canClick ? "cursor-pointer" : "cursor-default"}
                  ${requestable ? "hover:shadow-sm" : ""}
                  group
                `}
                onClick={() => handleDayClick(day)}
                title={`${formatDate(day.date)} - ${currentReason}${hasOverride ? ' (Override)' : ''}`}
              >
                <div className="h-full flex flex-col justify-between">
                  <div className="text-[10px] sm:text-[11px] font-semibold leading-none">D{day.day}</div>
                  <div className="flex items-center justify-center text-sm sm:text-base leading-none">
                    <span aria-hidden="true">{getDayEmoji(state.symbol)}</span>
                  </div>
                  <div className="text-[10px] text-center leading-none opacity-80">{formatShortDate(day.date)}</div>
                  {hasOverride && (
                    <div className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-blue-500" />
                  )}
                </div>

                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 whitespace-nowrap">
                  <div className="font-semibold">Day {day.day}</div>
                  <div className="text-gray-300">{formatDate(day.date)}</div>
                  <div className="mt-1">{currentReason}</div>
                  {hasOverride && (
                    <div className="text-blue-300 text-xs mt-1">
                      Override: {isQualified ? "Qualified" : "Not Qualified"}
                    </div>
                  )}
                  {!day.isExcluded && (
                    <div className="text-gray-300 text-xs mt-1">
                      {day.minutes} mins • {day.topics} topics
                    </div>
                  )}
                  {day.isExcluded && (
                    <div className="text-gray-300 text-xs mt-1">
                      {day.wouldHaveQualified ? "🎁 Extra credit earned" : "Exempt - Not counted in progress"}
                    </div>
                  )}
                  {requestable && <div className="text-gray-300 text-xs mt-1">Click to override</div>}
                  {/* Arrow */}
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] sm:text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-emerald-50 border border-emerald-300 rounded"></div>
            <span className="text-emerald-800 font-medium">✅ Qualified</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-rose-50 border border-rose-300 rounded"></div>
            <span className="text-rose-800 font-medium">❌ Not Qualified</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-amber-50 border border-amber-300 rounded"></div>
            <span className="text-amber-800 font-medium">🎁/📅 Exempt</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-gray-50 border border-gray-200 rounded"></div>
            <span className="text-gray-600 font-medium">⏳ Future</span>
          </div>
          {studentInfo && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-50 border border-blue-300 rounded"></div>
              <span className="text-blue-800 font-medium">✅🔧/❌🔧 Override</span>
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="mt-3 text-xs text-utsa-muted">
          {allDays.filter((d) => d.isExcluded).length > 0 && (
            <div>{allDays.filter((d) => d.isExcluded).length} exempt days are not counted toward progress.</div>
          )}
          {studentInfo && <div className="mt-1">Click eligible days to submit an override request.</div>}
        </div>
      </CardContent>

      {/* Override Modal */}
      {studentInfo && overrideModal.isOpen && (
        <DayOverrideModal
          isOpen={overrideModal.isOpen}
          onClose={() => setOverrideModal({ isOpen: false, dayInfo: null })}
          onSuccess={handleOverrideSuccess}
          dayInfo={overrideModal.dayInfo}
          studentInfo={studentInfo}
        />
      )}

      <Dialog
        open={mobileDayDetail.isOpen}
        onOpenChange={(open) => setMobileDayDetail((prev) => ({ ...prev, isOpen: open }))}
      >
        <DialogContent className="w-[calc(100%-1rem)] max-w-none left-1/2 top-auto bottom-2 translate-x-[-50%] translate-y-0 rounded-xl p-4 sm:top-[50%] sm:bottom-auto sm:max-w-lg sm:translate-y-[-50%]">
          {mobileDayDetail.day && (() => {
            const day = mobileDayDetail.day
            const override = overrideMap.get(day.day)
            const state = getDayState(day, day.day)
            const requestable = canRequestOverride(day)
            const currentIndex = mobileNavigableDays.findIndex((d) => d.day === day.day)
            const prevDay = currentIndex > 0 ? mobileNavigableDays[currentIndex - 1] : null
            const nextDay = currentIndex >= 0 && currentIndex < mobileNavigableDays.length - 1 ? mobileNavigableDays[currentIndex + 1] : null
            return (
              <div className="space-y-3">
                <div className="mx-auto h-1.5 w-12 rounded-full bg-gray-300" aria-hidden="true" />
                <DialogHeader className="text-left">
                  <DialogTitle className="text-base flex items-center gap-2">
                    <span aria-hidden="true">{getDayEmoji(state.symbol)}</span>
                    Day {day.day} • {formatShortDate(day.date)}
                  </DialogTitle>
                  <DialogDescription>{formatDate(day.date)}</DialogDescription>
                </DialogHeader>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={!prevDay}
                    onClick={() => {
                      if (!prevDay) return
                      setMobileDayDetail({ isOpen: true, day: prevDay })
                    }}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Prev Day
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={!nextDay}
                    onClick={() => {
                      if (!nextDay) return
                      setMobileDayDetail({ isOpen: true, day: nextDay })
                    }}
                  >
                    Next Day
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>

                <div className={`rounded-md border px-3 py-2 text-sm ${state.className}`}>
                  <div className="font-medium">{state.label}</div>
                  <div className="text-xs mt-1 opacity-90">{override ? `${day.reason} (override applied)` : day.reason}</div>
                </div>

                {!day.isExcluded && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md bg-utsa-surface px-3 py-2">
                      <div className="text-utsa-muted">Minutes</div>
                      <div className="font-semibold text-utsa-midnight">{day.minutes}</div>
                    </div>
                    <div className="rounded-md bg-utsa-surface px-3 py-2">
                      <div className="text-utsa-muted">Topics</div>
                      <div className="font-semibold text-utsa-midnight">{day.topics}</div>
                    </div>
                  </div>
                )}

                {day.isExcluded && (
                  <p className="text-xs text-utsa-muted">
                    {day.wouldHaveQualified
                      ? "This exempt day still earned extra credit."
                      : "This exempt day does not count toward progress."}
                  </p>
                )}

                {studentInfo && (
                  <Button
                    className="w-full"
                    disabled={!requestable}
                    onClick={() => {
                      if (!requestable) return
                      setMobileDayDetail({ isOpen: false, day: null })
                      setOverrideModal({ isOpen: true, dayInfo: buildOverrideDayInfo(day) })
                    }}
                  >
                    {requestable ? "Request Override for This Day" : "Override Not Available"}
                  </Button>
                )}
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
