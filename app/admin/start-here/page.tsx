"use client"

import { useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  ExternalLink,
  KeyRound,
  Loader2,
  Users,
} from "lucide-react"
import { useAdminAuth } from "@/components/admin-auth-provider"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

const SESSION_EXPIRED = "Session expired — refresh and sign in again."

export default function StartHerePage() {
  const { user } = useAdminAuth()
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string; url?: string } | null>(
    null,
  )

  if (user.role !== "professor") {
    return (
      <Alert className="border-utsa-orange/30 bg-utsa-orange/10">
        <AlertTriangle className="h-4 w-4 text-utsa-accessible" />
        <AlertDescription className="text-utsa-accessible">
          Only professors can view the new-semester setup guide.
        </AlertDescription>
      </Alert>
    )
  }

  const handleCheckLogin = async () => {
    setChecking(true)
    setMessage(null)
    try {
      const response = await fetch("/api/admin/aleks-sync/check-login", {
        method: "POST",
        credentials: "same-origin",
      })
      if (response.status === 401) {
        setMessage({ type: "error", text: SESSION_EXPIRED })
        return
      }
      const result = await response.json()
      if (response.ok) {
        setMessage({
          type: "success",
          text: result.message || "Login check started.",
          url: result.actionsUrl,
        })
      } else {
        setMessage({ type: "error", text: result.error || "Failed to start login check" })
      }
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." })
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-utsa-midnight">Start Here!</h1>
        <p className="text-sm text-utsa-muted">
          New-semester checklist for professors. Keep this page handy anytime you need a refresher.
        </p>
      </div>

      {message && (
        <Alert
          className={
            message.type === "success"
              ? "border-green-200 bg-green-50"
              : "border-red-200 bg-red-50"
          }
        >
          {message.type === "success" ? (
            <CheckCircle className="h-4 w-4 text-green-700" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-red-700" />
          )}
          <AlertDescription
            className={message.type === "success" ? "text-green-800" : "text-red-800"}
          >
            <span>{message.text}</span>
            {message.url && (
              <>
                {" "}
                <a
                  href={message.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
                >
                  Open Actions
                  <ExternalLink className="h-3 w-3" />
                </a>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      <ol className="space-y-4">
        <li className="rounded-md bg-white p-4 space-y-3">
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-utsa-orange text-sm font-bold text-white">
              1
            </span>
            <div className="min-w-0 space-y-2">
              <h2 className="text-sm font-semibold text-utsa-midnight flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-utsa-orange" />
                Confirm ALEKS login still works
              </h2>
              <p className="text-sm text-utsa-muted">
                Before the semester starts, make sure the stored ALEKS username and password
                (used by the daily sync) can still sign in. This button attempts login and
                reports success or failure.
              </p>
              <Button
                type="button"
                onClick={handleCheckLogin}
                disabled={checking}
                className="btn-tactile-orange"
              >
                {checking ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Starting check…
                  </>
                ) : (
                  "Check ALEKS login"
                )}
              </Button>
            </div>
          </div>
        </li>

        <li className="rounded-md bg-white p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-utsa-orange text-sm font-bold text-white">
              2
            </span>
            <div className="min-w-0 space-y-2">
              <h2 className="text-sm font-semibold text-utsa-midnight flex items-center gap-2">
                <Calendar className="h-4 w-4 text-utsa-orange" />
                Set exam periods for the semester
              </h2>
              <p className="text-sm text-utsa-muted">
                Add or update each exam period&apos;s start and end dates so coin windows and
                automatic ALEKS pulls line up with the syllabus.
              </p>
              <Link
                href="/admin/manage-periods"
                className="inline-flex text-sm font-semibold text-utsa-orange hover:underline"
              >
                Go to Exam Periods →
              </Link>
            </div>
          </div>
        </li>

        <li className="rounded-md bg-white p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-utsa-orange text-sm font-bold text-white">
              3
            </span>
            <div className="min-w-0 space-y-2">
              <h2 className="text-sm font-semibold text-utsa-midnight flex items-center gap-2">
                <Users className="h-4 w-4 text-utsa-orange" />
                Create TA accounts
              </h2>
              <p className="text-sm text-utsa-muted">
                Create a staff account for each TA (username + PIN). Share those credentials with
                them privately.
              </p>
              <Link
                href="/admin/users"
                className="inline-flex text-sm font-semibold text-utsa-orange hover:underline"
              >
                Go to Staff →
              </Link>
            </div>
          </div>
        </li>

        <li className="rounded-md bg-white p-4 space-y-3">
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-utsa-orange text-sm font-bold text-white">
              4
            </span>
            <div className="min-w-0 space-y-3">
              <h2 className="text-sm font-semibold text-utsa-midnight">
                Brief your TAs on login and responsibilities
              </h2>
              <p className="text-sm text-utsa-muted">
                Tell TAs to open the admin portal, sign in with the username and PIN you created,
                and use the nav to reach Requests, Overrides, and student data.
              </p>

              <div className="rounded-md border border-black/5 bg-black/[0.02] p-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-utsa-muted">
                  TA responsibilities
                </p>
                <ol className="list-decimal space-y-1.5 pl-4 text-sm text-utsa-midnight">
                  <li>Check redemption requests regularly.</li>
                  <li>Enter coin redemptions into the gradebook.</li>
                  <li>Check in on students who are not doing ALEKS regularly.</li>
                </ol>
              </div>

              <div className="rounded-md border border-black/5 bg-black/[0.02] p-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-utsa-muted">
                  Professor responsibilities
                </p>
                <p className="text-sm text-utsa-midnight">
                  You handle everything else — for example errors in exam periods, sync issues, or
                  other unexpected problems (which should be rare). Escalate to the developer only
                  if something is clearly broken in the app itself.
                </p>
              </div>
            </div>
          </div>
        </li>
      </ol>
    </div>
  )
}
