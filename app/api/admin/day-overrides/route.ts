import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"
import crypto from "crypto"
import { bustStudentDataCache } from "@/lib/student-cache"
import { type AdminSession, isSession, requireAdmin } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

function actorFingerprint(session: AdminSession) {
  return crypto
    .createHash("sha256")
    .update(`${session.userId}:${session.username}`)
    .digest("hex")
    .substring(0, 16)
}

function canModifyOverride(
  session: AdminSession,
  adminPasswordHash: string | null | undefined,
): boolean {
  if (session.role === "professor") return true
  if (!adminPasswordHash) return false
  return adminPasswordHash === actorFingerprint(session)
}

async function ensureOverridesTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS student_day_overrides (
      id SERIAL PRIMARY KEY,
      student_id VARCHAR(50) NOT NULL,
      day_number INTEGER NOT NULL,
      date VARCHAR(10) NOT NULL,
      override_type VARCHAR(20) NOT NULL,
      reason TEXT,
      admin_password_hash VARCHAR(255),
      created_by VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(student_id, date)
    )
  `
  await sql`
    ALTER TABLE student_day_overrides
    ADD COLUMN IF NOT EXISTS created_by VARCHAR(255)
  `

  // Older DBs used UNIQUE(student_id, day_number), which silently blocked / replaced
  // overrides across exam periods that share the same day number. Migrate to date.
  await sql`
    DO $$
    DECLARE
      r RECORD;
    BEGIN
      FOR r IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'student_day_overrides'
          AND c.contype = 'u'
          AND pg_get_constraintdef(c.oid) ILIKE '%day_number%'
      LOOP
        EXECUTE format('ALTER TABLE student_day_overrides DROP CONSTRAINT %I', r.conname);
      END LOOP;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'student_day_overrides'
          AND c.contype = 'u'
          AND pg_get_constraintdef(c.oid) ILIKE '%(student_id, date)%'
      ) THEN
        ALTER TABLE student_day_overrides
          ADD CONSTRAINT student_day_overrides_student_id_date_key UNIQUE (student_id, date);
      END IF;
    END $$;
  `
}

// Create or update day override
export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin(request)
    if (!isSession(session)) return session

    const {
      studentId,
      dayNumber,
      date,
      overrideType,
      reason,
    } = await request.json()

    if (!studentId || !dayNumber || !date || !overrideType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (!["qualified", "not_qualified"].includes(overrideType)) {
      return NextResponse.json({ error: "Invalid override type" }, { status: 400 })
    }

    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    try {
      const settingsResult = await sql`
        SELECT setting_value
        FROM admin_settings
        WHERE setting_key = 'overrides_enabled'
      `
      let overridesEnabled = true
      if (settingsResult.rows.length > 0) {
        const value = settingsResult.rows[0].setting_value
        overridesEnabled =
          typeof value === "boolean"
            ? value
            : value === true || value === "true" || value === "t" || value === 1
      }

      if (!overridesEnabled) {
        return NextResponse.json(
          {
            error: "Day overrides are currently disabled. Please contact an administrator.",
          },
          { status: 403 },
        )
      }
    } catch (settingsError) {
      console.log("Settings check skipped (table may not exist):", settingsError)
    }

    try {
      await ensureOverridesTable()
    } catch (tableError) {
      console.error("Table creation error:", tableError)
      return NextResponse.json({ error: "Database table setup failed" }, { status: 500 })
    }

    const adminPasswordHash = actorFingerprint(session)
    const createdBy = session.displayName
    const normalizedStudentId = (studentId || "").toLowerCase().trim()
    const normalizedDate = (date || "").trim()

    const existingByDate = await sql`
      SELECT id, day_number, admin_password_hash
      FROM student_day_overrides
      WHERE student_id = ${normalizedStudentId}
        AND date = ${normalizedDate}
    `

    let result
    if (existingByDate.rows.length > 0) {
      const existing = existingByDate.rows[0]
      if (!canModifyOverride(session, existing.admin_password_hash)) {
        return NextResponse.json(
          { error: "You can only edit overrides you created. Ask a professor to change this one." },
          { status: 403 },
        )
      }

      result = await sql`
        UPDATE student_day_overrides
        SET day_number = ${dayNumber},
            override_type = ${overrideType},
            reason = ${reason || null},
            admin_password_hash = ${adminPasswordHash},
            created_by = ${createdBy},
            updated_at = NOW()
        WHERE id = ${existing.id}
        RETURNING id, created_at, updated_at
      `
    } else {
      // Unique key is (student_id, date) — same day_number in another period is fine
      result = await sql`
        INSERT INTO student_day_overrides (
          student_id, day_number, date,
          override_type, reason, admin_password_hash, created_by
        )
        VALUES (
          ${normalizedStudentId}, ${dayNumber}, ${normalizedDate},
          ${overrideType}, ${reason || null}, ${adminPasswordHash}, ${createdBy}
        )
        ON CONFLICT (student_id, date)
        DO UPDATE SET
          day_number = EXCLUDED.day_number,
          override_type = EXCLUDED.override_type,
          reason = EXCLUDED.reason,
          admin_password_hash = EXCLUDED.admin_password_hash,
          created_by = EXCLUDED.created_by,
          updated_at = NOW()
        RETURNING id, created_at, updated_at
      `
    }

    bustStudentDataCache()

    return NextResponse.json({
      success: true,
      message: "Day override saved successfully",
      override: {
        id: result.rows[0].id,
        studentId,
        dayNumber,
        date,
        overrideType,
        reason,
        createdBy,
        createdAt: result.rows[0].created_at,
        updatedAt: result.rows[0].updated_at,
      },
    })
  } catch (error) {
    console.error("Day override error:", error)
    return NextResponse.json({ error: "Failed to save day override" }, { status: 500 })
  }
}

// Get all overrides for a student
export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin(request)
    if (!isSession(session)) return session

    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get("studentId")

    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json(
        {
          error: "Database not configured",
          overrides: [],
        },
        { status: 503 },
      )
    }

    try {
      await ensureOverridesTable()
    } catch {
      // Table may already exist without created_by; continue best-effort
    }

    let overrides = []

    if (studentId) {
      const normalizedStudentId = studentId.toLowerCase().trim()

      const result = await sql`
        SELECT
          id, student_id, day_number, date,
          override_type, reason, admin_password_hash, created_by,
          created_at, updated_at
        FROM student_day_overrides
        WHERE student_id = ${normalizedStudentId}
        ORDER BY day_number ASC
      `
      overrides = result.rows.map((row) => ({
        id: row.id,
        student_id: row.student_id,
        day_number: row.day_number,
        date: row.date,
        override_type: row.override_type,
        reason: row.reason,
        created_by: row.created_by || null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        can_modify: canModifyOverride(session, row.admin_password_hash),
      }))
    } else {
      const result = await sql`
        SELECT
          id, student_id, day_number, date,
          override_type, reason, admin_password_hash, created_by,
          created_at, updated_at
        FROM student_day_overrides
        ORDER BY created_at DESC
      `

      const studentIds = [...new Set(result.rows.map((row) => row.student_id))]
      const studentNameMap = new Map<string, string>()

      if (studentIds.length > 0) {
        const studentDataResult = await sql`
          SELECT data
          FROM student_data
          ORDER BY uploaded_at DESC
        `

        for (const row of studentDataResult.rows) {
          const studentData = row.data
          const parsedData =
            typeof studentData === "string" ? JSON.parse(studentData) : studentData

          studentIds.forEach((id) => {
            if (!studentNameMap.has(id) && parsedData[id] && parsedData[id].name) {
              studentNameMap.set(id, parsedData[id].name)
            }
          })

          if (studentNameMap.size === studentIds.length) break
        }
      }

      overrides = result.rows.map((row) => ({
        id: row.id,
        student_id: row.student_id,
        student_name: studentNameMap.get(row.student_id) || "Unknown Student",
        day_number: row.day_number,
        date: row.date,
        override_type: row.override_type,
        reason: row.reason,
        created_by: row.created_by || null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        can_modify: canModifyOverride(session, row.admin_password_hash),
      }))
    }

    return NextResponse.json({
      success: true,
      overrides,
    })
  } catch (error) {
    console.error("Get overrides error:", error)
    return NextResponse.json(
      { error: "Failed to fetch overrides", overrides: [] },
      { status: 500 },
    )
  }
}

// Delete a day override
export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAdmin(request)
    if (!isSession(session)) return session

    const { studentId, dayNumber, date, id } = await request.json()

    if (!studentId || (!id && !date && !dayNumber)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    const normalizedStudentId = (studentId || "").toLowerCase().trim()
    const normalizedDate = typeof date === "string" ? date.trim() : ""

    // Prefer id, then date — day_number alone is ambiguous across periods
    let existing
    if (id) {
      existing = await sql`
        SELECT id, admin_password_hash
        FROM student_day_overrides
        WHERE id = ${id}
          AND student_id = ${normalizedStudentId}
      `
    } else if (normalizedDate) {
      existing = await sql`
        SELECT id, admin_password_hash
        FROM student_day_overrides
        WHERE student_id = ${normalizedStudentId}
          AND date = ${normalizedDate}
      `
    } else {
      existing = await sql`
        SELECT id, admin_password_hash
        FROM student_day_overrides
        WHERE student_id = ${normalizedStudentId}
          AND day_number = ${dayNumber}
        ORDER BY date DESC
        LIMIT 1
      `
    }

    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Override not found" }, { status: 404 })
    }

    if (!canModifyOverride(session, existing.rows[0].admin_password_hash)) {
      return NextResponse.json(
        { error: "You can only delete overrides you created. Ask a professor to remove this one." },
        { status: 403 },
      )
    }

    await sql`
      DELETE FROM student_day_overrides
      WHERE id = ${existing.rows[0].id}
    `

    bustStudentDataCache()

    return NextResponse.json({
      success: true,
      message: "Day override deleted successfully",
    })
  } catch (error) {
    console.error("Delete override error:", error)
    return NextResponse.json({ error: "Failed to delete override" }, { status: 500 })
  }
}
