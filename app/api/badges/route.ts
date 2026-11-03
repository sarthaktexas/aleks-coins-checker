import { type NextRequest, NextResponse } from "next/server"
import { getStudentBadges, ensureBadgesSchema } from "@/lib/badges"

export const dynamic = "force-dynamic"

/**
 * Get badges for a student
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get("studentId")

    if (!studentId) {
      return NextResponse.json({ error: "studentId is required" }, { status: 400 })
    }

    // Ensure schema exists
    await ensureBadgesSchema()

    const badges = await getStudentBadges(studentId)

    return NextResponse.json({
      success: true,
      badges,
    })
  } catch (error) {
    console.error("Error fetching badges:", error)
    return NextResponse.json(
      { error: "Internal server error", details: (error as Error).message },
      { status: 500 }
    )
  }
}
