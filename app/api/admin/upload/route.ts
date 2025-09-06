import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"
import * as XLSX from "xlsx"

// Get current year
const CURRENT_YEAR = new Date().getFullYear()

// Define the same periods as in the admin page
const EXAM_PERIODS = {
  spring2025: {
    name: `Spring ${CURRENT_YEAR} - Exam 1 Period`,
    startDate: `${CURRENT_YEAR}-01-15`,
    endDate: `${CURRENT_YEAR}-02-10`,
    excludedDates: [`${CURRENT_YEAR}-01-20`, `${CURRENT_YEAR}-02-03`],
  },
  spring2025_exam2: {
    name: `Spring ${CURRENT_YEAR} - Exam 2 Period`,
    startDate: `${CURRENT_YEAR}-02-11`,
    endDate: `${CURRENT_YEAR}-03-10`,
    excludedDates: [`${CURRENT_YEAR}-02-17`, `${CURRENT_YEAR}-03-03`],
  },
  spring2025_exam3: {
    name: `Spring ${CURRENT_YEAR} - Exam 3 Period`,
    startDate: `${CURRENT_YEAR}-03-11`,
    endDate: `${CURRENT_YEAR}-04-07`,
    excludedDates: [`${CURRENT_YEAR}-03-17`, `${CURRENT_YEAR}-03-31`],
  },
  spring2025_final: {
    name: `Spring ${CURRENT_YEAR} - Final Exam Period`,
    startDate: `${CURRENT_YEAR}-04-08`,
    endDate: `${CURRENT_YEAR}-04-28`,
    excludedDates: [`${CURRENT_YEAR}-04-21`],
  },
  summer2025: {
    name: `Summer ${CURRENT_YEAR} - Exam 1 Period`,
    startDate: `${CURRENT_YEAR}-05-31`,
    endDate: `${CURRENT_YEAR}-06-23`,
    excludedDates: [`${CURRENT_YEAR}-06-07`, `${CURRENT_YEAR}-06-08`],
  },
  summer2025_exam2: {
    name: `Summer ${CURRENT_YEAR} - Exam 2 Period`,
    startDate: `${CURRENT_YEAR}-06-24`,
    endDate: `${CURRENT_YEAR}-07-17`,
    excludedDates: [`${CURRENT_YEAR}-07-04`, `${CURRENT_YEAR}-07-05`, `${CURRENT_YEAR}-07-06`],
  },
  summer2025_exam3: {
    name: `Summer ${CURRENT_YEAR} - Exam 3 Period`,
    startDate: `${CURRENT_YEAR}-07-18`,
    endDate: `${CURRENT_YEAR}-08-03`,
    excludedDates: [`${CURRENT_YEAR}-07-26`, `${CURRENT_YEAR}-07-27`],
  },
  summer2025_final: {
    name: `Summer ${CURRENT_YEAR} - Final Exam Period`,
    startDate: `${CURRENT_YEAR}-08-04`,
    endDate: `${CURRENT_YEAR}-08-10`,
    excludedDates: [],
  },
  fall2025: {
    name: `Fall ${CURRENT_YEAR} - Exam 1 Period`,
    startDate: `${CURRENT_YEAR}-08-26`,
    endDate: `${CURRENT_YEAR}-09-20`,
    excludedDates: [`${CURRENT_YEAR}-09-02`, `${CURRENT_YEAR}-09-16`],
  },
  fall2025_exam2: {
    name: `Fall ${CURRENT_YEAR} - Exam 2 Period`,
    startDate: `${CURRENT_YEAR}-09-21`,
    endDate: `${CURRENT_YEAR}-10-18`,
    excludedDates: [`${CURRENT_YEAR}-10-14`],
  },
  fall2025_exam3: {
    name: `Fall ${CURRENT_YEAR} - Exam 3 Period`,
    startDate: `${CURRENT_YEAR}-10-19`,
    endDate: `${CURRENT_YEAR}-11-15`,
    excludedDates: [`${CURRENT_YEAR}-11-11`],
  },
  fall2025_final: {
    name: `Fall ${CURRENT_YEAR} - Final Exam Period`,
    startDate: `${CURRENT_YEAR}-11-16`,
    endDate: `${CURRENT_YEAR}-12-13`,
    excludedDates: [
      `${CURRENT_YEAR}-11-25`,
      `${CURRENT_YEAR}-11-26`,
      `${CURRENT_YEAR}-11-27`,
      `${CURRENT_YEAR}-11-28`,
      `${CURRENT_YEAR}-11-29`,
    ],
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
    workingDays.push({
      day: dayNumber,
      date: dateString,
      isExcluded: excluded.has(dateString),
    })
    dayNumber++

    currentDate.setDate(currentDate.getDate() + 1)
  }

  return workingDays
}

