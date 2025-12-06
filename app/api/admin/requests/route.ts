import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"

// GET - Fetch all student requests for admin view
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const password = searchParams.get("password")

    // Check admin password
    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 })
    }

    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured", requests: [] }, { status: 503 })
    }

    // Get all requests sorted by section and student name alphabetically
    const result = await sql`
      SELECT 
        id,
        student_id,
        student_name,
        student_email,
        period,
        section_number,
        request_type,
        request_details,
        day_number,
        override_date,
        submitted_at,
        status,
        admin_notes,
        processed_at,
        processed_by
      FROM student_requests
      ORDER BY section_number ASC, student_name ASC, submitted_at DESC
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

// PUT - Update a student request status
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { password, requestId, status, adminNotes, processedBy } = body

    // Check admin password
    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 })
    }

    // Validate input
    if (!requestId || !status) {
      return NextResponse.json({ error: "Request ID and status are required" }, { status: 400 })
    }

    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    // Get the request details first (we need student info and current status)
    const requestResult = await sql`
      SELECT student_id, student_name, period, section_number, request_type, request_details, day_number, override_date, status
      FROM student_requests
      WHERE id = ${requestId}
    `

    if (requestResult.rows.length === 0) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 })
    }

    const requestData = requestResult.rows[0]

    // If this is an override request and approved, create the override
    let overrideId = null
    if (requestData.request_type === 'override_request' && status === 'approved' && requestData.day_number && requestData.override_date) {
      // Check if overrides are enabled
      try {
        const settingsResult = await sql`
          SELECT setting_value
          FROM admin_settings
          WHERE setting_key = 'overrides_enabled'
        `
        const overridesEnabled = settingsResult.rows.length > 0 
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
      try {
        // Extract just the reason part from request_details
        let reasonText = adminNotes || ''
        if (!reasonText && requestData.request_details) {
          // Look for "Reason: " in the request details and extract everything after it
          const reasonMatch = requestData.request_details.match(/Reason:\s*(.+)/s)
          if (reasonMatch) {
            reasonText = reasonMatch[1].trim()
          }
        }
        
        // Normalize student_id to ensure consistency with how overrides are queried
        const normalizedStudentId = (requestData.student_id || '').toLowerCase().trim()
        
        // Normalize date to ensure it matches the format used in dailyLog (YYYY-MM-DD)
        // Remove any whitespace and ensure proper format
        const normalizedDate = (requestData.override_date || '').trim()
        
        // First, check if there's already an override for this (student_id, date)
        // The calendar matches by date, not day_number, so we should prioritize date matching
        const existingByDate = await sql`
          SELECT id, day_number
          FROM student_day_overrides
          WHERE student_id = ${normalizedStudentId}
            AND date = ${normalizedDate}
        `
        
        // Use ON CONFLICT to handle the new (student_id, date) constraint
        // This ensures the override is created or updated correctly
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
            ${reasonText || 'Override approved'}
          )
          ON CONFLICT (student_id, date)
          DO UPDATE SET
            day_number = EXCLUDED.day_number,
            override_type = EXCLUDED.override_type,
            reason = EXCLUDED.reason,
            updated_at = NOW()
          RETURNING id
        `
        
        if (overrideResult.rows.length === 0 || !overrideResult.rows[0]?.id) {
          throw new Error("Override insert did not return an ID")
        }
        
        overrideId = overrideResult.rows[0].id
      } catch (overrideError) {
        console.error("Error creating override:", overrideError)
        // If override creation fails, we should not approve the request
        // Return an error so the admin knows the override wasn't created
        return NextResponse.json({ 
          error: "Failed to create day override. Request was not approved.",
          details: process.env.NODE_ENV === "development" ? (overrideError as Error).message : undefined
        }, { status: 500 })
      }
    }

    // Note: Coins are already deducted when the request is submitted
    // If rejecting a redemption request, deactivate the original coin adjustment (only if not already rejected)
    let adjustmentDeactivated = false
    const wasAlreadyRejected = requestData.status === 'rejected'
    if (status === 'rejected' && !wasAlreadyRejected && (requestData.request_type === 'assignment_replacement' || requestData.request_type === 'quiz_replacement')) {
      try {
        // Find and deactivate the coin adjustment linked to this request
        // Use request_id for direct, reliable lookup
        const adjustmentResult = await sql`
          UPDATE coin_adjustments
          SET is_active = false
          WHERE request_id = ${requestId}
            AND is_active = true
          RETURNING id
        `
        
        if (adjustmentResult.rows.length > 0) {
          adjustmentDeactivated = true
        }
      } catch (deactivateError) {
        console.error(`Error deactivating coin adjustment for request ${requestId}:`, deactivateError)
        // Continue with rejection even if deactivation fails, but log the error
      }
    }

    // Update the request
    const result = await sql`
      UPDATE student_requests
      SET 
        status = ${status},
        admin_notes = ${adminNotes || null},
        processed_at = CURRENT_TIMESTAMP,
        processed_by = ${processedBy || 'admin'}
      WHERE id = ${requestId}
      RETURNING id, status, processed_at
    `

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 })
    }

    let message = "Request updated successfully"
    if (overrideId) {
      message = "Override approved and applied to student record"
    } else if (adjustmentDeactivated) {
      message = "Request rejected and coin deduction cancelled"
    } else if (status === 'rejected') {
      message = "Request rejected successfully"
    }

    return NextResponse.json({
      success: true,
      message: message,
      request: result.rows[0],
      overrideId: overrideId,
      adjustmentDeactivated: adjustmentDeactivated
    })
  } catch (error) {
    console.error("Error updating student request:", error)
    return NextResponse.json(
      { 
        error: "Failed to update request",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined
      },
      { status: 500 }
    )
  }
}

