import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"

// GET - Fetch counts of pending student requests
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const password = searchParams.get("password")

    // Check admin password
    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 })
    }

    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ 
        error: "Database not configured", 
        overrideRequests: 0,
        redemptionRequests: 0
      }, { status: 503 })
    }

    // Get count of pending override requests
    const overrideResult = await sql`
      SELECT COUNT(*) as count
      FROM student_requests
      WHERE request_type = 'override_request' AND status = 'pending'
    `

    // Get count of pending redemption requests (assignment and quiz replacements)
    const redemptionResult = await sql`
      SELECT COUNT(*) as count
      FROM student_requests
      WHERE request_type IN ('assignment_replacement', 'quiz_replacement') AND status = 'pending'
    `

    const overrideRequests = parseInt(overrideResult.rows[0]?.count || '0')
    const redemptionRequests = parseInt(redemptionResult.rows[0]?.count || '0')

    return NextResponse.json({
      success: true,
      overrideRequests,
      redemptionRequests
    })
  } catch (error) {
    console.error("Error fetching request stats:", error)
    return NextResponse.json(
      { 
        error: "Failed to fetch request stats",
        overrideRequests: 0,
        redemptionRequests: 0,
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined
      },
      { status: 500 }
    )
  }
}
