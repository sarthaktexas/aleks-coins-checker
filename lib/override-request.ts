/** Machine-readable markers written into override request_details. */
export const OVERRIDE_KIND_REVIEWED = "reviewed_topics"
export const OVERRIDE_KIND_MANUAL = "manual"

export type OverrideKind = typeof OVERRIDE_KIND_REVIEWED | typeof OVERRIDE_KIND_MANUAL

export function parseOverrideKind(requestDetails: string | null | undefined): OverrideKind | null {
  if (!requestDetails) return null
  const match = requestDetails.match(/Override Kind:\s*([a-z_]+)/i)
  if (!match) return null
  const kind = match[1].toLowerCase()
  if (kind === OVERRIDE_KIND_REVIEWED || kind === OVERRIDE_KIND_MANUAL) return kind
  return null
}

/** True when the request is explicitly for reviewed topics (new or legacy free-text). */
export function isReviewedTopicsOverride(requestDetails: string | null | undefined): boolean {
  const kind = parseOverrideKind(requestDetails)
  if (kind === OVERRIDE_KIND_REVIEWED) return true
  if (kind === OVERRIDE_KIND_MANUAL) return false

  // Legacy requests without Override Kind: heuristic matching "review" in the reason
  const reason = extractOverrideReason(requestDetails)
  return reason.toLowerCase().includes("review")
}

export function extractOverrideReason(requestDetails: string | null | undefined): string {
  if (!requestDetails) return ""
  const reasonMatch = requestDetails.match(/Reason:\s*([\s\S]+)/)
  if (reasonMatch) return reasonMatch[1].trim()
  return requestDetails.trim()
}

export function buildOverrideRequestDetails(opts: {
  dayNumber: number
  dateLabel: string
  currentQualified: boolean
  kind: OverrideKind
  reason?: string
}): string {
  const lines = [
    `Day ${opts.dayNumber} (${opts.dateLabel})`,
    `Current Status: ${opts.currentQualified ? "Qualified" : "Not Qualified"}`,
    "Requested Change: To be marked as Qualified",
    `Override Kind: ${opts.kind}`,
  ]
  const reason = (opts.reason || "").trim()
  if (reason) {
    lines.push("", `Reason: ${reason}`)
  } else if (opts.kind === OVERRIDE_KIND_REVIEWED) {
    lines.push("", "Reason: Reviewed topics on this day")
  }
  return lines.join("\n")
}
