import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"
import { ensureBadgesSchema } from "@/lib/badges"
import { isSession, requireAdmin, requireProfessor } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin(request)
    if (!isSession(session)) return session
    const professorGate = requireProfessor(session)
    if (professorGate !== true) return professorGate

    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json(
        {
          error: "Database not configured",
          totalBadges: 0,
          streak10: 0,
          streak25: 0,
          uniqueStudents: 0,
          byPeriod: [],
        },
        { status: 503 },
      )
    }

    await ensureBadgesSchema()

    const totals = await sql`
      SELECT
        COUNT(*)::int AS total_badges,
        COUNT(*) FILTER (WHERE badge_type = 'streak_10_day')::int AS streak_10,
        COUNT(*) FILTER (WHERE badge_type = 'streak_25_day')::int AS streak_25,
        COUNT(DISTINCT student_id)::int AS unique_students
      FROM student_badges
    `

    const byPeriod = await sql`
      SELECT
        period,
        COUNT(*) FILTER (WHERE badge_type = 'streak_10_day')::int AS streak_10,
        COUNT(*) FILTER (WHERE badge_type = 'streak_25_day')::int AS streak_25,
        COUNT(*)::int AS total
      FROM student_badges
      GROUP BY period
      ORDER BY period DESC
    `

    const row = totals.rows[0] || {}

    return NextResponse.json({
      success: true,
      totalBadges: Number(row.total_badges || 0),
      streak10: Number(row.streak_10 || 0),
      streak25: Number(row.streak_25 || 0),
      uniqueStudents: Number(row.unique_students || 0),
      byPeriod: byPeriod.rows.map((r) => ({
        period: String(r.period),
        streak10: Number(r.streak_10 || 0),
        streak25: Number(r.streak_25 || 0),
        total: Number(r.total || 0),
      })),
    })
  } catch (error) {
    console.error("Error fetching badge stats:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch badge stats",
        details:
          process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
        totalBadges: 0,
        streak10: 0,
        streak25: 0,
        uniqueStudents: 0,
        byPeriod: [],
      },
      { status: 500 },
    )
  }
}
