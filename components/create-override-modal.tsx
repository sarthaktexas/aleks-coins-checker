"use client"

import { useState } from "react"
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
import { AlertTriangle, CheckCircle, Loader2 } from "lucide-react"

type CreateOverrideModalProps = {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  studentId: string
  studentName: string
  dayNumber: number
  date: string
}

export function CreateOverrideModal({
  isOpen,
  onClose,
  onSuccess,
  studentId,
  studentName,
  dayNumber,
  date,
}: CreateOverrideModalProps) {
  const [overrideType, setOverrideType] = useState<"qualified" | "not_qualified" | "double_coins">("qualified")
  const [reason, setReason] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!reason.trim()) {
      setError("Please provide a reason for this override")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      const response = await fetch("/api/admin/day-overrides", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          studentId,
          dayNumber,
          date,
          overrideType,
          reason: reason.trim(),
        }),
      })

      const result = await response.json()

      if (response.ok && result.success) {
        setSuccess(true)
        setReason("")
        setTimeout(() => {
          setSuccess(false)
          onSuccess()
          onClose()
        }, 1500)
      } else {
        setError(result.error || "Failed to create override")
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
      setOverrideType("qualified")
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
            <h3 className="text-lg font-semibold text-utsa-midnight mb-2">Override Created!</h3>
            <p className="text-sm text-utsa-muted">
              The day override has been applied successfully.
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
          <DialogTitle>Create Day Override</DialogTitle>
          <DialogDescription className="text-sm">
            Create an override for <strong>{studentName}</strong> on <strong>Day {dayNumber}</strong> ({date})
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <Label className="text-sm font-medium">Override Type</Label>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => setOverrideType("qualified")}
                className={`text-left p-3 rounded-md border transition-colors ${
                  overrideType === "qualified"
                    ? "border-utsa-orange bg-amber-50 ring-1 ring-utsa-orange/40"
                    : "border-[rgba(3,32,68,0.15)] bg-white hover:border-[rgba(3,32,68,0.25)]"
                }`}
              >
                <div className="font-medium text-sm">Qualified</div>
                <div className="text-xs text-utsa-muted">Mark this day as qualified (1 coin)</div>
              </button>
              <button
                type="button"
                onClick={() => setOverrideType("double_coins")}
                className={`text-left p-3 rounded-md border transition-colors ${
                  overrideType === "double_coins"
                    ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500/40"
                    : "border-[rgba(3,32,68,0.15)] bg-white hover:border-[rgba(3,32,68,0.25)]"
                }`}
              >
                <div className="font-medium text-sm">Double Coins 🪙🪙</div>
                <div className="text-xs text-utsa-muted">Mark this day as qualified with double coins (2 coins)</div>
              </button>
              <button
                type="button"
                onClick={() => setOverrideType("not_qualified")}
                className={`text-left p-3 rounded-md border transition-colors ${
                  overrideType === "not_qualified"
                    ? "border-red-500 bg-red-50 ring-1 ring-red-500/40"
                    : "border-[rgba(3,32,68,0.15)] bg-white hover:border-[rgba(3,32,68,0.25)]"
                }`}
              >
                <div className="font-medium text-sm">Not Qualified</div>
                <div className="text-xs text-utsa-muted">Mark this day as not qualified (0 coins)</div>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason" className="text-sm font-medium">
              Reason <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this override is being created..."
              className="min-h-[80px]"
              required
            />
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
            <Button type="submit" disabled={isLoading || !reason.trim()}>
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </div>
              ) : (
                "Create Override"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
