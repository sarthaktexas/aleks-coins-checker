import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"
import { parse, format, addDays, differenceInDays } from "date-fns"
import xlsx from "xlsx"

// Predefined exam periods with excluded dates
const EXAM_PERIODS = {
  "exam1-fall2024": {
    name: "Exam 1 - Fall 2024",
    startDate: "2024-08-26",
    endDate: "2024-09-20",
    excludedDates: ["2024-09-02"], // Labor Day
  },
  "exam2-fall2024": {
    name: "Exam 2 - Fall 2024",
    startDate: "2024-09-23",
    endDate: "2024-10-18",
    excludedDates: [],
  },
  "exam3-fall2024": {
    name: "Exam 3 - Fall 2024",
    startDate: "2024-10-21",
    endDate: "2024-11-15",
    excludedDates: [],
  },
  "final-fall2024": {
    name: "Final Exam - Fall 2024",
    startDate: "2024-11-18",
    endDate: "2024-12-06",
    excludedDates: ["2024-11-25", "2024-11-26", "2024-11-27", "2024-11-28", "2024-11-29"], // Thanksgiving week
  },
  "exam1-spring2025": {
    name: "Exam 1 - Spring 2025",
    startDate: "2025-01-21",
    endDate: "2025-02-14",
    excludedDates: ["2025-01-20"], // MLK Day
  },
  "exam2-spring2025": {
    name: "Exam 2 - Spring 2025",
    startDate: "2025-02-17",
    endDate: "2025-03-14",
    excludedDates: ["2025-02-17"], // Presidents Day
  },
  "exam3-spring2025": {
    name: "Exam 3 - Spring 2025",
    startDate: "2025-03-24",
    endDate: "2025-04-18",
    excludedDates: [],
  },
  "final-spring2025": {
    name: "Final Exam - Spring 2025",
    startDate: "2025-04-21",
    endDate: "2025-05-09",
    excludedDates: [],
  },
  "exam1-summer2025": {
    name: "Exam 1 - Summer 2025",
    startDate: "2025-05-31",
    endDate: "2025-06-27",
    excludedDates: [],
  },
  "exam2-summer2025": {
    name: "Exam 2 - Summer 2025",
    startDate: "2025-06-30",
    endDate: "2025-07-25",
    excludedDates: ["2025-07-04"], // Independence Day
  },
}

// Utility function
function timeToMinutes(time: any) {
  if (!time || typeof time !== "string") return 0
  const parts = time.split(":")
  return Number.parseInt(parts[0]) * 60 + Number.parseInt(parts[1])
}

