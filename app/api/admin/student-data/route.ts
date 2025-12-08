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

async function applyOverridesToStudentData(studentData: StudentData): Promise<StudentData> {
  try {
    // Get all overrides including date field to match by date instead of day_number
    // This ensures overrides from one period don't apply to another period
    const overridesResult = await sql`
      SELECT student_id, day_number, date, override_type, reason
      FROM student_day_overrides
    `

    // Group overrides by student_id and date (not day_number, since day numbers are period-specific)
    const overridesMap = new Map<string, Map<string, any>>()
    
    overridesResult.rows.forEach(override => {
      if (!overridesMap.has(override.student_id)) {
        overridesMap.set(override.student_id, new Map())
      }
      // Use date as the key instead of day_number to match the correct period
      overridesMap.get(override.student_id)!.set(override.date, override)
    })

    // Apply overrides to each student's daily log
    const updatedStudentData = { ...studentData }
    
    Object.keys(updatedStudentData).forEach(studentId => {
      const student = updatedStudentData[studentId]
      const studentOverrides = overridesMap.get(studentId)
      
      if (student.dailyLog) {
        // Apply overrides to daily log by matching date (not day_number) if they exist
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

        // Always recalculate totals based on daily log (with or without overrides)
        const workingDayLogs = student.dailyLog.filter((d) => !d.isExcluded)
        const completedWorkingDays = workingDayLogs.length
        const qualifiedWorkingDays = workingDayLogs.filter((d) => d.qualified).length
        
        // Calculate exempt day credits (from days that would have qualified on exempt days)
        const exemptDayCredits = student.dailyLog.filter((d) => d.isExcluded && d.wouldHaveQualified).length
        
        // Include exempt day credits in percentage to allow over 100% for extra credit
        const percentComplete = completedWorkingDays > 0 ? Math.round(((qualifiedWorkingDays + exemptDayCredits) / completedWorkingDays) * 100 * 10) / 10 : 0
        
        // Don't overwrite totalDays - it should remain the max day number with data
        // student.totalDays should stay as the original value (max day number with data)
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
    const sectionNumber = searchParams.get("sectionNumber")

    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ 
        error: "Database not configured",
        uploadRecords: [],
        studentData: {}
      }, { status: 503 })
    }

    // Get upload records - handle both old and new schema
    let uploadRecords
    try {
      // First, check if the section_number column exists
      const columnCheck = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'student_data' AND column_name = 'section_number'
      `
      
      if (columnCheck.rows.length > 0) {
        // Column exists, use it
        uploadRecords = await sql`
          SELECT 
            id,
            period,
            COALESCE(section_number, 'default') as section_number,
            uploaded_at,
            data
          FROM student_data 
          ORDER BY uploaded_at DESC
        `
      } else {
        // Column doesn't exist, use fallback
        uploadRecords = await sql`
          SELECT 
            id,
            period,
            'default' as section_number,
            uploaded_at,
            data
          FROM student_data 
          ORDER BY uploaded_at DESC
        `
      }
    } catch (error) {
      console.error("Error checking column or querying data:", error)
      // Final fallback - try the old schema query
      uploadRecords = await sql`
        SELECT 
          id,
          period,
          'default' as section_number,
          uploaded_at,
          data
        FROM student_data 
        ORDER BY uploaded_at DESC
      `
    }

    let studentData = {}

    // If a period is requested, get that data (section is optional)
    // If no period is requested, get all students from all periods
    if (period) {
      let result
      try {
        // Check if section_number column exists first
        const columnCheck = await sql`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'student_data' AND column_name = 'section_number'
        `
        
        if (columnCheck.rows.length > 0) {
          // Column exists
          if (sectionNumber) {
            // Specific section requested
            result = await sql`
              SELECT data, uploaded_at, section_number
              FROM student_data 
              WHERE period = ${period} AND COALESCE(section_number, 'default') = ${sectionNumber}
              ORDER BY uploaded_at DESC 
              LIMIT 1
            `
          } else {
            // All sections requested - get latest upload for each section and merge
            result = await sql`
              SELECT data, uploaded_at, section_number
              FROM student_data 
              WHERE period = ${period}
              ORDER BY uploaded_at DESC
            `
          }
        } else {
          // Column doesn't exist, use fallback
          result = await sql`
            SELECT data, uploaded_at, 'default' as section_number
            FROM student_data 
            WHERE period = ${period}
            ORDER BY uploaded_at DESC 
            LIMIT 1
          `
        }
      } catch (error) {
        console.error("Error querying student data:", error)
        // Final fallback
        result = await sql`
          SELECT data, uploaded_at, 'default' as section_number
          FROM student_data 
          WHERE period = ${period}
          ORDER BY uploaded_at DESC 
          LIMIT 1
        `
      }

      if (result.rows.length > 0) {
        if (sectionNumber) {
          // Single section - use first result
          const row = result.rows[0]
          if (typeof row.data === "string") {
            studentData = JSON.parse(row.data)
          } else {
            studentData = row.data
          }
        } else {
          // Multiple sections - merge data, keeping most recent for each student
          const studentDataMap = new Map<string, { data: any, uploadedAt: string }>()
          
          for (const row of result.rows) {
            let rowData: any
            if (typeof row.data === "string") {
              rowData = JSON.parse(row.data)
            } else {
              rowData = row.data
            }
            
            // For each student in this section's data, keep the most recent upload
            Object.keys(rowData).forEach(studentId => {
              const existing = studentDataMap.get(studentId)
              if (!existing || new Date(row.uploaded_at) > new Date(existing.uploadedAt)) {
                studentDataMap.set(studentId, {
                  data: rowData[studentId],
                  uploadedAt: row.uploaded_at
                })
              }
            })
          }
          
          // Convert map back to object
          studentData = {}
          studentDataMap.forEach((value, studentId) => {
            studentData[studentId] = value.data
          })
        }
        
        // Apply overrides to student data to match what students see
        studentData = await applyOverridesToStudentData(studentData)
      }
    } else {
      // No period specified - load all students from all periods
      // Get latest upload for each period/section combination and merge
      let result
      try {
        const columnCheck = await sql`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'student_data' AND column_name = 'section_number'
        `
        
        if (columnCheck.rows.length > 0) {
          if (sectionNumber) {
            // Specific section across all periods
            result = await sql`
              SELECT data, uploaded_at, section_number, period
              FROM student_data 
              WHERE COALESCE(section_number, 'default') = ${sectionNumber}
              ORDER BY uploaded_at DESC
            `
          } else {
            // All sections across all periods
            result = await sql`
              SELECT data, uploaded_at, section_number, period
              FROM student_data 
              ORDER BY uploaded_at DESC
            `
          }
        } else {
          // Column doesn't exist
          result = await sql`
            SELECT data, uploaded_at, 'default' as section_number, period
            FROM student_data 
            ORDER BY uploaded_at DESC
          `
        }
      } catch (error) {
        console.error("Error querying all student data:", error)
        result = await sql`
          SELECT data, uploaded_at, 'default' as section_number, period
          FROM student_data 
          ORDER BY uploaded_at DESC
        `
      }

      if (result.rows.length > 0) {
        // Merge data from all periods, keeping most recent for each student
        const studentDataMap = new Map<string, { data: any, uploadedAt: string }>()
        
        for (const row of result.rows) {
          let rowData: any
          if (typeof row.data === "string") {
            rowData = JSON.parse(row.data)
          } else {
            rowData = row.data
          }
          
          // For each student, keep the most recent upload
          Object.keys(rowData).forEach(studentId => {
            const existing = studentDataMap.get(studentId)
            if (!existing || new Date(row.uploaded_at) > new Date(existing.uploadedAt)) {
              studentDataMap.set(studentId, {
                data: rowData[studentId],
                uploadedAt: row.uploaded_at
              })
            }
          })
        }
        
        // Convert map back to object
        studentData = {}
        studentDataMap.forEach((value, studentId) => {
          studentData[studentId] = value.data
        })
        
        // Apply overrides to student data
        studentData = await applyOverridesToStudentData(studentData)
      }
    }

    // Group uploads by period and section, keeping only the latest upload for each combination
    const latestUploads = new Map<string, any>()
    const uniqueStudentIds = new Set<string>()
    
    uploadRecords.rows.forEach(row => {
      const key = `${row.period}-${row.section_number || 'default'}`
      const data = typeof row.data === "string" ? JSON.parse(row.data) : row.data || {}
      
      // Only keep if this is the first time we see this period/section combo
      // or if this upload is newer than what we have
      if (!latestUploads.has(key) || new Date(row.uploaded_at) > new Date(latestUploads.get(key).uploaded_at)) {
        latestUploads.set(key, {
          id: row.id,
          period: row.period,
          section_number: row.section_number,
          uploaded_at: row.uploaded_at,
          student_count: Object.keys(data).length
        })
      }
    })
    
    // Calculate unique student count across ALL latest uploads
    for (const upload of latestUploads.values()) {
      // Find the row data for this upload
      const rowData = uploadRecords.rows.find(row => 
        row.period === upload.period && 
        (row.section_number || 'default') === upload.section_number
      )
      if (rowData) {
        const data = typeof rowData.data === "string" ? JSON.parse(rowData.data) : rowData.data || {}
        Object.keys(data).forEach(studentId => {
          uniqueStudentIds.add(studentId)
        })
      }
    }

    return NextResponse.json({
      success: true,
      uploadRecords: Array.from(latestUploads.values()),
      studentData,
      uniqueStudentCount: uniqueStudentIds.size
    })
  } catch (error) {
    console.error("Error fetching student data:", error)
    return NextResponse.json(
      { 
        error: "Failed to fetch student data",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined
      },
      { status: 500 }
    )
  }
}

// DELETE - Delete student data (all or specific upload)
export async function DELETE(request: NextRequest) {
  try {
    // Check admin password
    const body = await request.json()
    const { password, uploadId } = body

    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 })
    }

    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    let result

    if (uploadId) {
      // Delete specific upload by ID
      result = await sql`
        DELETE FROM student_data
        WHERE id = ${uploadId}
        RETURNING id, period, section_number, uploaded_at
      `

      if (result.rows.length === 0) {
        return NextResponse.json({ 
          error: "Upload not found",
        }, { status: 404 })
      }

      return NextResponse.json({ 
        success: true, 
        message: `Successfully deleted upload for period ${result.rows[0].period}, section ${result.rows[0].section_number}`,
        deletedCount: result.rows.length,
        deletedRecord: result.rows[0]
      })
    } else {
      // Delete all student data (original behavior)
      const countResult = await sql`
        SELECT COUNT(*) as count FROM student_data
      `
      const recordCount = parseInt(countResult.rows[0].count)

      if (recordCount === 0) {
        return NextResponse.json({ 
          success: true, 
          message: "No student data found to delete",
          deletedCount: 0
        })
      }

      result = await sql`
        DELETE FROM student_data
        RETURNING id, period, uploaded_at
      `

      return NextResponse.json({ 
        success: true, 
        message: `Successfully deleted all student data (${result.rows.length} records)`,
        deletedCount: result.rows.length,
        deletedRecords: result.rows.map(row => ({
          id: row.id,
          period: row.period,
          uploaded_at: row.uploaded_at
        }))
      })
    }
  } catch (error) {
    console.error("Error deleting student data:", error)
    return NextResponse.json(
      { 
        error: "Failed to delete student data",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined
      },
      { status: 500 }
    )
  }
}
