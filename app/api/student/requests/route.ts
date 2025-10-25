import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"

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

    // Determine coin deduction amount for redemption requests
    let coinDeduction = 0
    if (requestType === 'assignment_replacement') {
      coinDeduction = 10
    } else if (requestType === 'quiz_replacement') {
      coinDeduction = 20
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
    if (coinDeduction > 0) {
      const periodKey = `${period}_${sectionNumber}`
      
      // Insert coin adjustment
      await sql`
        INSERT INTO coin_adjustments (
          student_id,
          period,
          section_number,
          adjustment_amount,
          reason,
          created_by,
          created_at
        )
        VALUES (
          ${studentId.toLowerCase().trim()},
          ${period},
          ${sectionNumber},
          ${-coinDeduction},
          ${`Pending ${requestType.replace('_', ' ')} request - ${requestDetails.substring(0, 50)}...`},
          'system',
          NOW()
        )
      `
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

