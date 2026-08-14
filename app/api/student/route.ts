import { type NextRequest, NextResponse } from "next/server"
import { unstable_cache } from "next/cache"
import { sql } from "@vercel/postgres"
import { STUDENT_DATA_CACHE_TAG } from "@/lib/student-cache"
import { countExemptCredits } from "@/lib/day-credits"
import { applyOverrideToDay, buildOverridesMap, normalizeOverrideDate } from "@/lib/day-overrides"

type DailyLog = {
  day: number
  date: string
  qualified: boolean
  minutes: number
  topics: number
  reason: string
  isExcluded?: boolean
  isCoinOnlyExempt?: boolean
  wouldHaveQualified?: boolean
}

type StudentData = {
  [key: string]: {
    name: string
    email: string
    coins: number
    totalDays: number
    periodDays: number
    percentComplete: number
    dailyLog: DailyLog[]
    exemptDayCredits?: number
    coinOnlyExemptCredits?: number
  }
}


function getWorkingDays(startDate: string, endDate: string, excludedDates: string[] = []) {
  // Parse dates manually to avoid timezone issues
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number)
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number)
  
  const excluded = new Set(excludedDates)
  const workingDays = []

  // Create current date object manually
  let currentYear = startYear
  let currentMonth = startMonth
  let currentDay = startDay
  let dayNumber = 1

  // Helper function to compare dates
  const isDateBeforeOrEqual = (year1: number, month1: number, day1: number, year2: number, month2: number, day2: number) => {
    if (year1 < year2) return true
    if (year1 > year2) return false
    if (month1 < month2) return true
    if (month1 > month2) return false
    return day1 <= day2
  }

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

  while (isDateBeforeOrEqual(currentYear, currentMonth, currentDay, endYear, endMonth, endDay)) {
    // Create date string manually
    const dateString = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(currentDay).padStart(2, "0")}`

    // Add all days but mark excluded ones
    const isExcluded = excluded.has(dateString)

    workingDays.push({
      day: dayNumber,
      date: dateString,
      isExcluded,
    })


    dayNumber++
    incrementDate()
  }

  return workingDays
}

function generateDemoData(): any {
  // Use hardcoded demo period dates (no hardcoded periods import)
  const period = {
    startDate: "2025-06-24",
    endDate: "2025-07-17", 
    excludedDates: ["2025-07-04", "2025-07-05", "2025-07-06"]
  }
  const allDays = getWorkingDays(period.startDate, period.endDate, [...period.excludedDates])
  const workingDays = allDays.filter((day) => !day.isExcluded)

  const totalDays = 20 // Increase to 20 so days 15-16 have data
  const periodDays = workingDays.length

  const demoDailyLog: DailyLog[] = []
  let demoCoins = 0

  // Fixed demo data - specify exactly which calendar days are qualified
  // Days 11, 12, 13 are July 4-6 (excluded)
  // Days 15, 16 should be working days with data (not future days)
  const qualifiedCalendarDays = new Set([1, 2, 4, 5, 7, 8, 9, 14, 15]) // 9 qualified days
  const missedCalendarDays = new Set([3, 6, 10, 16, 17, 18, 19, 20]) // Days with data but not qualified


  // Process all days (including excluded ones)
  allDays.forEach(({ day, date, isExcluded }) => {
    let isQualified = false
    let minutes = 0
    let topics = 0
    let reason = ""

    if (isExcluded) {
      // Excluded days don't count toward qualification, even if they have data
      isQualified = false
      reason = "📅 Exempt day - does not count toward progress"
      // Give some data for excluded days (but no coins)
      minutes = 45
      topics = 2
    } else if (day <= totalDays) {
      // Regular working days with data - only these can earn coins
      if (qualifiedCalendarDays.has(day)) {
        // Qualified working day
        isQualified = true
        minutes = 35 + day * 2 // Vary the minutes slightly
        topics = 1 + (day % 3) // Vary topics 1-3
        reason = `✅ Met requirement: ${minutes} mins + ${topics} topic${topics !== 1 ? "s" : ""}`
        demoCoins++ // Only increment coins for qualified, non-excluded days
      } else {
        // Missed working day - has data but not qualified
        isQualified = false
        if (day % 2 === 0) {
          minutes = 25 // Not enough minutes
          topics = 2
          reason = `❌ Not enough: ${minutes} mins (needs 31 mins)`
        } else {
          minutes = 35 // Enough minutes but no topics
          topics = 0
          reason = `❌ Not enough: ${topics} topics (needs 1 topic)`
        }
      }
    } else {
      // Days beyond totalDays are treated the same as days with no data
      reason = "⏳ No data available"
      minutes = 0
      topics = 0
    }

    demoDailyLog.push({
      day,
      date,
      qualified: isQualified,
      minutes,
      topics,
      reason,
      isExcluded,
    })
  })

  // Calculate percentage based only on working days that have data
  const workingDayLogs = demoDailyLog.filter((d) => !d.isExcluded && d.day <= totalDays)
  const qualifiedDays = workingDayLogs.filter((d) => d.qualified).length
  const percentComplete =
    workingDayLogs.length > 0 ? Math.round((qualifiedDays / workingDayLogs.length) * 100 * 10) / 10 : 0


  return {
    name: "Demo Student",
    email: "demo@example.com",
    coins: demoCoins, // Should be exactly 9
    totalDays: workingDayLogs.length,
    periodDays,
    percentComplete,
    dailyLog: demoDailyLog,
    periodInfo: {
      startDate: period.startDate,
      endDate: period.endDate,
      excludedDates: period.excludedDates,
    },
  }
}

type PeriodEntry = {
  period: string
  section: string
  data: StudentData[string]
  uploadedAt: string
}

type StudentLoadResult = {
  studentData: StudentData
  periodInfo: {
    period: string
    section_number: string
    uploaded_at: string
  } | null
  /** Plain array so unstable_cache can serialize it (Maps become {}) */
  periods: PeriodEntry[]
}

/**
 * Pull only one student's JSON slice from each upload row.
 * Previously this selected the entire class blob on every lookup (huge Neon egress).
 */
async function loadStudentSliceFromDB(studentId: string): Promise<StudentLoadResult> {
  if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
    return { studentData: {}, periodInfo: null, periods: [] }
  }

  // data->id returns only that student's object; data ? id filters rows that contain them
  const result = await sql`
    SELECT
      data->${studentId} AS student,
      period,
      COALESCE(section_number, 'default') AS section_number,
      uploaded_at
    FROM student_data
    WHERE data ? ${studentId}
    ORDER BY uploaded_at DESC
  `

  if (result.rows.length === 0) {
    return { studentData: {}, periodInfo: null, periods: [] }
  }

  const periods: PeriodEntry[] = []
  const processedPeriods = new Set<string>()
  let studentData: StudentData = {}
  let latestPeriodInfo: StudentLoadResult["periodInfo"] = null

  for (const row of result.rows) {
    const periodKey = `${row.period}_${row.section_number || "default"}`
    if (processedPeriods.has(periodKey)) continue
    processedPeriods.add(periodKey)

    let student = row.student
    if (typeof student === "string") {
      student = JSON.parse(student)
    }
    if (!student) continue

    periods.push({
      period: row.period,
      section: row.section_number || "default",
      data: student,
      uploadedAt: row.uploaded_at,
    })

    if (!studentData[studentId]) {
      studentData[studentId] = student
    }

    if (!latestPeriodInfo || new Date(row.uploaded_at) > new Date(latestPeriodInfo.uploaded_at)) {
      latestPeriodInfo = {
        period: row.period,
        section_number: row.section_number || "default",
        uploaded_at: row.uploaded_at,
      }
    }
  }

  return { studentData, periodInfo: latestPeriodInfo, periods }
}

async function loadStudentDataFromDB(studentId: string): Promise<StudentLoadResult> {
  try {
    return await unstable_cache(
      () => loadStudentSliceFromDB(studentId),
      ["student-slice", studentId],
      { revalidate: 300, tags: [STUDENT_DATA_CACHE_TAG, `student-${studentId}`] }
    )()
  } catch (error) {
    console.error("Error loading student data from database:", error)

    if (error instanceof Error) {
      if (
        error.message.includes("missing_connection_string") ||
        error.message.includes('relation "student_data" does not exist') ||
        error.message.includes("POSTGRES_URL")
      ) {
        return { studentData: {}, periodInfo: null, periods: [] }
      }
    }

    throw error
  }
}

function applyOverridesInMemory(
  studentData: StudentData,
  overrides: Array<{
    student_id: string
    day_number: number
    date: string
    override_type: string
    reason: string
  }>
): StudentData {
  const overridesMap = buildOverridesMap(overrides)

  // Clone so we never mutate objects stored in unstable_cache
  const updatedStudentData: StudentData = JSON.parse(JSON.stringify(studentData))

  Object.keys(updatedStudentData).forEach((id) => {
    const student = updatedStudentData[id]
    const studentOverrides = overridesMap.get(id.toLowerCase())

    if (!student.dailyLog) return

    if (studentOverrides) {
      student.dailyLog = student.dailyLog.map((day) => {
        const override = studentOverrides.get(normalizeOverrideDate(day.date))
        if (override) return applyOverrideToDay(day, override)
        return day
      })
    }

    const workingDayLogs = student.dailyLog.filter((d) => !d.isExcluded)
    const completedWorkingDays = workingDayLogs.length
    const qualifiedWorkingDays = workingDayLogs.filter((d) => d.qualified).length
    const { exemptDayCredits, coinOnlyExemptCredits } = countExemptCredits(student.dailyLog)
    const percentComplete =
      completedWorkingDays > 0
        ? Math.round(
            ((qualifiedWorkingDays + exemptDayCredits) / completedWorkingDays) * 100 * 10
          ) / 10
        : 0

    student.percentComplete = percentComplete
    student.coins = qualifiedWorkingDays + exemptDayCredits + coinOnlyExemptCredits
    student.exemptDayCredits = exemptDayCredits
    student.coinOnlyExemptCredits = coinOnlyExemptCredits
  })

  return updatedStudentData
}

async function fetchStudentOverrides(studentId: string) {
  try {
    const overridesResult = await sql`
      SELECT student_id, day_number, date, override_type, reason
      FROM student_day_overrides
      WHERE student_id = ${studentId}
    `
    return overridesResult.rows as Array<{
      student_id: string
      day_number: number
      date: string
      override_type: string
      reason: string
    }>
  } catch (error) {
    console.error("Error applying overrides:", error)
    return []
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { studentId } = body


    // Validate input
    if (!studentId || typeof studentId !== "string") {
      return NextResponse.json({ error: "Student ID is required" }, { status: 400 })
    }

    // For demo student, always return demo data
    const normalizedId = studentId.toLowerCase().trim()
    if (normalizedId === "abc123") {
      const demoStudent = generateDemoData()
      return NextResponse.json({
        success: true,
        student: {
          ...demoStudent,
          period: 'Fall 2024',
          sectionNumber: 'default'
        },
      })
    }

    // Load student data from database
    let studentData: StudentData
    let periodInfo: any
    let allPeriods: PeriodEntry[] = []
    let overrides: Awaited<ReturnType<typeof fetchStudentOverrides>> = []

    try {
      const result = await loadStudentDataFromDB(normalizedId)
      studentData = result.studentData
      periodInfo = result.periodInfo
      allPeriods = result.periods

      // One overrides query for this student, applied to all periods in memory
      overrides = await fetchStudentOverrides(normalizedId)
      studentData = applyOverridesInMemory(studentData, overrides)
    } catch (dbError) {
      console.error("Database error:", dbError)

      // If database is not configured, just show a message about demo mode
      if (
        dbError instanceof Error &&
        (dbError.message.includes("missing_connection_string") || dbError.message.includes("POSTGRES_URL"))
      ) {
        return NextResponse.json(
          {
            error: "Database not configured. Only demo student (abc123) is available in preview mode.",
          },
          { status: 503 },
        )
      }

      return NextResponse.json(
        {
          error: "Database connection error. Please contact your instructor.",
          details: process.env.NODE_ENV === "development" ? (dbError as Error).message : undefined,
        },
        { status: 503 },
      )
    }

    if (Object.keys(studentData).length === 0) {
      return NextResponse.json(
        {
          error:
            "No student data available. Please use demo student (abc123) or contact your instructor to upload data.",
        },
        { status: 503 },
      )
    }


    // Look up the student (case-insensitive)
    const student = studentData[normalizedId]

    if (!student) {
      return NextResponse.json(
        {
          error: "Student ID not found. Please check your ID and try again.",
        },
        { status: 404 },
      )
    }

    // Get all periods for this student
    allPeriods = [...allPeriods].sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    )
    
    // Get coin adjustments for this student
    let coinAdjustments: any[] = []
    try {
      const adjustmentsResult = await sql`
        SELECT 
          id,
          period,
          section_number,
          adjustment_amount,
          reason,
          created_at,
          created_by
        FROM coin_adjustments
        WHERE student_id = ${normalizedId} AND is_active = true
        ORDER BY created_at DESC
      `
      coinAdjustments = adjustmentsResult.rows
    } catch (error) {
      console.error("Error fetching coin adjustments:", error)
    }

    // Create a map of adjustments by period and section
    // Separate global adjustments (redemptions with NULL period) from period-specific adjustments
    const adjustmentsByPeriod = new Map<string, number>()
    let globalAdjustments = 0 // Redemptions that deduct from total, not specific periods
    let totalAdjustments = 0
    
    coinAdjustments.forEach(adj => {
      // If period is '__GLOBAL__', it's a global adjustment (redemption) that affects total only
      if (adj.period === '__GLOBAL__' || adj.period === null || adj.period === undefined) {
        globalAdjustments += adj.adjustment_amount
        totalAdjustments += adj.adjustment_amount
      } else {
        // Period-specific adjustment
        const key = `${adj.period}_${adj.section_number}`
        const current = adjustmentsByPeriod.get(key) || 0
        adjustmentsByPeriod.set(key, current + adj.adjustment_amount)
        totalAdjustments += adj.adjustment_amount
      }
    })
    
    // Fetch exam period names for display (period_key -> name) — cached
    const periodNamesMap = new Map<string, string>()
    try {
      const periodRows = await unstable_cache(
        async () => {
          const periodsResult = await sql`
            SELECT period_key, name FROM exam_periods
          `
          return periodsResult.rows as Array<{ period_key: string; name: string }>
        },
        ["exam-period-names"],
        { revalidate: 3600, tags: [STUDENT_DATA_CACHE_TAG, "exam-periods"] }
      )()
      periodRows.forEach((row) => {
        periodNamesMap.set(row.period_key, row.name)
      })
    } catch (e) {
      console.error("Error fetching period names:", e)
    }

    // Format periods data with overrides applied once (no extra DB round-trips)
    const periodsData = allPeriods.map((periodData) => {
      const tempStudentData = { [normalizedId]: periodData.data }
      const overriddenData = applyOverridesInMemory(tempStudentData, overrides)
      const studentWithOverrides = overriddenData[normalizedId]

      const periodKey = `${periodData.period}_${periodData.section}`
      const adjustment = adjustmentsByPeriod.get(periodKey) || 0
      const periodName =
        periodNamesMap.get(periodData.period) ??
        periodData.period.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())

      return {
        period: periodData.period,
        section: periodData.section,
        periodName,
        name: studentWithOverrides.name,
        email: studentWithOverrides.email,
        coins: studentWithOverrides.coins,
        coinAdjustment: adjustment,
        totalCoins: studentWithOverrides.coins + adjustment,
        totalDays: studentWithOverrides.totalDays,
        periodDays: studentWithOverrides.periodDays,
        percentComplete: studentWithOverrides.percentComplete,
        dailyLog: studentWithOverrides.dailyLog,
        exemptDayCredits: studentWithOverrides.exemptDayCredits,
        coinOnlyExemptCredits: studentWithOverrides.coinOnlyExemptCredits,
        uploadedAt: periodData.uploadedAt,
      }
    })

    // Calculate total coins across all periods with period-specific adjustments
    // Then add global adjustments (redemptions) which deduct from the total, not individual periods
    const totalCoinsFromPeriods = periodsData.reduce((sum, p) => sum + p.totalCoins, 0)
    // Clamp to 0 minimum - students can't have negative coins
    const totalCoinsAcrossPeriods = Math.max(0, totalCoinsFromPeriods + globalAdjustments)
    
    // Get the student's section number from their actual period data
    // Use the most recent period's section (first in allPeriods since it's sorted by upload date)
    const studentSectionNumber = allPeriods.length > 0 
      ? allPeriods[0].section 
      : (periodInfo?.section_number || 'default')
    
    // Get current period adjustment
    const currentPeriodKey = `${periodInfo?.period || 'Unknown'}_${studentSectionNumber}`
    const currentPeriodAdjustment = adjustmentsByPeriod.get(currentPeriodKey) || 0
    
    // Get all requests for this student in one query
    let pendingRequests: any[] = []
    let approvedRequests: any[] = []
    let rejectedRequests: any[] = []
    try {
      const requestsResult = await sql`
        SELECT 
          id,
          request_type,
          request_details,
          submitted_at,
          status,
          admin_notes,
          processed_at,
          processed_by,
          period,
          section_number,
          day_number,
          override_date
        FROM student_requests
        WHERE student_id = ${normalizedId}
        ORDER BY submitted_at DESC
      `
      pendingRequests = requestsResult.rows.filter((r) => r.status === "pending")
      approvedRequests = requestsResult.rows.filter((r) => r.status === "approved")
      rejectedRequests = requestsResult.rows.filter((r) => r.status === "rejected")
    } catch (requestError) {
      console.error("Error fetching student requests:", requestError)
    }
    
    // Return the student's data including all periods
    return NextResponse.json({
      success: true,
      student: {
        name: student.name,
        email: student.email,
        coins: student.coins,
        coinAdjustment: currentPeriodAdjustment,
        totalCoins: student.coins + currentPeriodAdjustment,
        totalDays: student.totalDays,
        periodDays: student.periodDays,
        percentComplete: student.percentComplete,
        dailyLog: student.dailyLog,
        period: periodInfo?.period || 'Unknown',
        sectionNumber: studentSectionNumber,
        exemptDayCredits: student.exemptDayCredits,
        coinOnlyExemptCredits: student.coinOnlyExemptCredits,
        uploadedAt: periodInfo?.uploaded_at || allPeriods[0]?.uploadedAt || null,
      },
      periods: periodsData,
      coinAdjustments: coinAdjustments,
      totalCoinsAcrossPeriods: totalCoinsAcrossPeriods,
      pendingRequests: pendingRequests,
      approvedRequests: approvedRequests,
      rejectedRequests: rejectedRequests
    })
  } catch (error) {
    console.error("Error processing student lookup:", error)

    let errorMessage = "Internal server error. Please try again later."
    let errorDetails = undefined

    if (error instanceof Error) {
      if (error.message.includes("JSON")) {
        errorMessage = "Invalid request format. Please try again."
      }

      if (process.env.NODE_ENV === "development") {
        errorDetails = error.message
      }
    }

    return NextResponse.json(
      {
        error: errorMessage,
        details: errorDetails,
      },
      { status: 500 },
    )
  }
}
