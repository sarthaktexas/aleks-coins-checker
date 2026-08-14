import { sql } from "@vercel/postgres"
import * as XLSX from "xlsx"
import { bustStudentDataCache } from "@/lib/student-cache"

export async function ensureExamPeriodsSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS exam_periods (
      id SERIAL PRIMARY KEY,
      period_key VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      excluded_dates JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `
  await sql`
    ALTER TABLE exam_periods
    ADD COLUMN IF NOT EXISTS coin_only_exempt_dates JSONB DEFAULT '[]'::jsonb
  `
}

function getWorkingDays(
  startDate: string,
  endDate: string,
  excludedDates: string[] = [],
  coinOnlyExemptDates: string[] = [],
) {
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number)
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number)

  const excluded = new Set(excludedDates)
  const coinOnly = new Set(coinOnlyExemptDates)
  const workingDays: Array<{
    day: number
    date: string
    isExcluded: boolean
    isCoinOnlyExempt: boolean
  }> = []

  let currentYear = startYear
  let currentMonth = startMonth
  let currentDay = startDay
  let dayNumber = 1

  const isDateBeforeOrEqual = (
    year1: number,
    month1: number,
    day1: number,
    year2: number,
    month2: number,
    day2: number,
  ) => {
    if (year1 < year2) return true
    if (year1 > year2) return false
    if (month1 < month2) return true
    if (month1 > month2) return false
    return day1 <= day2
  }

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
    const dateString = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(currentDay).padStart(2, "0")}`
    const isStandardExempt = excluded.has(dateString)
    const isCoinOnlyExempt = coinOnly.has(dateString) && !isStandardExempt
    workingDays.push({
      day: dayNumber,
      date: dateString,
      isExcluded: isStandardExempt || isCoinOnlyExempt,
      isCoinOnlyExempt,
    })
    dayNumber++
    incrementDate()
  }

  return workingDays
}

function timeToMinutes(time: unknown): number {
  if (!time || typeof time !== "string") return 0
  const parts = time.split(":")
  return Number.parseInt(parts[0]) * 60 + Number.parseInt(parts[1])
}

