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

function generateDemoData(): any {
  const demoDailyLog: DailyLog[] = []
  let demoCoins = 0
  const totalDays = 17
  const periodDays = 24

  // Generate demo data for 17 days with recovery scenario (3 missed days)
  for (let i = 0; i < totalDays + 7; i++) {
    // Show some future days too
    const dayNumber = i + 1
    let isQualified = false
    let isExcluded = false

    // Make some days exempt (like weekends or holidays)
    if (dayNumber === 7 || dayNumber === 14 || dayNumber === 21) {
      isExcluded = true
    } else if (dayNumber <= totalDays) {
      // Make specific days missed to create recovery scenario
      if (dayNumber === 3 || dayNumber === 8 || dayNumber === 17) {
        isQualified = false
      } else {
        // 85% chance of being qualified for other days
        isQualified = Math.random() > 0.15
      }
    }

    const minutes = isQualified ? Math.floor(Math.random() * 40) + 31 : Math.floor(Math.random() * 30)
    const topics = isQualified ? Math.floor(Math.random() * 3) + 1 : Math.floor(Math.random() * 2)

    // Generate dates starting from current year
    const currentYear = new Date().getFullYear()
    const startDate = new Date(currentYear, 4, 31) // May 31 of current year
    const currentDate = new Date(startDate)
    currentDate.setDate(startDate.getDate() + (dayNumber - 1))
    const dateString = currentDate.toISOString().split("T")[0]

    let reason = ""
    if (isExcluded) {
      reason = "📅 Exempt day - does not count toward progress"
    } else if (dayNumber > totalDays) {
      reason = "⏳ Future day"
    } else if (isQualified) {
      reason = `✅ Met requirement: ${minutes} mins + ${topics} topic${topics !== 1 ? "s" : ""}`
      demoCoins++
    } else {
      if (minutes < 31 && topics < 1) {
        reason = `❌ Not enough: ${minutes} mins (needs 31 mins) and ${topics} topics (needs 1 topic)`
      } else if (minutes < 31) {
        reason = `❌ Not enough: ${minutes} mins (needs 31 mins)`
      } else {
        reason = `❌ Not enough: ${topics} topics (needs 1 topic)`
      }
    }

    demoDailyLog.push({
      day: dayNumber,
      date: dateString,
      qualified: isQualified,
      minutes,
      topics,
      reason,
      isExcluded,
    })
  }

  // Calculate percentage based only on working days
  const workingDayLogs = demoDailyLog.filter((d) => !d.isExcluded && d.day <= totalDays)
  const qualifiedDays = workingDayLogs.filter((d) => d.qualified).length
  const percentComplete =
    workingDayLogs.length > 0 ? Math.round((qualifiedDays / workingDayLogs.length) * 100 * 10) / 10 : 0

  return {
    name: "Demo Student",
    email: "demo@example.com",
    coins: demoCoins,
    totalDays: workingDayLogs.length,
    periodDays,
    percentComplete,
    dailyLog: demoDailyLog,
  }
}

async function loadStudentDataFromDB(): Promise<StudentData> {
  try {
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

    // If it's a table doesn't exist error, return empty data
    if (error instanceof Error && error.message.includes('relation "student_data" does not exist')) {
      console.log("student_data table does not exist yet")
      return {}
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
          error: "No student data available. Please contact your instructor to upload data.",
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
