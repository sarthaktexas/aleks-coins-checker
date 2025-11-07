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
    const password = searchParams.get("password")

    // Check admin password for admin view (when no specific studentId)
    if (!studentId) {
      if (!password || password !== process.env.ADMIN_PASSWORD) {
        return NextResponse.json({ error: "Invalid password" }, { status: 401 })
      }
    }

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
      // Get all overrides (for admin view) - just the overrides first
      const result = await sql`
        SELECT 
          id, student_id, day_number, date,
          override_type, reason, created_at, updated_at
        FROM student_day_overrides
        ORDER BY created_at DESC
      `
      
      // Get unique student IDs from overrides
      const studentIds = [...new Set(result.rows.map(row => row.student_id))]
      
      // Get student names for these specific students only
      const studentNameMap = new Map<string, string>()
      
      if (studentIds.length > 0) {
        // Optimize: Only query student_data records, but we still need to check all records
        // since student data is stored as JSON. However, we can stop early once we find all names.
        // For now, we'll load all but process efficiently
        const studentDataResult = await sql`
          SELECT data
          FROM student_data
          ORDER BY uploaded_at DESC
        `
        
        // Check each dataset until we find names for all students
        // This is still necessary since data is JSON, but we stop early when all names are found
        for (const row of studentDataResult.rows) {
          const studentData = row.data
          let parsedData
          
          if (typeof studentData === "string") {
            parsedData = JSON.parse(studentData)
          } else {
            parsedData = studentData
          }
          
          // Extract names for students who don't have names yet
          studentIds.forEach(studentId => {
            if (!studentNameMap.has(studentId) && parsedData[studentId] && parsedData[studentId].name) {
              studentNameMap.set(studentId, parsedData[studentId].name)
            }
          })
          
          // If we found all student names, we can stop early - this is an optimization
          if (studentNameMap.size === studentIds.length) {
            break
          }
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

