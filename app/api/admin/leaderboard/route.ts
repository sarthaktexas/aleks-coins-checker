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

async function applyOverridesToStudentData(studentData: StudentData): Promise<StudentData> {
  try {
    const studentIds = Object.keys(studentData)
    
    if (studentIds.length === 0) {
      return studentData
    }

    // Get all overrides for students in the dataset
    const allOverrides = await sql`
      SELECT student_id, day_number, date, override_type, reason
      FROM student_day_overrides
    `
    const studentIdsSet = new Set(studentIds.map(id => id.toLowerCase()))
    const overridesResult = {
      rows: allOverrides.rows.filter(row => studentIdsSet.has(row.student_id.toLowerCase()))
    }

    const overridesMap = new Map<string, Map<string, any>>()
    
    overridesResult.rows.forEach(override => {
      if (!overridesMap.has(override.student_id)) {
        overridesMap.set(override.student_id, new Map())
      }
      overridesMap.get(override.student_id)!.set(override.date, override)
    })

    const updatedStudentData = { ...studentData }
    
    Object.keys(updatedStudentData).forEach(studentId => {
      const student = updatedStudentData[studentId]
      const studentOverrides = overridesMap.get(studentId)
      
      if (student.dailyLog) {
        // Apply overrides to daily log by matching date (not day_number) if they exist
        if (studentOverrides) {
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
        }

        // Always recalculate totals based on daily log (with or without overrides)
        const workingDayLogs = student.dailyLog.filter((d) => !d.isExcluded)
        const completedWorkingDays = workingDayLogs.length
        const qualifiedWorkingDays = workingDayLogs.filter((d) => d.qualified).length
        
        const exemptDayCredits = student.dailyLog.filter((d) => d.isExcluded && d.wouldHaveQualified).length
        
        // Include exempt day credits in percentage to allow over 100% for extra credit
        const percentComplete = completedWorkingDays > 0 ? Math.round(((qualifiedWorkingDays + exemptDayCredits) / completedWorkingDays) * 100 * 10) / 10 : 0
        
        student.percentComplete = percentComplete
        student.coins = qualifiedWorkingDays + exemptDayCredits
        student.exemptDayCredits = exemptDayCredits
      }
    })

    return updatedStudentData
  } catch (error) {
    console.error("Error applying overrides:", error)
    return studentData
  }
}

// Calculate average minutes per day for a student (excluding excluded days)
function calculateAvgMinutesPerDay(dailyLog: DailyLog[]): number {
  const workingDays = dailyLog.filter((d) => !d.isExcluded)
  if (workingDays.length === 0) return 0
  
  const totalMinutes = workingDays.reduce((sum, d) => sum + d.minutes, 0)
  return totalMinutes / workingDays.length
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const password = searchParams.get("password")
    const period = searchParams.get("period")
    const sectionNumber = searchParams.get("sectionNumber")
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "20")

    // Check admin password
    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 })
    }

    // Validate input
    if (!period || !sectionNumber) {
      return NextResponse.json({ error: "period and sectionNumber are required" }, { status: 400 })
    }

    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    // Get all student data for this period and section
    let result
    try {
      result = await sql`
        SELECT data, period, section_number
        FROM student_data
        WHERE period = ${period} AND COALESCE(section_number, 'default') = ${sectionNumber}
        ORDER BY uploaded_at DESC
        LIMIT 1
      `
    } catch (error) {
      console.error("Error querying student data:", error)
      return NextResponse.json({ error: "Failed to load student data" }, { status: 500 })
    }

    if (result.rows.length === 0) {
      return NextResponse.json({ 
        success: true,
        students: [],
        totalStudents: 0,
        totalPages: 0,
        currentPage: page,
        pageSize
      })
    }

    // Parse student data
    let studentData: StudentData
    const row = result.rows[0]
    if (typeof row.data === "string") {
      studentData = JSON.parse(row.data)
    } else {
      studentData = row.data as StudentData
    }

    // Apply overrides to all students
    studentData = await applyOverridesToStudentData(studentData)

    // Get all coin adjustments for all students in this period/section
    // Exclude redemptions (period = '__GLOBAL__' or null)
    const studentIds = Object.keys(studentData).map(id => id.toLowerCase())
    const studentIdsSet = new Set(studentIds)
    let coinAdjustments: any[] = []
    
    try {
      // Get all adjustments for this period/section (not redemptions)
      const adjustmentsResult = await sql`
        SELECT 
          student_id,
          adjustment_amount
        FROM coin_adjustments
        WHERE 
          period = ${period}
          AND COALESCE(section_number, 'default') = ${sectionNumber}
          AND is_active = true
          AND period IS NOT NULL
          AND period != '__GLOBAL__'
      `
      // Filter to only students in our dataset
      coinAdjustments = adjustmentsResult.rows.filter(adj => 
        studentIdsSet.has(adj.student_id.toLowerCase())
      )
    } catch (error) {
      console.error("Error fetching coin adjustments:", error)
      // Continue without adjustments if there's an error
    }

    // Create a map of adjustments by student ID
    const adjustmentsByStudent = new Map<string, number>()
    coinAdjustments.forEach(adj => {
      const studentId = adj.student_id.toLowerCase()
      const current = adjustmentsByStudent.get(studentId) || 0
      adjustmentsByStudent.set(studentId, current + adj.adjustment_amount)
    })

    // Calculate total coins for each student (excluding redemptions)
    // and calculate average minutes per day for tie-breaking
    const studentsWithCoins = Object.keys(studentData).map(sId => {
      const student = studentData[sId]
      const adjustment = adjustmentsByStudent.get(sId.toLowerCase()) || 0
      const totalCoins = student.coins + adjustment
      const avgMinutesPerDay = calculateAvgMinutesPerDay(student.dailyLog)
      
      return {
        studentId: sId.toLowerCase(),
        name: student.name,
        email: student.email,
        totalCoins,
        avgMinutesPerDay,
        baseCoins: student.coins,
        adjustments: adjustment,
        exemptDayCredits: student.exemptDayCredits || 0,
        percentComplete: student.percentComplete
      }
    })

    // Sort by total coins (descending), then by avg minutes per day (descending) for tie-breaking
    studentsWithCoins.sort((a, b) => {
      if (b.totalCoins !== a.totalCoins) {
        return b.totalCoins - a.totalCoins
      }
      // Tie-breaker: higher avg minutes per day wins
      return b.avgMinutesPerDay - a.avgMinutesPerDay
    })

    // Calculate pagination
    const totalStudents = studentsWithCoins.length
    const totalPages = Math.ceil(totalStudents / pageSize)
    const startIndex = (page - 1) * pageSize
    const endIndex = startIndex + pageSize
    const paginatedStudents = studentsWithCoins.slice(startIndex, endIndex)

    // Add rank to each student (1-based)
    const studentsWithRank = paginatedStudents.map((student, index) => ({
      ...student,
      rank: startIndex + index + 1
    }))

    return NextResponse.json({
      success: true,
      students: studentsWithRank,
      totalStudents,
      totalPages,
      currentPage: page,
      pageSize,
      period,
      sectionNumber
    })
  } catch (error) {
    console.error("Error processing leaderboard:", error)

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
