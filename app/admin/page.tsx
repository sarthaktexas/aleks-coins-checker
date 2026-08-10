"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Upload,
  CheckCircle,
  AlertTriangle,
  Calendar,
  FileSpreadsheet,
  Trash2,
  Coins,
} from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { EXAM_PERIODS, CURRENT_YEAR } from "@/lib/exam-periods"

type ExamPeriodData = {
  name: string
  startDate: string
  endDate: string
  excludedDates: readonly string[]
}

const SESSION_EXPIRED = "Session expired — refresh and sign in again."

export default function AdminPage() {
  const [file, setFile] = useState<File | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState("")
  const [sectionNumber, setSectionNumber] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [periods, setPeriods] = useState<Record<string, ExamPeriodData>>({})
  const [isLoadingPeriods, setIsLoadingPeriods] = useState(true)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [overridesEnabled, setOverridesEnabled] = useState(true)
  const [redemptionRequestsEnabled, setRedemptionRequestsEnabled] = useState(true)
  const [isLoadingSettings, setIsLoadingSettings] = useState(false)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [settingsFlash, setSettingsFlash] = useState<"overrides" | "redemption" | null>(null)
  const loadSettingsAbortRef = useRef<AbortController | null>(null)
  const settingsFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Bumped on every toggle so in-flight loads can't overwrite optimistic state
  const settingsEpochRef = useRef(0)

  const showSettingsFlash = (setting: "overrides" | "redemption") => {
    if (settingsFlashTimeoutRef.current) clearTimeout(settingsFlashTimeoutRef.current)
    setSettingsFlash(setting)
    settingsFlashTimeoutRef.current = setTimeout(() => {
      setSettingsFlash(null)
      settingsFlashTimeoutRef.current = null
    }, 2200)
  }

  useEffect(() => {
    return () => {
      if (settingsFlashTimeoutRef.current) clearTimeout(settingsFlashTimeoutRef.current)
    }
  }, [])

  const loadPeriods = async () => {
    try {
      const response = await fetch("/api/admin/exam-periods", { credentials: "same-origin" })
      const data = await response.json()

      if (response.ok) {
        setPeriods(data.periods || {})
        if (!selectedPeriod && Object.keys(data.periods || {}).length > 0) {
          setSelectedPeriod(Object.keys(data.periods)[0])
        }
      } else {
        setPeriods(EXAM_PERIODS)
        if (!selectedPeriod) setSelectedPeriod("summer2025_exam2")
      }
    } catch {
      setPeriods(EXAM_PERIODS)
      if (!selectedPeriod) setSelectedPeriod("summer2025_exam2")
    } finally {
      setIsLoadingPeriods(false)
    }
  }

  useEffect(() => {
    loadPeriods()
    loadSettings()
  }, [])

  const loadSettings = async () => {
    loadSettingsAbortRef.current?.abort()
    const controller = new AbortController()
    loadSettingsAbortRef.current = controller
    const signal = controller.signal
    const epoch = settingsEpochRef.current

    setIsLoadingSettings(true)
    try {
      const response = await fetch("/api/admin/settings", {
        signal,
        credentials: "same-origin",
        cache: "no-store",
      })
      if (signal.aborted || settingsEpochRef.current !== epoch) return
      if (response.status === 401) {
        setMessage({ type: "error", text: SESSION_EXPIRED })
        return
      }
      const data = await response.json()
      if (signal.aborted || settingsEpochRef.current !== epoch) return
      if (response.ok && data.success) {
        setOverridesEnabled(Boolean(data.settings.overridesEnabled))
        setRedemptionRequestsEnabled(Boolean(data.settings.redemptionRequestsEnabled))
      } else {
        setMessage({ type: "error", text: data.error || "Failed to load settings" })
      }
    } catch (error) {
      if (signal.aborted || settingsEpochRef.current !== epoch) return
      console.error("Error loading settings:", error)
      setMessage({ type: "error", text: "Failed to load settings" })
    } finally {
      if (loadSettingsAbortRef.current === controller) {
        setIsLoadingSettings(false)
      }
    }
  }

  const updateSettings = async (setting: "overrides" | "redemption", value: boolean) => {
    // Invalidate any in-flight load so it can't snap the switch back
    settingsEpochRef.current += 1
    const epoch = settingsEpochRef.current
    loadSettingsAbortRef.current?.abort()

    if (setting === "overrides") setOverridesEnabled(value)
    else setRedemptionRequestsEnabled(value)

    setIsSavingSettings(true)
    try {
      const updates: { overridesEnabled?: boolean; redemptionRequestsEnabled?: boolean } = {}
      if (setting === "overrides") updates.overridesEnabled = value
      else updates.redemptionRequestsEnabled = value

      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify(updates),
      })

      if (settingsEpochRef.current !== epoch) return

      if (response.status === 401) {
        if (setting === "overrides") setOverridesEnabled(!value)
        else setRedemptionRequestsEnabled(!value)
        setMessage({ type: "error", text: SESSION_EXPIRED })
        return
      }

      const result = await response.json()
      if (settingsEpochRef.current !== epoch) return

      if (response.ok && result.success) {
        // Keep the value we just wrote — never re-apply a re-parsed DB read for
        // the toggled field (that was snapping the switch back to on).
        if (setting === "overrides") {
          setOverridesEnabled(value)
          if (typeof result.settings?.redemptionRequestsEnabled === "boolean") {
            setRedemptionRequestsEnabled(result.settings.redemptionRequestsEnabled)
          }
        } else {
          setRedemptionRequestsEnabled(value)
          if (typeof result.settings?.overridesEnabled === "boolean") {
            setOverridesEnabled(result.settings.overridesEnabled)
          }
        }
        showSettingsFlash(setting)
      } else {
        if (setting === "overrides") setOverridesEnabled(!value)
        else setRedemptionRequestsEnabled(!value)
        setMessage({ type: "error", text: result.error || "Failed to update settings" })
      }
    } catch {
      if (settingsEpochRef.current !== epoch) return
      if (setting === "overrides") setOverridesEnabled(!value)
      else setRedemptionRequestsEnabled(!value)
      setMessage({ type: "error", text: "Network error. Please try again." })
    } finally {
      if (settingsEpochRef.current === epoch) {
        setIsSavingSettings(false)
      }
    }
  }

  const handleFileChange = (selectedFile: File) => {
    if (selectedFile && (selectedFile.name.endsWith(".xlsx") || selectedFile.name.endsWith(".xls"))) {
      setFile(selectedFile)
      setMessage(null)
    } else {
      setMessage({ type: "error", text: "Please select a valid Excel file (.xlsx or .xls)" })
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) handleFileChange(selectedFile)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const excelFile = Array.from(e.dataTransfer.files).find(
      (f) => f.name.endsWith(".xlsx") || f.name.endsWith(".xls"),
    )
    if (excelFile) handleFileChange(excelFile)
    else setMessage({ type: "error", text: "Please drop a valid Excel file (.xlsx or .xls)" })
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      setMessage({ type: "error", text: "Please select a file to upload" })
      return
    }
    if (!sectionNumber.trim()) {
      setMessage({ type: "error", text: "Please enter a section number" })
      return
    }

    setIsUploading(true)
    setMessage(null)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("examPeriod", selectedPeriod)
      formData.append("sectionNumber", sectionNumber)

      const response = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      })
      if (response.status === 401) {
        setMessage({ type: "error", text: SESSION_EXPIRED })
        return
      }
      const result = await response.json()

      if (response.ok) {
        setMessage({
          type: "success",
          text: `Uploaded data for ${result.studentCount} students`,
        })
        setFile(null)
        if (fileInputRef.current) fileInputRef.current.value = ""
      } else {
        setMessage({ type: "error", text: result.error || "Upload failed" })
      }
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." })
    } finally {
      setIsUploading(false)
    }
  }

  const handleDeleteAllData = async () => {
    setIsDeleting(true)
    setMessage(null)

    try {
      const response = await fetch("/api/admin/student-data", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({}),
      })
      if (response.status === 401) {
        setMessage({ type: "error", text: SESSION_EXPIRED })
        return
      }
      const result = await response.json()

      if (response.ok) {
        setMessage({ type: "success", text: result.message || "All student data deleted" })
      } else {
        setMessage({ type: "error", text: result.error || "Delete failed" })
      }
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." })
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const formatDateRange = (startDate: string, endDate: string) => {
    const formatDate = (dateStr: string) => {
      const [year, month, day] = dateStr.split("-").map(Number)
      const date = new Date(year, month - 1, day)
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
      return `${monthNames[date.getMonth()]} ${date.getDate()}`
    }
    return `${formatDate(startDate)} – ${formatDate(endDate)}`
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-utsa-midnight">Upload & Settings</h1>
        <p className="text-sm text-utsa-muted">Upload ALEKS Excel data and manage feature flags</p>
      </div>

      <form onSubmit={handleUpload} className="space-y-4 rounded-md border border-utsa-border bg-white p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Exam period ({CURRENT_YEAR})</Label>
            <Select
              value={selectedPeriod}
              onValueChange={setSelectedPeriod}
              disabled={isUploading || isLoadingPeriods}
            >
              <SelectTrigger className="h-8 border-utsa-border">
                <SelectValue placeholder={isLoadingPeriods ? "Loading…" : "Select period"} />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(periods).map(([key, period]) => (
                  <SelectItem key={key} value={key}>
                    {period.name} · {formatDateRange(period.startDate, period.endDate)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sectionNumber">Section number</Label>
            <Input
              id="sectionNumber"
              type="text"
              placeholder="e.g. 003"
              value={sectionNumber}
              onChange={(e) => setSectionNumber(e.target.value)}
              disabled={isUploading}
              className="h-8 border-utsa-border focus-visible:ring-utsa-orange"
            />
          </div>
        </div>

        {selectedPeriod && periods[selectedPeriod] && (
          <div className="flex items-start gap-2 rounded border border-utsa-border bg-utsa-surface px-3 py-2 text-xs text-utsa-muted">
            <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-utsa-orange" />
            <span>
              {periods[selectedPeriod].name} ·{" "}
              {formatDateRange(periods[selectedPeriod].startDate, periods[selectedPeriod].endDate)} ·{" "}
              {periods[selectedPeriod].excludedDates.length} exempt days
            </span>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Excel file</Label>
          <div
            className={`cursor-pointer rounded-md border border-dashed px-4 py-6 text-center transition-colors ${
              isDragOver
                ? "border-utsa-orange bg-utsa-orange/10"
                : file
                  ? "border-emerald-400 bg-emerald-50"
                  : "border-utsa-border bg-utsa-surface hover:border-utsa-orange/50"
            } ${isUploading ? "pointer-events-none opacity-50" : ""}`}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={!isUploading ? () => fileInputRef.current?.click() : undefined}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleInputChange}
              className="hidden"
              disabled={isUploading}
            />
            {file ? (
              <div className="space-y-2">
                <CheckCircle className="mx-auto h-5 w-5 text-emerald-600" />
                <p className="text-sm font-medium text-emerald-800">{file.name}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    setFile(null)
                    if (fileInputRef.current) fileInputRef.current.value = ""
                  }}
                  disabled={isUploading}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                <FileSpreadsheet className="mx-auto h-5 w-5 text-utsa-muted" />
                <p className="text-sm text-utsa-midnight">Drop Excel here or click to browse</p>
                <p className="text-xs text-utsa-muted">.xlsx / .xls</p>
              </div>
            )}
          </div>
        </div>

        <Button
          type="submit"
          disabled={isUploading || !file}
          className="w-full sm:w-auto"
        >
          {isUploading ? (
            "Uploading…"
          ) : (
            <>
              <Upload className="h-4 w-4" />
              Upload
            </>
          )}
        </Button>
      </form>

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

      <div className="space-y-3 rounded-md border border-utsa-border bg-white p-4">
        <h2 className="text-sm font-semibold text-utsa-midnight">Settings</h2>

        <div className="flex items-center justify-between gap-4 border-b border-utsa-border py-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-utsa-midnight">
              <Calendar className="h-3.5 w-3.5 text-utsa-muted" />
              Day overrides
            </div>
            <p className="text-xs text-utsa-muted">Allow creating day overrides</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              aria-live="polite"
              className={`flex items-center gap-1 text-xs font-medium text-emerald-600 transition-opacity duration-300 ${
                settingsFlash === "overrides" ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Settings updated
            </span>
            <Switch
              id="overrides-toggle"
              checked={overridesEnabled}
              onCheckedChange={(checked) => updateSettings("overrides", checked)}
              disabled={isSavingSettings || isLoadingSettings}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 py-1">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-utsa-midnight">
              <Coins className="h-3.5 w-3.5 text-utsa-muted" />
              Redemption requests
            </div>
            <p className="text-xs text-utsa-muted">Allow students to submit redemptions</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              aria-live="polite"
              className={`flex items-center gap-1 text-xs font-medium text-emerald-600 transition-opacity duration-300 ${
                settingsFlash === "redemption" ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Settings updated
            </span>
            <Switch
              id="redemption-toggle"
              checked={redemptionRequestsEnabled}
              onCheckedChange={(checked) => updateSettings("redemption", checked)}
              disabled={isSavingSettings || isLoadingSettings}
            />
          </div>
        </div>
      </div>

      <div className="rounded-md border border-utsa-border bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-utsa-accessible" />
          <h2 className="text-sm font-semibold text-utsa-midnight">Danger zone</h2>
        </div>

        {!showDeleteConfirm ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isDeleting || isUploading}
            className="border-utsa-orange/40 text-utsa-accessible"
          >
            Delete all student data
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-utsa-accessible">
              This permanently deletes all student data, requests, adjustments, and overrides.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteAllData}
                disabled={isDeleting || isUploading}
              >
                {isDeleting ? "Deleting…" : "Yes, delete everything"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-md border border-utsa-border bg-utsa-surface p-4 text-xs text-utsa-muted">
        <p className="mb-1 font-medium text-utsa-midnight">Excel tips</p>
        <p>
          Include Student ID, Name, Email, plus Day N Minutes / Day N Topics columns. Exempt days
          come from the selected period.
        </p>
      </div>
    </div>
  )
}
