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
      await sql`
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

