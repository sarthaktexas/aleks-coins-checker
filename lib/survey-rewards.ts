import { sql } from "@vercel/postgres"
import {
  awardBadge,
  ensureBadgesSchema,
  hasSurveyBadge,
} from "@/lib/badges"
import {
  SURVEY_COMPLETE_COINS,
  SURVEY_COIN_REASON,
} from "@/lib/badge-constants"
import { bustStudentDataCache } from "@/lib/student-cache"

export type SurveyScoreRow = {
  rawName: string
  score: 0 | 100
  lineNumber: number
}

export type SurveyMatchResult = {
  rawName: string
  score: 0 | 100
  lineNumber: number
  status:
    | "awarded"
    | "already_awarded"
    | "skipped_zero"
    | "not_found"
    | "ambiguous"
    | "error"
  studentId?: string
  studentName?: string
  coinsAwarded?: number
  message?: string
}

export type SurveyRosterEntry = {
  studentId: string
  name: string
  period: string
  sectionNumber: string
}

/** Lowercase, strip accents, collapse punctuation/spacing for fuzzy name match. */
export function normalizeNameKey(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9,\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Generate match keys for "Last, First" and "First Last" forms. */
export function nameMatchKeys(name: string): string[] {
  const n = normalizeNameKey(name)
  if (!n) return []
  const keys = new Set<string>([n])

  if (n.includes(",")) {
    const [last, ...rest] = n.split(",").map((s) => s.trim())
    const first = rest.join(" ").trim()
    if (last && first) {
      keys.add(`${first} ${last}`)
      keys.add(`${last} ${first}`)
    }
  } else {
    const parts = n.split(" ").filter(Boolean)
    if (parts.length >= 2) {
      const last = parts[parts.length - 1]
      const first = parts.slice(0, -1).join(" ")
      keys.add(`${last}, ${first}`)
      keys.add(`${last} ${first}`)
    }
  }

  return [...keys]
}

/**
 * Parse pasted text or CSV-ish lines into name + 0/100 score rows.
 * Accepts: "Name, 100", "Name\t100", "Name 100", "id,100"
 */
export function parseSurveyScoreText(text: string): {
  rows: SurveyScoreRow[]
  errors: string[]
} {
  const rows: SurveyScoreRow[] = []
  const errors: string[] = []
  const lines = String(text || "").split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1
    const raw = lines[i].trim()
    if (!raw) continue

    // Skip common header rows
    if (/^(name|student|full\s*name|student\s*name)\b/i.test(raw) && /score|grade|result|points/i.test(raw)) {
      continue
    }

    const parsed = parseSurveyScoreLine(raw)
    if (!parsed) {
      errors.push(`Line ${lineNumber}: could not parse "${raw}" (need a name and score 0 or 100)`)
      continue
    }
    rows.push({ ...parsed, lineNumber })
  }

  return { rows, errors }
}

