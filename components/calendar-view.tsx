"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar } from "lucide-react"
import { DayOverrideModal } from "@/components/day-override-modal"

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

type CalendarViewProps = {
  dailyLog: DailyLog[]
  totalDays: number
  periodDays: number
  studentInfo?: {
    studentId: string
    name: string
  }
}

export function CalendarView({ dailyLog, totalDays, periodDays, studentInfo }: CalendarViewProps) {
  const [overrides, setOverrides] = useState<DayOverride[]>([])
  const [overrideModal, setOverrideModal] = useState<{
    isOpen: boolean
    dayInfo: any
  }>({
    isOpen: false,
    dayInfo: null
  })

  // Create a map for quick lookup
  const logMap = new Map(dailyLog.map((log) => [log.day, log]))
  const overrideMap = new Map(overrides.map((override) => [override.day_number, override]))

  // Load overrides when studentInfo is available
  useEffect(() => {
    if (studentInfo?.studentId) {
      loadOverrides()
    }
  }, [studentInfo])

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
    if (dailyLog.length === 0) {
      return []
    }

    // Get start date from first day in dailyLog
    const firstDay = dailyLog[0]
    const [startYear, startMonth, startDay] = firstDay.date.split('-').map(Number)
    
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

    // Generate all days up to periodDays
    for (let i = 0; i < periodDays; i++) {
      // Create date string manually
      const dateString = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(currentDay).padStart(2, "0")}`

      // Check if this day has data
      const existingLog = logMap.get(dayNumber)

      if (existingLog) {
        // Use existing data
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

  const getDayColor = (day: DailyLog, dayNumber: number) => {
    const override = overrideMap.get(dayNumber)
    
    // Exempt days - special styling for those that would have qualified
    if (day.isExcluded) {
      if (day.wouldHaveQualified) {
        return "bg-amber-100 border-amber-300 text-amber-800 cursor-default ring-1 ring-amber-300"
      }
      return "bg-gray-200 border-gray-300 text-gray-500 cursor-default"
    }

    // Days without data are treated as future days
    if (day.reason === "⏳ No data available") {
      return "bg-gray-100 border-gray-200 text-gray-400 cursor-default"
    }

    // Check if there's an override for this day
    const isQualified = override ? override.override_type === "qualified" : day.qualified
    const hasOverride = !!override

    // Override days are always blue
    if (hasOverride) {
      const baseColor = "bg-blue-100 border-blue-300 text-blue-800"
      const hoverColor = "hover:bg-blue-200"
      const clickable = studentInfo ? "cursor-pointer" : "cursor-default"
      return `${baseColor} ${hoverColor} ${clickable} ring-1 ring-blue-300`
    }

    // Regular days with data (no overrides)
    if (isQualified) {
      const baseColor = "bg-green-100 border-green-300 text-green-800"
      const hoverColor = "hover:bg-green-200"
      const clickable = studentInfo ? "cursor-pointer" : "cursor-default"
      return `${baseColor} ${hoverColor} ${clickable}`
    } else {
      const baseColor = "bg-red-100 border-red-300 text-red-800"
      const hoverColor = "hover:bg-red-200"
      const clickable = studentInfo ? "cursor-pointer" : "cursor-default"
      return `${baseColor} ${hoverColor} ${clickable}`
    }
  }

  const getDayIcon = (day: DailyLog, dayNumber: number) => {
    if (day.isExcluded) {
      return day.wouldHaveQualified ? "🎁" : "📅" // Gift emoji for exempt days that would have qualified, calendar for others
    }

    // Days without data use clock icon
    if (day.reason === "⏳ No data available") {
      return "⏳" // Clock emoji for no data days
    }

    // Check if there's an override for this day
    const override = overrideMap.get(dayNumber)
    const isQualified = override ? override.override_type === "qualified" : day.qualified
    const hasOverride = !!override

    // Override days show checkmark and wrench
    if (hasOverride) {
      return "✅🔧" // Checkmark and wrench for overrides
    }

    return isQualified ? "✅" : "❌"
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

  const handleDayClick = (day: DailyLog) => {
    if (!studentInfo || day.isExcluded || day.reason === "⏳ No data available") {
      return // Don't allow clicking on exempt or no data days
    }

    const override = overrideMap.get(day.day)
    const isQualified = override ? override.override_type === "qualified" : day.qualified
    
    setOverrideModal({
      isOpen: true,
      dayInfo: {
        dayNumber: day.day,
        date: day.date,
        currentQualified: isQualified,
        currentReason: override ? override.reason || day.reason : day.reason
      }
    })
  }

  const handleOverrideSuccess = () => {
    loadOverrides() // Reload overrides after successful save
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
          {allDays.map((day) => {
            const override = overrideMap.get(day.day)
            const hasOverride = !!override
            const isQualified = override ? override.override_type === "qualified" : day.qualified
            const currentReason = override ? override.reason || day.reason : day.reason
            const canClick = studentInfo && !day.isExcluded && day.reason !== "⏳ No data available"
            
            
            return (
              <div
                key={day.day}
                className={`
                  relative aspect-square rounded-lg border-2 p-1 sm:p-2 transition-all duration-200
                  ${getDayColor(day, day.day)}
                  group
                `}
                onClick={() => handleDayClick(day)}
                title={`${formatDate(day.date)} - ${currentReason}${hasOverride ? ' (Override)' : ''}`}
              >
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="text-lg sm:text-xl mb-1">{getDayIcon(day, day.day)}</div>
                  <div className="text-xs sm:text-sm font-bold mb-1">Day {day.day}</div>
                  <div className="text-xs text-center leading-tight">{formatShortDate(day.date)}</div>
                  {hasOverride && (
                    <div className="text-xs text-blue-600 font-medium mt-1">Override</div>
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
                  {canClick && <div className="text-gray-300 text-xs mt-1">Click to override</div>}
                  {/* Arrow */}
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                </div>
              </div>
            )
          })}
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
            <div className="w-4 h-4 bg-amber-100 border-2 border-amber-300 rounded ring-1 ring-amber-300"></div>
            <span className="text-amber-800 font-medium">Extra Credit (🎁)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-200 border-2 border-gray-300 rounded"></div>
            <span className="text-gray-600 font-medium">Exempt Days (📅)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-100 border-2 border-gray-200 rounded"></div>
            <span className="text-gray-600 font-medium">No Data / Future Days (⏳)</span>
          </div>
          {studentInfo && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-100 border-2 border-blue-300 rounded ring-2 ring-blue-400"></div>
              <span className="text-blue-800 font-medium">Override (✅🔧)</span>
            </div>
          )}
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
    </Card>
  )
}
