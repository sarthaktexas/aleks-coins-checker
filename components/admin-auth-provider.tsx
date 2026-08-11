"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"
import Link from "next/link"
import { AlertTriangle, Lock, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"

export type AdminAuthUser = {
  id: number
  username: string
  displayName: string
  role: "ta" | "professor"
}

type AdminAuthContextValue = {
  user: AdminAuthUser
  loading: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null)

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider")
  return ctx
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminAuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState("")
  const [pin, setPin] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/auth", { credentials: "same-origin" })
      if (!response.ok) {
        setUser(null)
        return
      }
      const data = await response.json()
      if (data.authenticated && data.user) {
        setUser(data.user)
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      await refresh()
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [refresh])

  const logout = useCallback(async () => {
    await fetch("/api/admin/auth", { method: "DELETE", credentials: "same-origin" })
    setUser(null)
    // Clear legacy shared-password storage
    try {
      localStorage.removeItem("adminPassword")
    } catch {
      /* ignore */
    }
  }, [])

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError("")
    try {
      const response = await fetch("/api/admin/auth", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, pin }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        setError(data.error || "Invalid username or PIN")
        return
      }
      setUser(data.user)
      setPin("")
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-utsa-muted">
        Checking session…
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-sm space-y-4 pt-8">
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-utsa-orange" />
          <h1 className="text-lg font-semibold text-utsa-midnight">Staff login</h1>
        </div>
        <p className="text-sm text-utsa-muted">
          Sign in with your username and PIN. Each TA and professor has their own account.
        </p>
        <form onSubmit={handleLogin} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="admin-username">Username</Label>
            <Input
              id="admin-username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-8 border-utsa-border focus-visible:ring-utsa-orange"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-pin">PIN</Label>
            <Input
              id="admin-pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="h-8 border-utsa-border focus-visible:ring-utsa-orange"
              required
            />
          </div>
          <Button
            type="submit"
            disabled={submitting}
            className="w-full"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
          {error && (
            <Alert className="border-utsa-orange/30 bg-utsa-orange/10">
              <AlertTriangle className="h-4 w-4 text-utsa-accessible" />
              <AlertDescription className="text-utsa-accessible">{error}</AlertDescription>
            </Alert>
          )}
        </form>
      </div>
    )
  }

  return (
    <AdminAuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AdminAuthContext.Provider>
  )
}

export function AdminUserBadge() {
  const { user, logout } = useAdminAuth()
  return (
    <div className="flex items-center gap-2">
      <Link
        href="/admin/profile"
        className="hidden text-xs text-utsa-muted hover:text-utsa-orange sm:inline"
      >
        {user.displayName}
        <span className="text-utsa-muted/70"> · {user.role}</span>
      </Link>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => logout()}
        className="h-8 gap-1 px-2 text-xs text-utsa-muted hover:text-utsa-orange"
      >
        <LogOut className="h-3.5 w-3.5" />
        Log out
      </Button>
    </div>
  )
}
