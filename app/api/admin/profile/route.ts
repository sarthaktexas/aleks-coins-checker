import { type NextRequest, NextResponse } from "next/server"
import {
  buildSession,
  findActiveUserById,
  isSession,
  requireAdmin,
  setSessionCookie,
  updateAdminUser,
  verifyPin,
} from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

/** PATCH — update the signed-in user's own profile (display name and/or PIN) */
export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAdmin(request)
    if (!isSession(session)) return session

    const body = await request.json()
    const displayName =
      typeof body.displayName === "string" ? body.displayName.trim() : undefined
    const currentPin = typeof body.currentPin === "string" ? body.currentPin : ""
    const newPin = typeof body.newPin === "string" ? body.newPin : ""

    const wantsDisplayName = displayName !== undefined
    const wantsPin = newPin.length > 0

    if (!wantsDisplayName && !wantsPin) {
      return NextResponse.json(
        { error: "Provide a display name and/or a new PIN" },
        { status: 400 },
      )
    }

    if (wantsDisplayName && !displayName) {
      return NextResponse.json({ error: "Display name is required" }, { status: 400 })
    }

    if (wantsPin) {
      if (newPin.length < 4) {
        return NextResponse.json({ error: "PIN must be at least 4 characters" }, { status: 400 })
      }
      if (!currentPin) {
        return NextResponse.json(
          { error: "Current PIN is required to set a new PIN" },
          { status: 400 },
        )
      }

      const existing = await findActiveUserById(session.userId)
      if (!existing) {
        return NextResponse.json({ error: "User not found" }, { status: 404 })
      }
      if (!verifyPin(currentPin, existing.pinSalt, existing.pinHash)) {
        return NextResponse.json({ error: "Current PIN is incorrect" }, { status: 400 })
      }
    }

    const user = await updateAdminUser(session.userId, {
      displayName: wantsDisplayName ? displayName : undefined,
      pin: wantsPin ? newPin : undefined,
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const nextSession = buildSession(user)
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    })
    setSessionCookie(response, nextSession)
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update profile"
    const status = message.includes("must be") || message.includes("required") ? 400 : 500
    console.error("Error updating profile:", error)
    return NextResponse.json({ error: message }, { status })
  }
}
