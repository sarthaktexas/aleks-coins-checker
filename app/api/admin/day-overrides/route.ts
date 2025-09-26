import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"
import crypto from "crypto"

// Create or update day override
export async function POST(request: NextRequest) {
  try {
    const { 
      studentId, 
      dayNumber, 
      date, 
      overrideType, 
      reason, 
      adminPassword 
    } = await request.json()

    // Validate admin password
    if (!adminPassword || adminPassword !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid admin password" }, { status: 401 })
    }

    // Validate required fields
    if (!studentId || !dayNumber || !date || !overrideType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (!['qualified', 'not_qualified'].includes(overrideType)) {
      return NextResponse.json({ error: "Invalid override type" }, { status: 400 })
    }

    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    // Ensure the overrides table exists
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS student_day_overrides (
          id SERIAL PRIMARY KEY,
          student_id VARCHAR(50) NOT NULL,
          day_number INTEGER NOT NULL,
          date VARCHAR(10) NOT NULL,
          override_type VARCHAR(20) NOT NULL,
          reason TEXT,
          admin_password_hash VARCHAR(255),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(student_id, day_number)
        )
      `
    } catch (tableError) {
      console.error("Table creation error:", tableError)
      return NextResponse.json({ error: "Database table setup failed" }, { status: 500 })
    }

    // Create a simple hash of the admin password for audit trail (not for security)
    const adminPasswordHash = crypto.createHash('sha256').update(adminPassword).digest('hex').substring(0, 16)

    // Insert or update the override
    const result = await sql`
      INSERT INTO student_day_overrides (
        student_id, day_number, date, 
        override_type, reason, admin_password_hash
      )
      VALUES (
        ${studentId}, ${dayNumber}, ${date},
        ${overrideType}, ${reason || null}, ${adminPasswordHash}
      )
      ON CONFLICT (student_id, day_number)
      DO UPDATE SET
        override_type = EXCLUDED.override_type,
        reason = EXCLUDED.reason,
        admin_password_hash = EXCLUDED.admin_password_hash,
        updated_at = NOW()
      RETURNING id, created_at, updated_at
    `

    return NextResponse.json({
      success: true,
      message: "Day override saved successfully",
      override: {
        id: result.rows[0].id,
        studentId,
        dayNumber,
        date,
        overrideType,
        reason,
        createdAt: result.rows[0].created_at,
        updatedAt: result.rows[0].updated_at
      }
    })

  } catch (error) {
    console.error("Day override error:", error)
    return NextResponse.json(
      { error: "Failed to save day override" },
      { status: 500 }
    )
  }
}

// Get all overrides for a student
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get("studentId")

    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ 
        error: "Database not configured",
        overrides: []
      }, { status: 503 })
    }

    let overrides = []

    if (studentId) {
      // Get overrides for specific student
      const result = await sql`
        SELECT 
          id, student_id, day_number, date,
          override_type, reason, created_at, updated_at
        FROM student_day_overrides
        WHERE student_id = ${studentId}
        ORDER BY day_number ASC
      `
      overrides = result.rows
    } else {
      // Get all overrides (for admin view) with student names
      const result = await sql`
        SELECT 
          o.id, o.student_id, o.day_number, o.date,
          o.override_type, o.reason, o.created_at, o.updated_at,
          s.data as student_data
        FROM student_day_overrides o
        LEFT JOIN student_data s ON true
        ORDER BY o.created_at DESC
      `
      
      // Process the results to extract student names
      const studentNameMap = new Map<string, string>()
      
      // Build a map of student IDs to names from all student data
      for (const row of result.rows) {
        if (row.student_data) {
          let studentData
          if (typeof row.student_data === "string") {
            studentData = JSON.parse(row.student_data)
          } else {
            studentData = row.student_data
          }
          
          // Extract student names from the data
          Object.keys(studentData).forEach(studentId => {
            if (studentData[studentId] && studentData[studentId].name) {
              studentNameMap.set(studentId, studentData[studentId].name)
            }
          })
        }
      }
      
      // Map the overrides with student names
      overrides = result.rows.map(row => ({
        id: row.id,
        student_id: row.student_id,
        student_name: studentNameMap.get(row.student_id) || 'Unknown Student',
        day_number: row.day_number,
        date: row.date,
        override_type: row.override_type,
        reason: row.reason,
        created_at: row.created_at,
        updated_at: row.updated_at
      }))
    }
    
    return NextResponse.json({
      success: true,
      overrides
    })

  } catch (error) {
    console.error("Get overrides error:", error)
    return NextResponse.json(
      { error: "Failed to fetch overrides", overrides: [] },
      { status: 500 }
    )
  }
}

// Delete a day override
export async function DELETE(request: NextRequest) {
  try {
    const { 
      studentId, 
      dayNumber, 
      adminPassword 
    } = await request.json()

    // Validate admin password
    if (!adminPassword || adminPassword !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid admin password" }, { status: 401 })
    }

    // Validate required fields
    if (!studentId || !dayNumber) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    // Delete the override
    const result = await sql`
      DELETE FROM student_day_overrides
      WHERE student_id = ${studentId}
      AND day_number = ${dayNumber}
      RETURNING id
    `

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Override not found" }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      message: "Day override deleted successfully"
    })

  } catch (error) {
    console.error("Delete override error:", error)
    return NextResponse.json(
      { error: "Failed to delete override" },
      { status: 500 }
    )
  }
}

