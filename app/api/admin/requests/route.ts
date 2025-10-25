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

    // Get the request details first (we need student info for coin deduction)
    const requestResult = await sql`
      SELECT student_id, student_name, period, section_number, request_type, request_details, day_number, override_date
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
      try {
        const overrideResult = await sql`
          INSERT INTO student_day_overrides (
            student_id, 
            day_number, 
            date, 
            override_type, 
            reason
          )
          VALUES (
            ${requestData.student_id}, 
            ${requestData.day_number}, 
            ${requestData.override_date}, 
            'qualified',
            ${`Override approved: ${adminNotes || requestData.request_details}`}
          )
          ON CONFLICT (student_id, day_number)
          DO UPDATE SET
            override_type = 'qualified',
            reason = EXCLUDED.reason,
            updated_at = NOW()
          RETURNING id
        `
        overrideId = overrideResult.rows[0]?.id
      } catch (overrideError) {
        console.error("Error creating override:", overrideError)
      }
    }

    // Note: Coins are already deducted when the request is submitted, no need to deduct again

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
    }

    return NextResponse.json({
      success: true,
      message: message,
      request: result.rows[0],
      overrideId: overrideId
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

