import * as XLSX from "xlsx"

export async function processExcelFile(buffer, period, excludedDates = []) {
  try {
    // Parse the Excel file
    const workbook = XLSX.read(buffer, { type: "buffer" })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]

    // Convert to JSON
    const rawData = XLSX.utils.sheet_to_json(worksheet)

    console.log(`Processing ${rawData.length} rows from Excel file`)

    // Process the data
    const processedData = {}

    for (const row of rawData) {
      // Extract student info (adjust column names as needed)
      const studentId = row["Student ID"] || row["ID"] || row["student_id"]
      const name = row["Name"] || row["Student Name"] || row["name"]
      const email = row["Email"] || row["email"]

      if (!studentId) continue

      // Initialize student data
      if (!processedData[studentId.toLowerCase()]) {
        processedData[studentId.toLowerCase()] = {
          name: name || "Unknown Student",
          email: email || `${studentId}@my.utsa.edu`,
          coins: 0,
          totalDays: 0,
          periodDays: 0,
          percentComplete: 0,
          dailyLog: [],
        }
      }

      const student = processedData[studentId.toLowerCase()]

      // Process daily data (adjust based on your Excel structure)
      const date = row["Date"] || row["date"]
      const minutes = Number.parseInt(row["Minutes"] || row["minutes"] || 0)
      const topics = Number.parseInt(row["Topics"] || row["topics"] || 0)

      if (date) {
        const qualified = minutes >= 31 && topics >= 1

        let reason = ""
        if (qualified) {
          reason = `✅ Met requirement: ${minutes} mins + ${topics} topic${topics !== 1 ? "s" : ""}`
          student.coins++
        } else {
          if (minutes < 31 && topics < 1) {
            reason = `❌ Not enough: ${minutes} mins (needs 31 mins) and ${topics} topics (needs 1 topic)`
          } else if (minutes < 31) {
            reason = `❌ Not enough: ${minutes} mins (needs 31 mins)`
          } else {
            reason = `❌ Not enough: ${topics} topics (needs 1 topic)`
          }
        }

        student.dailyLog.push({
          day: student.dailyLog.length + 1,
          date: formatDate(date),
          qualified,
          minutes,
          topics,
          reason,
        })

        student.totalDays++
      }
    }

    // Calculate final statistics for each student
    for (const studentId in processedData) {
      const student = processedData[studentId]
      student.periodDays = student.totalDays // Adjust based on your needs

      const qualifiedDays = student.dailyLog.filter((d) => d.qualified).length
      student.percentComplete =
        student.totalDays > 0 ? Math.round((qualifiedDays / student.totalDays) * 100 * 10) / 10 : 0
    }

    console.log(`Processed ${Object.keys(processedData).length} students`)
    return processedData
  } catch (error) {
    console.error("Error processing Excel file:", error)
    throw new Error(`Failed to process Excel file: ${error.message}`)
  }
}

function formatDate(dateValue) {
  try {
    // Handle different date formats
    if (typeof dateValue === "number") {
      // Excel serial date
      const date = XLSX.SSF.parse_date_code(dateValue)
      return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`
    } else if (typeof dateValue === "string") {
      // String date
      const date = new Date(dateValue)
      return date.toISOString().split("T")[0]
    } else if (dateValue instanceof Date) {
      // Date object
      return dateValue.toISOString().split("T")[0]
    }
    return dateValue
  } catch (error) {
    console.error("Error formatting date:", error)
    return dateValue
  }
}
