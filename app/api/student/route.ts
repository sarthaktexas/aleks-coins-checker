import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"

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

async function loadStudentDataFromDB(): Promise<{ studentData: StudentData, periodInfo: any, studentPeriods?: Map<string, Array<{ period: string, section: string, data: any, uploadedAt: string }>> }> {
  try {
    // Check if database URL is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return { studentData: {}, periodInfo: null }
    }

    // First, check if the table exists and has data
    const tableCheck = await sql`
      SELECT COUNT(*) as count FROM student_data
    `

    if (tableCheck.rows[0].count === 0) {
      return { studentData: {}, periodInfo: null }
    }

    // Get all data from all sections and merge them
    const result = await sql`
      SELECT data, period, section_number, uploaded_at FROM student_data 
      ORDER BY uploaded_at DESC
    `

    if (result.rows.length === 0) {
      return { studentData: {}, periodInfo: null }
    }

    console.log(`Found ${result.rows.length} data uploads, processing from newest to oldest`)
    console.log(`Data replacement strategy: Keep all exam periods per student, replace data for same period/section`)
    
    // Log all uploads to see what periods we have
    result.rows.forEach((row, index) => {
      console.log(`Upload ${index + 1}: period=${row.period}, section=${row.section_number}, uploaded_at=${row.uploaded_at}`)
    })

    // Track multiple periods per student
    const studentPeriods = new Map<string, Array<{ period: string, section: string, data: any, uploadedAt: string }>>()
    
    // Load student data - keep most recent upload, but track all periods per student
    let studentData: StudentData = {}
    let latestPeriodInfo: any = null
    const processedPeriods = new Set<string>()

    for (const row of result.rows) {
      
      // Parse the JSON data for this row
      let rowStudentData: StudentData
      if (typeof row.data === "string") {
        rowStudentData = JSON.parse(row.data)
      } else {
        rowStudentData = row.data as StudentData
      }

      // Create a unique key for this period and section combination
      const periodKey = `${row.period}_${row.section_number || 'default'}`
      
      // Only process this data if we haven't seen this period/section combination yet
      // Since we're processing newest first, this ensures we get the latest data for each period
      if (!processedPeriods.has(periodKey)) {
        // Add all students from this period/section to the period tracking
        Object.keys(rowStudentData).forEach(studentId => {
          if (!studentPeriods.has(studentId)) {
            studentPeriods.set(studentId, [])
          }
          
          studentPeriods.get(studentId)!.push({
            period: row.period,
            section: row.section_number || 'default',
            data: rowStudentData[studentId],
            uploadedAt: row.uploaded_at
          })
          
          // For backward compatibility, keep the latest upload in the main studentData object
          if (!studentData[studentId]) {
            studentData[studentId] = rowStudentData[studentId]
          }
        })
        
        processedPeriods.add(periodKey)
        console.log(`Loaded data for period: ${row.period}, section: ${row.section_number || 'default'} (uploaded at ${row.uploaded_at})`)
        
      }

      // Keep track of the most recent period info
      if (!latestPeriodInfo || new Date(row.uploaded_at) > new Date(latestPeriodInfo.uploaded_at)) {
        latestPeriodInfo = {
          period: row.period,
          section_number: row.section_number,
          uploaded_at: row.uploaded_at
        }
      }
    }

    console.log(`Processed ${processedPeriods.size} unique period/section combinations: ${Array.from(processedPeriods).join(', ')}`)


    // Return student data with period info and all periods per student
    return { 
      studentData,
      periodInfo: latestPeriodInfo,
      studentPeriods
    }
  } catch (error) {
    console.error("Error loading student data from database:", error)

    // If it's a connection error or table doesn't exist error, return empty data
    if (error instanceof Error) {
      if (
        error.message.includes("missing_connection_string") ||
        error.message.includes('relation "student_data" does not exist') ||
        error.message.includes("POSTGRES_URL")
      ) {
        return { studentData: {}, periodInfo: null }
      }
    }

    throw error
  }
}

