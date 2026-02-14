import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"

// GET - Fetch all exam periods
export async function GET(request: NextRequest) {
  try {
    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      console.log("No database URL configured - returning empty periods")
      return NextResponse.json({ periods: {} })
    }

    // Ensure the table exists
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS exam_periods (
          id SERIAL PRIMARY KEY,
          period_key VARCHAR(50) UNIQUE NOT NULL,
          name VARCHAR(255) NOT NULL,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          excluded_dates JSONB DEFAULT '[]'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `
      console.log("Exam periods table created/verified successfully")
    } catch (tableError) {
      console.error("Table creation error:", tableError)
      return NextResponse.json({ error: "Database table setup failed" }, { status: 500 })
    }

    // Fetch all exam periods
    const result = await sql`
      SELECT period_key, name, start_date, end_date, excluded_dates
      FROM exam_periods
      ORDER BY start_date ASC
    `

    // Convert to the format expected by the frontend
    const periods: Record<string, any> = {}
    result.rows.forEach((row) => {
      // Format dates to YYYY-MM-DD string format
      const formatDate = (date: any) => {
        if (!date) return ""
        if (typeof date === 'string') return date
        // If it's a Date object, format it
        const d = new Date(date)
        return d.toISOString().split('T')[0]
      }
      
      periods[row.period_key] = {
        name: row.name,
        startDate: formatDate(row.start_date),
        endDate: formatDate(row.end_date),
        excludedDates: row.excluded_dates || [],
      }
    })

    console.log(`Fetched ${result.rows.length} exam periods from database`)
    return NextResponse.json({ periods })
  } catch (error) {
    console.error("Error fetching exam periods:", error)
    return NextResponse.json({ error: "Failed to fetch exam periods" }, { status: 500 })
  }
}

// POST - Create or update an exam period
export async function POST(request: NextRequest) {
  try {
    // Check admin password
    const body = await request.json()
    const { password, periodKey, name, startDate, endDate, excludedDates } = body

    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 })
    }

    // Validate required fields
    if (!periodKey || !name || !startDate || !endDate) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    // Ensure the table exists
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS exam_periods (
          id SERIAL PRIMARY KEY,
          period_key VARCHAR(50) UNIQUE NOT NULL,
          name VARCHAR(255) NOT NULL,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          excluded_dates JSONB DEFAULT '[]'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `
    } catch (tableError) {
      console.error("Table creation error:", tableError)
      return NextResponse.json({ error: "Database table setup failed" }, { status: 500 })
    }

    // Insert or update the exam period
    const result = await sql`
      INSERT INTO exam_periods (period_key, name, start_date, end_date, excluded_dates, updated_at)
      VALUES (${periodKey}, ${name}, ${startDate}, ${endDate}, ${JSON.stringify(excludedDates || [])}, NOW())
      ON CONFLICT (period_key) 
      DO UPDATE SET 
        name = EXCLUDED.name,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        excluded_dates = EXCLUDED.excluded_dates,
        updated_at = NOW()
      RETURNING period_key, name, start_date, end_date, excluded_dates
    `

    console.log(`Exam period ${periodKey} saved successfully`)
    return NextResponse.json({ 
      success: true, 
      message: `Exam period "${name}" saved successfully`,
      period: result.rows[0]
    })
  } catch (error) {
    console.error("Error saving exam period:", error)
    return NextResponse.json({ error: "Failed to save exam period" }, { status: 500 })
  }
}

// PATCH - Change a period's key (updates all references across tables)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { password, oldPeriodKey, newPeriodKey } = body

    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 })
    }

    if (!oldPeriodKey || !newPeriodKey) {
      return NextResponse.json({ error: "Both oldPeriodKey and newPeriodKey are required" }, { status: 400 })
    }

    if (oldPeriodKey === newPeriodKey) {
      return NextResponse.json({ error: "New key must be different from the current key" }, { status: 400 })
    }

    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    // Check that the old period exists
    const existingCheck = await sql`
      SELECT period_key FROM exam_periods WHERE period_key = ${oldPeriodKey}
    `
    if (existingCheck.rows.length === 0) {
      return NextResponse.json({ error: "Period not found" }, { status: 404 })
    }

    // Check that new key doesn't already exist
    const conflictCheck = await sql`
      SELECT period_key FROM exam_periods WHERE period_key = ${newPeriodKey}
    `
    if (conflictCheck.rows.length > 0) {
      return NextResponse.json({ error: `A period with key "${newPeriodKey}" already exists` }, { status: 409 })
    }

    // Update all tables in a transaction-like sequence
    // 1. exam_periods
    await sql`
      UPDATE exam_periods 
      SET period_key = ${newPeriodKey}, updated_at = NOW()
      WHERE period_key = ${oldPeriodKey}
    `

    // 2. student_data (period column)
    await sql`
      UPDATE student_data 
      SET period = ${newPeriodKey}
      WHERE period = ${oldPeriodKey}
    `

    // 3. coin_adjustments (period column - only where period matches, not __GLOBAL__)
    await sql`
      UPDATE coin_adjustments 
      SET period = ${newPeriodKey}
      WHERE period = ${oldPeriodKey}
    `

    // 4. student_requests (period column)
    await sql`
      UPDATE student_requests 
      SET period = ${newPeriodKey}
      WHERE period = ${oldPeriodKey}
    `

    console.log(`Period key changed from ${oldPeriodKey} to ${newPeriodKey}`)
    return NextResponse.json({
      success: true,
      message: `Period key successfully changed to "${newPeriodKey}"`,
    })
  } catch (error) {
    console.error("Error changing period key:", error)
    return NextResponse.json({ error: "Failed to change period key" }, { status: 500 })
  }
}

// DELETE - Delete an exam period
export async function DELETE(request: NextRequest) {
  try {
    // Check admin password
    const body = await request.json()
    const { password, periodKey } = body

    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 })
    }

    if (!periodKey) {
      return NextResponse.json({ error: "Period key is required" }, { status: 400 })
    }

    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    // Delete the exam period
    const result = await sql`
      DELETE FROM exam_periods 
      WHERE period_key = ${periodKey}
      RETURNING name
    `

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Exam period not found" }, { status: 404 })
    }

    console.log(`Exam period ${periodKey} deleted successfully`)
    return NextResponse.json({ 
      success: true, 
      message: `Exam period "${result.rows[0].name}" deleted successfully`
    })
  } catch (error) {
    console.error("Error deleting exam period:", error)
    return NextResponse.json({ error: "Failed to delete exam period" }, { status: 500 })
  }
}
