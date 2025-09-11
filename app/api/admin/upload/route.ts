import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"
import * as XLSX from "xlsx"

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
    workingDays.push({
      day: dayNumber,
      date: dateString,
      isExcluded: excluded.has(dateString),
    })
    dayNumber++
    incrementDate()
  }

  return workingDays
}

async function processExcelData(rawData: any[], examPeriod: string) {

  // Get period configuration from database ONLY - no hardcoded fallbacks
  let period
  try {
    const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/admin/exam-periods`)
    const data = await response.json()
    
    console.log(`🔍 DEBUG: Upload processing for period: ${examPeriod}`)
    console.log(`🔍 DEBUG: Period API response status: ${response.ok}`)
    console.log(`🔍 DEBUG: Available periods in database:`, Object.keys(data.periods || {}))
    
    if (response.ok && data.periods && data.periods[examPeriod]) {
      period = data.periods[examPeriod]
      console.log(`🔍 DEBUG: Using period from database:`, {
        name: period.name,
        startDate: period.startDate,
        endDate: period.endDate,
        excludedDates: period.excludedDates
      })
    } else {
      throw new Error(`Period ${examPeriod} not found in database. Available periods: ${Object.keys(data.periods || {}).join(", ")}`)
    }
  } catch (error) {
    console.error("Error fetching period from database:", error)
    throw new Error(`Failed to fetch period ${examPeriod} from database: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }

  if (!period) {
    throw new Error(`Period ${examPeriod} not found`)
  }


  // Detect the maximum day number from Excel columns
  let maxDayFromExcel = 0
  rawData.forEach((row) => {
    Object.keys(row).forEach((key) => {
      const match = key.match(/^h:mm_(\d+)$/)
      if (match) {
        const dayNum = Number.parseInt(match[1])
        if (dayNum > maxDayFromExcel) maxDayFromExcel = dayNum
      }
    })
  })


  // Get all days for the period (including excluded ones)
  const allDays = getWorkingDays(period.startDate, period.endDate, period.excludedDates)
  const workingDays = allDays.filter((day) => !day.isExcluded)
  const totalPeriodDays = allDays.length
  const totalWorkingDays = workingDays.length

  console.log(`🔍 DEBUG: Generated ${allDays.length} total days for period`)
  console.log(`🔍 DEBUG: First few days:`, allDays.slice(0, 3).map(d => ({ day: d.day, date: d.date, isExcluded: d.isExcluded })))
  console.log(`🔍 DEBUG: Last few days:`, allDays.slice(-3).map(d => ({ day: d.day, date: d.date, isExcluded: d.isExcluded })))


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


          if (!studentId || !name) {
            console.warn(`Row ${index + 1}: Missing student ID or name, skipping`)
            return
          }

          // Process daily data for ALL days in the period
          let coins = 0
          const dailyLog: any[] = []

          // Process days 1 through maxDayFromExcel (the actual days with data in Excel)
          for (let dayNum = 1; dayNum <= maxDayFromExcel; dayNum++) {
            // Find the corresponding day info from allDays
            const dayInfo = allDays.find(d => d.day === dayNum)
            if (!dayInfo) {
              console.warn(`Day ${dayNum} not found in period days, skipping`)
              continue
            }

            const calendarDay = dayInfo.day
            const date = dayInfo.date
            const isExcluded = dayInfo.isExcluded

            // Try to get data from Excel columns if they exist
            const timeCol = `h:mm_${calendarDay}`
            const topicCol = `added to pie_${calendarDay}`
            
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
          }

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
        totalDays: maxDayFromExcel, // Use the actual number of days with data from Excel
        periodDays: totalWorkingDays, // Only count working days for period
        percentComplete,
        dailyLog, // Include all days (working + excluded)
      }

      // Log sample dailyLog for first student to debug dates
      if (Object.keys(processedData).length === 1) {
        console.log(`🔍 DEBUG: Sample student ${studentId} dailyLog:`, {
          firstDay: dailyLog[0] ? {
            day: dailyLog[0].day,
            date: dailyLog[0].date,
            qualified: dailyLog[0].qualified
          } : 'No first day',
          lastDay: dailyLog[dailyLog.length - 1] ? {
            day: dailyLog[dailyLog.length - 1].day,
            date: dailyLog[dailyLog.length - 1].date,
            qualified: dailyLog[dailyLog.length - 1].qualified
          } : 'No last day',
          totalDays: dailyLog.length
        })
      }

    } catch (error) {
      console.error(`Error processing row ${index + 1}:`, error)
    }
  })


  return processedData
}

