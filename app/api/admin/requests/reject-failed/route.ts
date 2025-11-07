import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"

// POST - Reject redemption requests that didn't get coins deducted
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { password } = body

    // Check admin password
    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 })
    }

    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    // Find redemption requests that are pending and should have had coins deducted
    // These are requests of type 'assignment_replacement' or 'quiz_replacement'
    // that don't have a corresponding coin adjustment record
    const redemptionRequests = await sql`
      SELECT 
        sr.id,
        sr.student_id,
        sr.student_name,
        sr.student_email,
        sr.period,
        sr.section_number,
        sr.request_type,
        sr.request_details,
        sr.submitted_at
      FROM student_requests sr
      WHERE sr.status = 'pending'
        AND sr.request_type IN ('assignment_replacement', 'quiz_replacement')
        AND NOT EXISTS (
          SELECT 1
          FROM coin_adjustments ca
          WHERE ca.student_id = sr.student_id
            AND ca.period = '__GLOBAL__'
            AND ca.section_number = sr.section_number
            AND ca.created_by = 'system'
            AND (
              (sr.request_type = 'assignment_replacement' AND ca.reason LIKE 'Pending assignment replacement%')
              OR
              (sr.request_type = 'quiz_replacement' AND ca.reason LIKE 'Pending quiz replacement%')
            )
            AND ca.is_active = true
            AND ca.created_at >= sr.submitted_at - INTERVAL '1 minute'
            AND ca.created_at <= sr.submitted_at + INTERVAL '5 minutes'
        )
      ORDER BY sr.submitted_at ASC
    `

    if (redemptionRequests.rows.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No failed redemption requests found",
        rejectedCount: 0,
        rejectedRequests: []
      })
    }

    const rejectedRequests = []
    const adminNote = "Automatically rejected: This redemption request was submitted but failed to create a coin adjustment due to a database error. Please resubmit if you still need this redemption."

    // Reject each request
    for (const req of redemptionRequests.rows) {
      try {
        await sql`
          UPDATE student_requests
          SET 
            status = 'rejected',
            admin_notes = ${adminNote},
            processed_at = CURRENT_TIMESTAMP,
            processed_by = 'system'
          WHERE id = ${req.id}
        `

        rejectedRequests.push({
          id: req.id,
          studentId: req.student_id,
          studentName: req.student_name,
          requestType: req.request_type,
          submittedAt: req.submitted_at
        })
      } catch (error) {
        console.error(`Error rejecting request ${req.id}:`, error)
        // Continue with other requests even if one fails
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully rejected ${rejectedRequests.length} redemption request(s) that failed to create coin adjustments`,
      rejectedCount: rejectedRequests.length,
      rejectedRequests: rejectedRequests
    })
  } catch (error) {
    console.error("Error rejecting failed requests:", error)
    return NextResponse.json(
      { 
        error: "Failed to reject failed requests",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined
      },
      { status: 500 }
    )
  }
}

