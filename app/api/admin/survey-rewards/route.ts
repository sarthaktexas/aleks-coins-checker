import { type NextRequest, NextResponse } from "next/server"
import { isSession, requireAdmin } from "@/lib/admin-auth"
import { SURVEY_COMPLETE_COINS } from "@/lib/badge-constants"
import {
  applySurveyRewards,
  parseSurveyScoreText,
} from "@/lib/survey-rewards"

export const dynamic = "force-dynamic"

/**
 * POST — preview or apply survey completion rewards.
 * Body: { text, period, sectionNumber, coinAmount?, dryRun? }
 * Students with score 100 get the Survey Complete badge + coin adjustment.
 * Score 0 is recorded as skipped. Idempotent per student.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin(request)
    if (!isSession(session)) return session

    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    const body = await request.json()
    const text = typeof body.text === "string" ? body.text : ""
    const period = typeof body.period === "string" ? body.period.trim() : ""
    const sectionNumber =
      typeof body.sectionNumber === "string" ? body.sectionNumber.trim() : ""
    const dryRun = Boolean(body.dryRun)
    const coinAmount =
      body.coinAmount === undefined || body.coinAmount === null || body.coinAmount === ""
        ? SURVEY_COMPLETE_COINS
        : Number(body.coinAmount)

    if (!text.trim()) {
      return NextResponse.json({ error: "Paste a list of student names and scores" }, { status: 400 })
    }
    if (!period) {
      return NextResponse.json({ error: "Exam period is required" }, { status: 400 })
    }
    if (!sectionNumber) {
      return NextResponse.json({ error: "Section number is required" }, { status: 400 })
    }
    if (!Number.isFinite(coinAmount) || coinAmount < 1 || coinAmount > 100) {
      return NextResponse.json({ error: "Coin amount must be between 1 and 100" }, { status: 400 })
    }

    const { rows, errors: parseErrors } = parseSurveyScoreText(text)
    if (rows.length === 0) {
      return NextResponse.json(
        {
          error: "No valid rows found. Each line needs a name and score 0 or 100.",
          parseErrors,
        },
        { status: 400 },
      )
    }

    const summary = await applySurveyRewards({
      rows,
      period,
      sectionNumber,
      coinAmount: Math.round(coinAmount),
      adminEmail: session.displayName,
      dryRun,
    })

    return NextResponse.json({
      success: true,
      dryRun,
      coinAmount: Math.round(coinAmount),
      period,
      sectionNumber,
      parseErrors,
      ...summary,
    })
  } catch (error) {
    console.error("Error applying survey rewards:", error)
    return NextResponse.json(
      {
        error: "Failed to process survey rewards",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
      },
      { status: 500 },
    )
  }
}
