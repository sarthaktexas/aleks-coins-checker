import { type NextRequest, NextResponse } from "next/server"
import { EXAM_PERIODS } from "@/lib/exam-periods"
import { isSession, requireAdmin } from "@/lib/admin-auth"

export async function GET(request: NextRequest) {
  try {
    const session = requireAdmin(request)
    if (!isSession(session)) return session

    return NextResponse.json({
      success: true,
      periods: EXAM_PERIODS
    })
  } catch (error) {
    console.error("Error fetching exam periods:", error)
    return NextResponse.json(
      { error: "Failed to fetch exam periods" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = requireAdmin(request)
    if (!isSession(session)) return session

    const { periods } = await request.json()

    // In a real implementation, you would save the periods to a database or config file
    // For now, we'll just return success
    console.log("Periods update requested:", periods)

    return NextResponse.json({
      success: true,
      message: "Exam periods updated successfully"
    })
  } catch (error) {
    console.error("Error updating exam periods:", error)
    return NextResponse.json(
      { error: "Failed to update exam periods" },
      { status: 500 }
    )
  }
}
