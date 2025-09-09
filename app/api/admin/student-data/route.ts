import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get("period")

    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ 
        error: "Database not configured",
        uploadRecords: [],
        studentData: {}
      }, { status: 503 })
    }

    // Get upload records
    const uploadRecords = await sql`
      SELECT 
        id,
        period,
        uploaded_at,
        data
      FROM student_data 
      ORDER BY uploaded_at DESC
    `

    let studentData = {}

    // If a specific period is requested, get that data
    if (period) {
      const result = await sql`
        SELECT data, uploaded_at 
        FROM student_data 
        WHERE period = ${period}
        ORDER BY uploaded_at DESC 
        LIMIT 1
      `

      if (result.rows.length > 0) {
        const row = result.rows[0]
        if (typeof row.data === "string") {
          studentData = JSON.parse(row.data)
        } else {
          studentData = row.data
        }
      }
    }

    return NextResponse.json({
      success: true,
      uploadRecords: uploadRecords.rows.map(row => {
        const data = typeof row.data === "string" ? JSON.parse(row.data) : row.data || {}
        return {
          id: row.id,
          period: row.period,
          uploaded_at: row.uploaded_at,
          student_count: Object.keys(data).length
        }
      }),
      studentData
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

// DELETE - Delete all student data
export async function DELETE(request: NextRequest) {
  try {
    // Check admin password
    const body = await request.json()
    const { password } = body

    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 })
    }

    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    // Get count of records before deletion
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

    // Delete all student data
    const result = await sql`
      DELETE FROM student_data
      RETURNING id, period, uploaded_at
    `

    console.log(`Deleted ${result.rows.length} student data records`)
    
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
