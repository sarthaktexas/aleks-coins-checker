"use client"

import { useEffect, useState, type FormEvent } from "react"
import { AlertTriangle, CheckCircle, User } from "lucide-react"
import { useAdminAuth } from "@/components/admin-auth-provider"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function AdminProfilePage() {
  const { user, refresh } = useAdminAuth()
  const [displayName, setDisplayName] = useState(user.displayName)
  const [currentPin, setCurrentPin] = useState("")
  const [newPin, setNewPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  useEffect(() => {
    setDisplayName(user.displayName)
  }, [user.displayName])

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setMessage(null)

    const trimmedName = displayName.trim()
    const nameChanged = trimmedName !== user.displayName
    const changingPin = newPin.length > 0 || confirmPin.length > 0 || currentPin.length > 0

    if (!nameChanged && !changingPin) {
      setMessage({ type: "error", text: "No changes to save" })
      return
    }

    if (nameChanged && !trimmedName) {
      setMessage({ type: "error", text: "Display name is required" })
      return
    }

    if (changingPin) {
      if (!currentPin) {
        setMessage({ type: "error", text: "Enter your current PIN to change it" })
        return
      }
      if (newPin.length < 4) {
        setMessage({ type: "error", text: "New PIN must be at least 4 characters" })
        return
      }
      if (newPin !== confirmPin) {
        setMessage({ type: "error", text: "New PIN and confirmation do not match" })
        return
      }
    }

    setSubmitting(true)
    try {
      const body: { displayName?: string; currentPin?: string; newPin?: string } = {}
      if (nameChanged) body.displayName = trimmedName
      if (changingPin) {
        body.currentPin = currentPin
        body.newPin = newPin
      }

      const response = await fetch("/api/admin/profile", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (!response.ok) {
        setMessage({ type: "error", text: data.error || "Failed to update profile" })
        return
      }

      setCurrentPin("")
      setNewPin("")
      setConfirmPin("")
      await refresh()
      setMessage({
        type: "success",
        text: changingPin && nameChanged
          ? "Display name and PIN updated"
          : changingPin
            ? "PIN updated"
            : "Display name updated",
      })
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <User className="h-5 w-5 text-utsa-orange" />
        <div>
          <h1 className="text-xl font-semibold text-utsa-midnight">Your profile</h1>
          <p className="text-sm text-utsa-muted">
            Update the name shown on your actions, or change your PIN.
          </p>
        </div>
      </div>

      {message && (
        <Alert
          className={
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50"
              : "border-utsa-orange/30 bg-utsa-orange/10"
          }
        >
          {message.type === "success" ? (
            <CheckCircle className="h-4 w-4 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-utsa-accessible" />
          )}
          <AlertDescription
            className={message.type === "success" ? "text-emerald-800" : "text-utsa-accessible"}
          >
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSave} className="space-y-4 rounded-md border border-utsa-border bg-white p-4">
        <div className="space-y-1.5">
          <Label>Username</Label>
          <Input
            value={user.username}
            disabled
            className="h-8 border-utsa-border bg-utsa-surface text-utsa-muted"
          />
          <p className="text-xs text-utsa-muted">Username cannot be changed. Ask a professor if you need a new login.</p>
        </div>

        <div className="space-y-1.5">
          <Label>Role</Label>
          <Input
            value={user.role === "professor" ? "Professor" : "TA"}
            disabled
            className="h-8 border-utsa-border bg-utsa-surface text-utsa-muted"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="profile-display-name">Display name</Label>
          <Input
            id="profile-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Alice Chen"
            required
            className="h-8 border-utsa-border focus-visible:ring-utsa-orange"
          />
          <p className="text-xs text-utsa-muted">
            This name is recorded on overrides, coin adjustments, and other actions you take.
          </p>
        </div>

        <div className="space-y-3 border-t border-utsa-border pt-4">
          <div>
            <h2 className="text-sm font-semibold text-utsa-midnight">Change PIN</h2>
            <p className="text-xs text-utsa-muted">Leave blank to keep your current PIN.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="profile-current-pin">Current PIN</Label>
              <Input
                id="profile-current-pin"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value)}
                className="h-8 border-utsa-border focus-visible:ring-utsa-orange"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-new-pin">New PIN</Label>
              <Input
                id="profile-new-pin"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                minLength={4}
                className="h-8 border-utsa-border focus-visible:ring-utsa-orange"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-confirm-pin">Confirm new PIN</Label>
              <Input
                id="profile-confirm-pin"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                minLength={4}
                className="h-8 border-utsa-border focus-visible:ring-utsa-orange"
              />
            </div>
          </div>
        </div>

        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </div>
  )
}
