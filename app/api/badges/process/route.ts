import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"
import { ensureBadgesSchema, processBadgesForStudent } from "@/lib/badges"
import { isSession, requireAdmin } from "@/lib/admin-auth"
import { bustStudentDataCache } from "@/lib/student-cache"

export const dynamic = "force-dynamic"

/**
 * Process badges for all students or a specific student
 * This is an admin-only route for retroactive badge processing
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin(request)
    if (!isSession(session)) return session

    const body = await request.json()
    const { studentId, period, sectionNumber } = body

    // Ensure the badges schema exists
    await ensureBadgesSchema()

    let processedCount = 0
    let badgesAwarded = 0
    let coinsAwarded = 0
    const errors: string[] = []

    if (studentId) {
      // Process a specific student
      try {
        const result = await sql`
          SELECT data, period, section_number
          FROM student_data
          WHERE period = ${period} AND COALESCE(section_number, 'default') = ${sectionNumber}
          ORDER BY uploaded_at DESC
          LIMIT 1
        `

        if (result.rows.length === 0) {
          return NextResponse.json({ error: "No data found for this period and section" }, { status: 404 })
        }

        const row = result.rows[0]
        let studentData: any
        if (typeof row.data === "string") {
          studentData = JSON.parse(row.data)
        } else {
          studentData = row.data
        }

        const student = studentData[studentId.toLowerCase()]
        if (!student) {
          return NextResponse.json({ error: "Student not found" }, { status: 404 })
        }

        const { badgesEarned, coinsAwarded: coins } = await processBadgesForStudent(
          studentId,
          student.name,
          student.dailyLog,
          period,
          sectionNumber,
          session.email
        )

        processedCount = 1
        badgesAwarded = badgesEarned.length
        coinsAwarded = coins

        // Bust the cache so the student sees the update immediately
        bustStudentDataCache()
      } catch (error) {
        console.error("Error processing student:", error)
        errors.push(`Error processing student ${studentId}: ${error}`)
      }
    } else {
      // Process all students across all periods
      try {
        const result = await sql`
          SELECT data, period, COALESCE(section_number, 'default') as section_number
          FROM student_data
          ORDER BY uploaded_at DESC
        `

        // Group by period and section to get the latest data for each
        const latestData = new Map<string, any>()
        for (const row of result.rows) {
          const key = `${row.period}_${row.section_number}`
          if (!latestData.has(key)) {
            latestData.set(key, row)
          }
        }

        for (const [key, row] of latestData.entries()) {
          let studentData: any
          if (typeof row.data === "string") {
            studentData = JSON.parse(row.data)
          } else {
            studentData = row.data
          }

          // Process each student in this period
          for (const [id, student] of Object.entries(studentData)) {
            try {
              const { badgesEarned, coinsAwarded: coins } = await processBadgesForStudent(
                id,
                (student as any).name,
                (student as any).dailyLog,
                row.period,
                row.section_number,
                session.email
              )

              processedCount++
              badgesAwarded += badgesEarned.length
              coinsAwarded += coins
            } catch (error) {
              console.error(`Error processing student ${id}:`, error)
              errors.push(`Error processing student ${id}: ${error}`)
            }
          }
        }

        // Bust the cache after processing all students
        bustStudentDataCache()
      } catch (error) {
        console.error("Error processing all students:", error)
        return NextResponse.json(
          { error: "Error processing students", details: (error as Error).message },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      success: true,
      processedCount,
      badgesAwarded,
      coinsAwarded,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error("Error processing badges:", error)
    return NextResponse.json(
      { error: "Internal server error", details: (error as Error).message },
      { status: 500 }
    )
  }
}
