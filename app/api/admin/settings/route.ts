import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"
import { isSession, requireAdmin } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

function parseSettingBool(value: unknown): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value === 1
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    return normalized === "true" || normalized === "t" || normalized === "1"
  }
  return false
}

async function ensureSettingsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS admin_settings (
      id SERIAL PRIMARY KEY,
      setting_key VARCHAR(100) UNIQUE NOT NULL,
      setting_value BOOLEAN NOT NULL DEFAULT true,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `
}

async function readSettings() {
  const result = await sql`
    SELECT setting_key, setting_value
    FROM admin_settings
  `

  const settingsMap = new Map<string, boolean>()
  for (const row of result.rows) {
    settingsMap.set(String(row.setting_key), parseSettingBool(row.setting_value))
  }

  return {
    overridesEnabled: settingsMap.get("overrides_enabled") ?? true,
    redemptionRequestsEnabled: settingsMap.get("redemption_requests_enabled") ?? true,
  }
}

async function upsertSetting(key: string, value: boolean) {
  // Bind as text then cast — avoids driver quirks with JS false in some postgres clients
  const written = await sql`
    INSERT INTO admin_settings (setting_key, setting_value, updated_at)
    VALUES (${key}, ${value ? "true" : "false"}::boolean, NOW())
    ON CONFLICT (setting_key)
    DO UPDATE SET
      setting_value = EXCLUDED.setting_value,
      updated_at = NOW()
    RETURNING setting_value
  `
  const stored = parseSettingBool(written.rows[0]?.setting_value)
  if (stored !== value) {
    throw new Error(`Failed to persist ${key}: wrote ${value}, got ${String(written.rows[0]?.setting_value)}`)
  }
  return stored
}

// GET - Fetch admin settings
export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin(request)
    if (!isSession(session)) return session

    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    try {
      await ensureSettingsTable()
    } catch (tableError) {
      console.error("Table creation error:", tableError)
      return NextResponse.json({ error: "Database table setup failed" }, { status: 500 })
    }

    const settings = await readSettings()
    return NextResponse.json({ success: true, settings })
  } catch (error) {
    console.error("Get admin settings error:", error)
    return NextResponse.json({ error: "Failed to fetch admin settings" }, { status: 500 })
  }
}

// PUT - Update admin settings
export async function PUT(request: NextRequest) {
  try {
    const session = await requireAdmin(request)
    if (!isSession(session)) return session

    const body = await request.json()
    const { overridesEnabled, redemptionRequestsEnabled } = body

    if (typeof overridesEnabled !== "boolean" && overridesEnabled !== undefined) {
      return NextResponse.json({ error: "Invalid overridesEnabled value" }, { status: 400 })
    }
    if (typeof redemptionRequestsEnabled !== "boolean" && redemptionRequestsEnabled !== undefined) {
      return NextResponse.json({ error: "Invalid redemptionRequestsEnabled value" }, { status: 400 })
    }

    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    try {
      await ensureSettingsTable()
    } catch (tableError) {
      console.error("Table creation error:", tableError)
      return NextResponse.json({ error: "Database table setup failed" }, { status: 500 })
    }

    if (typeof overridesEnabled === "boolean") {
      await upsertSetting("overrides_enabled", overridesEnabled)
    }
    if (typeof redemptionRequestsEnabled === "boolean") {
      await upsertSetting("redemption_requests_enabled", redemptionRequestsEnabled)
    }

    const settings = await readSettings()

    // Echo the values we just wrote so the client never snaps back from a bad re-read
    return NextResponse.json({
      success: true,
      message: "Settings updated successfully",
      settings: {
        overridesEnabled:
          typeof overridesEnabled === "boolean" ? overridesEnabled : settings.overridesEnabled,
        redemptionRequestsEnabled:
          typeof redemptionRequestsEnabled === "boolean"
            ? redemptionRequestsEnabled
            : settings.redemptionRequestsEnabled,
      },
    })
  } catch (error) {
    console.error("Update admin settings error:", error)
    return NextResponse.json(
      {
        error: "Failed to update admin settings",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
      },
      { status: 500 },
    )
  }
}
