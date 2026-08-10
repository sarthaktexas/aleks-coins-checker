import { type NextRequest, NextResponse } from "next/server"
import { parseAleksWorkbook, processExcelData, saveStudentData } from "@/lib/aleks-excel"
import { isAuthorized, requireImportToken } from "@/lib/import-token"

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

    console.log(
      `✅ ALEKS sync imported period=${examPeriod} section=${sectionNumber} students=${studentCount}`,
    )

    return NextResponse.json({
      success: true,
      message: "ALEKS report imported successfully",
      studentCount,
      examPeriod,
      sectionNumber,
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
