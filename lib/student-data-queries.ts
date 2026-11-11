import { sql } from "@vercel/postgres"

export type UploadMeta = {
  id: number
  period: string
  section_number: string
  uploaded_at: string
  student_count: number
}

/**
 * Latest upload per (period, section) with student counts — never ships JSONB blobs.
 * Uses DISTINCT ON + jsonb_object_keys so Neon only returns small metadata rows.
 */
export async function listLatestUploadMeta(): Promise<{
  uploadRecords: UploadMeta[]
  uniqueStudentCount: number
}> {
  const meta = await sql`
    SELECT
      id,
      period,
      section_number,
      uploaded_at,
      (
        SELECT COUNT(*)::int
        FROM jsonb_object_keys(data) AS keys(key)
      ) AS student_count
    FROM (
      SELECT DISTINCT ON (period, COALESCE(section_number, 'default'))
        id,
        period,
        COALESCE(section_number, 'default') AS section_number,
        uploaded_at,
        data
      FROM student_data
      ORDER BY period, COALESCE(section_number, 'default'), uploaded_at DESC
    ) latest
    ORDER BY uploaded_at DESC
  `

  const uploadRecords: UploadMeta[] = meta.rows.map((row) => ({
    id: Number(row.id),
    period: String(row.period),
    section_number: String(row.section_number || "default"),
    uploaded_at: row.uploaded_at,
    student_count: Number(row.student_count) || 0,
  }))

  const unique = await sql`
    SELECT COUNT(DISTINCT lower(key))::int AS count
    FROM (
      SELECT DISTINCT ON (period, COALESCE(section_number, 'default'))
        data
      FROM student_data
      ORDER BY period, COALESCE(section_number, 'default'), uploaded_at DESC
    ) latest
    CROSS JOIN LATERAL jsonb_object_keys(data) AS key
  `

  return {
    uploadRecords,
    uniqueStudentCount: Number(unique.rows[0]?.count) || 0,
  }
}

/**
 * Roster projection without dailyLog — used for email / list UIs.
 * Still reads JSONB in Postgres, but only returns scalar fields over the wire.
 */
export async function loadSlimStudentRoster(options: {
  period?: string | null
  sectionNumber?: string | null
}): Promise<Record<string, {
  name: string
  email: string
  coins: number
  totalDays: number
  periodDays: number
  percentComplete: number
}>> {
  const { period, sectionNumber } = options

  // Project scalars in SQL so dailyLog never leaves Postgres.
  let rows
  if (period && sectionNumber) {
    rows = await sql`
      SELECT
        key AS student_id,
        value->>'name' AS name,
        value->>'email' AS email,
        COALESCE((value->>'coins')::float, 0) AS coins,
        COALESCE((value->>'totalDays')::float, 0) AS total_days,
        COALESCE((value->>'periodDays')::float, 0) AS period_days,
        COALESCE((value->>'percentComplete')::float, 0) AS percent_complete,
        uploaded_at
      FROM (
        SELECT data, uploaded_at
        FROM student_data
        WHERE period = ${period}
          AND COALESCE(section_number, 'default') = ${sectionNumber}
        ORDER BY uploaded_at DESC
        LIMIT 1
      ) latest
      CROSS JOIN LATERAL jsonb_each(data) AS x(key, value)
    `
  } else if (period) {
    rows = await sql`
      SELECT
        key AS student_id,
        value->>'name' AS name,
        value->>'email' AS email,
        COALESCE((value->>'coins')::float, 0) AS coins,
        COALESCE((value->>'totalDays')::float, 0) AS total_days,
        COALESCE((value->>'periodDays')::float, 0) AS period_days,
        COALESCE((value->>'percentComplete')::float, 0) AS percent_complete,
        uploaded_at
      FROM (
        SELECT DISTINCT ON (COALESCE(section_number, 'default'))
          data,
          uploaded_at,
          COALESCE(section_number, 'default') AS section_number
        FROM student_data
        WHERE period = ${period}
        ORDER BY COALESCE(section_number, 'default'), uploaded_at DESC
      ) latest
      CROSS JOIN LATERAL jsonb_each(data) AS x(key, value)
      ORDER BY uploaded_at DESC
    `
  } else if (sectionNumber) {
    rows = await sql`
      SELECT
        key AS student_id,
        value->>'name' AS name,
        value->>'email' AS email,
        COALESCE((value->>'coins')::float, 0) AS coins,
        COALESCE((value->>'totalDays')::float, 0) AS total_days,
        COALESCE((value->>'periodDays')::float, 0) AS period_days,
        COALESCE((value->>'percentComplete')::float, 0) AS percent_complete,
        uploaded_at
      FROM (
        SELECT DISTINCT ON (period)
          data,
          uploaded_at,
          period
        FROM student_data
        WHERE COALESCE(section_number, 'default') = ${sectionNumber}
        ORDER BY period, uploaded_at DESC
      ) latest
      CROSS JOIN LATERAL jsonb_each(data) AS x(key, value)
      ORDER BY uploaded_at DESC
    `
  } else {
    rows = await sql`
      SELECT
        key AS student_id,
        value->>'name' AS name,
        value->>'email' AS email,
        COALESCE((value->>'coins')::float, 0) AS coins,
        COALESCE((value->>'totalDays')::float, 0) AS total_days,
        COALESCE((value->>'periodDays')::float, 0) AS period_days,
        COALESCE((value->>'percentComplete')::float, 0) AS percent_complete,
        uploaded_at
      FROM (
        SELECT DISTINCT ON (period, COALESCE(section_number, 'default'))
          data,
          uploaded_at
        FROM student_data
        ORDER BY period, COALESCE(section_number, 'default'), uploaded_at DESC
      ) latest
      CROSS JOIN LATERAL jsonb_each(data) AS x(key, value)
      ORDER BY uploaded_at DESC
    `
  }

  const roster: Record<string, {
    name: string
    email: string
    coins: number
    totalDays: number
    periodDays: number
    percentComplete: number
  }> = {}

  for (const row of rows.rows) {
    const id = String(row.student_id)
    if (roster[id]) continue // keep most-recent (rows ordered by uploaded_at DESC)
    roster[id] = {
      name: String(row.name || ""),
      email: String(row.email || ""),
      coins: Number(row.coins) || 0,
      totalDays: Number(row.total_days) || 0,
      periodDays: Number(row.period_days) || 0,
      percentComplete: Number(row.percent_complete) || 0,
    }
  }

  return roster
}

