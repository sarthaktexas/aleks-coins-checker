import XLSX from "xlsx"
import fs from "fs"

// Get current year
const CURRENT_YEAR = new Date().getFullYear()

// Define exam periods with excluded dates - using current year
const EXAM_PERIODS = {
  spring2025: {
    name: `Spring ${CURRENT_YEAR} - Exam 1 Period`,
    startDate: `${CURRENT_YEAR}-01-15`,
    endDate: `${CURRENT_YEAR}-02-10`,
    excludedDates: [`${CURRENT_YEAR}-01-20`, `${CURRENT_YEAR}-02-03`], // MLK Day, random Monday
  },
  spring2025_exam2: {
    name: `Spring ${CURRENT_YEAR} - Exam 2 Period`,
    startDate: `${CURRENT_YEAR}-02-11`,
    endDate: `${CURRENT_YEAR}-03-10`,
    excludedDates: [`${CURRENT_YEAR}-02-17`, `${CURRENT_YEAR}-03-03`], // Presidents Day, Spring Break start
  },
  spring2025_final: {
    name: `Spring ${CURRENT_YEAR} - Final Exam Period`,
    startDate: `${CURRENT_YEAR}-03-11`,
    endDate: `${CURRENT_YEAR}-04-28`,
    excludedDates: [`${CURRENT_YEAR}-03-17`, `${CURRENT_YEAR}-04-21`], // Spring Break, Easter Monday
  },
  summer2025: {
    name: `Summer ${CURRENT_YEAR} - Exam 1 Period`,
    startDate: `${CURRENT_YEAR}-05-31`,
    endDate: `${CURRENT_YEAR}-06-23`,
    excludedDates: [`${CURRENT_YEAR}-06-07`, `${CURRENT_YEAR}-06-08`], // Weekend
  },
  summer2025_exam2: {
    name: `Summer ${CURRENT_YEAR} - Exam 2 Period`,
    startDate: `${CURRENT_YEAR}-06-24`,
    endDate: `${CURRENT_YEAR}-07-17`,
    excludedDates: [`${CURRENT_YEAR}-07-04`, `${CURRENT_YEAR}-07-05`, `${CURRENT_YEAR}-07-06`], // July 4th weekend
  },
  summer2025_final: {
    name: `Summer ${CURRENT_YEAR} - Final Exam Period`,
    startDate: `${CURRENT_YEAR}-07-18`,
    endDate: `${CURRENT_YEAR}-08-10`,
    excludedDates: [`${CURRENT_YEAR}-07-26`, `${CURRENT_YEAR}-07-27`], // Weekend
  },
  fall2025: {
    name: `Fall ${CURRENT_YEAR} - Exam 1 Period`,
    startDate: `${CURRENT_YEAR}-08-26`,
    endDate: `${CURRENT_YEAR}-09-20`,
    excludedDates: [`${CURRENT_YEAR}-09-02`, `${CURRENT_YEAR}-09-16`], // Labor Day, random Monday
  },
  fall2025_exam2: {
    name: `Fall ${CURRENT_YEAR} - Exam 2 Period`,
    startDate: `${CURRENT_YEAR}-09-21`,
    endDate: `${CURRENT_YEAR}-10-18`,
    excludedDates: [`${CURRENT_YEAR}-10-14`], // Columbus Day
  },
  fall2025_final: {
    name: `Fall ${CURRENT_YEAR} - Final Exam Period`,
    startDate: `${CURRENT_YEAR}-10-19`,
    endDate: `${CURRENT_YEAR}-12-13`,
    excludedDates: [
      `${CURRENT_YEAR}-11-25`,
      `${CURRENT_YEAR}-11-26`,
      `${CURRENT_YEAR}-11-27`,
      `${CURRENT_YEAR}-11-28`,
      `${CURRENT_YEAR}-11-29`,
    ], // Thanksgiving week
  },
}

