import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"
import { EXAM_PERIODS } from "@/lib/exam-periods"

// POST - Initialize exam periods with default data
export async function POST(request: NextRequest) {
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

    // Check if periods already exist
    const existingCount = await sql`SELECT COUNT(*) as count FROM exam_periods`
    if (existingCount.rows[0].count > 0) {
      return NextResponse.json({ 
        success: true, 
        message: "Exam periods already initialized",
        count: existingCount.rows[0].count
      })
    }

    // Insert all default exam periods
    const periods = Object.entries(EXAM_PERIODS)
    let insertedCount = 0

    for (const [periodKey, period] of periods) {
      try {
        await sql`
          INSERT INTO exam_periods (period_key, name, start_date, end_date, excluded_dates)
          VALUES (${periodKey}, ${period.name}, ${period.startDate}, ${period.endDate}, ${JSON.stringify(period.excludedDates)})
        `
        insertedCount++
        console.log(`Inserted exam period: ${periodKey} - ${period.name}`)
      } catch (insertError) {
        console.error(`Error inserting period ${periodKey}:`, insertError)
      }
    }

    console.log(`Successfully initialized ${insertedCount} exam periods`)
    return NextResponse.json({ 
      success: true, 
      message: `Successfully initialized ${insertedCount} exam periods`,
      count: insertedCount
    })
  } catch (error) {
    console.error("Error initializing exam periods:", error)
    return NextResponse.json({ error: "Failed to initialize exam periods" }, { status: 500 })
  }
}
