import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"
import fs from "fs"
import path from "path"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get("id")

    if (!studentId) {
      return NextResponse.json({ error: "Student ID is required" }, { status: 400 })
    }

    console.log(`Looking for student: ${studentId}`)

    let studentData: any = {}

    // Check if database is available
    const hasDatabase = process.env.POSTGRES_URL || process.env.DATABASE_URL

    if (hasDatabase) {
      try {
        console.log("Attempting to fetch from database...")

        // Try to fetch from database first
        const result = await sql`
          SELECT data FROM student_data 
          ORDER BY uploaded_at DESC 
          LIMIT 1
        `

        if (result.rows.length > 0) {
          studentData = result.rows[0].data
          console.log(`Database data loaded with ${Object.keys(studentData).length} students`)
        } else {
          console.log("No data found in database, falling back to JSON file")
          throw new Error("No database data found")
        }
      } catch (dbError) {
        console.log("Database error, falling back to JSON file:", dbError)
        throw new Error("Database unavailable")
      }
    } else {
      console.log("No database connection string found, using JSON file")
      throw new Error("No database configured")
    }

    // Fallback to JSON file if database fails or is not configured
    if (!studentData || Object.keys(studentData).length === 0) {
      try {
        console.log("Loading from JSON file...")
        const filePath = path.join(process.cwd(), "data", "students.json")

        if (!fs.existsSync(filePath)) {
          console.log("JSON file not found")
          return NextResponse.json({ error: "No student data available" }, { status: 404 })
        }

        const fileContent = fs.readFileSync(filePath, "utf8")

        if (!fileContent.trim()) {
          console.log("JSON file is empty")
          return NextResponse.json({ error: "Student data file is empty" }, { status: 404 })
        }

        studentData = JSON.parse(fileContent)
        console.log(`JSON data loaded with ${Object.keys(studentData).length} students`)
      } catch (fileError) {
        console.error("Error reading JSON file:", fileError)
        return NextResponse.json({ error: "Failed to load student data" }, { status: 500 })
      }
    }

    // Look for the student
    const student = studentData[studentId]

    if (!student) {
      console.log(`Student ${studentId} not found`)
      console.log("Available student IDs:", Object.keys(studentData).slice(0, 10))

      return NextResponse.json(
        {
          error: "Student ID not found",
          availableIds: Object.keys(studentData).slice(0, 5),
          totalStudents: Object.keys(studentData).length,
        },
        { status: 404 },
      )
    }

    console.log(`Found student: ${student.name}`)
    return NextResponse.json(student)
  } catch (error) {
    console.error("API Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
