const xlsx = require("xlsx")
const { parse, format, addDays, differenceInDays } = require("date-fns")

function processExcelData(buffer, startDateStr, endDateStr) {
  const MIN_MINUTES = 31
  const MIN_TOPICS = 1

  const startDate = parse(startDateStr, "yyyy-MM-dd", new Date())
  const endDate = parse(endDateStr, "yyyy-MM-dd", new Date())
  const totalDaysInPeriod = differenceInDays(endDate, startDate) + 1

  // === LOAD WORKBOOK FROM BUFFER ===
  const wb = xlsx.read(buffer, { type: "buffer" })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const data = xlsx.utils.sheet_to_json(sheet, { range: 3 })

  // === DETECT MAX DAY INDEX FROM ALL ROWS ===
  let maxDay = 0
  data.forEach((row) => {
    Object.keys(row).forEach((key) => {
      const match = key.match(/^h:mm_(\d+)$/)
      if (match) {
        const dayNum = Number.parseInt(match[1])
        if (dayNum > maxDay) maxDay = dayNum
      }
    })
  })

  // === DETECT TIME/TOPIC COLUMNS DYNAMICALLY ===
  const pairs = []
  for (let i = 1; i <= maxDay; i++) {
    pairs.push([`h:mm_${i}`, `added to pie_${i}`])
  }

  // === UTILITY ===
  function timeToMinutes(time) {
    if (!time || typeof time !== "string") return 0
    const parts = time.split(":")
    return Number.parseInt(parts[0]) * 60 + Number.parseInt(parts[1])
  }

  // === PROCESS STUDENTS ===
  const results = data.map((row) => {
    const name = row[Object.keys(row)[0]]
    const studentId = row[Object.keys(row)[2]]
    const email = row[Object.keys(row)[3]]
    let coins = 0
    const dailyLog = []

    pairs.forEach(([timeCol, topicCol], index) => {
      const date = format(addDays(startDate, index), "yyyy-MM-dd")
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
        day: index + 1,
        date,
        qualified,
        minutes,
        topics,
        reason,
      })
    })

    const percentComplete = ((coins / maxDay) * 100).toFixed(1)
    return { studentId, name, email, coins, maxDay, totalDaysInPeriod, percentComplete, dailyLog }
  })

  // === JSON OUTPUT ===
  const jsonMap = {}
  results.forEach((s) => {
    jsonMap[s.studentId] = {
      name: s.name,
      email: s.email,
      coins: s.coins,
      totalDays: s.maxDay,
      periodDays: s.totalDaysInPeriod,
      percentComplete: Number.parseFloat(s.percentComplete),
      dailyLog: s.dailyLog,
    }
  })

  return jsonMap
}

module.exports = { processExcelData }
