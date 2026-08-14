import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"
import { EXAM_PERIODS } from "@/lib/exam-periods"
import { ensureExamPeriodsSchema } from "@/lib/aleks-excel"
import { isSession, requireAdmin, requireProfessor } from "@/lib/admin-auth"

// POST - Initialize exam periods with default data
export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin(request)
    if (!isSession(session)) return session
    const professorGate = requireProfessor(session)
    if (professorGate !== true) return professorGate

    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    // Ensure the table exists
    try {
      await ensureExamPeriodsSchema()
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
        const coinOnly =
          "coinOnlyExemptDates" in period ? [...(period as { coinOnlyExemptDates: readonly string[] }).coinOnlyExemptDates] : []
        await sql`
          INSERT INTO exam_periods (period_key, name, start_date, end_date, excluded_dates, coin_only_exempt_dates)
          VALUES (${periodKey}, ${period.name}, ${period.startDate}, ${period.endDate}, ${JSON.stringify([...period.excludedDates])}, ${JSON.stringify(coinOnly)})
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
