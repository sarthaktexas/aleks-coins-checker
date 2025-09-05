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

  const processedData: any = {}

  rawData.forEach((row, index) => {
    try {
      // Extract student info (adjust column names based on your Excel structure)
      const studentId = String(row["Student Id"] || "")
        .toLowerCase()
        .trim()
      const name = String(row["Student"] || "").trim()
      const email = String(row["Email"] || "").trim()

      if (!studentId || !name) {
        console.warn(`Row ${index + 1}: Missing student ID or name, skipping`)
        return
      }

      // Process daily data
      const dailyLog: any[] = []
      let coins = 0

      // Look for day columns for ALL days (including excluded ones)
      allDays.forEach(({ day, date, isExcluded }) => {
        const minutesCol = `Day ${day} Minutes` || `D${day} Minutes` || `Day${day}_Minutes`
        const topicsCol = `Day ${day} Topics` || `D${day} Topics` || `Day${day}_Topics`

        const minutes = Number.parseInt(row[minutesCol]) || 0
        const topics = Number.parseInt(row[topicsCol]) || 0

        let qualified = false
        let reason = ""

        if (isExcluded) {
          // Excluded days don't count toward qualification, even if they have data
          qualified = false
          reason = "📅 Exempt day - does not count toward progress"
        } else {
          // Regular days: check if qualified (31+ minutes AND 1+ topics)
          qualified = minutes >= 31 && topics >= 1

          if (qualified) {
            coins++
            reason = `✅ Met requirement: ${minutes} mins + ${topics} topic${topics !== 1 ? "s" : ""}`
          } else {
            if (minutes < 31 && topics < 1) {
              reason = `❌ Not enough: ${minutes} mins (needs 31 mins) and ${topics} topics (needs 1 topic)`
            } else if (minutes < 31) {
              reason = `❌ Not enough: ${minutes} mins (needs 31 mins)`
            } else {
              reason = `❌ Not enough: ${topics} topics (needs 1 topic)`
            }
          }
        }

        dailyLog.push({
          day,
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

    // Read Excel file
    const fileBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(fileBuffer, { type: "array" })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]

    // Convert to JSON
    const rawData = XLSX.utils.sheet_to_json(worksheet)
    console.log(`Found ${rawData.length} rows in Excel file`)

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
        INSERT INTO student_data (data, uploaded_at)
        VALUES (${JSON.stringify(studentData)}, NOW())
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
