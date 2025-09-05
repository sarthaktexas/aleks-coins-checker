import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"

type DailyLog = {
  day: number
  date: string
  qualified: boolean
  minutes: number
  topics: number
  reason: string
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
  for (let i = 0; i < totalDays; i++) {
    const dayNumber = i + 1
    let isQualified = true

    // Make specific days missed to create recovery scenario
    if (dayNumber === 3 || dayNumber === 8 || dayNumber === 17) {
      isQualified = false
    } else {
      // 85% chance of being qualified for other days
      isQualified = Math.random() > 0.15
    }

    const minutes = isQualified ? Math.floor(Math.random() * 40) + 31 : Math.floor(Math.random() * 30)
    const topics = isQualified ? Math.floor(Math.random() * 3) + 1 : Math.floor(Math.random() * 2)

    // Generate dates starting from May 31, 2025
    const startDate = new Date(2025, 4, 31) // May 31, 2025 (month is 0-indexed)
    const currentDate = new Date(startDate)
    currentDate.setDate(startDate.getDate() + (dayNumber - 1))
    const dateString = currentDate.toISOString().split("T")[0]

    let reason = ""
    if (isQualified) {
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
    })
  }

  const qualifiedDays = demoDailyLog.filter((d) => d.qualified).length
  const percentComplete = Math.round((qualifiedDays / totalDays) * 100 * 10) / 10

  return {
    name: "Demo Student",
    email: "demo@example.com",
    coins: demoCoins,
    totalDays,
    periodDays,
    percentComplete,
    dailyLog: demoDailyLog,
  }
}

async function loadStudentDataFromDB(): Promise<StudentData> {
  try {
    // Try to get data from database first
    const result = await sql`
      SELECT data FROM student_data 
      ORDER BY uploaded_at DESC 
      LIMIT 1
    `

    if (result.rows.length > 0) {
      console.log("Successfully loaded student data from database")
      return result.rows[0].data as StudentData
    }

    console.log("No data found in database, falling back to JSON file")

    // Fallback to JSON file if database is empty
    try {
      const studentsModule = await import("../../../data/students.json")
      return studentsModule.default
    } catch (fileError) {
      console.warn("Error reading students.json file:", fileError)
      return {}
    }
  } catch (error) {
    console.error("Error loading student data from database:", error)

    // Fallback to JSON file
    try {
      const studentsModule = await import("../../../data/students.json")
      return studentsModule.default
    } catch (fileError) {
      console.warn("Error reading students.json file:", fileError)
      return {}
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { studentId } = await request.json()

    console.log("Received student ID:", studentId)

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
        student: demoStudent,
      })
    }

    // Load student data from database or fallback to JSON
    const studentData = await loadStudentDataFromDB()

    if (Object.keys(studentData).length === 0) {
      return NextResponse.json(
        {
          error: "No student data available. Please contact your instructor.",
        },
        { status: 503 },
      )
    }

    console.log("Available student IDs:", Object.keys(studentData).slice(0, 10))
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
    return NextResponse.json(
      {
        error: "Internal server error. Please try again later.",
        details:
          process.env.NODE_ENV === "development"
            ? error instanceof Error
              ? error.message
              : "Unknown error"
            : undefined,
      },
      { status: 500 },
    )
  }
}
