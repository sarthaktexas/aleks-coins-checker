import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"

// GET - Fetch admin settings
export async function GET(request: NextRequest) {
  try {
    // Check admin password
    const { searchParams } = new URL(request.url)
    const password = searchParams.get("password")

    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 })
    }

    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    // Ensure the table exists
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS admin_settings (
          id SERIAL PRIMARY KEY,
          setting_key VARCHAR(100) UNIQUE NOT NULL,
          setting_value BOOLEAN NOT NULL DEFAULT true,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `
    } catch (tableError) {
      console.error("Table creation error:", tableError)
      return NextResponse.json({ error: "Database table setup failed" }, { status: 500 })
    }

    // Get all settings, defaulting to true (enabled) if not set
    const result = await sql`
      SELECT setting_key, setting_value
      FROM admin_settings
    `

    const settingsMap = new Map<string, boolean>()
    result.rows.forEach((row) => {
      settingsMap.set(row.setting_key, row.setting_value)
    })

    // Return settings with defaults
    return NextResponse.json({
      success: true,
      settings: {
        overridesEnabled: settingsMap.get("overrides_enabled") ?? true,
        redemptionRequestsEnabled: settingsMap.get("redemption_requests_enabled") ?? true,
      },
    })
  } catch (error) {
    console.error("Get admin settings error:", error)
    return NextResponse.json(
      { error: "Failed to fetch admin settings" },
      { status: 500 }
    )
  }
}

// PUT - Update admin settings
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { password, overridesEnabled, redemptionRequestsEnabled } = body

    // Check admin password
    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 })
    }

    // Validate input
    if (typeof overridesEnabled !== "boolean" && overridesEnabled !== undefined) {
      return NextResponse.json({ error: "Invalid overridesEnabled value" }, { status: 400 })
    }
    if (typeof redemptionRequestsEnabled !== "boolean" && redemptionRequestsEnabled !== undefined) {
      return NextResponse.json({ error: "Invalid redemptionRequestsEnabled value" }, { status: 400 })
    }

    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    // Ensure the table exists
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS admin_settings (
          id SERIAL PRIMARY KEY,
          setting_key VARCHAR(100) UNIQUE NOT NULL,
          setting_value BOOLEAN NOT NULL DEFAULT true,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `
    } catch (tableError) {
      console.error("Table creation error:", tableError)
      return NextResponse.json({ error: "Database table setup failed" }, { status: 500 })
    }

    // Update settings
    if (typeof overridesEnabled === "boolean") {
      await sql`
        INSERT INTO admin_settings (setting_key, setting_value, updated_at)
        VALUES ('overrides_enabled', ${overridesEnabled}, NOW())
        ON CONFLICT (setting_key)
        DO UPDATE SET
          setting_value = EXCLUDED.setting_value,
          updated_at = NOW()
      `
    }

    if (typeof redemptionRequestsEnabled === "boolean") {
      await sql`
        INSERT INTO admin_settings (setting_key, setting_value, updated_at)
        VALUES ('redemption_requests_enabled', ${redemptionRequestsEnabled}, NOW())
        ON CONFLICT (setting_key)
        DO UPDATE SET
          setting_value = EXCLUDED.setting_value,
          updated_at = NOW()
      `
    }

    // Return updated settings
    const result = await sql`
      SELECT setting_key, setting_value
      FROM admin_settings
    `

    const settingsMap = new Map<string, boolean>()
    result.rows.forEach((row) => {
      settingsMap.set(row.setting_key, row.setting_value)
    })

    return NextResponse.json({
      success: true,
      message: "Settings updated successfully",
      settings: {
        overridesEnabled: settingsMap.get("overrides_enabled") ?? true,
        redemptionRequestsEnabled: settingsMap.get("redemption_requests_enabled") ?? true,
      },
    })
  } catch (error) {
    console.error("Update admin settings error:", error)
    return NextResponse.json(
      { error: "Failed to update admin settings" },
      { status: 500 }
    )
  }
}
