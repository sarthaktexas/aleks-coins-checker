import { type NextRequest, NextResponse } from "next/server"
import { isSession, requireAdmin, requireProfessor } from "@/lib/admin-auth"
import { parseAleksWorkbook, processExcelData, saveStudentData } from "@/lib/aleks-excel"

export async function POST(request: NextRequest) {
  try {
    const session = requireAdmin(request)
    if (!isSession(session)) return session
    const professorGate = requireProfessor(session)
    if (professorGate !== true) return professorGate

    const formData = await request.formData()
    const file = formData.get("file") as File
    const examPeriod = formData.get("examPeriod") as string
    const sectionNumber = formData.get("sectionNumber") as string

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
    }

    if (!examPeriod) {
      return NextResponse.json({ error: "No exam period selected" }, { status: 400 })
    }

    if (!sectionNumber) {
      return NextResponse.json({ error: "Section number is required" }, { status: 400 })
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

    try {
      await saveStudentData(studentData, examPeriod, sectionNumber)
    } catch (insertError) {
      console.error("Insert error:", insertError)
      return NextResponse.json({ error: "Failed to save data to database" }, { status: 500 })
    }

    console.log(
      `✅ Successfully replaced data for period ${examPeriod}, section ${sectionNumber} with ${studentCount} students`,
    )

    return NextResponse.json({
      success: true,
      message: "Excel file processed and student data uploaded successfully",
      studentCount,
      examPeriod,
    })
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json(
      {
        error: "Failed to process and upload data",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
      },
      { status: 500 },
    )
  }
}
