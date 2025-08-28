import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"

// Add this function at the top to define periods and excluded dates
function getPeriodDates(period: string, customStart?: string, customEnd?: string) {
  const periods = {
    exam1: {
      start: "2024-08-30",
      end: "2024-09-26",
      excludedDates: ["2024-09-01"], // Labor Day
    },
    exam2: {
      start: "2024-09-29",
      end: "2024-10-24",
      excludedDates: ["2024-10-13", "2024-10-14"], // Fall Break
    },
    exam3: {
      start: "2024-10-26",
      end: "2024-12-04",
      excludedDates: ["2024-11-26", "2024-11-27", "2024-11-28"], // Thanksgiving Break
    },
    summer: {
      start: "2025-07-11",
      end: "2025-08-04",
      excludedDates: [], // No excluded dates
    },
    custom: {
      start: customStart || "2025-07-11",
      end: customEnd || "2025-08-04",
      excludedDates: [], // No excluded dates for custom
    },
  }

  return periods[period as keyof typeof periods] || periods.summer
}

// Import the processing function
async function processExcelData(buffer: Buffer, period: string, customStart?: string, customEnd?: string) {
  const { parse, format, addDays, differenceInDays } = await import("date-fns")

  // Dynamic import for xlsx since it's not available in edge runtime
  const xlsx = await import("xlsx")

  const MIN_MINUTES = 31
  const MIN_TOPICS = 1

  // Get period dates and exclusions
  const periodInfo = getPeriodDates(period, customStart, customEnd)
  const startDate = parse(periodInfo.start, "yyyy-MM-dd", new Date())
  const endDate = parse(periodInfo.end, "yyyy-MM-dd", new Date())
  const excludedDates = new Set(periodInfo.excludedDates)

  // Calculate total days excluding the excluded dates
  const totalDaysInPeriod = differenceInDays(endDate, startDate) + 1
  const excludedCount = periodInfo.excludedDates.length
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

  // Utility function
  function timeToMinutes(time: any) {
    if (!time || typeof time !== "string") return 0
    const parts = time.split(":")
    return Number.parseInt(parts[0]) * 60 + Number.parseInt(parts[1])
  }

  // Process students
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
    const file = formData.get("file") as File
    const period = formData.get("period") as string
    const customStart = formData.get("startDate") as string | null
    const customEnd = formData.get("endDate") as string | null
    const password = formData.get("password") as string

    // Verify admin password
    const adminPassword = process.env.ADMIN_PASSWORD || "admin123"
    if (password !== adminPassword) {
      return NextResponse.json({ error: "Invalid admin password" }, { status: 401 })
    }

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
    }

    if (!period) {
      return NextResponse.json({ error: "Please select an exam period" }, { status: 400 })
    }

    if (!file.name.endsWith(".xlsx")) {
      return NextResponse.json({ error: "Please upload a valid Excel (.xlsx) file" }, { status: 400 })
    }

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer())

    // Process the Excel data with period information
    const studentData = await processExcelData(buffer, period, customStart || undefined, customEnd || undefined)
    const studentCount = Object.keys(studentData).length

    // Initialize database table if it doesn't exist
    await sql`
      CREATE TABLE IF NOT EXISTS student_data (
        id SERIAL PRIMARY KEY,
        data JSONB NOT NULL,
        period VARCHAR(50) NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        uploaded_by VARCHAR(255) DEFAULT 'admin'
      )
    `

    // Clear existing data and insert new data
    await sql`DELETE FROM student_data`
    await sql`
      INSERT INTO student_data (data, period, uploaded_by) 
      VALUES (${JSON.stringify(studentData)}, ${period}, 'admin')
    `

    console.log(`Successfully processed ${studentCount} students for ${period}`)

    return NextResponse.json({
      success: true,
      message: "Student data updated successfully",
      studentCount,
      period,
    })
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json(
      { error: "Failed to process file. Please check the format and try again." },
      { status: 500 },
    )
  }
}
