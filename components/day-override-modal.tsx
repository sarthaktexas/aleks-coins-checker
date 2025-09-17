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
  }
  studentInfo: {
    studentId: string
    name: string
  }
}

export function DayOverrideModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  dayInfo, 
  studentInfo 
}: DayOverrideModalProps) {
  const [adminPassword, setAdminPassword] = useState("")
  const [overrideType, setOverrideType] = useState<"qualified" | "not_qualified">(
    dayInfo.currentQualified ? "not_qualified" : "qualified"
  )
  const [reason, setReason] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    try {
      const response = await fetch("/api/admin/day-overrides", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studentId: studentInfo.studentId,
          dayNumber: dayInfo.dayNumber,
          date: dayInfo.date,
          overrideType,
          reason: reason.trim() || null,
          adminPassword
        }),
      })

      const result = await response.json()

      if (response.ok && result.success) {
        onSuccess()
        onClose()
        // Reset form
        setAdminPassword("")
        setReason("")
        setError("")
      } else {
        setError(result.error || "Failed to save override")
      }
    } catch (error) {
      setError("Network error. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    if (!isLoading) {
      setAdminPassword("")
      setReason("")
      setError("")
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

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-1 bg-blue-100 rounded">
              <Shield className="h-4 w-4 text-blue-600" />
            </div>
            Override Day Status
          </DialogTitle>
          <DialogDescription>
            Override the status for <strong>Day {dayInfo.dayNumber}</strong> ({formatDate(dayInfo.date)}) 
            for student <strong>{studentInfo.name}</strong>
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

          {/* Override Type Selection */}
          <div className="space-y-2">
            <Label htmlFor="overrideType" className="text-sm font-medium">
              Override Status To:
            </Label>
            <Select value={overrideType} onValueChange={(value: "qualified" | "not_qualified") => setOverrideType(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select override status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="qualified">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    Qualified (✅)
                  </div>
                </SelectItem>
                <SelectItem value="not_qualified">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    Not Qualified (❌)
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason" className="text-sm font-medium">
              Reason for Override (Optional)
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason for this override..."
              className="min-h-[80px]"
            />
          </div>

          {/* Admin Password */}
          <div className="space-y-2">
            <Label htmlFor="adminPassword" className="text-sm font-medium">
              Admin Password
            </Label>
            <Input
              id="adminPassword"
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Enter admin password"
              required
              disabled={isLoading}
            />
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
              disabled={isLoading || !adminPassword}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Save Override
                </div>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

