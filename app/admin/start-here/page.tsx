"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  KeyRound,
  Loader2,
  Users,
  XCircle,
} from "lucide-react"
import { useAdminAuth } from "@/components/admin-auth-provider"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ThinkingOrb } from "thinking-orbs"

const SESSION_EXPIRED = "Session expired — refresh and sign in again."
const POLL_MS = 3000
const MAX_POLL_MS = 8 * 60 * 1000

type CheckStatus = {
  phase: "idle" | "starting" | "polling" | "success" | "failure" | "error"
  summary: string
  runId: number | null
}

export default function StartHerePage() {
  const { user } = useAdminAuth()
  const [check, setCheck] = useState<CheckStatus>({
    phase: "idle",
    summary: "",
    runId: null,
  })
  const pollStartedAt = useRef<number>(0)
  const abortPoll = useRef(false)

  useEffect(() => {
    return () => {
      abortPoll.current = true
    }
  }, [])

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

  const pollStatus = async (params: { runId?: number | null; since?: string }) => {
    abortPoll.current = false
    pollStartedAt.current = Date.now()
    setCheck((prev) => ({
      ...prev,
      phase: "polling",
      summary: params.runId ? "Running — checking ALEKS login…" : "Starting login check…",
    }))

    while (!abortPoll.current) {
      if (Date.now() - pollStartedAt.current > MAX_POLL_MS) {
        setCheck((prev) => ({
          ...prev,
          phase: "error",
          summary: "Login check is taking too long. Try again in a few minutes.",
        }))
        return
      }

      const qs = params.runId
        ? `runId=${params.runId}`
        : `since=${encodeURIComponent(params.since || "")}`
      const response = await fetch(`/api/admin/aleks-sync/check-login?${qs}`, {
        credentials: "same-origin",
      })
      if (response.status === 401) {
        setCheck({
          phase: "error",
          summary: SESSION_EXPIRED,
          runId: null,
        })
        return
      }
      const data = await response.json()
      if (!response.ok) {
        setCheck({
          phase: "error",
          summary: data.error || "Failed to load login check status",
          runId: params.runId ?? null,
        })
        return
      }

      if (data.runId && !params.runId) {
        params.runId = data.runId
      }

      if (data.status === "completed") {
        const ok = data.conclusion === "success"
        setCheck({
          phase: ok ? "success" : "failure",
          summary: ok
            ? "ALEKS login succeeded."
            : "ALEKS login did not succeed. Please contact the developer to fix it.",
          runId: data.runId ?? params.runId ?? null,
        })
        return
      }

      setCheck({
        phase: "polling",
        summary: data.summary || "Running — checking ALEKS login…",
        runId: data.runId ?? params.runId ?? null,
      })

      await new Promise((r) => setTimeout(r, POLL_MS))
    }
  }

  const handleCheckLogin = async () => {
    abortPoll.current = true
    setCheck({
      phase: "starting",
      summary: "Starting login check…",
      runId: null,
    })

    try {
      const response = await fetch("/api/admin/aleks-sync/check-login", {
        method: "POST",
        credentials: "same-origin",
      })
      if (response.status === 401) {
        setCheck({
          phase: "error",
          summary: SESSION_EXPIRED,
          runId: null,
        })
        return
      }
      const result = await response.json()
      if (!response.ok) {
        setCheck({
          phase: "error",
          summary: result.error || "Failed to start login check",
          runId: null,
        })
        return
      }

      await pollStatus({
        runId: result.runId ?? null,
        since: result.dispatchedAt,
      })
    } catch {
      setCheck({
        phase: "error",
        summary: "Network error. Please try again.",
        runId: null,
      })
    }
  }

  const busy = check.phase === "starting" || check.phase === "polling"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-utsa-midnight">Start Here!</h1>
        <p className="text-sm text-utsa-muted">
          New-semester checklist for professors. Keep this page handy anytime you need a refresher.
          Classes will be pulled automatically from ALEKS and class data will auto-populate after sync runs.
        </p>
      </div>

      <ol className="space-y-4">
        <li className="rounded-md bg-white p-4 space-y-3">
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-utsa-orange text-sm font-bold text-white">
              1
            </span>
            <div className="min-w-0 flex-1 space-y-3">
              <h2 className="text-sm font-semibold text-utsa-midnight flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-utsa-orange" />
                Confirm ALEKS login still works
              </h2>
              <p className="text-sm text-utsa-muted">
                Before the semester starts, make sure the stored ALEKS username and password
                (used by the daily sync) can still sign in. This button attempts login and
                reports success or failure here on this page.
              </p>
              <Button
                type="button"
                onClick={handleCheckLogin}
                disabled={busy}
                className="btn-tactile-orange"
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {check.phase === "starting" ? "Starting…" : "Checking…"}
                  </>
                ) : (
                  "Check ALEKS login"
                )}
              </Button>

              {check.phase !== "idle" && (
                <div
                  className={
                    check.phase === "success"
                      ? "rounded-md border border-green-200 bg-green-50 p-3 space-y-2"
                      : check.phase === "failure" || check.phase === "error"
                        ? "rounded-md border border-red-200 bg-red-50 p-3 space-y-2"
                        : "rounded-md border border-black/5 bg-black/[0.02] p-3 space-y-2"
                  }
                >
                  <div className="flex items-start gap-2 text-sm">
                    {check.phase === "success" ? (
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-700" />
                    ) : check.phase === "failure" || check.phase === "error" ? (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
                    ) : (
                      <ThinkingOrb
                        state="solving"
                        size={24}
                        aria-label="Checking ALEKS login status"
                        className="mt-0.5 shrink-0 rounded-full bg-utsa-orange/10 ring-2 ring-utsa-orange/35 shadow-sm"
                      />
                    )}
                    <p
                      className={
                        check.phase === "success"
                          ? "text-green-800"
                          : check.phase === "failure" || check.phase === "error"
                            ? "text-red-800"
                            : "text-utsa-midnight"
                      }
                    >
                      {check.summary}
                    </p>
                  </div>
                </div>
              )}
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
