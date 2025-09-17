"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Shield, 
  Search, 
  Users, 
  Calendar,
  ArrowLeft,
  Download,
  Trash2,
  AlertTriangle,
  CheckCircle,
  XCircle
} from "lucide-react"
import Link from "next/link"

type DayOverride = {
  id: number
  student_id: string
  day_number: number
  date: string
  override_type: "qualified" | "not_qualified"
  reason: string | null
  created_at: string
  updated_at: string
}

export default function ViewOverridesPage() {
  const [password, setPassword] = useState("")
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authError, setAuthError] = useState("")
  const [isLoadingAuth, setIsLoadingAuth] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [overrides, setOverrides] = useState<DayOverride[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // Load saved password from localStorage on component mount
  useEffect(() => {
    const savedPassword = localStorage.getItem('adminPassword')
    if (savedPassword) {
      setPassword(savedPassword)
    }
  }, [])

  // Save password to localStorage when it changes
  useEffect(() => {
    if (password) {
      localStorage.setItem('adminPassword', password)
    }
  }, [password])

  useEffect(() => {
    if (isAuthenticated) {
      loadOverrides()
    }
  }, [isAuthenticated])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoadingAuth(true)
    setAuthError("")

    try {
      const response = await fetch("/api/admin/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      })

      const result = await response.json()

      if (response.ok && result.success) {
        setIsAuthenticated(true)
      } else {
        setAuthError(result.error || "Authentication failed")
      }
    } catch (error) {
      setAuthError("Network error. Please try again.")
    } finally {
      setIsLoadingAuth(false)
    }
  }

  const loadOverrides = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/admin/day-overrides")
      const result = await response.json()

      if (response.ok) {
        setOverrides(result.overrides || [])
      } else {
        setError(result.error || "Failed to load overrides")
      }
    } catch (error) {
      setError("Failed to load overrides")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteOverride = async (override: DayOverride) => {
    if (!confirm(`Are you sure you want to delete the override for ${override.student_id}, Day ${override.day_number}?`)) {
      return
    }

    setDeletingId(override.id)
    try {
      const response = await fetch("/api/admin/day-overrides", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studentId: override.student_id,
          dayNumber: override.day_number,
          adminPassword: password
        }),
      })

      const result = await response.json()

      if (response.ok && result.success) {
        // Remove the override from the list
        setOverrides(prev => prev.filter(o => o.id !== override.id))
      } else {
        setError(result.error || "Failed to delete override")
      }
    } catch (error) {
      setError("Network error. Please try again.")
    } finally {
      setDeletingId(null)
    }
  }

  const filteredOverrides = overrides.filter((override) => {
    const matchesSearch = searchTerm === "" || 
      override.student_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      override.reason?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      override.date.includes(searchTerm)
    
    return matchesSearch
  })

  const formatDate = (dateString: string) => {
    // Convert UTC timestamp to Central Time - show date
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "America/Chicago" // Central Time
    }
    
    return new Date(dateString).toLocaleString("en-US", options)
  }

  const formatOverrideDate = (dateString: string) => {
    if (!dateString) return ""
    const [year, month, day] = dateString.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
  }

  const handleExport = () => {
    if (filteredOverrides.length === 0) {
      setError("No overrides to export")
      return
    }

    // Convert overrides to CSV format
    const headers = ["Student ID", "Day Number", "Date", "Override Type", "Reason", "Created At", "Updated At"]
    const csvData = [
      headers.join(","),
      ...filteredOverrides.map((override) => [
        override.student_id,
        override.day_number,
        override.date,
        `"${override.override_type}"`,
        `"${override.reason || ''}"`,
        formatDate(override.created_at),
        formatDate(override.updated_at)
      ].join(","))
    ].join("\n")

    // Create and download file
    const blob = new Blob([csvData], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `day-overrides-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  // Show authentication form if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
        <div className="container mx-auto px-4 py-8 max-w-md">
          <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Shield className="h-5 w-5 text-blue-600" />
                </div>
                Admin Authentication
              </CardTitle>
              <CardDescription>
                Enter admin password to view day overrides
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium text-slate-700">
                    Admin Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoadingAuth}
                    className="h-12 border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                    placeholder="Enter admin password"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isLoadingAuth || !password}
                  className="w-full h-12 bg-blue-600 hover:bg-blue-700"
                >
                  {isLoadingAuth ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Authenticating...
                    </div>
                  ) : (
                    "Authenticate"
                  )}
                </Button>
                {authError && (
                  <Alert className="border-red-200 bg-red-50">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-800">
                      {authError}
                    </AlertDescription>
                  </Alert>
                )}
              </form>
            </CardContent>
          </Card>

          {/* Back to Student Portal */}
          <div className="text-center mt-8">
            <Button variant="outline" asChild>
              <Link href="/">← Back to Student Portal</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/dashboard" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Day Overrides</h1>
            <p className="text-slate-600">View and manage student day overrides</p>
          </div>
        </div>

        {/* Overrides Table */}
        <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Calendar className="h-5 w-5 text-blue-600" />
                  </div>
                  All Day Overrides
                </CardTitle>
                <CardDescription>
                  {filteredOverrides.length} overrides found
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleExport} disabled={filteredOverrides.length === 0}>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Search */}
            <div className="mb-6">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-slate-500" />
                <Input
                  placeholder="Search by student ID, reason, or date..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-md"
                />
              </div>
            </div>

            {/* Overrides Table */}
            <div className="space-y-2">
              {/* Header Row */}
              <div className="flex items-center gap-4 p-3 bg-slate-100 border border-slate-200 rounded-lg text-sm font-medium text-slate-600">
                <div className="flex-1">Student ID</div>
                <div className="w-20 text-center">Day</div>
                <div className="flex-1">Date</div>
                <div className="w-24 text-center">Status</div>
                <div className="flex-1">Reason</div>
                <div className="w-32 text-center">Created</div>
                <div className="w-20 text-center">Actions</div>
              </div>
              
              {filteredOverrides.map((override) => (
                <div key={override.id} className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                  {/* Student ID */}
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm font-semibold text-slate-900 truncate">{override.student_id}</p>
                  </div>

                  {/* Day Number */}
                  <div className="w-20 text-center">
                    <span className="text-lg font-bold text-slate-900">Day {override.day_number}</span>
                  </div>

                  {/* Date */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-600">{formatOverrideDate(override.date)}</p>
                  </div>

                  {/* Status */}
                  <div className="w-24 text-center">
                    <Badge 
                      className={
                        override.override_type === "qualified" 
                          ? "bg-green-500 hover:bg-green-600 text-white" 
                          : "bg-red-500 hover:bg-red-600 text-white"
                      }
                    >
                      {override.override_type === "qualified" ? (
                        <div className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Qualified
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <XCircle className="h-3 w-3" />
                          Not Qualified
                        </div>
                      )}
                    </Badge>
                  </div>

                  {/* Reason */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-600 truncate">
                      {override.reason || <span className="text-slate-400 italic">No reason provided</span>}
                    </p>
                  </div>

                  {/* Created Date */}
                  <div className="w-32 text-center">
                    <p className="text-xs text-slate-500">{formatDate(override.created_at)}</p>
                  </div>

                  {/* Actions */}
                  <div className="w-20 text-center">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteOverride(override)}
                      disabled={deletingId === override.id}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      {deletingId === override.id ? (
                        <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {filteredOverrides.length === 0 && !isLoading && (
              <div className="text-center py-8">
                {overrides.length === 0 ? (
                  <div>
                    <p className="text-slate-500 mb-2">No day overrides found.</p>
                    <p className="text-sm text-slate-400">
                      Overrides will appear here when students use the day override feature.
                    </p>
                  </div>
                ) : (
                  <p className="text-slate-500">No overrides found matching your search criteria.</p>
                )}
              </div>
            )}

            {isLoading && (
              <div className="text-center py-8">
                <div className="inline-flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-slate-500">Loading overrides...</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {error && (
          <Card className="mt-6 border-red-200 bg-red-50">
            <CardContent className="p-4">
              <p className="text-red-800">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Back to Student Portal */}
        <div className="text-center mt-8">
          <Button variant="outline" asChild>
            <Link href="/">← Back to Student Portal</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

