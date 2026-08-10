import { NextResponse } from "next/server"
import { sql } from "@vercel/postgres"

// Must stay dynamic — Next 14 caches GET route handlers by default when they
// don't read the request, which made toggle changes look intermittent to students.
export const dynamic = "force-dynamic"
export const revalidate = 0

function parseSettingBool(value: unknown): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value === 1
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    return normalized === "true" || normalized === "t" || normalized === "1"
  }
  return false
}

function settingsResponse(overridesEnabled: boolean, redemptionRequestsEnabled: boolean) {
  return NextResponse.json(
    { overridesEnabled, redemptionRequestsEnabled },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    },
  )
}

// GET - Fetch public settings (read-only, no password required)
export async function GET() {
  try {
    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return settingsResponse(true, true)
    }

    try {
      const result = await sql`
        SELECT setting_key, setting_value
        FROM admin_settings
      `

      const settingsMap = new Map<string, boolean>()
      result.rows.forEach((row) => {
        settingsMap.set(row.setting_key, parseSettingBool(row.setting_value))
      })

      return settingsResponse(
        settingsMap.get("overrides_enabled") ?? true,
        settingsMap.get("redemption_requests_enabled") ?? true,
      )
    } catch (error) {
      // If table doesn't exist, return defaults
      console.log("Settings table may not exist, returning defaults:", error)
      return settingsResponse(true, true)
    }
  } catch (error) {
    console.error("Get public settings error:", error)
    return settingsResponse(true, true)
  }
}
