import { type NextRequest, NextResponse } from "next/server"
import {
  bootstrapAdminUsersIfNeeded,
  buildSession,
  clearSessionCookie,
  findActiveUserById,
  findActiveUserByUsername,
  getSessionFromRequest,
  setSessionCookie,
  verifyPin,
} from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

/** GET — current session (if any) */
export async function GET(request: NextRequest) {
  try {
    await bootstrapAdminUsersIfNeeded()
    const session = getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    const user = await findActiveUserById(session.userId)
    if (!user) {
      const response = NextResponse.json({ authenticated: false }, { status: 401 })
      clearSessionCookie(response)
      return response
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    })
  } catch (error) {
    console.error("Session check error:", error)
    return NextResponse.json(
      {
        error: "Failed to check session",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
      },
      { status: 500 },
    )
  }
}

/** POST — login with username + PIN */
export async function POST(request: NextRequest) {
  try {
    await bootstrapAdminUsersIfNeeded()

    const body = await request.json()
    const username = typeof body.username === "string" ? body.username : ""
    const pin = typeof body.pin === "string" ? body.pin : typeof body.password === "string" ? body.password : ""

    if (!username || !pin) {
      return NextResponse.json({ error: "Username and PIN are required" }, { status: 400 })
    }

    const user = await findActiveUserByUsername(username)
    if (!user || !verifyPin(pin, user.pinSalt, user.pinHash)) {
      return NextResponse.json({ error: "Invalid username or PIN" }, { status: 401 })
    }

    const session = buildSession(user)
    const response = NextResponse.json({
      success: true,
      message: "Authentication successful",
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    })
    setSessionCookie(response, session)
    return response
  } catch (error) {
    console.error("Auth error:", error)
    return NextResponse.json(
      {
        error: "Authentication failed",
        details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
      },
      { status: 500 },
    )
  }
}

/** DELETE — logout */
export async function DELETE() {
  const response = NextResponse.json({ success: true })
  clearSessionCookie(response)
  return response
}
