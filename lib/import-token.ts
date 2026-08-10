import { timingSafeEqual } from "crypto"
import { type NextRequest, NextResponse } from "next/server"

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}

/**
 * Auth for GitHub Actions → app imports.
 * Accepts Authorization: Bearer <IMPORT_API_TOKEN>
 */
export function requireImportToken(request: NextRequest): true | NextResponse {
  const expected = process.env.IMPORT_API_TOKEN
  if (!expected) {
    return NextResponse.json(
      { error: "IMPORT_API_TOKEN is not configured on the server" },
      { status: 503 },
    )
  }

  const header = request.headers.get("authorization") || ""
  const match = header.match(/^Bearer\s+(.+)$/i)
  const token = match?.[1]?.trim()
  if (!token || !safeEqual(token, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return true
}

export function isAuthorized(result: true | NextResponse): result is true {
  return result === true
}