function processExcelData(rawData: any[], examPeriod: string) {
  console.log(`Processing Excel data for exam period: ${examPeriod}`)

  // Get period configuration
  const period = EXAM_PERIODS[examPeriod as keyof typeof EXAM_PERIODS]
  if (!period) {
    throw new Error(`Invalid exam period: ${examPeriod}. Available: ${Object.keys(EXAM_PERIODS).join(", ")}`)
  }

  console.log(`Period: ${period.name}`)
  console.log(`Date range: ${period.startDate} to ${period.endDate}`)
  console.log(`Excluded dates: ${period.excludedDates.join(", ")}`)

  // Get all days for the period (including excluded ones)
  const allDays = getWorkingDays(period.startDate, period.endDate, period.excludedDates)
  const workingDays = allDays.filter((day) => !day.isExcluded)
  const totalPeriodDays = allDays.length
  const totalWorkingDays = workingDays.length

  console.log(`Total days in period: ${totalPeriodDays}`)
  console.log(`Total working days (excluding exemptions): ${totalWorkingDays}`)

  // === DETECT MAX DAY INDEX FROM ALL ROWS (like your code) ===
  let maxDay = 0
  rawData.forEach((row) => {
    Object.keys(row).forEach((key) => {
      const match = key.match(/^h:mm_(\d+)$/)
      if (match) {
        const dayNum = Number.parseInt(match[1])
        if (dayNum > maxDay) maxDay = dayNum
      }
    })
  })

  console.log(`Detected max day from Excel: ${maxDay}`)

  // === UTILITY FUNCTION (from your code) ===
  function timeToMinutes(time: any): number {
    if (!time || typeof time !== "string") return 0
    const parts = time.split(":")
    return Number.parseInt(parts[0]) * 60 + Number.parseInt(parts[1])
  }

  const MIN_MINUTES = 31
  const MIN_TOPICS = 1

  const processedData: any = {}

  rawData.forEach((row, index) => {
    try {
      // Extract student info using your column structure
      const name = String(row[Object.keys(row)[0]] || "").trim() // First column
      const studentId = String(row[Object.keys(row)[2]] || "")
        .toLowerCase()
        .trim() // Third column
      const email = String(row[Object.keys(row)[3]] || "").trim() // Fourth column

      console.log(`Processing row ${index + 1}: Name="${name}", ID="${studentId}", Email="${email}"`)

      if (!studentId || !name) {
        console.warn(`Row ${index + 1}: Missing student ID or name, skipping`)
        return
      }

      // Process daily data using your exact logic
      let coins = 0
      const dailyLog: any[] = []

      // Create pairs for time/topic columns (like your code)
      const pairs = []
      for (let i = 1; i <= maxDay; i++) {
        pairs.push([`h:mm_${i}`, `added to pie_${i}`])
      }

      pairs.forEach(([timeCol, topicCol], dayIndex) => {
        const calendarDay = dayIndex + 1

        // Find the corresponding date from our period days
        const dayInfo = allDays.find((d) => d.day === calendarDay)
        const date = dayInfo ? dayInfo.date : `${period.startDate.split("-")[0]}-01-01` // fallback
        const isExcluded = dayInfo ? dayInfo.isExcluded : false

        const minutes = timeToMinutes(row[timeCol])
        const topics = Number.parseFloat(row[topicCol]) || 0

        let qualified = false
        let reason = ""

        if (isExcluded) {
          // Excluded days don't count toward qualification, even if they have data
          qualified = false
          reason = "📅 Exempt day - does not count toward progress"
        } else {
          // Use your exact logic for qualification
          const minMsg = minutes >= MIN_MINUTES ? null : `${minutes} mins (needs ${MIN_MINUTES} mins)`
          const topicMsg =
            topics >= MIN_TOPICS ? null : `${topics} topics (needs ${MIN_TOPICS} topic${MIN_TOPICS > 1 ? "s" : ""})`

          qualified = !minMsg && !topicMsg
          if (qualified) {
            coins++
            reason = `✅ Met requirement: ${minutes} mins + ${topics} topics`
          } else {
            const parts = []
            if (minMsg) parts.push(minMsg)
            if (topicMsg) parts.push(topicMsg)
            reason = `❌ Not enough: ` + parts.join(" and ")
          }
        }

        dailyLog.push({
          day: calendarDay,
          date,
          qualified,
          minutes,
          topics,
          reason,
          isExcluded,
        })
      })

      // Calculate completion percentage based only on working days
      const workingDayLogs = dailyLog.filter((d) => !d.isExcluded)
      const completedWorkingDays = workingDayLogs.length
      const qualifiedWorkingDays = workingDayLogs.filter((d) => d.qualified).length
      const percentComplete =
        completedWorkingDays > 0 ? Math.round((qualifiedWorkingDays / completedWorkingDays) * 100 * 10) / 10 : 0

      processedData[studentId] = {
        name,
        email,
        coins,
        totalDays: completedWorkingDays, // Only count working days
        periodDays: totalWorkingDays, // Only count working days for period
        percentComplete,
        dailyLog, // Include all days (working + excluded)
      }

      console.log(
        `Processed: ${name} (${studentId}) - ${coins} coins, ${percentComplete}% complete (${qualifiedWorkingDays}/${completedWorkingDays} working days)`,
      )
    } catch (error) {
      console.error(`Error processing row ${index + 1}:`, error)
    }
  })

  console.log(`\nProcessed ${Object.keys(processedData).length} students successfully`)

  return processedData
}