function getWorkingDays(startDate, endDate, excludedDates = []) {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const excluded = new Set(excludedDates)
  const workingDays = []

  const currentDate = new Date(start)
  let dayNumber = 1

  while (currentDate <= end) {
    const dateString = currentDate.toISOString().split("T")[0]

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

function processExcelFile(filePath, examPeriod = "summer2025") {
  console.log(`Processing Excel file: ${filePath}`)
  console.log(`Using exam period: ${examPeriod}`)

  // Read the Excel file
  const workbook = XLSX.readFile(filePath)
  const sheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[sheetName]

  // Convert to JSON
  const rawData = XLSX.utils.sheet_to_json(worksheet)

  console.log(`Found ${rawData.length} rows in Excel file`)

  // Get period configuration
  const period = EXAM_PERIODS[examPeriod]
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

  const processedData = {}

  rawData.forEach((row, index) => {
    try {
      // Extract student info (adjust column names based on your Excel structure)
      const studentId = String(row["Student ID"] || row["ID"] || "")
        .toLowerCase()
        .trim()
      const name = String(row["Name"] || row["Student Name"] || "").trim()
      const email = String(row["Email"] || "").trim()

      if (!studentId || !name) {
        console.warn(`Row ${index + 1}: Missing student ID or name, skipping`)
        return
      }

      // Process daily data
      const dailyLog = []
      let coins = 0
      let exemptDayCredits = 0 // Track extra credit coins from exempt days

      // Look for day columns for ALL days (including excluded ones)
      allDays.forEach(({ day, date, isExcluded }) => {
        const minutesCol = `Day ${day} Minutes` || `D${day} Minutes` || `Day${day}_Minutes`
        const topicsCol = `Day ${day} Topics` || `D${day} Topics` || `Day${day}_Topics`

        const minutes = Number.parseInt(row[minutesCol]) || 0
        const topics = Number.parseInt(row[topicsCol]) || 0

        let qualified = false
        let reason = ""
        let wouldHaveQualified = false

        if (isExcluded) {
          // Check if they would have qualified on exempt day
          wouldHaveQualified = minutes >= 31 && topics >= 1
          
          if (wouldHaveQualified) {
            // Give extra credit Aleks coin for qualifying on exempt day
            exemptDayCredits++
            reason = `🎁 Extra credit: Would have qualified (${minutes} mins + ${topics} topics)`
          } else {
            reason = "📅 Exempt day - does not count toward progress"
          }
          // Excluded days never count toward regular qualification
          qualified = false
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
          wouldHaveQualified,
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
        coins: coins + exemptDayCredits, // Include exempt day credits in total coins
        totalDays: completedWorkingDays, // Only count working days
        periodDays: totalWorkingDays, // Only count working days for period
        percentComplete,
        dailyLog, // Include all days (working + excluded)
        exemptDayCredits, // Track exempt day credits separately for display
      }

      console.log(
        `Processed: ${name} (${studentId}) - ${coins + exemptDayCredits} coins (${coins} regular + ${exemptDayCredits} exempt), ${percentComplete}% complete (${qualifiedWorkingDays}/${completedWorkingDays} working days)`,
      )
    } catch (error) {
      console.error(`Error processing row ${index + 1}:`, error)
    }
  })

  console.log(`\nProcessed ${Object.keys(processedData).length} students successfully`)

  return processedData
}

// Main execution
function main() {
  const args = process.argv.slice(2)

  if (args.length < 1) {
    console.log("Usage: node process-excel.js <excel-file-path> [exam-period]")
    console.log("Available exam periods:")
    Object.keys(EXAM_PERIODS).forEach((key) => {
      console.log(`  ${key}: ${EXAM_PERIODS[key].name}`)
    })
    console.log(`Example: node process-excel.js students.xlsx summer2025`)
    process.exit(1)
  }

  const filePath = args[0]
  const examPeriod = args[1] || "summer2025"

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`)
    process.exit(1)
  }

  try {
    const processedData = processExcelFile(filePath, examPeriod)

    // Write to JSON file
    const outputPath = "students.json"
    fs.writeFileSync(outputPath, JSON.stringify(processedData, null, 2))

    console.log(`\n✅ Successfully created ${outputPath}`)
    console.log(`📊 Total students: ${Object.keys(processedData).length}`)
    console.log(`📅 Period: ${EXAM_PERIODS[examPeriod].name}`)
    console.log(
      `🗓️  Total days: ${getWorkingDays(EXAM_PERIODS[examPeriod].startDate, EXAM_PERIODS[examPeriod].endDate, EXAM_PERIODS[examPeriod].excludedDates).length}`,
    )
    console.log(
      `📝 Working days: ${getWorkingDays(EXAM_PERIODS[examPeriod].startDate, EXAM_PERIODS[examPeriod].endDate, EXAM_PERIODS[examPeriod].excludedDates).filter((d) => !d.isExcluded).length}`,
    )
  } catch (error) {
    console.error("Error processing file:", error.message)
    process.exit(1)
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export { processExcelFile, EXAM_PERIODS }