async function applyOverridesToStudentData(studentData: StudentData): Promise<StudentData> {
  try {
    // Get all overrides including date field to match by date instead of day_number
    // This ensures overrides from one period don't apply to another period
    const overridesResult = await sql`
      SELECT student_id, day_number, date, override_type, reason
      FROM student_day_overrides
    `

    // Group overrides by student_id and date (not day_number, since day numbers are period-specific)
    const overridesMap = new Map<string, Map<string, any>>()
    
    overridesResult.rows.forEach(override => {
      if (!overridesMap.has(override.student_id)) {
        overridesMap.set(override.student_id, new Map())
      }
      // Use date as the key instead of day_number to match the correct period
      overridesMap.get(override.student_id)!.set(override.date, override)
    })

    // Apply overrides to each student's daily log
    const updatedStudentData = { ...studentData }
    
    Object.keys(updatedStudentData).forEach(studentId => {
      const student = updatedStudentData[studentId]
      const studentOverrides = overridesMap.get(studentId)
      
      if (studentOverrides && student.dailyLog) {
        // Apply overrides to daily log by matching date (not day_number)
        student.dailyLog = student.dailyLog.map(day => {
          const override = studentOverrides.get(day.date)
          if (override) {
            return {
              ...day,
              qualified: override.override_type === "qualified",
              reason: override.reason || day.reason
            }
          }
          return day
        })

        // Recalculate totals based on updated daily log
        const workingDayLogs = student.dailyLog.filter((d) => !d.isExcluded)
        const completedWorkingDays = workingDayLogs.length
        const qualifiedWorkingDays = workingDayLogs.filter((d) => d.qualified).length
        const percentComplete = completedWorkingDays > 0 ? Math.round((qualifiedWorkingDays / completedWorkingDays) * 100 * 10) / 10 : 0
        
        // Calculate exempt day credits (from days that would have qualified on exempt days)
        const exemptDayCredits = student.dailyLog.filter((d) => d.isExcluded && d.wouldHaveQualified).length
        
        // Don't overwrite totalDays - it should remain the max day number with data
        // student.totalDays should stay as the original value (max day number with data)
        student.percentComplete = percentComplete
        student.coins = qualifiedWorkingDays + exemptDayCredits
        student.exemptDayCredits = exemptDayCredits
      }
    })

    return updatedStudentData
  } catch (error) {
    console.error("Error applying overrides:", error)
    return studentData // Return original data if override application fails
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
    let studentPeriods: Map<string, Array<{ period: string, section: string, data: any, uploadedAt: string }>> | undefined

    try {
      const result = await loadStudentDataFromDB()
      studentData = result.studentData
      periodInfo = result.periodInfo
      studentPeriods = result.studentPeriods
      
      // Apply overrides to student data
      studentData = await applyOverridesToStudentData(studentData)
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
    const allPeriods = studentPeriods?.get(normalizedId) || []
    
    // Sort periods by upload date (most recent first)
    allPeriods.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
    
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
    
    // Format periods data with overrides applied
    const periodsData = await Promise.all(allPeriods.map(async (periodData) => {
      // Apply overrides to this period's data
      const tempStudentData = { [normalizedId]: periodData.data }
      const overriddenData = await applyOverridesToStudentData(tempStudentData)
      const studentWithOverrides = overriddenData[normalizedId]
      
      // Add coin adjustments for this period
      const periodKey = `${periodData.period}_${periodData.section}`
      const adjustment = adjustmentsByPeriod.get(periodKey) || 0
      
      return {
        period: periodData.period,
        section: periodData.section,
        name: studentWithOverrides.name,
        email: studentWithOverrides.email,
        coins: studentWithOverrides.coins,
        coinAdjustment: adjustment,
        totalCoins: studentWithOverrides.coins + adjustment,
        totalDays: studentWithOverrides.totalDays,
        periodDays: studentWithOverrides.periodDays,
        percentComplete: studentWithOverrides.percentComplete,
        dailyLog: studentWithOverrides.dailyLog,
        exemptDayCredits: studentWithOverrides.exemptDayCredits
      }
    }))

    // Calculate total coins across all periods with period-specific adjustments
    // Then add global adjustments (redemptions) which deduct from the total, not individual periods
    const totalCoinsFromPeriods = periodsData.reduce((sum, p) => sum + p.totalCoins, 0)
    const totalCoinsAcrossPeriods = totalCoinsFromPeriods + globalAdjustments
    
    // Get current period adjustment
    const currentPeriodKey = `${periodInfo?.period || 'Unknown'}_${periodInfo?.section_number || 'default'}`
    const currentPeriodAdjustment = adjustmentsByPeriod.get(currentPeriodKey) || 0
    
    // Get pending requests for this student
    let pendingRequests = []
    try {
      const requestsResult = await sql`
        SELECT 
          id,
          request_type,
          request_details,
          submitted_at,
          status
        FROM student_requests
        WHERE student_id = ${normalizedId} AND status = 'pending'
        ORDER BY submitted_at DESC
      `
      pendingRequests = requestsResult.rows
    } catch (requestError) {
      console.error("Error fetching pending requests:", requestError)
      // Continue without pending requests if there's an error
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
        sectionNumber: periodInfo?.section_number || 'default',
        exemptDayCredits: student.exemptDayCredits
      },
      periods: periodsData,
      coinAdjustments: coinAdjustments,
      totalCoinsAcrossPeriods: totalCoinsAcrossPeriods,
      pendingRequests: pendingRequests
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