// Process students
async function processExcelData(buffer: Buffer, period: any, excludedDatesArray: string[]) {
  const MIN_MINUTES = 31
  const MIN_TOPICS = 1

  const startDate = parse(period.startDate, "yyyy-MM-dd", new Date())
  const endDate = parse(period.endDate, "yyyy-MM-dd", new Date())
  const excludedDates = new Set([...period.excludedDates, ...excludedDatesArray])

  // Calculate total days excluding the excluded dates
  const totalDaysInPeriod = differenceInDays(endDate, startDate) + 1
  const excludedCount = excludedDates.size
  const workingDays = totalDaysInPeriod - excludedCount

  // Load workbook from buffer
  const wb = xlsx.read(buffer, { type: "buffer" })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const data = xlsx.utils.sheet_to_json(sheet, { range: 3 })

  // Detect max day index from all rows
  let maxDay = 0
  data.forEach((row: any) => {
    Object.keys(row).forEach((key) => {
      const match = key.match(/^h:mm_(\d+)$/)
      if (match) {
        const dayNum = Number.parseInt(match[1])
        if (dayNum > maxDay) maxDay = dayNum
      }
    })
  })

  // Create date mapping, skipping excluded dates
  const dateMapping: { [key: number]: string } = {}
  let dayIndex = 1
  let currentDate = new Date(startDate)

  while (dayIndex <= maxDay && currentDate <= endDate) {
    const dateStr = format(currentDate, "yyyy-MM-dd")

    // Only assign this date if it's not excluded
    if (!excludedDates.has(dateStr)) {
      dateMapping[dayIndex] = dateStr
      dayIndex++
    }

    // Move to next day
    currentDate = addDays(currentDate, 1)
  }

  // Detect time/topic columns dynamically
  const pairs = []
  for (let i = 1; i <= maxDay; i++) {
    pairs.push([`h:mm_${i}`, `added to pie_${i}`])
  }

  const results = data.map((row: any) => {
    const name = row[Object.keys(row)[0]]
    const studentId = row[Object.keys(row)[2]]
    const email = row[Object.keys(row)[3]]
    let coins = 0
    const dailyLog: any[] = []

    pairs.forEach(([timeCol, topicCol], index) => {
      const dayNumber = index + 1
      const date = dateMapping[dayNumber] || format(addDays(startDate, index), "yyyy-MM-dd")
      const minutes = timeToMinutes(row[timeCol])
      const topics = Number.parseFloat(row[topicCol]) || 0

      const minMsg = minutes >= MIN_MINUTES ? null : `${minutes} mins (needs ${MIN_MINUTES} mins)`
      const topicMsg =
        topics >= MIN_TOPICS ? null : `${topics} topics (needs ${MIN_TOPICS} topic${MIN_TOPICS > 1 ? "s" : ""})`

      const qualified = !minMsg && !topicMsg
      if (qualified) coins++

      let reason = ""
      if (qualified) {
        reason = `✅ Met requirement: ${minutes} mins + ${topics} topics`
      } else {
        const parts = []
        if (minMsg) parts.push(minMsg)
        if (topicMsg) parts.push(topicMsg)
        reason = `❌ Not enough: ` + parts.join(" and ")
      }

      dailyLog.push({
        day: dayNumber,
        date,
        qualified,
        minutes,
        topics,
        reason,
      })
    })

    const percentComplete = ((coins / maxDay) * 100).toFixed(1)
    return { studentId, name, email, coins, maxDay, workingDays, percentComplete, dailyLog }
  })

  // Create JSON map
  const jsonMap: any = {}
  results.forEach((s: any) => {
    jsonMap[s.studentId] = {
      name: s.name,
      email: s.email,
      coins: s.coins,
      totalDays: s.maxDay,
      periodDays: s.workingDays, // Use working days (excluding excluded dates)
      percentComplete: Number.parseFloat(s.percentComplete),
      dailyLog: s.dailyLog,
    }
  })

  return jsonMap
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const password = formData.get("password") as string
    const file = formData.get("file") as File
    const selectedPeriod = formData.get("period") as string
    const excludedDates = formData.get("excludedDates") as string

    // Verify admin password
    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 })
    }

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
    }

    // Get file buffer
    const buffer = Buffer.from(await file.arrayBuffer())

    // Process the Excel file using the script
    const { processExcelFile } = await import("../../../scripts/process-excel.js")

    const excludedDatesArray = excludedDates ? excludedDates.split(",").map((d) => d.trim()) : []

    const processedData = await processExcelFile(buffer, selectedPeriod, excludedDatesArray)

    // Store in database
    try {
      await sql`
        INSERT INTO student_data (data, uploaded_at)
        VALUES (${JSON.stringify(processedData)}, NOW())
      `

      console.log("Data successfully stored in database")
    } catch (dbError) {
      console.error("Database error:", dbError)
      return NextResponse.json(
        {
          error: "Failed to store data in database",
          details: dbError instanceof Error ? dbError.message : "Unknown database error",
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      message: "File processed and data stored successfully",
      studentsProcessed: Object.keys(processedData).length,
    })
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json(
      {
        error: "Failed to process file",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

export async function GET() {
  return NextResponse.json({
    periods: Object.entries(EXAM_PERIODS).map(([key, period]) => ({
      id: key,
      name: period.name,
      startDate: period.startDate,
      endDate: period.endDate,
      excludedDates: period.excludedDates,
    })),
  })
}
