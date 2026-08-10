"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { CheckCircle, Loader2, Bug } from "lucide-react"

type BugReportModalProps = {
  isOpen: boolean
  onClose: () => void
  studentId?: string
  studentEmail?: string
}

export function BugReportModal({
  isOpen,
  onClose,
  studentId = "",
  studentEmail = "",
}: BugReportModalProps) {
  const [description, setDescription] = useState("")
  const [contactEmail, setContactEmail] = useState(studentEmail)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setContactEmail(studentEmail)
      setDescription("")
      setError("")
      setSuccess(false)
    }
  }, [isOpen, studentEmail])

  const resetAndClose = () => {
    setDescription("")
    setContactEmail(studentEmail)
    setError("")
    setSuccess(false)
    setIsLoading(false)
    onClose()
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) resetAndClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    try {
      const response = await fetch("/api/bug-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          contactEmail,
          description,
          pageUrl: typeof window !== "undefined" ? window.location.href : "",
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Failed to submit report. Please try again.")
        return
      }

      setSuccess(true)
      setTimeout(() => {
        resetAndClose()
      }, 1800)
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5 text-slate-700" />
            Report a bug
          </DialogTitle>
          <DialogDescription>
            Tell us what went wrong. Reports are saved for the maintainer to review.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              Thanks — your report was submitted.
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bug-description">What happened?</Label>
              <Textarea
                id="bug-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What were you trying to do? What did you see instead?"
                rows={5}
                required
                minLength={10}
                maxLength={4000}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bug-email">
                Contact email <span className="text-slate-400 font-normal">(optional)</span>
              </Label>
              <Input
                id="bug-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="you@example.com"
                maxLength={254}
              />
            </div>

            {studentId ? (
              <p className="text-xs text-slate-500">
                Student ID <span className="font-medium text-slate-700">{studentId}</span> will
                be included automatically.
              </p>
            ) : null}

            {error ? (
              <Alert className="border-red-200 bg-red-50">
                <AlertDescription className="text-red-800">{error}</AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={resetAndClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading || description.trim().length < 10}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  "Submit report"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
