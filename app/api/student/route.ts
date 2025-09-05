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
  }
}

// Get current year and define the same periods as in the script
const CURRENT_YEAR = new Date().getFullYear()

const EXAM_PERIODS = {
  summer2025_exam2: {
    name: `Summer ${CURRENT_YEAR} - Exam 2 Period`,
    startDate: `${CURRENT_YEAR}-06-24`,
    endDate: `${CURRENT_YEAR}-07-17`,
    excludedDates: [`${CURRENT_YEAR}-07-04`, `${CURRENT_YEAR}-07-05`, `${CURRENT_YEAR}-07-06`], // July 4th weekend
  },
}

function getWorkingDays(startDate: string, endDate: string, excludedDates: string[] = []) {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const excluded = new Set(excludedDates)
  const workingDays = []

  const currentDate = new Date(start)
  let dayNumber = 1

  while (currentDate <= end) {
    // Use local date string to avoid timezone issues
    const year = currentDate.getFullYear()
    const month = String(currentDate.getMonth() + 1).padStart(2, "0")
    const day = String(currentDate.getDate()).padStart(2, "0")
    const dateString = `${year}-${month}-${day}`

    // Add all days but mark excluded ones
    const isExcluded = excluded.has(dateString)

    workingDays.push({
      day: dayNumber,
      date: dateString,
      isExcluded,
    })

    console.log(`Day ${dayNumber}: ${dateString} ${isExcluded ? "(EXCLUDED)" : "(working)"}`)

    dayNumber++
    currentDate.setDate(currentDate.getDate() + 1)
  }

  return workingDays
}

function generateDemoData(): any {
  // Use the actual summer 2025 exam 2 period for demo
  const period = EXAM_PERIODS.summer2025_exam2
  const allDays = getWorkingDays(period.startDate, period.endDate, period.excludedDates)
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

  console.log("=== DEMO DATA GENERATION ===")
  console.log("Excluded dates:", period.excludedDates)
  console.log("Qualified calendar days:", Array.from(qualifiedCalendarDays))
  console.log("Missed calendar days:", Array.from(missedCalendarDays))
  console.log("Total days with data:", totalDays)

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
      console.log(`Day ${day} (${date}): EXCLUDED - no coins`)
    } else if (day <= totalDays) {
      // Regular working days with data - only these can earn coins
      if (qualifiedCalendarDays.has(day)) {
        // Qualified working day
        isQualified = true
        minutes = 35 + day * 2 // Vary the minutes slightly
        topics = 1 + (day % 3) // Vary topics 1-3
        reason = `✅ Met requirement: ${minutes} mins + ${topics} topic${topics !== 1 ? "s" : ""}`
        demoCoins++ // Only increment coins for qualified, non-excluded days
        console.log(
          `Day ${day} (${date}): QUALIFIED - ${minutes} mins, ${topics} topics - COIN EARNED (total: ${demoCoins})`,
        )
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
        console.log(`Day ${day} (${date}): NOT QUALIFIED - ${reason}`)
      }
    } else {
      // Future days (beyond totalDays)
      reason = "⏳ Future day"
      minutes = 0
      topics = 0
      console.log(`Day ${day} (${date}): FUTURE DAY`)
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

  console.log("=== FINAL DEMO STATS ===")
  console.log(`Total coins: ${demoCoins}`)
  console.log(`Qualified days: ${qualifiedDays}`)
  console.log(`Working days with data: ${workingDayLogs.length}`)
  console.log(`Excluded days: ${allDays.filter((d) => d.isExcluded).length}`)

  return {
    name: "Demo Student",
    email: "demo@example.com",
    coins: demoCoins, // Should be exactly 9
    totalDays: workingDayLogs.length,
    periodDays,
    percentComplete,
    dailyLog: demoDailyLog,
  }
}

async function loadStudentDataFromDB(): Promise<StudentData> {
  try {
    // Check if database URL is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      console.log("No database URL configured - database not available")
      return {}
    }

    console.log("Attempting to load student data from database...")

    // First, check if the table exists and has data
    const tableCheck = await sql`
      SELECT COUNT(*) as count FROM student_data
    `

    console.log("Table check result:", tableCheck.rows[0])

    if (tableCheck.rows[0].count === 0) {
      console.log("No data found in student_data table")
      return {}
    }

    // Get the most recent data
    const result = await sql`
      SELECT data, uploaded_at FROM student_data 
      ORDER BY uploaded_at DESC 
      LIMIT 1
    `

    if (result.rows.length === 0) {
      console.log("No rows returned from student_data table")
      return {}
    }

    const row = result.rows[0]
    console.log("Retrieved row with upload date:", row.uploaded_at)

    // Parse the JSON data
    let studentData: StudentData

    if (typeof row.data === "string") {
      studentData = JSON.parse(row.data)
    } else {
      // Data is already parsed as JSON
      studentData = row.data as StudentData
    }

    console.log("Successfully loaded student data from database")
    console.log("Number of students:", Object.keys(studentData).length)

    return studentData
  } catch (error) {
    console.error("Error loading student data from database:", error)

    // If it's a connection error or table doesn't exist error, return empty data
    if (error instanceof Error) {
      if (
        error.message.includes("missing_connection_string") ||
        error.message.includes('relation "student_data" does not exist') ||
        error.message.includes("POSTGRES_URL")
      ) {
        console.log("Database not configured or table doesn't exist - returning empty data")
        return {}
      }
    }

    throw error
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { studentId } = body

    console.log("Received student ID:", studentId)

    // Validate input
    if (!studentId || typeof studentId !== "string") {
      return NextResponse.json({ error: "Student ID is required" }, { status: 400 })
    }

    // For demo student, always return demo data
    const normalizedId = studentId.toLowerCase().trim()
    if (normalizedId === "abc123") {
      console.log("Returning demo student data")
      const demoStudent = generateDemoData()
      return NextResponse.json({
        success: true,
        student: demoStudent,
      })
    }

    // Load student data from database
    let studentData: StudentData

    try {
      studentData = await loadStudentDataFromDB()
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

    console.log("Available student IDs (first 10):", Object.keys(studentData).slice(0, 10))
    console.log("Looking for ID:", normalizedId)

    // Look up the student (case-insensitive)
    const student = studentData[normalizedId]

    if (!student) {
      console.log("Student not found for ID:", normalizedId)
      return NextResponse.json(
        {
          error: "Student ID not found. Please check your ID and try again.",
        },
        { status: 404 },
      )
    }

    console.log("Found student:", student.name)

    // Return the student's data including daily log
    return NextResponse.json({
      success: true,
      student: {
        name: student.name,
        email: student.email,
        coins: student.coins,
        totalDays: student.totalDays,
        periodDays: student.periodDays,
        percentComplete: student.percentComplete,
        dailyLog: student.dailyLog,
      },
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
