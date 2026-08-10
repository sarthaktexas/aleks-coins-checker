import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@vercel/postgres"

export type AdminRole = "ta" | "professor"

export type AdminUser = {
  id: number
  username: string
  displayName: string
  role: AdminRole
  active: boolean
}

export type AdminSession = {
  userId: number
  username: string
  displayName: string
  role: AdminRole
  exp: number
}

const SESSION_COOKIE = "admin_session"
const SESSION_TTL_SECONDS = 60 * 60 * 12 // 12 hours
const PIN_KEY_LEN = 64

function getSessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD
  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET (or ADMIN_PASSWORD fallback) is not configured")
  }
  return secret
}

export function hashPin(pin: string, salt?: string): { hash: string; salt: string } {
  const pinSalt = salt || randomBytes(16).toString("hex")
  const hash = scryptSync(pin, pinSalt, PIN_KEY_LEN).toString("hex")
  return { hash, salt: pinSalt }
}

export function verifyPin(pin: string, salt: string, expectedHash: string): boolean {
  try {
    const actual = scryptSync(pin, salt, PIN_KEY_LEN)
    const expected = Buffer.from(expectedHash, "hex")
    if (actual.length !== expected.length) return false
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

function signPayload(payload: string): string {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url")
}

export function encodeSession(session: AdminSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url")
  const signature = signPayload(payload)
  return `${payload}.${signature}`
}

export function decodeSession(token: string | undefined): AdminSession | null {
  if (!token) return null
  const [payload, signature] = token.split(".")
  if (!payload || !signature) return null

  const expected = signPayload(payload)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AdminSession
    if (!session?.userId || !session.exp || session.exp < Date.now()) return null
    if (!session.username || !session.displayName || !session.role) return null
    return session
  } catch {
    return null
  }
}

export function sessionCookieOptions(maxAge = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  }
}

export function buildSession(user: AdminUser): AdminSession {
  return {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    exp: Date.now() + SESSION_TTL_SECONDS * 1000,
  }
}

export function setSessionCookie(response: NextResponse, session: AdminSession) {
  response.cookies.set(SESSION_COOKIE, encodeSession(session), sessionCookieOptions())
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0))
}

export function getSessionFromRequest(request: NextRequest): AdminSession | null {
  return decodeSession(request.cookies.get(SESSION_COOKIE)?.value)
}

export function getSessionFromCookies(): AdminSession | null {
  return decodeSession(cookies().get(SESSION_COOKIE)?.value)
}

export function unauthorized(message = "Authentication required") {
  return NextResponse.json({ error: message }, { status: 401 })
}

export function forbidden(message = "Insufficient permissions") {
  return NextResponse.json({ error: message }, { status: 403 })
}

/** Require a valid admin session. Returns session or a 401 response. */
export function requireAdmin(request: NextRequest): AdminSession | NextResponse {
  const session = getSessionFromRequest(request)
  if (!session) return unauthorized()
  return session
}

export function requireProfessor(session: AdminSession): true | NextResponse {
  if (session.role !== "professor") return forbidden("Professor access required")
  return true
}

export function isSession(value: AdminSession | NextResponse): value is AdminSession {
  return !(value instanceof NextResponse)
}

export async function ensureAdminUsersTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS admin_users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(64) UNIQUE NOT NULL,
      display_name VARCHAR(255) NOT NULL,
      pin_hash VARCHAR(255) NOT NULL,
      pin_salt VARCHAR(64) NOT NULL,
      role VARCHAR(32) NOT NULL DEFAULT 'ta',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase()
}

function rowToUser(row: {
  id: number
  username: string
  display_name: string
  role: string
  active: boolean
}): AdminUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role === "professor" ? "professor" : "ta",
    active: row.active,
  }
}

