import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"

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

    // If a specific period and section are requested, get that data
    if (period && sectionNumber) {
      let result
      try {
        // Check if section_number column exists first
        const columnCheck = await sql`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'student_data' AND column_name = 'section_number'
        `
        
        if (columnCheck.rows.length > 0) {
          // Column exists, use it
          result = await sql`
            SELECT data, uploaded_at 
            FROM student_data 
            WHERE period = ${period} AND COALESCE(section_number, 'default') = ${sectionNumber}
            ORDER BY uploaded_at DESC 
            LIMIT 1
          `
        } else {
          // Column doesn't exist, use fallback
          result = await sql`
            SELECT data, uploaded_at 
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
          SELECT data, uploaded_at 
          FROM student_data 
          WHERE period = ${period}
          ORDER BY uploaded_at DESC 
          LIMIT 1
        `
      }

      if (result.rows.length > 0) {
        const row = result.rows[0]
        if (typeof row.data === "string") {
          studentData = JSON.parse(row.data)
        } else {
          studentData = row.data
        }
      }
    }

    // Group uploads by period and section, keeping only the latest upload for each combination
    const latestUploads = new Map<string, any>()
    
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

    return NextResponse.json({
      success: true,
      uploadRecords: Array.from(latestUploads.values()),
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
