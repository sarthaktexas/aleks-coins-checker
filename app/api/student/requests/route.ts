import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"

type DailyLog = {
  day: number
  date: string
  qualified: boolean
  minutes: number
  topics: number
  reason: string
  isExcluded?: boolean
  wouldHaveQualified?: boolean
}

type StudentData = {
  [key: string]: {
    name: string
    email: string
    coins: number
    totalDays: number
    periodDays: number
    percentComplete: number
    dailyLog: DailyLog[]
    exemptDayCredits?: number
  }
}

// Apply day overrides to student data (same logic as student route)
async function applyOverridesToStudentData(studentData: StudentData, studentId?: string): Promise<StudentData> {
  try {
    const studentIds = Object.keys(studentData)
    
    if (studentIds.length === 0) {
      return studentData
    }

    // Get overrides only for the students we're processing
    let overridesResult
    if (studentId && studentIds.includes(studentId.toLowerCase())) {
      overridesResult = await sql`
        SELECT student_id, day_number, date, override_type, reason
        FROM student_day_overrides
        WHERE student_id = ${studentId.toLowerCase()}
      `
    } else {
      const allOverrides = await sql`
        SELECT student_id, day_number, date, override_type, reason
        FROM student_day_overrides
      `
      const studentIdsSet = new Set(studentIds.map(id => id.toLowerCase()))
      overridesResult = {
        rows: allOverrides.rows.filter(row => studentIdsSet.has(row.student_id.toLowerCase()))
      }
    }

    // Group overrides by student_id and date
    const overridesMap = new Map<string, Map<string, any>>()
    
    overridesResult.rows.forEach(override => {
      if (!overridesMap.has(override.student_id)) {
        overridesMap.set(override.student_id, new Map())
      }
      overridesMap.get(override.student_id)!.set(override.date, override)
    })

    // Apply overrides to each student's daily log
    const updatedStudentData = { ...studentData }
    
    Object.keys(updatedStudentData).forEach(studentId => {
      const student = updatedStudentData[studentId]
      const studentOverrides = overridesMap.get(studentId)
      
      if (student.dailyLog) {
        // Apply overrides to daily log by matching date
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

        // Recalculate totals based on daily log (with or without overrides)
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
    return studentData // Return original data if override application fails
  }
}

// POST - Submit a new student request
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { studentId, studentName, studentEmail, period, sectionNumber, requestType, requestDetails, dayNumber, overrideDate } = body

    // Validate input
    if (!studentId || !studentName || !studentEmail || !period || !sectionNumber || !requestType || !requestDetails) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 })
    }

    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    // Check if the request type is allowed based on settings
    try {
      if (requestType === 'override_request') {
        const settingsResult = await sql`
          SELECT setting_value
          FROM admin_settings
          WHERE setting_key = 'overrides_enabled'
        `
        let overridesEnabled = true // Default to enabled if setting doesn't exist
        if (settingsResult.rows.length > 0) {
          const value = settingsResult.rows[0].setting_value
          // Ensure boolean values are properly converted (PostgreSQL might return as string or boolean)
          overridesEnabled = typeof value === 'boolean' ? value : value === true || value === 'true' || value === 't' || value === 1
        }
        
        if (!overridesEnabled) {
          return NextResponse.json({ 
            error: "Day override requests are currently disabled. Please contact your instructor." 
          }, { status: 403 })
        }
      } else if (requestType === 'assignment_replacement' || requestType === 'quiz_replacement') {
        const settingsResult = await sql`
          SELECT setting_value
          FROM admin_settings
          WHERE setting_key = 'redemption_requests_enabled'
        `
        let redemptionEnabled = true // Default to enabled if setting doesn't exist
        if (settingsResult.rows.length > 0) {
          const value = settingsResult.rows[0].setting_value
          // Ensure boolean values are properly converted (PostgreSQL might return as string or boolean)
          redemptionEnabled = typeof value === 'boolean' ? value : value === true || value === 'true' || value === 't' || value === 1
        }
        
        if (!redemptionEnabled) {
          return NextResponse.json({ 
            error: "Redemption requests are currently disabled. Please contact your instructor." 
          }, { status: 403 })
        }
      }
    } catch (settingsError) {
      // If settings table doesn't exist yet, allow the operation (backward compatibility)
      console.log("Settings check skipped (table may not exist):", settingsError)
    }

    // Determine coin deduction amount for redemption requests
    let coinDeduction = 0
    if (requestType === 'assignment_replacement') {
      coinDeduction = 10
    } else if (requestType === 'quiz_replacement') {
      coinDeduction = 20
    }

    // Validate that student has enough coins for redemption requests
    if (coinDeduction > 0) {
      try {
        const normalizedStudentId = studentId.toLowerCase().trim()
        
        // Get student's current total coins across all periods
        // Use the same approach as the student route to ensure consistency
        const studentDataResult = await sql`
          SELECT data, period, section_number, uploaded_at
          FROM student_data
          ORDER BY uploaded_at DESC
        `
        
        // Track all periods for this student (same logic as student route)
        const studentPeriods: Array<{ period: string, section: string, data: any }> = []
        const processedPeriods = new Set<string>()
        
        for (const row of studentDataResult.rows) {
          let rowData: any
          if (typeof row.data === "string") {
            rowData = JSON.parse(row.data)
          } else {
            rowData = row.data
          }
          
          const student = rowData[normalizedStudentId]
          if (student) {
            const periodKey = `${row.period}_${row.section_number || 'default'}`
            // Only process the latest upload for each period/section combination
            if (!processedPeriods.has(periodKey)) {
              studentPeriods.push({
                period: row.period,
                section: row.section_number || 'default',
                data: student
              })
              processedPeriods.add(periodKey)
            }
          }
        }
        
        // Get active coin adjustments first (same as student route)
        const adjustmentsResult = await sql`
          SELECT 
            period,
            section_number,
            adjustment_amount
          FROM coin_adjustments
          WHERE student_id = ${normalizedStudentId} AND is_active = true
        `
        
        // Create a map of adjustments by period (same as student route)
        const adjustmentsByPeriod = new Map<string, number>()
        let globalAdjustments = 0
        
        adjustmentsResult.rows.forEach(adj => {
          if (adj.period === '__GLOBAL__' || adj.period === null || adj.period === undefined) {
            globalAdjustments += adj.adjustment_amount
          } else {
            // Period-specific adjustment
            const key = `${adj.period}_${adj.section_number || 'default'}`
            const current = adjustmentsByPeriod.get(key) || 0
            adjustmentsByPeriod.set(key, current + adj.adjustment_amount)
          }
        })
        
        // Apply overrides to each period's data and calculate coins (same logic as student route)
        // For each period: totalCoins = coins + periodAdjustment, then sum all periods
        let totalCoinsFromPeriods = 0
        for (const periodData of studentPeriods) {
          // Apply overrides to this period's data
          const tempStudentData: StudentData = { [normalizedStudentId]: periodData.data }
          const overriddenData = await applyOverridesToStudentData(tempStudentData, normalizedStudentId)
          const studentWithOverrides = overriddenData[normalizedStudentId]
          
          if (studentWithOverrides) {
            // Get period-specific adjustment for this period (same as student route)
            const periodKey = `${periodData.period}_${periodData.section}`
            const periodAdjustment = adjustmentsByPeriod.get(periodKey) || 0
            
            // Calculate total coins for this period: coins + period adjustment (same as student route)
            const periodTotalCoins = (studentWithOverrides.coins || 0) + periodAdjustment
            totalCoinsFromPeriods += periodTotalCoins
          }
        }
        
        // Calculate current total (before this redemption)
        // Same formula as student route: sum of (period coins + period adjustments) + global adjustments
        const currentTotal = Math.max(0, totalCoinsFromPeriods + globalAdjustments)
        
        // Check if student has enough coins
        if (currentTotal < coinDeduction) {
          return NextResponse.json({ 
            error: `Insufficient coins. You have ${currentTotal} coin${currentTotal !== 1 ? 's' : ''} but need ${coinDeduction} coins for this redemption.` 
          }, { status: 400 })
        }
      } catch (validationError) {
        // If validation fails, log but allow the request (better to allow than block if there's an error)
        console.error("Error validating coin balance:", validationError)
        // Continue with request submission
      }
    }

    // Insert the request into the database
    const result = await sql`
      INSERT INTO student_requests (
        student_id, 
        student_name, 
        student_email, 
        period, 
        section_number, 
        request_type, 
        request_details,
        day_number,
        override_date,
        status
      )
      VALUES (
        ${studentId.toLowerCase().trim()}, 
        ${studentName}, 
        ${studentEmail}, 
        ${period}, 
        ${sectionNumber}, 
        ${requestType}, 
        ${requestDetails},
        ${dayNumber || null},
        ${overrideDate || null},
        'pending'
      )
      RETURNING id, submitted_at
    `

    // If this is a redemption request, deduct coins immediately
    // Redemptions deduct from total coins, not from a specific period
    // So we set period to "__GLOBAL__" to indicate it's a global adjustment
    if (coinDeduction > 0) {
      const requestId = result.rows[0].id
      
      // Ensure the coin_adjustments table has the request_id column
      try {
        const columnCheck = await sql`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'coin_adjustments' AND column_name = 'request_id'
        `
        
        if (columnCheck.rows.length === 0) {
          // Add the request_id column (nullable, as not all adjustments are linked to requests)
          await sql`
            ALTER TABLE coin_adjustments 
            ADD COLUMN request_id INTEGER REFERENCES student_requests(id) ON DELETE SET NULL
          `
        }
      } catch (migrationError) {
        console.error("Error checking/adding request_id column:", migrationError)
        // Continue anyway - the column might already exist or this might be a non-critical error
      }
      
      // Insert coin adjustment with "__GLOBAL__" period for global (total) deduction
      // Link it to the request via request_id
      // Wrap in try-catch to handle failures gracefully and log for diagnosis
      try {
        const adjustmentResult = await sql`
          INSERT INTO coin_adjustments (
            student_id,
            student_name,
            period,
            section_number,
            adjustment_amount,
            reason,
            created_by,
            created_at,
            request_id
          )
          VALUES (
            ${studentId.toLowerCase().trim()},
            ${studentName},
            '__GLOBAL__',
            ${sectionNumber},
            ${-coinDeduction},
            ${`Pending ${requestType.replace('_', ' ')} request - ${requestDetails.substring(0, 50)}...`},
            'system',
            NOW(),
            ${requestId}
          )
          RETURNING id
        `
        
        // Verify the adjustment was created successfully
        if (!adjustmentResult.rows || adjustmentResult.rows.length === 0) {
          console.error(`Failed to create coin adjustment for request ${requestId}. Request created but adjustment failed.`)
          // Note: We don't delete the request here as it might be useful for diagnosis
          // The reject-failed endpoint can be used to clean these up
        }
      } catch (adjustmentError) {
        // Log the error but don't fail the request submission
        // The request will be created but marked as failed by the reject-failed endpoint
        console.error(`Error creating coin adjustment for request ${requestId}:`, adjustmentError)
        console.error(`Request was created (id: ${requestId}) but coin adjustment failed. Student: ${studentId}, Deduction: ${coinDeduction}`)
        // Don't throw - let the request be created so admin can see it in the reject-failed list
      }
    }

    return NextResponse.json({
      success: true,
      message: "Request submitted successfully",
      requestId: result.rows[0].id,
      submittedAt: result.rows[0].submitted_at
    })
  } catch (error) {
    console.error("Error submitting student request:", error)
    return NextResponse.json(
      { 
        error: "Failed to submit request",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined
      },
      { status: 500 }
    )
  }
}

// GET - Fetch requests for a specific student
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get("studentId")

    if (!studentId) {
      return NextResponse.json({ error: "Student ID is required" }, { status: 400 })
    }

    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured", requests: [] }, { status: 503 })
    }

    // Get all requests for this student
    const result = await sql`
      SELECT 
        id,
        period,
        section_number,
        request_type,
        request_details,
        submitted_at,
        status,
        admin_notes,
        processed_at,
        processed_by
      FROM student_requests
      WHERE student_id = ${studentId.toLowerCase().trim()}
      ORDER BY submitted_at DESC
    `

    return NextResponse.json({
      success: true,
      requests: result.rows
    })
  } catch (error) {
    console.error("Error fetching student requests:", error)
    return NextResponse.json(
      { 
        error: "Failed to fetch requests",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined
      },
      { status: 500 }
    )
  }
}

