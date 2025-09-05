import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"

export async function POST(request: NextRequest) {
  try {
    console.log("Admin upload request received")

    // Check admin password
    const formData = await request.formData()
    const password = formData.get("password") as string
    const file = formData.get("file") as File

    console.log("Password provided:", !!password)
    console.log("File provided:", !!file)

    if (!password || password !== process.env.ADMIN_PASSWORD) {
      console.log("Invalid password provided")
      return NextResponse.json({ error: "Invalid password" }, { status: 401 })
    }

    if (!file) {
      console.log("No file provided")
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
    }

    console.log("File details:", {
      name: file.name,
      size: file.size,
      type: file.type,
    })

    // Read file content
    const fileContent = await file.text()
    console.log("File content length:", fileContent.length)

    let studentData

    try {
      studentData = JSON.parse(fileContent)
      console.log("JSON parsed successfully")
    } catch (parseError) {
      console.error("JSON parse error:", parseError)
      return NextResponse.json({ error: "Invalid JSON file format" }, { status: 400 })
    }

    // Validate the data structure
    if (typeof studentData !== "object" || studentData === null) {
      console.log("Invalid data structure")
      return NextResponse.json({ error: "Invalid data format - expected JSON object" }, { status: 400 })
    }

    const studentCount = Object.keys(studentData).length
    console.log("Number of students in data:", studentCount)

    if (studentCount === 0) {
      return NextResponse.json({ error: "No student data found in file" }, { status: 400 })
    }

    // Ensure the table exists
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS student_data (
          id SERIAL PRIMARY KEY,
          data JSONB NOT NULL,
          uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `
      console.log("Table created/verified successfully")
    } catch (tableError) {
      console.error("Table creation error:", tableError)
      return NextResponse.json({ error: "Database table setup failed" }, { status: 500 })
    }

    // Store in database
    try {
      const insertResult = await sql`
        INSERT INTO student_data (data, uploaded_at)
        VALUES (${JSON.stringify(studentData)}, NOW())
        RETURNING id, uploaded_at
      `

      console.log("Data inserted successfully:", insertResult.rows[0])
    } catch (insertError) {
      console.error("Insert error:", insertError)
      return NextResponse.json({ error: "Failed to save data to database" }, { status: 500 })
    }

    console.log("Student data uploaded successfully to database")

    return NextResponse.json({
      success: true,
      message: "Student data uploaded successfully",
      studentCount: studentCount,
    })
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json(
      {
        error: "Failed to upload data",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
      },
      { status: 500 },
    )
  }
}
