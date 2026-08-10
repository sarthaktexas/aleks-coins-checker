import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"

export const dynamic = "force-dynamic"

async function ensureBugReportsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS bug_reports (
      id SERIAL PRIMARY KEY,
      student_id TEXT,
      contact_email TEXT,
      page_url TEXT,
      description TEXT NOT NULL,
      user_agent TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      admin_notes TEXT,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    )
  `
}

async function sendOptionalEmail(opts: {
  id: number
  studentId?: string
  contactEmail?: string
  pageUrl?: string
  description: string
  userAgent?: string
}) {
  const apiKey = process.env.RESEND_API_KEY
  const toEmail = process.env.BUG_REPORT_EMAIL || "sarthaktexas@gmail.com"

  if (!apiKey) {
    return { emailed: false as const, reason: "email_not_configured" as const }
  }

  const fromEmail = process.env.BUG_REPORT_FROM_EMAIL || "onboarding@resend.dev"
  const subject = `[ALEKS Portal] Bug report #${opts.id}`
  const text = [
    `Bug report #${opts.id}`,
    "",
    `Student ID: ${opts.studentId || "(not provided)"}`,
    `Contact email: ${opts.contactEmail || "(not provided)"}`,
    `Page: ${opts.pageUrl || "(unknown)"}`,
    `Submitted: ${new Date().toISOString()}`,
    "",
    "Description:",
    opts.description,
    "",
    `User agent: ${opts.userAgent || "(unknown)"}`,
    "",
    "View in admin: /admin/bug-reports",
  ].join("\n")

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      subject,
      text,
      ...(opts.contactEmail ? { reply_to: opts.contactEmail } : {}),
    }),
  })

  if (!response.ok) {
    const details = await response.text()
    console.error("Resend email failed:", details)
    return { emailed: false as const, reason: "email_send_failed" as const }
  }

  return { emailed: true as const }
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    const body = await request.json()
    const studentId =
      typeof body.studentId === "string" ? body.studentId.trim().slice(0, 64) : ""
    const contactEmail =
      typeof body.contactEmail === "string" ? body.contactEmail.trim().slice(0, 254) : ""
    const pageUrl =
      typeof body.pageUrl === "string" ? body.pageUrl.trim().slice(0, 500) : ""
    const description =
      typeof body.description === "string" ? body.description.trim().slice(0, 4000) : ""
    const userAgent = request.headers.get("user-agent")?.slice(0, 500) || ""

    if (!description || description.length < 10) {
      return NextResponse.json(
        { error: "Please describe the issue in at least 10 characters." },
        { status: 400 }
      )
    }

    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      return NextResponse.json({ error: "Invalid contact email." }, { status: 400 })
    }

    await ensureBugReportsTable()

    const result = await sql`
      INSERT INTO bug_reports (student_id, contact_email, page_url, description, user_agent)
      VALUES (
        ${studentId || null},
        ${contactEmail || null},
        ${pageUrl || null},
        ${description},
        ${userAgent || null}
      )
      RETURNING id
    `

    const id = result.rows[0].id as number
    const emailResult = await sendOptionalEmail({
      id,
      studentId: studentId || undefined,
      contactEmail: contactEmail || undefined,
      pageUrl: pageUrl || undefined,
      description,
      userAgent: userAgent || undefined,
    })

    return NextResponse.json({
      success: true,
      id,
      emailed: emailResult.emailed,
    })
  } catch (error) {
    console.error("Error submitting bug report:", error)
    return NextResponse.json(
      {
        error: "Failed to submit bug report",
        details:
          process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
      },
      { status: 500 }
    )
  }
}