/**
 * Map student IDs → period/section membership using keys only (no dailyLog egress).
 */
export async function loadStudentPeriodSectionIndex(): Promise<{
  studentsByPeriodSection: Map<string, Map<string, Set<string>>>
  latestSectionByStudent: Map<string, string>
}> {
  const studentsByPeriodSection = new Map<string, Map<string, Set<string>>>()
  const latestSectionByStudent = new Map<string, string>()

  const rows = await sql`
    SELECT
      period,
      COALESCE(section_number, 'default') AS section_number,
      key AS student_id
    FROM (
      SELECT DISTINCT ON (period, COALESCE(section_number, 'default'))
        period,
        COALESCE(section_number, 'default') AS section_number,
        data,
        uploaded_at
      FROM student_data
      ORDER BY period, COALESCE(section_number, 'default'), uploaded_at DESC
    ) latest
    CROSS JOIN LATERAL jsonb_object_keys(data) AS key
  `

  for (const row of rows.rows) {
    const period = String(row.period || "")
    const section = String(row.section_number || "default")
    const sid = String(row.student_id || "").toLowerCase().trim()
    if (!period || !sid) continue

    if (!studentsByPeriodSection.has(period)) studentsByPeriodSection.set(period, new Map())
    const bySection = studentsByPeriodSection.get(period)!
    if (!bySection.has(section)) bySection.set(section, new Set())
    bySection.get(section)!.add(sid)

    if (!latestSectionByStudent.has(sid)) latestSectionByStudent.set(sid, section)
  }

  return { studentsByPeriodSection, latestSectionByStudent }
}

/**
 * Resolve display names for a set of student IDs without shipping full class blobs.
 */
export async function loadStudentNamesByIds(
  studentIds: string[],
): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>()
  if (studentIds.length === 0) return nameMap

  const normalized = [...new Set(studentIds.map((id) => id.toLowerCase().trim()).filter(Boolean))]
  if (normalized.length === 0) return nameMap

  // Pull only matching student objects from the most recent uploads.
  const rows = await sql`
    SELECT key AS student_id, value->>'name' AS name
    FROM (
      SELECT DISTINCT ON (period, COALESCE(section_number, 'default'))
        data,
        uploaded_at
      FROM student_data
      ORDER BY period, COALESCE(section_number, 'default'), uploaded_at DESC
    ) latest
    CROSS JOIN LATERAL jsonb_each(data) AS x(key, value)
    WHERE lower(key) = ANY(${normalized as any}::text[])
    ORDER BY uploaded_at DESC
  `

  for (const row of rows.rows) {
    const id = String(row.student_id || "").toLowerCase().trim()
    if (!id || nameMap.has(id)) continue
    if (row.name) nameMap.set(id, String(row.name))
  }

  return nameMap
}

/**
 * Load only the requested students' objects across latest period/section uploads.
 */
export async function loadStudentSlicesByIds(
  studentIds: string[],
): Promise<
  Array<{
    studentId: string
    period: string
    section: string
    uploadedAt: string
    student: any
  }>
> {
  const normalized = [...new Set(studentIds.map((id) => id.toLowerCase().trim()).filter(Boolean))]
  if (normalized.length === 0) return []

  const rows = await sql`
    SELECT
      period,
      COALESCE(section_number, 'default') AS section_number,
      uploaded_at,
      key AS student_id,
      value AS student
    FROM (
      SELECT DISTINCT ON (period, COALESCE(section_number, 'default'))
        period,
        COALESCE(section_number, 'default') AS section_number,
        uploaded_at,
        data
      FROM student_data
      ORDER BY period, COALESCE(section_number, 'default'), uploaded_at DESC
    ) latest
    CROSS JOIN LATERAL jsonb_each(data) AS x(key, value)
    WHERE lower(key) = ANY(${normalized as any}::text[])
    ORDER BY uploaded_at DESC
  `

  return rows.rows.map((row) => ({
    studentId: String(row.student_id).toLowerCase(),
    period: String(row.period),
    section: String(row.section_number || "default"),
    uploadedAt: String(row.uploaded_at),
    student: typeof row.student === "string" ? JSON.parse(row.student) : row.student,
  }))
}
