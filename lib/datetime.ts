/**
 * Format an absolute timestamp in the viewer's browser timezone,
 * including a short zone label (e.g. "CST", "PDT").
 *
 * DB values are TIMESTAMPTZ (UTC); this converts for display only.
 * Omitting `timeZone` lets Intl use the local zone.
 */
export function formatLocalDateTime(
  dateInput: string | Date | null | undefined
): string {
  if (!dateInput) return ""
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput)
  if (Number.isNaN(date.getTime())) return ""

  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  })
}
