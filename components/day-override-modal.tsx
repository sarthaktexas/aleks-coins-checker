"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertTriangle, CheckCircle, Loader2, Shield } from "lucide-react"

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
  studentInfo 
}: DayOverrideModalProps) {
  const [reason, setReason] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Prevent submission if this is the latest day but NOT the last day
    if (dayInfo.isLatestDay && !dayInfo.isLastDay) {
      setError("Override requests are disabled for the latest day. Data may not be accurate based on when it was uploaded.")
      return
    }
    
    setIsLoading(true)
    setError("")

    try {
      const requestDetails = `Day ${dayInfo.dayNumber} (${formatDate(dayInfo.date)})\nCurrent Status: ${dayInfo.currentQualified ? 'Qualified' : 'Not Qualified'}\nRequested Change: To be marked as Qualified\n${reason ? `\nReason: ${reason}` : ''}`

      const response = await fetch("/api/student/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studentId: studentInfo.studentId,
          studentName: studentInfo.name,
          studentEmail: studentInfo.email || '',
          period: studentInfo.period || 'Unknown',
          sectionNumber: studentInfo.sectionNumber || 'default',
          requestType: 'override_request',
          requestDetails: requestDetails,
          dayNumber: dayInfo.dayNumber,
          overrideDate: dayInfo.date
        }),
      })

      const result = await response.json()

      if (response.ok && result.success) {
        setSuccess(true)
        setReason("")
        setError("")
        // Close after showing success
        setTimeout(() => {
          setSuccess(false)
          onSuccess()
          onClose()
        }, 1500)
      } else {
        setError(result.error || "Failed to submit override request")
      }
    } catch (error) {
      setError("Network error. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    if (!isLoading) {
      setReason("")
      setError("")
      setSuccess(false)
      onClose()
    }
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return ""
    const [year, month, day] = dateString.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    const monthNames = ["January", "February", "March", "April", "May", "June", 
      "July", "August", "September", "October", "November", "December"]
    return `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
  }

  if (success) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <div className="text-center py-6">
            <div className="mx-auto flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-4">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Override Request Submitted!</h3>
            <p className="text-sm text-gray-600">
              Your override request has been sent to your instructor for review.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-1 bg-blue-100 rounded">
              <Shield className="h-4 w-4 text-blue-600" />
            </div>
            Request Day Override
          </DialogTitle>
          <DialogDescription>
            Request an override for <strong>Day {dayInfo.dayNumber}</strong> ({formatDate(dayInfo.date)})
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Current Status Display */}
          <div className="p-3 bg-slate-50 rounded-lg border">
            <div className="text-sm text-slate-600 mb-2">Current Status:</div>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${dayInfo.currentQualified ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="font-medium">
                {dayInfo.currentQualified ? "✅ Qualified" : "❌ Not Qualified"}
              </span>
            </div>
            {dayInfo.currentReason && (
              <div className="text-sm text-slate-600 mt-1">
                Reason: {dayInfo.currentReason}
              </div>
            )}
          </div>

          {/* Warning for latest day (but not last day) */}
          {dayInfo.isLatestDay && !dayInfo.isLastDay && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                Override requests are disabled for the latest day. Data may not be accurate based on when it was uploaded.
              </AlertDescription>
            </Alert>
          )}

          {/* Info about what student is requesting */}
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="text-sm text-blue-800">
              <strong>Your Request:</strong> Mark this day as qualified
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason" className="text-sm font-medium">
              Reason for Override Request
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this day should be marked as qualified..."
              className="min-h-[80px]"
              required
            />
            <p className="text-xs text-slate-500">
              Provide details about why you believe this day should be marked as qualified (e.g., technical issues, special circumstances)
            </p>
          </div>

          {error && (
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                {error}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !reason.trim() || (dayInfo.isLatestDay && !dayInfo.isLastDay)}
              className="bg-blue-600 hover:bg-blue-700"
            >
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

