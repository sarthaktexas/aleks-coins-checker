import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"

// Simple in-memory cache for analytics (in production, consider Redis)
let analyticsCache: { data: MergedPeriodStats[], timestamp: number } | null = null
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

type StudentData = {
  [studentId: string]: {
    name: string
    email: string
    coins: number
    totalDays: number
    periodDays: number
    percentComplete: number
    dailyLog: Array<{
      day: number
      date: string
      qualified: boolean
      minutes: number
      topics: number
      reason: string
      isExcluded?: boolean
      wouldHaveQualified?: boolean
    }>
    exemptDayCredits?: number
  }
}

type DayStats = {
  day: number
  date: string
  averageCompletion: number
  averageTime: number
  totalStudents: number
  qualifiedStudents: number
  isExcluded: boolean
  sectionData: {
    sectionNumber: string
    completion: number
    time: number
    students: number
    qualified: number
  }[]
  discrepancy: number
}

type SectionStats = {
  sectionNumber: string
  period: string
  totalStudents: number
  averageCompletion: number
  averageTime: number
  dayStats: DayStats[]
}

type MergedPeriodStats = {
  period: string
  sections: string[]
  totalStudents: number
  averageCompletion: number
  averageTime: number
  dayStats: DayStats[]
}

async function applyOverridesToStudentData(studentData: StudentData): Promise<StudentData> {
  try {
    // Get all overrides (now student-specific only)
    const overridesResult = await sql`
      SELECT student_id, day_number, override_type, reason
      FROM student_day_overrides
    `

    const overridesMap = new Map<string, Map<number, any>>()
    
    // Group overrides by student_id
    overridesResult.rows.forEach(override => {
      if (!overridesMap.has(override.student_id)) {
        overridesMap.set(override.student_id, new Map())
      }
      overridesMap.get(override.student_id)!.set(override.day_number, override)
    })

    // Apply overrides to each student's daily log
    const updatedStudentData = { ...studentData }
    
    Object.keys(updatedStudentData).forEach(studentId => {
      const student = updatedStudentData[studentId]
      const studentOverrides = overridesMap.get(studentId)
      
      if (studentOverrides && student.dailyLog) {
        // Apply overrides to daily log
        student.dailyLog = student.dailyLog.map(day => {
          const override = studentOverrides.get(day.day)
          if (override) {
            return {
              ...day,
              qualified: override.override_type === "qualified",
              reason: override.reason || day.reason
            }
          }
          return day
        })

        // Recalculate totals based on updated daily log
        const workingDayLogs = student.dailyLog.filter((d) => !d.isExcluded)
        const completedWorkingDays = workingDayLogs.length
        const qualifiedWorkingDays = workingDayLogs.filter((d) => d.qualified).length
        const percentComplete = completedWorkingDays > 0 ? Math.round((qualifiedWorkingDays / completedWorkingDays) * 100 * 10) / 10 : 0
        
        // Calculate exempt day credits (from days that would have qualified on exempt days)
        const exemptDayCredits = student.dailyLog.filter((d) => d.isExcluded && d.wouldHaveQualified).length
        
        student.percentComplete = percentComplete
        student.coins = qualifiedWorkingDays + exemptDayCredits
        student.exemptDayCredits = exemptDayCredits
      }
    })

    return updatedStudentData
  } catch (error) {
    console.error("Error applying overrides:", error)
    return studentData // Return original data if override application fails
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get("period")

    // Check cache first
    if (analyticsCache && Date.now() - analyticsCache.timestamp < CACHE_DURATION) {
      let cachedPeriods = analyticsCache.data
      
      // Filter by period if requested
      if (period) {
        cachedPeriods = cachedPeriods.filter(p => p.period === period)
      }
      
      return NextResponse.json({
        success: true,
        periods: cachedPeriods,
        cached: true
      })
    }

    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ 
        error: "Database not configured",
        sections: []
      }, { status: 503 })
    }

    // Get all upload records
    let uploadRecords
    try {
      // Check if section_number column exists
      const columnCheck = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'student_data' AND column_name = 'section_number'
      `
      
      if (columnCheck.rows.length > 0) {
        uploadRecords = await sql`
          SELECT 
            period,
            COALESCE(section_number, 'default') as section_number,
            uploaded_at,
            data
          FROM student_data 
          ORDER BY uploaded_at DESC
        `
      } else {
        uploadRecords = await sql`
          SELECT 
            period,
            'default' as section_number,
            uploaded_at,
            data
          FROM student_data 
          ORDER BY uploaded_at DESC
        `
      }
    } catch (error) {
      console.error("Error querying data:", error)
      return NextResponse.json({ 
        error: "Failed to query database",
        sections: []
      }, { status: 500 })
    }

    if (uploadRecords.rows.length === 0) {
      return NextResponse.json({ 
        success: true,
        sections: []
      })
    }

    // Group uploads by period and section, keeping only the latest upload for each combination
    const latestUploads = new Map<string, any>()
    
    uploadRecords.rows.forEach(row => {
      const key = `${row.period}-${row.section_number}`
      
      if (!latestUploads.has(key) || new Date(row.uploaded_at) > new Date(latestUploads.get(key).uploaded_at)) {
        latestUploads.set(key, {
          period: row.period,
          section_number: row.section_number,
          uploaded_at: row.uploaded_at,
          data: row.data
        })
      }
    })

    // Group uploads by period
    const periodGroups = new Map<string, any[]>()
    for (const [key, upload] of latestUploads) {
      if (period && upload.period !== period) {
        continue
      }
      
      if (!periodGroups.has(upload.period)) {
        periodGroups.set(upload.period, [])
      }
      periodGroups.get(upload.period)!.push(upload)
    }

    const mergedPeriods: MergedPeriodStats[] = []

    // Process each period (merging all sections)
    for (const [periodName, uploads] of periodGroups) {
      const allStudents: any[] = []
      const sectionNames: string[] = []
      let totalStudents = 0
      let totalCompletion = 0
      let totalTime = 0
      let totalDaysWithTime = 0

      // Collect all students from all sections in this period
      for (const upload of uploads) {
        let studentData: StudentData
        if (typeof upload.data === "string") {
          studentData = JSON.parse(upload.data)
        } else {
          studentData = upload.data
        }

        // Apply overrides to match what students see
        studentData = await applyOverridesToStudentData(studentData)

        const students = Object.values(studentData)
        if (students.length === 0) continue

        sectionNames.push(upload.section_number)
        allStudents.push(...students.map(s => ({ ...s, sectionNumber: upload.section_number })))
        totalStudents += students.length
        totalCompletion += students.reduce((sum, student) => sum + student.percentComplete, 0)
        
        // Calculate time for this section
        students.forEach(student => {
          student.dailyLog.forEach(day => {
            if (day.minutes > 0) {
              totalTime += day.minutes
              totalDaysWithTime++
            }
          })
        })
      }

      if (allStudents.length === 0) continue

      const averageCompletion = totalStudents > 0 ? totalCompletion / totalStudents : 0
      const averageTime = totalDaysWithTime > 0 ? totalTime / totalDaysWithTime : 0

      // Calculate day-by-day statistics with section breakdown
      const dayStatsMap = new Map<number, {
        day: number
        date: string
        totalStudents: number
        qualifiedStudents: number
        totalTime: number
        studentsWithTime: number
        isExcluded: boolean
        sectionBreakdown: Map<string, {
          students: number
          qualified: number
          time: number
          timeCount: number
        }>
      }>()

      // Pre-allocate day stats
      const allDays = allStudents.flatMap(s => s.dailyLog.map(d => d.day))
      if (allDays.length === 0) continue
      
      const maxDay = Math.max(...allDays)
      for (let day = 1; day <= maxDay; day++) {
        dayStatsMap.set(day, {
          day,
          date: '',
          totalStudents: 0,
          qualifiedStudents: 0,
          totalTime: 0,
          studentsWithTime: 0,
          isExcluded: false,
          sectionBreakdown: new Map()
        })
      }

      // Process all students' daily logs
      allStudents.forEach(student => {
        student.dailyLog.forEach(day => {
          const dayStats = dayStatsMap.get(day.day)
          if (dayStats) {
            // Set date and excluded status from first occurrence
            if (!dayStats.date) {
              dayStats.date = day.date
              dayStats.isExcluded = day.isExcluded || false
            }
            
            // Initialize section breakdown if not exists
            if (!dayStats.sectionBreakdown.has(student.sectionNumber)) {
              dayStats.sectionBreakdown.set(student.sectionNumber, {
                students: 0,
                qualified: 0,
                time: 0,
                timeCount: 0
              })
            }
            
            const sectionData = dayStats.sectionBreakdown.get(student.sectionNumber)!
            dayStats.totalStudents++
            sectionData.students++
            
            // For exempt days, count students who qualified (including wouldHaveQualified)
            // For regular days, count students who qualified
            if (day.isExcluded) {
              if (day.qualified || day.wouldHaveQualified) {
                dayStats.qualifiedStudents++
                sectionData.qualified++
              }
            } else {
              if (day.qualified) {
                dayStats.qualifiedStudents++
                sectionData.qualified++
              }
            }
            
            if (day.minutes > 0) {
              dayStats.totalTime += day.minutes
              dayStats.studentsWithTime++
              sectionData.time += day.minutes
              sectionData.timeCount++
            }
          }
        })
      })

      // Convert to final format with section data and discrepancy
      const dayStats: DayStats[] = Array.from(dayStatsMap.values())
        .sort((a, b) => a.day - b.day)
        .map(day => {
          const sectionData = Array.from(day.sectionBreakdown.entries()).map(([sectionNumber, data]) => ({
            sectionNumber,
            completion: data.students > 0 ? (data.qualified / data.students) * 100 : 0,
            time: data.timeCount > 0 ? data.time / data.timeCount : 0,
            students: data.students,
            qualified: data.qualified
          }))

          // Calculate discrepancy between sections
          const completions = sectionData.map(s => s.completion)
          const discrepancy = completions.length > 1 ? Math.max(...completions) - Math.min(...completions) : 0

          return {
            day: day.day,
            date: day.date,
            averageCompletion: day.totalStudents > 0 ? (day.qualifiedStudents / day.totalStudents) * 100 : 0,
            averageTime: day.studentsWithTime > 0 ? day.totalTime / day.studentsWithTime : 0,
            totalStudents: day.totalStudents,
            qualifiedStudents: day.qualifiedStudents,
            isExcluded: day.isExcluded,
            sectionData,
            discrepancy
          }
        })

      mergedPeriods.push({
        period: periodName,
        sections: sectionNames,
        totalStudents,
        averageCompletion: Math.round(averageCompletion * 10) / 10,
        averageTime: Math.round(averageTime * 10) / 10,
        dayStats
      })
    }

    // Sort periods by name
    mergedPeriods.sort((a, b) => a.period.localeCompare(b.period))

    // Update cache
    analyticsCache = {
      data: mergedPeriods,
      timestamp: Date.now()
    }

    // Filter by period if requested
    let filteredPeriods = mergedPeriods
    if (period) {
      filteredPeriods = mergedPeriods.filter(p => p.period === period)
    }

    return NextResponse.json({
      success: true,
      periods: filteredPeriods,
      cached: false
    })

  } catch (error) {
    console.error("Error calculating analytics:", error)
    return NextResponse.json(
      { 
        error: "Failed to calculate analytics",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined
      },
      { status: 500 }
    )
  }
}