export async function POST(request: NextRequest) {
  try {

    // Check admin password
    const formData = await request.formData()
    const password = formData.get("password") as string
    const file = formData.get("file") as File
    const examPeriod = formData.get("examPeriod") as string
    const sectionNumber = formData.get("sectionNumber") as string


    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 })
    }

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
    }

    if (!examPeriod) {
      return NextResponse.json({ error: "No exam period selected" }, { status: 400 })
    }

    if (!sectionNumber) {
      return NextResponse.json({ error: "Section number is required" }, { status: 400 })
    }


    // Read Excel file with range starting from row 4 (like your code)
    const fileBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(fileBuffer, { type: "array" })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]

    // Convert to JSON starting from row 4 (range: 3 like your code)
    const rawData = XLSX.utils.sheet_to_json(worksheet, { range: 3 })

    if (rawData.length === 0) {
      return NextResponse.json({ error: "No data found in Excel file" }, { status: 400 })
    }

    // Process the Excel data
    const studentData = await processExcelData(rawData, examPeriod)
    const studentCount = Object.keys(studentData).length

    if (studentCount === 0) {
      return NextResponse.json({ error: "No valid student data found in file" }, { status: 400 })
    }

    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    // Ensure the table exists and has the section_number column
    try {
      // First, create the table if it doesn't exist (with old schema)
      await sql`
        CREATE TABLE IF NOT EXISTS student_data (
          id SERIAL PRIMARY KEY,
          data JSONB NOT NULL,
          period VARCHAR(50) NOT NULL,
          uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `
      
      // Check if section_number column exists
      const columnCheck = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'student_data' AND column_name = 'section_number'
      `
      
      if (columnCheck.rows.length === 0) {
        // Add the section_number column
        await sql`
          ALTER TABLE student_data 
          ADD COLUMN section_number VARCHAR(20) DEFAULT 'default'
        `
        
        // Update existing records to have 'default' as section_number
        await sql`
          UPDATE student_data 
          SET section_number = 'default' 
          WHERE section_number IS NULL
        `
        
        // Make the column NOT NULL
        await sql`
          ALTER TABLE student_data 
          ALTER COLUMN section_number SET NOT NULL
        `
      }
    } catch (tableError) {
      console.error("Table creation/update error:", tableError)
      return NextResponse.json({ error: "Database table setup failed" }, { status: 500 })
    }

    // Store in database with upsert logic
    try {
      // First, check if we have existing data for this period and section
      const existingData = await sql`
        SELECT data FROM student_data 
        WHERE period = ${examPeriod} AND section_number = ${sectionNumber}
        ORDER BY uploaded_at DESC 
        LIMIT 1
      `

      let finalStudentData = studentData

      // If we have existing data, merge it with new data (new data overwrites existing)
      if (existingData.rows.length > 0) {
        const existing = typeof existingData.rows[0].data === "string" 
          ? JSON.parse(existingData.rows[0].data) 
          : existingData.rows[0].data

        // Merge: new data overwrites existing data for same student IDs
        finalStudentData = { ...existing, ...studentData }
      }

      // Insert new record with merged data
      const insertResult = await sql`
        INSERT INTO student_data (data, period, section_number, uploaded_at)
        VALUES (${JSON.stringify(finalStudentData)}, ${examPeriod}, ${sectionNumber}, NOW())
        RETURNING id, uploaded_at
      `

    } catch (insertError) {
      console.error("Insert error:", insertError)
      return NextResponse.json({ error: "Failed to save data to database" }, { status: 500 })
    }


    return NextResponse.json({
      success: true,
      message: "Excel file processed and student data uploaded successfully",
      studentCount: studentCount,
      examPeriod: examPeriod,
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