function parseMdyToIso(text: string): string | null {
  const m = String(text).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return null
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`
}

/**
 * Normalize ALEKS Time and Topic workbooks into the shape processExcelData expects:
 * positional name/id/email + h:mm_N / added to pie_N columns.
 *
 * Current ALEKS Excel 2007 exports use a date row + repeating bare "h:mm" /
 * "added to pie" / "attempted" groups. sheet_to_json(range:3) will invent
 * sparse h:mm_4-style keys for non-empty duplicate columns — those suffixes are
 * NOT ALEKS day numbers. Prefer date-row normalization whenever dates are present.
 *
 * True legacy files (already containing sequential h:mm_1…) still work as a fallback.
 */
export function parseAleksWorkbook(fileBuffer: ArrayBuffer) {
  const workbook = XLSX.read(fileBuffer, { type: "array" })
  const sheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: null,
    raw: false,
  }) as unknown[][]

  if (!rows.length) return [] as Record<string, unknown>[]

  // Prefer modern dated layout when present
  let subHeaderIdx = -1
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i] || []
    const cells = row.map((c) => String(c ?? "").trim().toLowerCase())
    if (cells.includes("h:mm") && cells.includes("added to pie")) {
      subHeaderIdx = i
      break
    }
  }

  if (subHeaderIdx >= 1) {
    const dateRow = rows[subHeaderIdx - 1] || []
    const subHeader = rows[subHeaderIdx] || []
    const dayCols: Array<{ day: number; timeIdx: number; topicIdx: number; date: string }> = []
    let dayNum = 0

    for (let col = 0; col < subHeader.length; col++) {
      const label = String(subHeader[col] ?? "")
        .trim()
        .toLowerCase()
      if (label !== "h:mm") continue
      const iso = parseMdyToIso(String(dateRow[col] ?? ""))
      // Skip the undated "Total Time (for date range)" h:mm group
      if (!iso) continue
      dayNum += 1
      dayCols.push({ day: dayNum, timeIdx: col, topicIdx: col + 1, date: iso })
    }

    if (dayCols.length > 0) {
      console.log(
        `ALEKS workbook: normalized ${dayCols.length} day columns (${dayCols[0].date} → ${dayCols[dayCols.length - 1].date})`,
      )

      const out: Record<string, unknown>[] = []
      for (const row of rows.slice(subHeaderIdx + 1)) {
        if (!row || !Array.isArray(row)) continue
        const name = String(row[0] ?? "").trim()
        const studentId = String(row[2] ?? "").trim()
        if (!name || !studentId) continue

        const record: Record<string, unknown> = {
          name,
          login: String(row[1] ?? "").trim(),
          studentId,
          email: String(row[3] ?? "").trim(),
        }
        for (const day of dayCols) {
          record[`h:mm_${day.day}`] = row[day.timeIdx] ?? ""
          record[`added to pie_${day.day}`] = row[day.topicIdx] ?? ""
        }
        out.push(record)
      }
      return out
    }
  }

  // True legacy: sequential h:mm_1 already in the sheet headers
  const legacy = XLSX.utils.sheet_to_json(worksheet, { range: 3 }) as Record<string, unknown>[]
  if (legacy.length > 0) {
    const sampleKeys = Object.keys(legacy[0] || {})
    const hasDayOne = sampleKeys.some((k) => /^h:mm_1$/i.test(k))
    if (hasDayOne) {
      console.log("ALEKS workbook: using legacy h:mm_1 headers")
      return legacy
    }
  }

  console.warn("ALEKS workbook: unrecognized layout; returning best-effort legacy parse")
  return legacy
}

export async function processExcelData(rawData: Record<string, unknown>[], examPeriod: string) {
  if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
    throw new Error("Database not configured")
  }

  await ensureExamPeriodsSchema()

  const result = await sql`
    SELECT period_key, name, start_date, end_date, excluded_dates, coin_only_exempt_dates
    FROM exam_periods
    WHERE period_key = ${examPeriod}
  `

  if (result.rows.length === 0) {
    throw new Error(`Period ${examPeriod} not found in database`)
  }

  const row = result.rows[0]
  const formatDate = (date: unknown) => {
    if (!date) return ""
    if (typeof date === "string") return date.slice(0, 10)
    const d = new Date(date as Date)
    return d.toISOString().split("T")[0]
  }

  const period = {
    name: row.name as string,
    startDate: formatDate(row.start_date),
    endDate: formatDate(row.end_date),
    excludedDates: (row.excluded_dates as string[]) || [],
    coinOnlyExemptDates: (row.coin_only_exempt_dates as string[]) || [],
  }

  let maxDayFromExcel = 0
  rawData.forEach((dataRow) => {
    Object.keys(dataRow).forEach((key) => {
      const match = key.match(/^h:mm_(\d+)$/)
      if (match) {
        const dayNum = Number.parseInt(match[1])
        if (dayNum > maxDayFromExcel) maxDayFromExcel = dayNum
      }
    })
  })

  const allDays = getWorkingDays(
    period.startDate,
    period.endDate,
    period.excludedDates,
    period.coinOnlyExemptDates,
  )
  const workingDays = allDays.filter((day) => !day.isExcluded)
  const totalWorkingDays = workingDays.length

  const MIN_MINUTES = 31
  const MIN_TOPICS = 1
  const processedData: Record<string, unknown> = {}

  rawData.forEach((dataRow, index) => {
    try {
      const keys = Object.keys(dataRow)
      const name = String(dataRow[keys[0]] || "").trim()
      const studentId = String(dataRow[keys[2]] || "")
        .toLowerCase()
        .trim()
      const email = String(dataRow[keys[3]] || "").trim()

      if (!studentId || !name) {
        console.warn(`Row ${index + 1}: Missing student ID or name, skipping`)
        return
      }

      let coins = 0
      const dailyLog: Array<Record<string, unknown>> = []
      let exemptDayCredits = 0
      let coinOnlyExemptCredits = 0

      for (let dayNum = 1; dayNum <= maxDayFromExcel; dayNum++) {
        const dayInfo = allDays.find((d) => d.day === dayNum)
        if (!dayInfo) {
          console.warn(`Day ${dayNum} not found in period days, skipping`)
          continue
        }

        const calendarDay = dayInfo.day
        const date = dayInfo.date
        const isExcluded = dayInfo.isExcluded
        const isCoinOnlyExempt = dayInfo.isCoinOnlyExempt
        const timeCol = `h:mm_${calendarDay}`
        const topicCol = `added to pie_${calendarDay}`
        const minutes = timeToMinutes(dataRow[timeCol])
        const topics = Number.parseFloat(String(dataRow[topicCol] ?? "")) || 0

        let qualified = false
        let reason = ""
        let wouldHaveQualified = false

        if (isExcluded) {
          const minMsg = minutes >= MIN_MINUTES ? null : `${minutes} mins (needs ${MIN_MINUTES} mins)`
          const topicMsg =
            topics >= MIN_TOPICS
              ? null
              : `${topics} topics (needs ${MIN_TOPICS} topic${MIN_TOPICS > 1 ? "s" : ""})`
          wouldHaveQualified = !minMsg && !topicMsg
          if (wouldHaveQualified) {
            if (isCoinOnlyExempt) {
              coinOnlyExemptCredits++
              reason = `🪙 Exempt (coins only): Would have qualified (${minutes} mins + ${topics} topics)`
            } else {
              exemptDayCredits++
              reason = `🎁 Extra credit: Would have qualified (${minutes} mins + ${topics} topics)`
            }
          } else if (isCoinOnlyExempt) {
            reason = "📅 Exempt (coins only) - earns a coin if you qualify, does not count toward extra credit %"
          } else {
            reason = "📅 Exempt day - does not count toward progress"
          }
          qualified = false
        } else {
          const minMsg = minutes >= MIN_MINUTES ? null : `${minutes} mins (needs ${MIN_MINUTES} mins)`
          const topicMsg =
            topics >= MIN_TOPICS
              ? null
              : `${topics} topics (needs ${MIN_TOPICS} topic${MIN_TOPICS > 1 ? "s" : ""})`
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
          isCoinOnlyExempt,
          wouldHaveQualified,
        })
      }

      const workingDayLogs = dailyLog.filter((d) => !d.isExcluded)
      const completedWorkingDays = workingDayLogs.length
      const qualifiedWorkingDays = workingDayLogs.filter((d) => d.qualified).length
      const percentComplete =
        completedWorkingDays > 0
          ? Math.round(((qualifiedWorkingDays + exemptDayCredits) / completedWorkingDays) * 100 * 10) / 10
          : 0

      processedData[studentId] = {
        name,
        email,
        coins: coins + exemptDayCredits + coinOnlyExemptCredits,
        totalDays: maxDayFromExcel,
        periodDays: totalWorkingDays,
        percentComplete,
        dailyLog,
        exemptDayCredits,
        coinOnlyExemptCredits,
      }
    } catch (error) {
      console.error(`Error processing row ${index + 1}:`, error)
    }
  })

  return processedData
}

export async function ensureStudentDataTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS student_data (
      id SERIAL PRIMARY KEY,
      data JSONB NOT NULL,
      period VARCHAR(50) NOT NULL,
      uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `

  const columnCheck = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'student_data' AND column_name = 'section_number'
  `

  if (columnCheck.rows.length === 0) {
    await sql`
      ALTER TABLE student_data
      ADD COLUMN section_number VARCHAR(20) DEFAULT 'default'
    `
    await sql`
      UPDATE student_data
      SET section_number = 'default'
      WHERE section_number IS NULL
    `
    await sql`
      ALTER TABLE student_data
      ALTER COLUMN section_number SET NOT NULL
    `
  }
}

export async function saveStudentData(
  studentData: Record<string, unknown>,
  examPeriod: string,
  sectionNumber: string,
) {
  if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
    throw new Error("Database not configured")
  }

  await ensureStudentDataTable()

  await sql`
    DELETE FROM student_data
    WHERE period = ${examPeriod} AND section_number = ${sectionNumber}
  `

  await sql`
    INSERT INTO student_data (data, period, section_number, uploaded_at)
    VALUES (${JSON.stringify(studentData)}, ${examPeriod}, ${sectionNumber}, NOW())
  `

  bustStudentDataCache()

  return Object.keys(studentData).length
}

export type PeriodDateInfo = {
  periodKey: string
  name: string
  startDate: string
  endDate: string
  excludedDates: string[]
  coinOnlyExemptDates: string[]
}

export async function getPeriodDates(periodKey: string): Promise<PeriodDateInfo | null> {
  if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
    throw new Error("Database not configured")
  }

  await ensureExamPeriodsSchema()

  const result = await sql`
    SELECT period_key, name, start_date, end_date, excluded_dates, coin_only_exempt_dates
    FROM exam_periods
    WHERE period_key = ${periodKey}
  `

  if (result.rows.length === 0) return null

  const row = result.rows[0]
  const formatDate = (date: unknown) => {
    if (!date) return ""
    if (typeof date === "string") return date.slice(0, 10)
    return new Date(date as Date).toISOString().split("T")[0]
  }

  return {
    periodKey: String(row.period_key),
    name: String(row.name),
    startDate: formatDate(row.start_date),
    endDate: formatDate(row.end_date),
    excludedDates: (row.excluded_dates as string[]) || [],
    coinOnlyExemptDates: (row.coin_only_exempt_dates as string[]) || [],
  }
}

/**
 * Active period = exam period whose date range includes today (Central).
 * If today falls in a gap (or after all periods), use the most recent period
 * that ended before today (backwards — never the next future period).
 */
export async function resolveActivePeriod(): Promise<{
  period: PeriodDateInfo
  source: "date_range" | "previous_period"
  latestUploadAt: string | null
  knownSections: string[]
} | null> {
  if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
    throw new Error("Database not configured")
  }

  await ensureStudentDataTable()
  await ensureExamPeriodsSchema()

  const today = todayInCentral()

  const containing = await sql`
    SELECT period_key
    FROM exam_periods
    WHERE start_date <= ${today}::date AND end_date >= ${today}::date
    ORDER BY start_date DESC
    LIMIT 1
  `

  let periodKey: string | null = null
  let source: "date_range" | "previous_period" = "date_range"

  if (containing.rows.length > 0) {
    periodKey = String(containing.rows[0].period_key)
    source = "date_range"
  } else {
    const previous = await sql`
      SELECT period_key
      FROM exam_periods
      WHERE end_date < ${today}::date
      ORDER BY end_date DESC
      LIMIT 1
    `
    if (previous.rows.length > 0) {
      periodKey = String(previous.rows[0].period_key)
      source = "previous_period"
    }
  }

  if (!periodKey) return null

  const period = await getPeriodDates(periodKey)
  if (!period) return null

  const latest = await sql`
    SELECT uploaded_at
    FROM student_data
    WHERE period = ${periodKey}
    ORDER BY uploaded_at DESC
    LIMIT 1
  `
  const latestUploadAt =
    latest.rows.length > 0
      ? new Date(latest.rows[0].uploaded_at as string).toISOString()
      : null

  const sections = await sql`
    SELECT DISTINCT COALESCE(section_number, 'default') as section_number
    FROM student_data
    WHERE period = ${periodKey}
    ORDER BY section_number
  `

  return {
    period,
    source,
    latestUploadAt,
    knownSections: sections.rows.map((r) => String(r.section_number)),
  }
}

/** Calendar date in America/Chicago (UTSA). */
export function todayInCentral(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

/**
 * ALEKS report window: period start → min(today, period end).
 * Without force, skips when today is outside the period or before day 7.
 */
export function computeReportWindow(
  startDate: string,
  endDate: string,
  today = todayInCentral(),
  options: { force?: boolean } = {},
) {
  const force = Boolean(options.force)
  // Current day or last day of the period, whichever comes first.
  const reportEndDate = today < endDate ? today : endDate
  const reportStartDate = startDate
  const firstAllowedSyncDay = new Date(`${startDate}T12:00:00Z`)
  firstAllowedSyncDay.setUTCDate(firstAllowedSyncDay.getUTCDate() + 6)
  const firstAllowedSyncDate = firstAllowedSyncDay.toISOString().slice(0, 10)

  if (!force) {
    if (today < startDate) {
      return {
        shouldSync: false as const,
        reason: "Period has not started yet",
        today,
        reportStartDate,
        reportEndDate: endDate,
        forced: false,
      }
    }
    if (today > endDate) {
      return {
        shouldSync: false as const,
        reason: "Period has ended",
        today,
        reportStartDate,
        reportEndDate: endDate,
        forced: false,
      }
    }
    if (today < firstAllowedSyncDate) {
      return {
        shouldSync: false as const,
        reason: "Waiting until day 7 of the exam period (ALEKS requires at least one week)",
        today,
        reportStartDate,
        reportEndDate,
        forced: false,
      }
    }
    return {
      shouldSync: true as const,
      reason: null as string | null,
      today,
      reportStartDate,
      reportEndDate,
      forced: false,
    }
  }

  let reason: string | null = "Forced sync"
  if (today < startDate) {
    // Before start: still pull the full period range so ALEKS has a valid window.
    reason = "Forced sync (period has not started yet — using full period range)"
    return {
      shouldSync: true as const,
      reason,
      today,
      reportStartDate,
      reportEndDate: endDate,
      forced: true,
    }
  }
  if (today > endDate) {
    reason = "Forced sync (period has ended — using period end date)"
  }

  return {
    shouldSync: true as const,
    reason,
    today,
    reportStartDate,
    reportEndDate,
    forced: true,
  }
}