export async function POST(request: NextRequest) {
  try {
    console.log("Admin upload request received")

    // Check admin password
    const formData = await request.formData()
    const password = formData.get("password") as string
    const file = formData.get("file") as File
    const examPeriod = formData.get("examPeriod") as string

    console.log("Password provided:", !!password)
    console.log("File provided:", !!file)
    console.log("Exam period:", examPeriod)

    if (!password || password !== process.env.ADMIN_PASSWORD) {
      console.log("Invalid password provided")
      return NextResponse.json({ error: "Invalid password" }, { status: 401 })
    }

    if (!file) {
      console.log("No file provided")
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
    }

    if (!examPeriod) {
      console.log("No exam period provided")
      return NextResponse.json({ error: "No exam period selected" }, { status: 400 })
    }

    console.log("File details:", {
      name: file.name,
      size: file.size,
      type: file.type,
    })

    // Read Excel file with range starting from row 4 (like your code)
    const fileBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(fileBuffer, { type: "array" })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]

    // Convert to JSON starting from row 4 (range: 3 like your code)
    const rawData = XLSX.utils.sheet_to_json(worksheet, { range: 3 })
    console.log(`Found ${rawData.length} rows in Excel file (starting from row 4)`)

    if (rawData.length === 0) {
      return NextResponse.json({ error: "No data found in Excel file" }, { status: 400 })
    }

    // Process the Excel data
    const studentData = processExcelData(rawData, examPeriod)
    const studentCount = Object.keys(studentData).length

    if (studentCount === 0) {
      return NextResponse.json({ error: "No valid student data found in file" }, { status: 400 })
    }

    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      console.log("No database URL configured - cannot store data")
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    // Ensure the table exists
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS student_data (
          id SERIAL PRIMARY KEY,
          data JSONB NOT NULL,
          period VARCHAR(50) NOT NULL,
          uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `
      console.log("Table created/verified successfully")
    } catch (tableError) {
      console.error("Table creation error:", tableError)
      return NextResponse.json({ error: "Database table setup failed" }, { status: 500 })
    }

    // Store in database
    try {
      const insertResult = await sql`
        INSERT INTO student_data (data, period, uploaded_at)
        VALUES (${JSON.stringify(studentData)}, ${examPeriod}, NOW())
        RETURNING id, uploaded_at
      `

      console.log("Data inserted successfully:", insertResult.rows[0])
    } catch (insertError) {
      console.error("Insert error:", insertError)
      return NextResponse.json({ error: "Failed to save data to database" }, { status: 500 })
    }

    console.log("Student data processed and uploaded successfully to database")

    return NextResponse.json({
      success: true,
      message: "Excel file processed and student data uploaded successfully",
      studentCount: studentCount,
      examPeriod: EXAM_PERIODS[examPeriod as keyof typeof EXAM_PERIODS].name,
    })
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json(
      {
        error: "Failed to process and upload data",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
      },
      { status: 500 },
    )
  }
}