// POST - Fast approve all pending requests for a specific student
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

    // Get all pending requests for this student
    const pendingRequestsResult = await sql`
      SELECT id, request_type, request_details, day_number, override_date
      FROM student_requests
      WHERE student_id = ${studentId.toLowerCase().trim()} AND status = 'pending'
    `

    if (pendingRequestsResult.rows.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: "No pending requests found for this student",
        approvedCount: 0
      })
    }

    const pendingRequests = pendingRequestsResult.rows
    let approvedCount = 0
    const createdOverrides = []

    // Check if overrides are enabled before processing
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
    } catch (settingsError) {
      // If settings table doesn't exist yet, allow the operation (backward compatibility)
      console.log("Settings check skipped (table may not exist):", settingsError)
    }

    // Process each pending request
    for (const requestData of pendingRequests) {
      try {
        // If this is an override request, create the override
        if (requestData.request_type === 'override_request' && requestData.day_number && requestData.override_date) {
          if (!overridesEnabled) {
            // Skip override requests if disabled
            continue
          }
          // Extract just the reason part from request_details
          let reasonText = adminNotes || ''
          if (!reasonText && requestData.request_details) {
            // Look for "Reason: " in the request details and extract everything after it
            const reasonMatch = requestData.request_details.match(/Reason:\s*(.+)/s)
            if (reasonMatch) {
              reasonText = reasonMatch[1].trim()
            }
          }
          
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
              ${studentId.toLowerCase().trim()}, 
              ${requestData.day_number}, 
              ${normalizedDate}, 
              'qualified',
              ${reasonText || 'Override approved via fast approve'}
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
        }

        // Update the request status
        await sql`
          UPDATE student_requests
          SET 
            status = 'approved',
            admin_notes = ${adminNotes || 'Fast approved all requests'},
            processed_at = CURRENT_TIMESTAMP,
            processed_by = 'admin'
          WHERE id = ${requestData.id}
        `

        approvedCount++
      } catch (error) {
        console.error(`Error processing request ${requestData.id}:`, error)
        // Continue with other requests even if one fails
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully approved ${approvedCount} requests for student ${studentId}`,
      approvedCount,
      createdOverrides: createdOverrides.length
    })
  } catch (error) {
    console.error("Error fast approving requests:", error)
    return NextResponse.json(
      { 
        error: "Failed to fast approve requests",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined
      },
      { status: 500 }
    )
  }
}

// Helper function to get request type label
function getRequestTypeLabel(type: string): string {
  switch (type) {
    case 'assignment_replacement':
      return 'Assignment/Video Replacement'
    case 'quiz_replacement':
      return 'Quiz Replacement'
    case 'override_request':
      return 'Day Override Request'
    case 'extra_credit':
      return 'Extra Credit Inquiry'
    case 'data_correction':
      return 'Data Correction Request'
    default:
      return type
  }
}

