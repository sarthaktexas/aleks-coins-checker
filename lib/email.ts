/**
 * Thin Resend helper for optional admin notification emails.
 * Used by bug reports and badge/sync error alerts.
 */

export type SendEmailResult =
  | { emailed: true }
  | { emailed: false; reason: "email_not_configured" | "email_send_failed" }

export function getNotifyEmail(): string {
  return (
    process.env.SYNC_ERROR_EMAIL ||
    process.env.BUG_REPORT_EMAIL ||
    "sarthaktexas@gmail.com"
  )
}

export async function sendResendEmail(opts: {
  subject: string
  text: string
  replyTo?: string
  to?: string | string[]
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { emailed: false, reason: "email_not_configured" }
  }

  const fromEmail = process.env.BUG_REPORT_FROM_EMAIL || "onboarding@resend.dev"
  const to = opts.to
    ? Array.isArray(opts.to)
      ? opts.to
      : [opts.to]
    : [getNotifyEmail()]

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to,
      subject: opts.subject,
      text: opts.text,
      ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
    }),
  })

  if (!response.ok) {
    const details = await response.text()
    console.error("Resend email failed:", details)
    return { emailed: false, reason: "email_send_failed" }
  }

  return { emailed: true }
}

/** Email badge / ALEKS sync processing failures to the configured admin address. */
export async function sendBadgeErrorEmail(opts: {
  source: string
  period?: string
  sectionNumber?: string
  error: string
  details?: string[]
}): Promise<SendEmailResult> {
  const lines = [
    "Badge processing failed during ALEKS sync / admin processing.",
    "",
    `Source: ${opts.source}`,
    `Period: ${opts.period || "(n/a)"}`,
    `Section: ${opts.sectionNumber || "(n/a)"}`,
    `Time: ${new Date().toISOString()}`,
    "",
    "Error:",
    opts.error,
  ]

  if (opts.details && opts.details.length > 0) {
    lines.push("", "Details:")
    for (const detail of opts.details.slice(0, 40)) {
      lines.push(`- ${detail}`)
    }
    if (opts.details.length > 40) {
      lines.push(`… and ${opts.details.length - 40} more`)
    }
  }

  lines.push("", "Check Admin → Sync History for run logs.")

  return sendResendEmail({
    subject: `[ALEKS Portal] Badge processing error (${opts.source})`,
    text: lines.join("\n"),
  })
}
