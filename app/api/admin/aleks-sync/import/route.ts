import { type NextRequest, NextResponse } from "next/server"
import { parseAleksWorkbook, processExcelData, saveStudentData } from "@/lib/aleks-excel"
import { isAuthorized, requireImportToken } from "@/lib/import-token"
import { ensureBadgesSchema, processBadgesForStudent } from "@/lib/badges"

export const dynamic = "force-dynamic"

/**
 * POST /api/admin/aleks-sync/import
 * Auth: Bearer IMPORT_API_TOKEN
 * Form fields: file, examPeriod, sectionNumber
 */
export async function POST(request: NextRequest) {
  try {
    const auth = requireImportToken(request)
    if (!isAuthorized(auth)) return auth

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const examPeriod = String(formData.get("examPeriod") || "")
    const sectionNumber = String(formData.get("sectionNumber") || "")

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
    }
    if (!examPeriod) {
      return NextResponse.json({ error: "examPeriod is required" }, { status: 400 })
    }
    if (!sectionNumber) {
      return NextResponse.json({ error: "sectionNumber is required" }, { status: 400 })
    }

    const fileBuffer = await file.arrayBuffer()
    const rawData = parseAleksWorkbook(fileBuffer)

    if (rawData.length === 0) {
      return NextResponse.json({ error: "No data found in Excel file" }, { status: 400 })
    }

    const studentData = await processExcelData(rawData, examPeriod)
    const studentCount = Object.keys(studentData).length

    if (studentCount === 0) {
      return NextResponse.json({ error: "No valid student data found in file" }, { status: 400 })
    }

    await saveStudentData(studentData, examPeriod, sectionNumber)

    // Process badges for all students after data import
    let badgesAwarded = 0
    let coinsAwarded = 0
    try {
      await ensureBadgesSchema()
      
      for (const [studentId, student] of Object.entries(studentData)) {
        const { badgesEarned, coinsAwarded: coins } = await processBadgesForStudent(
          studentId,
          student.name,
          student.dailyLog,
          examPeriod,
          sectionNumber,
          "aleks-sync-import"
        )
        badgesAwarded += badgesEarned.length
        coinsAwarded += coins
      }

      if (badgesAwarded > 0) {
        console.log(
          `🏆 Badge processing: awarded ${badgesAwarded} badge(s) and ${coinsAwarded} bonus coins`,
        )
      }
    } catch (badgeError) {
      // Don't fail the import if badge processing fails
      console.error("Badge processing error (non-fatal):", badgeError)
    }

    console.log(
      `✅ ALEKS sync imported period=${examPeriod} section=${sectionNumber} students=${studentCount}`,
    )

    return NextResponse.json({
      success: true,
      message: "ALEKS report imported successfully",
      studentCount,
      examPeriod,
      sectionNumber,
      badgesAwarded,
      coinsAwarded,
    })
  } catch (error) {
    console.error("ALEKS sync import error:", error)
    return NextResponse.json(
      {
        error: "Failed to import ALEKS report",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
      },
      { status: 500 },
    )
  }
}
