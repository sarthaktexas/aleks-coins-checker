import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"

type StudentData = {
  [studentId: string]: {
    name: string
    email: string
    coins: number
    totalDays: number
    periodDays: number
    percentComplete: number
    dailyLog: any[]
    exemptDayCredits?: number
  }
}

async function applyOverridesToStudentData(studentData: StudentData, studentId?: string): Promise<StudentData> {
  try {
    // Get all overrides including date field to match by date instead of day_number
    // We fetch all and filter in memory to avoid SQL syntax issues with conditional WHERE
    const overridesResult = await sql`
      SELECT student_id, day_number, date, override_type, reason
      FROM student_day_overrides
    `
    
    // Filter by studentId if provided
    const filteredOverrides = studentId 
      ? overridesResult.rows.filter(override => override.student_id.toLowerCase() === studentId.toLowerCase())
      : overridesResult.rows

    // Group overrides by student_id and date
    const overridesMap = new Map<string, Map<string, any>>()
    
    filteredOverrides.forEach(override => {
      if (!overridesMap.has(override.student_id)) {
        overridesMap.set(override.student_id, new Map())
      }
      overridesMap.get(override.student_id)!.set(override.date, override)
    })

    // Apply overrides to each student's daily log
    const updatedStudentData = { ...studentData }
    
    Object.keys(updatedStudentData).forEach(sId => {
      const student = updatedStudentData[sId]
      const studentOverrides = overridesMap.get(sId)
      
      if (student.dailyLog) {
        if (studentOverrides) {
          student.dailyLog = student.dailyLog.map(day => {
            const override = studentOverrides.get(day.date)
            if (override) {
              return {
                ...day,
                qualified: override.override_type === "qualified",
                reason: override.reason || day.reason
              }
            }
            return day
          })
        }

        // Recalculate totals based on daily log
        const workingDayLogs = student.dailyLog.filter((d) => !d.isExcluded)
        const completedWorkingDays = workingDayLogs.length
        const qualifiedWorkingDays = workingDayLogs.filter((d) => d.qualified).length
        
        const exemptDayCredits = student.dailyLog.filter((d) => d.isExcluded && d.wouldHaveQualified).length
        
        const percentComplete = completedWorkingDays > 0 ? Math.round(((qualifiedWorkingDays + exemptDayCredits) / completedWorkingDays) * 100 * 10) / 10 : 0
        
        student.percentComplete = percentComplete
        student.coins = qualifiedWorkingDays + exemptDayCredits
        student.exemptDayCredits = exemptDayCredits
      }
    })

    return updatedStudentData
  } catch (error) {
    console.error("Error applying overrides:", error)
    return studentData
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { studentIds } = body

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json({ error: "studentIds array is required" }, { status: 400 })
    }

    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    // Normalize student IDs to lowercase
    const normalizedIds = studentIds.map(id => id.toLowerCase())
    const studentIdsSet = new Set(normalizedIds)

    // Get all periods for these students
    const result = await sql`
      SELECT data, period, section_number, uploaded_at 
      FROM student_data 
      ORDER BY uploaded_at DESC
    `

    // Group periods by student ID
    const studentPeriods = new Map<string, Array<{ period: string, section: string, data: any, uploadedAt: string }>>()
    const processedPeriods = new Set<string>()

    for (const row of result.rows) {
      let rowStudentData: StudentData
      if (typeof row.data === "string") {
        rowStudentData = JSON.parse(row.data)
      } else {
        rowStudentData = row.data as StudentData
      }

      const periodKey = `${row.period}_${row.section_number || 'default'}`
      
      if (!processedPeriods.has(periodKey)) {
        Object.keys(rowStudentData).forEach(studentId => {
          const normalizedId = studentId.toLowerCase()
          if (studentIdsSet.has(normalizedId)) {
            if (!studentPeriods.has(normalizedId)) {
              studentPeriods.set(normalizedId, [])
            }
            
            studentPeriods.get(normalizedId)!.push({
              period: row.period,
              section: row.section_number || 'default',
              data: rowStudentData[studentId],
              uploadedAt: row.uploaded_at
            })
          }
        })
        
        processedPeriods.add(periodKey)
      }
    }

    // Get all coin adjustments for these students
    let coinAdjustments: any[] = []
    try {
      // Build query with proper array handling for Vercel Postgres
      const adjustmentsResult = await sql`
        SELECT 
          student_id,
          period,
          section_number,
          adjustment_amount
        FROM coin_adjustments
        WHERE LOWER(student_id) = ANY(${normalizedIds}::text[]) AND is_active = true
      `
      coinAdjustments = adjustmentsResult.rows
    } catch (error) {
      console.error("Error fetching coin adjustments:", error)
      // Fallback: fetch all adjustments and filter in memory
      try {
        const allAdjustmentsResult = await sql`
          SELECT 
            student_id,
            period,
            section_number,
            adjustment_amount
          FROM coin_adjustments
          WHERE is_active = true
        `
        coinAdjustments = allAdjustmentsResult.rows.filter(adj => 
          studentIdsSet.has(adj.student_id.toLowerCase())
        )
      } catch (fallbackError) {
        console.error("Error in fallback query:", fallbackError)
      }
    }

    // Organize adjustments by student and period
    const adjustmentsByStudent = new Map<string, { byPeriod: Map<string, number>, global: number }>()
    
    coinAdjustments.forEach(adj => {
      const normalizedId = adj.student_id.toLowerCase()
      if (!adjustmentsByStudent.has(normalizedId)) {
        adjustmentsByStudent.set(normalizedId, { byPeriod: new Map(), global: 0 })
      }
      
      const studentAdjustments = adjustmentsByStudent.get(normalizedId)!
      
      if (adj.period === '__GLOBAL__' || adj.period === null || adj.period === undefined) {
        studentAdjustments.global += adj.adjustment_amount
      } else {
        const periodKey = `${adj.period}_${adj.section_number || 'default'}`
        const current = studentAdjustments.byPeriod.get(periodKey) || 0
        studentAdjustments.byPeriod.set(periodKey, current + adj.adjustment_amount)
      }
    })

    // Calculate total balance for each student
    const balances: Record<string, number> = {}

    for (const studentId of normalizedIds) {
      const periods = studentPeriods.get(studentId) || []
      const studentAdjustments = adjustmentsByStudent.get(studentId) || { byPeriod: new Map(), global: 0 }

      // Calculate coins for each period with overrides and adjustments
      let totalCoinsFromPeriods = 0
      
      for (const periodData of periods) {
        // Apply overrides to this period's data
        const tempStudentData: StudentData = { [studentId]: periodData.data }
        const overriddenData = await applyOverridesToStudentData(tempStudentData, studentId)
        const studentWithOverrides = overriddenData[studentId]
        
        if (studentWithOverrides) {
          // Get period-specific adjustment
          const periodKey = `${periodData.period}_${periodData.section}`
          const periodAdjustment = studentAdjustments.byPeriod.get(periodKey) || 0
          
          // Calculate total coins for this period: coins + period adjustment
          const periodTotalCoins = (studentWithOverrides.coins || 0) + periodAdjustment
          totalCoinsFromPeriods += periodTotalCoins
        }
      }

      // Calculate total: sum of (period coins + period adjustments) + global adjustments
      // Clamp to 0 minimum - students can't have negative coins
      balances[studentId] = Math.max(0, totalCoinsFromPeriods + studentAdjustments.global)
    }

    return NextResponse.json({
      success: true,
      balances
    })
  } catch (error) {
    console.error("Error calculating student balances:", error)
    return NextResponse.json(
      { 
        error: "Failed to calculate student balances",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined
      },
      { status: 500 }
    )
  }
}