/** Create the first professor from ADMIN_PASSWORD if the table is empty. */
export async function bootstrapAdminUsersIfNeeded() {
  await ensureAdminUsersTable()

  const count = await sql`SELECT COUNT(*)::int AS count FROM admin_users`
  if ((count.rows[0]?.count as number) > 0) return

  const bootstrapPin =
    process.env.ADMIN_BOOTSTRAP_PIN || process.env.ADMIN_PASSWORD
  const bootstrapUsername = normalizeUsername(
    process.env.ADMIN_BOOTSTRAP_USERNAME || "admin",
  )
  const bootstrapName = process.env.ADMIN_BOOTSTRAP_NAME || "Admin"

  if (!bootstrapPin) {
    throw new Error(
      "No admin users exist. Set ADMIN_BOOTSTRAP_PIN (or ADMIN_PASSWORD) to create the first account.",
    )
  }

  const { hash, salt } = hashPin(bootstrapPin)
  await sql`
    INSERT INTO admin_users (username, display_name, pin_hash, pin_salt, role, active)
    VALUES (${bootstrapUsername}, ${bootstrapName}, ${hash}, ${salt}, 'professor', TRUE)
  `
}

export async function findActiveUserByUsername(username: string): Promise<
  | (AdminUser & { pinHash: string; pinSalt: string })
  | null
> {
  await ensureAdminUsersTable()
  const result = await sql`
    SELECT id, username, display_name, role, active, pin_hash, pin_salt
    FROM admin_users
    WHERE username = ${normalizeUsername(username)} AND active = TRUE
    LIMIT 1
  `
  if (result.rows.length === 0) return null
  const row = result.rows[0]
  return {
    ...rowToUser(row as any),
    pinHash: row.pin_hash as string,
    pinSalt: row.pin_salt as string,
  }
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  await ensureAdminUsersTable()
  const result = await sql`
    SELECT id, username, display_name, role, active
    FROM admin_users
    ORDER BY display_name ASC
  `
  return result.rows.map((row) => rowToUser(row as any))
}

export async function createAdminUser(input: {
  username: string
  displayName: string
  pin: string
  role: AdminRole
}): Promise<AdminUser> {
  await ensureAdminUsersTable()
  const username = normalizeUsername(input.username)
  if (!username || username.length < 2) {
    throw new Error("Username must be at least 2 characters")
  }
  if (!input.displayName.trim()) {
    throw new Error("Display name is required")
  }
  if (!input.pin || input.pin.length < 4) {
    throw new Error("PIN must be at least 4 characters")
  }
  if (input.role !== "ta" && input.role !== "professor") {
    throw new Error("Role must be ta or professor")
  }

  const { hash, salt } = hashPin(input.pin)
  try {
    const result = await sql`
      INSERT INTO admin_users (username, display_name, pin_hash, pin_salt, role, active)
      VALUES (${username}, ${input.displayName.trim()}, ${hash}, ${salt}, ${input.role}, TRUE)
      RETURNING id, username, display_name, role, active
    `
    return rowToUser(result.rows[0] as any)
  } catch (error: any) {
    if (error?.code === "23505") {
      throw new Error("Username already exists")
    }
    throw error
  }
}

export async function updateAdminUser(
  id: number,
  updates: {
    displayName?: string
    pin?: string
    role?: AdminRole
    active?: boolean
  },
): Promise<AdminUser | null> {
  await ensureAdminUsersTable()
  const existing = await sql`
    SELECT id, username, display_name, role, active, pin_hash, pin_salt
    FROM admin_users WHERE id = ${id} LIMIT 1
  `
  if (existing.rows.length === 0) return null

  const row = existing.rows[0]
  const displayName = updates.displayName?.trim() || (row.display_name as string)
  const role = updates.role || (row.role as AdminRole)
  const active = updates.active ?? (row.active as boolean)
  let pinHash = row.pin_hash as string
  let pinSalt = row.pin_salt as string

  if (updates.pin) {
    if (updates.pin.length < 4) throw new Error("PIN must be at least 4 characters")
    const hashed = hashPin(updates.pin)
    pinHash = hashed.hash
    pinSalt = hashed.salt
  }

  const result = await sql`
    UPDATE admin_users
    SET
      display_name = ${displayName},
      pin_hash = ${pinHash},
      pin_salt = ${pinSalt},
      role = ${role},
      active = ${active},
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING id, username, display_name, role, active
  `
  return rowToUser(result.rows[0] as any)
}

export { SESSION_COOKIE, SESSION_TTL_SECONDS }
