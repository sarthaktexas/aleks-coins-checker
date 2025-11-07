import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"

// POST - Run the fix redemption adjustments script
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

    // Find redemption adjustments that need fixing
    // These should have period = '__GLOBAL__' instead of a specific period
    const adjustmentsResult = await sql`
      SELECT 
        id,
        student_id,
        student_name,
        period,
        section_number,
        adjustment_amount,
        reason,
        created_at,
        created_by
      FROM coin_adjustments
      WHERE created_by = 'system'
        AND period IS NOT NULL
        AND period != '__GLOBAL__'
        AND (
          reason LIKE 'Pending assignment replacement%'
          OR reason LIKE 'Pending quiz replacement%'
        )
        AND is_active = true
      ORDER BY created_at DESC
    `

    const adjustments = adjustmentsResult.rows

    if (adjustments.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No redemption adjustments to fix",
        updatedCount: 0,
        failedCount: 0,
        adjustments: []
      })
    }

    // Update the adjustments
    const results = []
    let successCount = 0
    let failCount = 0

    for (const adjustment of adjustments) {
      try {
        await sql`
          UPDATE coin_adjustments
          SET period = '__GLOBAL__'
          WHERE id = ${adjustment.id}
        `

        results.push({
          adjustmentId: adjustment.id,
          studentName: adjustment.student_name,
          studentId: adjustment.student_id,
          oldPeriod: adjustment.period,
          newPeriod: '__GLOBAL__',
          adjustmentAmount: adjustment.adjustment_amount,
          success: true
        })
        successCount++
      } catch (error) {
        results.push({
          adjustmentId: adjustment.id,
          studentName: adjustment.student_name,
          studentId: adjustment.student_id,
          oldPeriod: adjustment.period,
          error: error instanceof Error ? error.message : "Unknown error",
          success: false
        })
        failCount++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${successCount} redemption adjustment(s) to use global (__GLOBAL__ period) deduction`,
      updatedCount: successCount,
      failedCount: failCount,
      adjustments: results
    })
  } catch (error) {
    console.error("Error fixing redemption adjustments:", error)
    return NextResponse.json(
      { 
        error: "Failed to fix redemption adjustments",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined
      },
      { status: 500 }
    )
  }
}

