"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertTriangle, BookOpen, CheckCircle, Loader2, Shield } from "lucide-react"
import {
  OVERRIDE_KIND_MANUAL,
  OVERRIDE_KIND_REVIEWED,
  buildOverrideRequestDetails,
  type OverrideKind,
} from "@/lib/override-request"

type DayOverrideModalProps = {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  dayInfo: {
    dayNumber: number
    date: string
    currentQualified: boolean
    currentReason: string
    isLatestDay?: boolean
    isLastDay?: boolean
  }
  studentInfo: {
    studentId: string
    name: string
    email?: string
    period?: string
    sectionNumber?: string
  }
}

export function DayOverrideModal({
  isOpen,
  onClose,
  onSuccess,
  dayInfo,
  studentInfo,
}: DayOverrideModalProps) {
  const [overrideKind, setOverrideKind] = useState<OverrideKind>(OVERRIDE_KIND_REVIEWED)
  const [reason, setReason] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [submittedKind, setSubmittedKind] = useState<OverrideKind | null>(null)
  const [overridesEnabled, setOverridesEnabled] = useState(true)
  const [isCheckingSettings, setIsCheckingSettings] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setIsCheckingSettings(true)
      fetch("/api/settings", { cache: "no-store" })
        .then((res) => res.json())
        .then((data) => {
          setOverridesEnabled(data.overridesEnabled ?? true)
        })
        .catch((err) => {
          console.error("Error checking settings:", err)
          setOverridesEnabled(true)
        })
        .finally(() => {
          setIsCheckingSettings(false)
        })
    }
  }, [isOpen])

  const formatDate = (dateString: string) => {
    if (!dateString) return ""
    const [year, month, day] = dateString.split("-").map(Number)
    const date = new Date(year, month - 1, day)
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ]
    return `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
  }

  const canSubmit =
    !isLoading &&
    !(dayInfo.isLatestDay && !dayInfo.isLastDay) &&
    overridesEnabled &&
    !isCheckingSettings &&
    (overrideKind === OVERRIDE_KIND_REVIEWED || reason.trim().length > 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (dayInfo.isLatestDay && !dayInfo.isLastDay) {
      setError(
        "Override requests are disabled for the latest day. Wait until the day is complete — updated data is available the next day at 7am.",
      )
      return
    }

    if (overrideKind === OVERRIDE_KIND_MANUAL && !reason.trim()) {
      setError("Please explain why this override needs manual review.")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      const requestDetails = buildOverrideRequestDetails({
        dayNumber: dayInfo.dayNumber,
        dateLabel: formatDate(dayInfo.date),
        currentQualified: dayInfo.currentQualified,
        kind: overrideKind,
        reason: reason.trim(),
      })

      const response = await fetch("/api/student/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studentId: studentInfo.studentId,
          studentName: studentInfo.name,
          studentEmail: studentInfo.email || "",
          period: studentInfo.period || "Unknown",
          sectionNumber: studentInfo.sectionNumber || "default",
          requestType: "override_request",
          requestDetails,
          dayNumber: dayInfo.dayNumber,
          overrideDate: dayInfo.date,
        }),
      })

      const result = await response.json()

      if (response.ok && result.success) {
        setSubmittedKind(overrideKind)
        setSuccess(true)
        setReason("")
        setError("")
        setTimeout(() => {
          setSuccess(false)
          setSubmittedKind(null)
          setOverrideKind(OVERRIDE_KIND_REVIEWED)
          onSuccess()
          onClose()
        }, 1500)
      } else {
        setError(result.error || "Failed to submit override request")
      }
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    if (!isLoading) {
      setReason("")
      setOverrideKind(OVERRIDE_KIND_REVIEWED)
      setSubmittedKind(null)
      setError("")
      setSuccess(false)
      onClose()
    }
  }

  if (success) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <div className="text-center py-6">
            <div className="mx-auto flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 mb-4">
              <CheckCircle className="h-6 w-6 text-emerald-600" />
            </div>
            <h3 className="text-lg font-semibold text-utsa-midnight mb-2">Override Request Submitted!</h3>
            <p className="text-sm text-utsa-muted">
              {submittedKind === OVERRIDE_KIND_REVIEWED
                ? "Your review override will be checked against ALEKS automatically."
                : "Your override request has been sent to your instructor for manual review."}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-1.5 bg-utsa-surface rounded-md">
              <Shield className="h-4 w-4 text-utsa-orange" />
            </div>
            Request Day Override
          </DialogTitle>
          <DialogDescription className="text-sm">
            Request an override for <strong>Day {dayInfo.dayNumber}</strong> ({formatDate(dayInfo.date)})
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3 bg-utsa-surface rounded-md border border-[rgba(3,32,68,0.1)]">
            <div className="text-xs uppercase tracking-wide text-utsa-muted mb-2 font-medium">Current Status</div>
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${dayInfo.currentQualified ? "bg-green-500" : "bg-red-500"}`}
              />
              <span className="text-sm font-medium text-utsa-midnight">
                {dayInfo.currentQualified ? "✅ Qualified" : "❌ Not Qualified"}
              </span>
            </div>
            {dayInfo.currentReason && (
              <div className="text-sm text-utsa-muted mt-1">Reason: {dayInfo.currentReason}</div>
            )}
          </div>

          {dayInfo.isLatestDay && !dayInfo.isLastDay && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                Override requests are disabled for the latest day. Data for today may not be accurate until
                the day is complete — updated ALEKS data is available the next day at 7am.
              </AlertDescription>
            </Alert>
          )}

          {!overridesEnabled && (
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                Day override requests are currently disabled. Please contact your instructor if you need
                assistance.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-medium">Why do you need an override?</Label>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => setOverrideKind(OVERRIDE_KIND_REVIEWED)}
                className={`text-left p-3 rounded-md border transition-colors ${
                  overrideKind === OVERRIDE_KIND_REVIEWED
                    ? "border-utsa-orange bg-amber-50 ring-1 ring-utsa-orange/40"
                    : "border-[rgba(3,32,68,0.15)] bg-white hover:border-[rgba(3,32,68,0.25)]"
                }`}
              >
                <div className="flex items-start gap-2">
                  <BookOpen className="h-4 w-4 mt-0.5 text-utsa-orange shrink-0" />
                  <div>
                    <div className="font-medium text-sm text-utsa-midnight">I reviewed topics this day</div>
                    <p className="text-xs text-utsa-muted mt-0.5">
                      We will verify this in ALEKS automatically.
                    </p>
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setOverrideKind(OVERRIDE_KIND_MANUAL)}
                className={`text-left p-3 rounded-md border transition-colors ${
                  overrideKind === OVERRIDE_KIND_MANUAL
                    ? "border-utsa-orange bg-amber-50 ring-1 ring-utsa-orange/40"
                    : "border-[rgba(3,32,68,0.15)] bg-white hover:border-[rgba(3,32,68,0.25)]"
                }`}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
                  <div>
                    <div className="font-medium text-sm text-utsa-midnight">Something else (manual review)</div>
                    <p className="text-xs text-utsa-muted mt-0.5">
                      Use this only if it was not a review day. You should have already talked to a TA or professor in person before submitting this; manual requests are typically denied otherwise.
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {overrideKind === OVERRIDE_KIND_MANUAL && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                Manual review requests are typically denied unless you have first talked with a TA or professor in person.
              </AlertDescription>
            </Alert>
          )}

          <div className="p-3 bg-utsa-surface rounded-md border border-[rgba(3,32,68,0.1)]">
            <div className="text-sm text-utsa-midnight">
              <strong>Your Request:</strong> Mark this day as qualified
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason" className="text-sm font-medium">
              {overrideKind === OVERRIDE_KIND_MANUAL
                ? "Why should this be done manually?"
                : "Optional note"}
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                overrideKind === OVERRIDE_KIND_MANUAL
                  ? "Explain the issue (e.g. technical problem, special circumstance)…"
                  : "Optional details about your review work…"
              }
              className="min-h-[80px]"
              required={overrideKind === OVERRIDE_KIND_MANUAL}
            />
            <p className="text-xs text-utsa-muted">
              {overrideKind === OVERRIDE_KIND_MANUAL
                ? "Required so your instructor knows why this cannot be auto-verified as a review day."
                : "You can leave this blank — confirming review above is enough."}
            </p>
          </div>

          {error && (
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Submit Override Request
                </div>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
