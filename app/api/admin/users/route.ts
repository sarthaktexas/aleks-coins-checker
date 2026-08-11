import { type NextRequest, NextResponse } from "next/server"
import {
  bootstrapAdminUsersIfNeeded,
  createAdminUser,
  isSession,
  listAdminUsers,
  requireAdmin,
  requireProfessor,
  type AdminRole,
  updateAdminUser,
} from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

/** GET — list staff accounts (any logged-in admin) */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin(request)
    if (!isSession(session)) return session

    await bootstrapAdminUsersIfNeeded()
    const users = await listAdminUsers()
    return NextResponse.json({ success: true, users })
  } catch (error) {
    console.error("Error listing admin users:", error)
    return NextResponse.json({ error: "Failed to list users" }, { status: 500 })
  }
}

/** POST — create staff account (professors only) */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin(request)
    if (!isSession(session)) return session
    const professorGate = requireProfessor(session)
    if (professorGate !== true) return professorGate

    const body = await request.json()
    const username = typeof body.username === "string" ? body.username : ""
    const displayName = typeof body.displayName === "string" ? body.displayName : ""
    const pin = typeof body.pin === "string" ? body.pin : ""
    const role: AdminRole = body.role === "professor" ? "professor" : "ta"

    const user = await createAdminUser({ username, displayName, pin, role })
    return NextResponse.json({ success: true, user })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create user"
    const status = message.includes("already exists") || message.includes("must be") ? 400 : 500
    console.error("Error creating admin user:", error)
    return NextResponse.json({ error: message }, { status })
  }
}

/** PATCH — update staff account (professors only) */
export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAdmin(request)
    if (!isSession(session)) return session
    const professorGate = requireProfessor(session)
    if (professorGate !== true) return professorGate

    const body = await request.json()
    const id = Number(body.id)
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "User id is required" }, { status: 400 })
    }

    // Prevent locking yourself out of professor role accidentally mid-request
    if (id === session.userId && body.active === false) {
      return NextResponse.json({ error: "You cannot deactivate your own account" }, { status: 400 })
    }
    if (id === session.userId && body.role === "ta") {
      return NextResponse.json({ error: "You cannot demote your own account" }, { status: 400 })
    }

    const user = await updateAdminUser(id, {
      displayName: typeof body.displayName === "string" ? body.displayName : undefined,
      pin: typeof body.pin === "string" && body.pin.length > 0 ? body.pin : undefined,
      role: body.role === "professor" || body.role === "ta" ? body.role : undefined,
      active: typeof body.active === "boolean" ? body.active : undefined,
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true, user })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update user"
    const status = message.includes("must be") ? 400 : 500
    console.error("Error updating admin user:", error)
    return NextResponse.json({ error: message }, { status })
  }
}
