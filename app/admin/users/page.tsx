"use client"

import { useEffect, useState, type FormEvent } from "react"
import { AlertTriangle, CheckCircle, Users } from "lucide-react"
import { useAdminAuth } from "@/components/admin-auth-provider"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type StaffUser = {
  id: number
  username: string
  displayName: string
  role: "ta" | "professor"
  active: boolean
}

export default function AdminUsersPage() {
  const { user } = useAdminAuth()
  const [users, setUsers] = useState<StaffUser[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [username, setUsername] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [pin, setPin] = useState("")
  const [role, setRole] = useState<"ta" | "professor">("ta")

  const loadUsers = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/admin/users")
      const data = await response.json()
      if (!response.ok) {
        setMessage({
          type: "error",
          text:
            response.status === 401
              ? "Session expired — refresh and sign in again."
              : data.error || "Failed to load staff",
        })
        return
      }
      setUsers(data.users || [])
    } catch {
      setMessage({ type: "error", text: "Network error loading staff" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  if (user.role !== "professor") {
    return (
      <Alert className="border-utsa-orange/30 bg-utsa-orange/10">
        <AlertTriangle className="h-4 w-4 text-utsa-accessible" />
        <AlertDescription className="text-utsa-accessible">
          Only professors can manage staff accounts.
        </AlertDescription>
      </Alert>
    )
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setMessage(null)
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, displayName, pin, role }),
      })
      const data = await response.json()
      if (!response.ok) {
        setMessage({ type: "error", text: data.error || "Failed to create user" })
        return
      }
      setUsername("")
      setDisplayName("")
      setPin("")
      setRole("ta")
      setMessage({ type: "success", text: `Created account for ${data.user.displayName}` })
      await loadUsers()
    } catch {
      setMessage({ type: "error", text: "Network error creating user" })
    } finally {
      setSubmitting(false)
    }
  }

  const updateUser = async (
    id: number,
    patch: { active?: boolean; role?: "ta" | "professor"; pin?: string },
  ) => {
    setMessage(null)
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      })
      const data = await response.json()
      if (!response.ok) {
        setMessage({ type: "error", text: data.error || "Failed to update user" })
        return
      }
      setMessage({ type: "success", text: `Updated ${data.user.displayName}` })
      await loadUsers()
    } catch {
      setMessage({ type: "error", text: "Network error updating user" })
    }
  }

  const resetPin = async (staff: StaffUser) => {
    const nextPin = window.prompt(`New PIN for ${staff.displayName} (min 4 characters):`)
    if (!nextPin) return
    await updateUser(staff.id, { pin: nextPin })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-utsa-orange" />
        <div>
          <h1 className="text-xl font-semibold text-utsa-midnight">Staff accounts</h1>
          <p className="text-sm text-utsa-muted">
            Each TA and professor signs in with their own username and PIN.
          </p>
        </div>
      </div>

      <div className="rounded-md bg-white p-4 text-sm text-utsa-midnight">
        <h2 className="font-semibold">Roles</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-utsa-muted">
          <li>
            <span className="font-medium text-utsa-midnight">TA</span> — full access to admin tools
            (uploads, requests, overrides, coins, email, etc.). Their display name is recorded on
            actions they take.
          </li>
          <li>
            <span className="font-medium text-utsa-midnight">Professor</span> — same admin access as
            TAs, plus managing staff on this page (add accounts, reset PINs, change roles, activate
            or deactivate people).
          </li>
        </ul>
      </div>

      {message && (
        <Alert
          className={
            message.type === "success"
              ? "border-green-200 bg-green-50"
              : "border-utsa-orange/30 bg-utsa-orange/10"
          }
        >
          {message.type === "success" ? (
            <CheckCircle className="h-4 w-4 text-green-700" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-utsa-accessible" />
          )}
          <AlertDescription
            className={message.type === "success" ? "text-green-800" : "text-utsa-accessible"}
          >
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleCreate} className="space-y-3 rounded-md bg-white p-4">
        <h2 className="text-sm font-semibold text-utsa-midnight">Add staff member</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-username">Username</Label>
            <Input
              id="new-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. alice"
              required
              className="border-utsa-border"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-display-name">Display name</Label>
            <Input
              id="new-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Alice Chen"
              required
              className="border-utsa-border"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-pin">PIN</Label>
            <Input
              id="new-pin"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="At least 4 characters"
              required
              minLength={4}
              className="border-utsa-border"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "ta" | "professor")}>
              <SelectTrigger className="border-utsa-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ta">TA</SelectItem>
                <SelectItem value="professor">Professor</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button type="submit" disabled={submitting} className="bg-utsa-orange hover:bg-utsa-accessible">
          {submitting ? "Creating…" : "Create account"}
        </Button>
      </form>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-utsa-midnight">Current staff</h2>
        {loading ? (
          <p className="text-sm text-utsa-muted">Loading…</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-utsa-muted">No staff accounts yet.</p>
        ) : (
          <ul className="rounded-md bg-white">
            {users.map((staff) => (
              <li key={staff.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-utsa-midnight">
                    {staff.displayName}
                    {!staff.active && (
                      <span className="ml-2 text-xs font-normal text-red-600">(inactive)</span>
                    )}
                  </p>
                  <p className="text-xs text-utsa-muted">
                    @{staff.username} · {staff.role}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => resetPin(staff)}
                    className="h-8 text-xs"
                  >
                    Reset PIN
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateUser(staff.id, {
                        role: staff.role === "professor" ? "ta" : "professor",
                      })
                    }
                    className="h-8 text-xs"
                    disabled={staff.id === user.id}
                  >
                    Make {staff.role === "professor" ? "TA" : "professor"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => updateUser(staff.id, { active: !staff.active })}
                    className="h-8 text-xs"
                    disabled={staff.id === user.id}
                  >
                    {staff.active ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
