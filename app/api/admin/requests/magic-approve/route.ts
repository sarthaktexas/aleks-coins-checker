import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"

// Helper function to load student data (similar to student route)
async function loadStudentDataFromDB(studentId: string): Promise<{ dailyLog: any[] }> {
  const result = await sql`
    SELECT 
      period,
      COALESCE(section_number, 'default') as section_number,
      data,
      uploaded_at
    FROM student_data 
    ORDER BY uploaded_at DESC
  `

  if (result.rows.length === 0) {
    return { dailyLog: [] }
  }

  // Find the student in the most recent upload
  for (const row of result.rows) {
    let rowStudentData: any
    if (typeof row.data === "string") {
      rowStudentData = JSON.parse(row.data)
    } else {
      rowStudentData = row.data
    }

    const student = rowStudentData[studentId.toLowerCase().trim()]
    if (student && student.dailyLog) {
      return { dailyLog: student.dailyLog }
    }
  }

  return { dailyLog: [] }
}

// POST - Magic approve day overrides with 31+ minutes
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { password, studentId, adminNotes } = body

    // Check admin password
    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 })
    }

    // Validate input
    if (!studentId) {
      return NextResponse.json({ error: "Student ID is required" }, { status: 400 })
    }

    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    const normalizedStudentId = studentId.toLowerCase().trim()

    // Check if overrides are enabled
    let overridesEnabled = true
    try {
      const settingsResult = await sql`
        SELECT setting_value
        FROM admin_settings
        WHERE setting_key = 'overrides_enabled'
      `
      overridesEnabled = settingsResult.rows.length > 0 
        ? settingsResult.rows[0].setting_value 
        : true // Default to enabled if setting doesn't exist
      
      if (!overridesEnabled) {
        return NextResponse.json({ 
          error: "Day overrides are currently disabled. Cannot approve override requests." 
        }, { status: 403 })
      }
    } catch (settingsError) {
      // If settings table doesn't exist yet, allow the operation (backward compatibility)
      console.log("Settings check skipped (table may not exist):", settingsError)
    }

    // Get all pending day override requests for this student
    const pendingRequestsResult = await sql`
      SELECT id, request_type, request_details, day_number, override_date
      FROM student_requests
      WHERE student_id = ${normalizedStudentId} 
        AND status = 'pending'
        AND request_type = 'override_request'
        AND day_number IS NOT NULL
    `

    if (pendingRequestsResult.rows.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: "No pending day override requests found for this student",
        approvedCount: 0
      })
    }

    // Load student data to get daily log with minutes
    const { dailyLog } = await loadStudentDataFromDB(normalizedStudentId)

    // Build a map of day_number to minutes
    const dayMinutesMap = new Map<number, number>()
    dailyLog.forEach((day: any) => {
      if (day.day && day.minutes !== undefined) {
        dayMinutesMap.set(day.day, day.minutes)
      }
    })

    const pendingRequests = pendingRequestsResult.rows
    let approvedCount = 0
    let skippedCount = 0
    const createdOverrides = []

    // Process each pending day override request
    for (const requestData of pendingRequests) {
      const dayNumber = requestData.day_number
      const minutes = dayMinutesMap.get(dayNumber) || 0

      // Extract the reason from request_details to check if it includes "review"
      let reasonText = ''
      if (requestData.request_details) {
        // Look for "Reason: " in the request details and extract everything after it
        // Use [\s\S] instead of . with s flag for ES2017 compatibility
        const reasonMatch = requestData.request_details.match(/Reason:\s*([\s\S]+)/)
        if (reasonMatch) {
          reasonText = reasonMatch[1].trim()
        } else {
          // If no "Reason:" prefix, use the whole request_details
          reasonText = requestData.request_details.trim()
        }
      }

      // Check if reason includes "review" (case-insensitive)
      const hasReview = reasonText.toLowerCase().includes('review')

      // Only approve if day has 31+ minutes AND reason includes "review"
      if (minutes >= 31 && hasReview) {
        try {
          // Use adminNotes if provided, otherwise use the extracted reason
          const finalReasonText = adminNotes || reasonText || `Magic approved: ${minutes} minutes logged`
          
          // Normalize date to ensure it matches the format used in dailyLog (YYYY-MM-DD)
          const normalizedDate = (requestData.override_date || '').trim()
          
          // Use ON CONFLICT to handle the new (student_id, date) constraint
          const overrideResult = await sql`
            INSERT INTO student_day_overrides (
              student_id, 
              day_number, 
              date, 
              override_type, 
              reason
            )
            VALUES (
              ${normalizedStudentId}, 
              ${requestData.day_number}, 
              ${normalizedDate}, 
              'qualified',
              ${finalReasonText}
            )
            ON CONFLICT (student_id, date)
            DO UPDATE SET
              day_number = EXCLUDED.day_number,
              override_type = EXCLUDED.override_type,
              reason = EXCLUDED.reason,
              updated_at = NOW()
            RETURNING id
          `
          
          if (overrideResult.rows.length > 0 && overrideResult.rows[0]?.id) {
            createdOverrides.push(overrideResult.rows[0].id)
          }

          // Update the request status
          await sql`
            UPDATE student_requests
            SET 
              status = 'approved',
              admin_notes = ${adminNotes || `Magic approved: ${minutes} minutes logged`},
              processed_at = CURRENT_TIMESTAMP,
              processed_by = 'admin'
            WHERE id = ${requestData.id}
          `

          approvedCount++
        } catch (error) {
          console.error(`Error processing request ${requestData.id}:`, error)
          // Continue with other requests even if one fails
        }
      } else {
        skippedCount++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Magic approved ${approvedCount} day override(s) with 31+ minutes and "review" in reason. Skipped ${skippedCount} request(s) that didn't meet criteria.`,
      approvedCount,
      skippedCount,
      createdOverrides: createdOverrides.length
    })
  } catch (error) {
    console.error("Error magic approving requests:", error)
    return NextResponse.json(
      { 
        error: "Failed to magic approve requests",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined
      },
      { status: 500 }
    )
  }
}