export function parseSurveyScoreLine(line: string): Omit<SurveyScoreRow, "lineNumber"> | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  // Trailing score: comma / tab / whitespace before 0 or 100
  const match = trimmed.match(/^(.*?)(?:[,\t]\s*|\s+)(100|0)\s*$/)
  if (!match) return null

  const rawName = match[1].replace(/^["']|["']$/g, "").trim()
  if (!rawName) return null

  const score = Number(match[2]) as 0 | 100
  if (score !== 0 && score !== 100) return null

  return { rawName, score }
}

/**
 * Build a name/id → roster index from the latest uploads for a period.
 * Prefers the admin-selected section when a student appears in multiple sections.
 */
export async function buildSurveyRosterIndex(options: {
  period: string
  sectionNumber?: string | null
}): Promise<{
  byKey: Map<string, SurveyRosterEntry[]>
  byId: Map<string, SurveyRosterEntry>
  entries: SurveyRosterEntry[]
}> {
  const { period, sectionNumber } = options
  const preferredSection = (sectionNumber || "").trim() || null

  const rows = await sql`
    SELECT
      key AS student_id,
      value->>'name' AS name,
      COALESCE(section_number, 'default') AS section_number,
      uploaded_at
    FROM (
      SELECT DISTINCT ON (COALESCE(section_number, 'default'))
        data,
        COALESCE(section_number, 'default') AS section_number,
        uploaded_at
      FROM student_data
      WHERE period = ${period}
      ORDER BY COALESCE(section_number, 'default'), uploaded_at DESC
    ) latest
    CROSS JOIN LATERAL jsonb_each(data) AS x(key, value)
    ORDER BY uploaded_at DESC
  `

  type Raw = { studentId: string; name: string; sectionNumber: string; preferred: boolean }
  const bestById = new Map<string, Raw>()

  for (const row of rows.rows) {
    const studentId = String(row.student_id || "")
      .toLowerCase()
      .trim()
    if (!studentId) continue
    const section = String(row.section_number || "default")
    const preferred = Boolean(preferredSection && section === preferredSection)
    const existing = bestById.get(studentId)
    if (!existing) {
      bestById.set(studentId, {
        studentId,
        name: String(row.name || ""),
        sectionNumber: preferredSection || section,
        preferred,
      })
      continue
    }
    // Prefer the selected section's copy of the student when available
    if (preferred && !existing.preferred) {
      bestById.set(studentId, {
        studentId,
        name: String(row.name || ""),
        sectionNumber: preferredSection || section,
        preferred: true,
      })
    }
  }

  const byKey = new Map<string, SurveyRosterEntry[]>()
  const byId = new Map<string, SurveyRosterEntry>()
  const entries: SurveyRosterEntry[] = []

  for (const raw of bestById.values()) {
    const entry: SurveyRosterEntry = {
      studentId: raw.studentId,
      name: raw.name,
      period,
      sectionNumber: preferredSection || raw.sectionNumber,
    }
    entries.push(entry)
    byId.set(entry.studentId, entry)
    for (const key of nameMatchKeys(entry.name)) {
      const list = byKey.get(key) || []
      if (!list.some((e) => e.studentId === entry.studentId)) list.push(entry)
      byKey.set(key, list)
    }
  }

  return { byKey, byId, entries }
}

export function resolveSurveyMatch(
  rawName: string,
  index: { byKey: Map<string, SurveyRosterEntry[]>; byId: Map<string, SurveyRosterEntry> },
): { entry?: SurveyRosterEntry; status: "matched" | "not_found" | "ambiguous"; message?: string } {
  const asId = rawName.toLowerCase().trim()
  if (index.byId.has(asId)) {
    return { entry: index.byId.get(asId), status: "matched" }
  }

  const candidates = new Map<string, SurveyRosterEntry>()
  for (const key of nameMatchKeys(rawName)) {
    for (const entry of index.byKey.get(key) || []) {
      candidates.set(entry.studentId, entry)
    }
  }

  if (candidates.size === 0) {
    return { status: "not_found", message: `No student matched "${rawName}"` }
  }
  if (candidates.size > 1) {
    const names = [...candidates.values()].map((e) => `${e.name} (${e.studentId})`).join("; ")
    return { status: "ambiguous", message: `Multiple matches for "${rawName}": ${names}` }
  }

  return { entry: [...candidates.values()][0], status: "matched" }
}

/**
 * Award survey badge + coins for score-100 students. Idempotent per student.
 */
export async function applySurveyRewards(options: {
  rows: SurveyScoreRow[]
  period: string
  sectionNumber: string
  coinAmount?: number
  adminEmail: string
  dryRun?: boolean
}): Promise<{
  results: SurveyMatchResult[]
  awarded: number
  alreadyAwarded: number
  skippedZero: number
  notFound: number
  ambiguous: number
  coinsAwarded: number
}> {
  const {
    rows,
    period,
    sectionNumber,
    adminEmail,
    dryRun = false,
  } = options
  const coinAmount =
    typeof options.coinAmount === "number" && Number.isFinite(options.coinAmount)
      ? Math.round(options.coinAmount)
      : SURVEY_COMPLETE_COINS

  if (coinAmount < 1 || coinAmount > 100) {
    throw new Error("Coin amount must be between 1 and 100")
  }

  await ensureBadgesSchema()
  const index = await buildSurveyRosterIndex({ period, sectionNumber })

  const results: SurveyMatchResult[] = []
  let awarded = 0
  let alreadyAwarded = 0
  let skippedZero = 0
  let notFound = 0
  let ambiguous = 0
  let coinsAwarded = 0

  for (const row of rows) {
    if (row.score === 0) {
      skippedZero++
      results.push({
        rawName: row.rawName,
        score: 0,
        lineNumber: row.lineNumber,
        status: "skipped_zero",
        message: "Score 0 — no reward",
      })
      continue
    }

    const match = resolveSurveyMatch(row.rawName, index)
    if (match.status === "not_found") {
      notFound++
      results.push({
        rawName: row.rawName,
        score: 100,
        lineNumber: row.lineNumber,
        status: "not_found",
        message: match.message,
      })
      continue
    }
    if (match.status === "ambiguous" || !match.entry) {
      ambiguous++
      results.push({
        rawName: row.rawName,
        score: 100,
        lineNumber: row.lineNumber,
        status: "ambiguous",
        message: match.message,
      })
      continue
    }

    const entry = match.entry
    const already = await hasSurveyBadge(entry.studentId)
    if (already) {
      alreadyAwarded++
      results.push({
        rawName: row.rawName,
        score: 100,
        lineNumber: row.lineNumber,
        status: "already_awarded",
        studentId: entry.studentId,
        studentName: entry.name,
        message: "Survey badge already earned",
      })
      continue
    }

    if (dryRun) {
      awarded++
      coinsAwarded += coinAmount
      results.push({
        rawName: row.rawName,
        score: 100,
        lineNumber: row.lineNumber,
        status: "awarded",
        studentId: entry.studentId,
        studentName: entry.name,
        coinsAwarded: coinAmount,
        message: `Would award badge + ${coinAmount} coins (preview)`,
      })
      continue
    }

    try {
      const badge = await awardBadge(
        entry.studentId,
        "survey_complete",
        100,
        period,
        sectionNumber,
        { score: 100, coinsAwarded: coinAmount, source: "survey_upload" },
      )

      if (!badge) {
        // Race / unique index: treat as already awarded
        alreadyAwarded++
        results.push({
          rawName: row.rawName,
          score: 100,
          lineNumber: row.lineNumber,
          status: "already_awarded",
          studentId: entry.studentId,
          studentName: entry.name,
          message: "Survey badge already earned",
        })
        continue
      }

      await sql`
        INSERT INTO coin_adjustments (
          student_id,
          student_name,
          period,
          section_number,
          adjustment_amount,
          reason,
          created_by,
          is_active
        )
        VALUES (
          ${entry.studentId},
          ${entry.name || entry.studentId},
          ${period},
          ${sectionNumber},
          ${coinAmount},
          ${SURVEY_COIN_REASON},
          ${adminEmail},
          true
        )
      `

      awarded++
      coinsAwarded += coinAmount
      results.push({
        rawName: row.rawName,
        score: 100,
        lineNumber: row.lineNumber,
        status: "awarded",
        studentId: entry.studentId,
        studentName: entry.name,
        coinsAwarded: coinAmount,
        message: `Awarded survey badge + ${coinAmount} coins`,
      })
    } catch (error) {
      results.push({
        rawName: row.rawName,
        score: 100,
        lineNumber: row.lineNumber,
        status: "error",
        studentId: entry.studentId,
        studentName: entry.name,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (!dryRun && awarded > 0) {
    bustStudentDataCache()
  }

  return {
    results,
    awarded,
    alreadyAwarded,
    skippedZero,
    notFound,
    ambiguous,
    coinsAwarded,
  }
}
