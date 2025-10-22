import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"

// GET - Fetch all coin adjustments or for a specific student
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get("studentId")
    const period = searchParams.get("period")
    const sectionNumber = searchParams.get("sectionNumber")

    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured", adjustments: [] }, { status: 503 })
    }

    let result
    if (studentId) {
      // Get adjustments for specific student
      result = await sql`
        SELECT 
          id,
          student_id,
          student_name,
          period,
          section_number,
          adjustment_amount,
          reason,
          created_at,
          created_by,
          is_active
        FROM coin_adjustments
        WHERE student_id = ${studentId.toLowerCase().trim()} AND is_active = true
        ORDER BY created_at DESC
      `
    } else if (period && sectionNumber) {
      // Get all adjustments for a specific period and section
      result = await sql`
        SELECT 
          id,
          student_id,
          student_name,
          period,
          section_number,
          adjustment_amount,
          reason,
          created_at,
          created_by,
          is_active
        FROM coin_adjustments
        WHERE period = ${period} AND section_number = ${sectionNumber} AND is_active = true
        ORDER BY student_name ASC, created_at DESC
      `
    } else {
      // Get all adjustments
      result = await sql`
        SELECT 
          id,
          student_id,
          student_name,
          period,
          section_number,
          adjustment_amount,
          reason,
          created_at,
          created_by,
          is_active
        FROM coin_adjustments
        WHERE is_active = true
        ORDER BY section_number ASC, student_name ASC, created_at DESC
      `
    }

    return NextResponse.json({
      success: true,
      adjustments: result.rows
    })
  } catch (error) {
    console.error("Error fetching coin adjustments:", error)
    return NextResponse.json(
      { 
        error: "Failed to fetch coin adjustments",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined
      },
      { status: 500 }
    )
  }
}

// POST - Create a new coin adjustment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { password, studentId, studentName, period, sectionNumber, adjustmentAmount, reason, createdBy } = body

    // Check admin password
    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 })
    }

    // Validate input
    if (!studentId || !studentName || !period || !sectionNumber || adjustmentAmount === undefined || !reason) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 })
    }

    // Validate adjustment amount is a number
    if (typeof adjustmentAmount !== 'number' || isNaN(adjustmentAmount)) {
      return NextResponse.json({ error: "Adjustment amount must be a valid number" }, { status: 400 })
    }

    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    // Insert the adjustment into the database
    const result = await sql`
      INSERT INTO coin_adjustments (
        student_id, 
        student_name, 
        period, 
        section_number, 
        adjustment_amount, 
        reason,
        created_by,
        is_active
      )
      VALUES (
        ${studentId.toLowerCase().trim()}, 
        ${studentName}, 
        ${period}, 
        ${sectionNumber}, 
        ${adjustmentAmount}, 
        ${reason},
        ${createdBy || 'admin'},
        true
      )
      RETURNING id, created_at
    `

    return NextResponse.json({
      success: true,
      message: "Coin adjustment created successfully",
      adjustmentId: result.rows[0].id,
      createdAt: result.rows[0].created_at
    })
  } catch (error) {
    console.error("Error creating coin adjustment:", error)
    return NextResponse.json(
      { 
        error: "Failed to create coin adjustment",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined
      },
      { status: 500 }
    )
  }
}

// DELETE - Soft delete a coin adjustment (set is_active to false)
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { password, adjustmentId } = body

    // Check admin password
    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 })
    }

    // Validate input
    if (!adjustmentId) {
      return NextResponse.json({ error: "Adjustment ID is required" }, { status: 400 })
    }

    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    // Soft delete the adjustment
    const result = await sql`
      UPDATE coin_adjustments
      SET is_active = false
      WHERE id = ${adjustmentId}
      RETURNING id, student_id, adjustment_amount
    `

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Adjustment not found" }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      message: "Coin adjustment deleted successfully",
      adjustment: result.rows[0]
    })
  } catch (error) {
    console.error("Error deleting coin adjustment:", error)
    return NextResponse.json(
      { 
        error: "Failed to delete coin adjustment",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined
      },
      { status: 500 }
    )
  }
}

