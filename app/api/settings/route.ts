import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"

// GET - Fetch public settings (read-only, no password required)
export async function GET() {
  try {
    // Check if database is available
    if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
      return NextResponse.json({ 
        overridesEnabled: true,
        redemptionRequestsEnabled: true
      })
    }

    try {
      // Get all settings, defaulting to true (enabled) if not set
      const result = await sql`
        SELECT setting_key, setting_value
        FROM admin_settings
      `

      const settingsMap = new Map<string, boolean>()
      result.rows.forEach((row) => {
        // Ensure boolean values are properly converted (PostgreSQL might return as string or boolean)
        const value = row.setting_value
        const boolValue = typeof value === 'boolean' ? value : value === true || value === 'true' || value === 't' || value === 1
        settingsMap.set(row.setting_key, boolValue)
      })

      // Return settings with defaults
      return NextResponse.json({
        overridesEnabled: settingsMap.get("overrides_enabled") ?? true,
        redemptionRequestsEnabled: settingsMap.get("redemption_requests_enabled") ?? true,
      })
    } catch (error) {
      // If table doesn't exist, return defaults
      console.log("Settings table may not exist, returning defaults:", error)
      return NextResponse.json({
        overridesEnabled: true,
        redemptionRequestsEnabled: true,
      })
    }
  } catch (error) {
    console.error("Get public settings error:", error)
    // Return defaults on error
    return NextResponse.json({
      overridesEnabled: true,
      redemptionRequestsEnabled: true,
    })
  }
}
