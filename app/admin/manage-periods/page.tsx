"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Calendar,
  Save,
  Edit,
  Plus,
  Trash2,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import {
  EXAM_PERIODS,
  CURRENT_YEAR,
  groupBySemester,
  getExamLabel,
  buildPeriodKey,
  buildPeriodName,
  getExamTypeFromKey,
  parsePeriodKey,
  SEMESTER_OPTIONS,
  EXAM_TYPE_OPTIONS,
  type SemesterSeason,
  type ExamType,
} from "@/lib/exam-periods"
import { useAdminAuth } from "@/components/admin-auth-provider"

type ExamPeriodData = {
  name: string
  startDate: string
  endDate: string
  excludedDates: readonly string[] | string[]
  coinOnlyExemptDates?: readonly string[] | string[]
}

type PeriodFormState = {
  season: SemesterSeason
  year: string
  examType: ExamType
  periodKey: string
  name: string
  startDate: string
  endDate: string
  excludedDates: string[]
  coinOnlyExemptDates: string[]
}

const emptyForm = (): PeriodFormState => ({
  season: "spring",
  year: String(CURRENT_YEAR),
  examType: "exam1",
  periodKey: buildPeriodKey("spring", CURRENT_YEAR, "exam1"),
  name: buildPeriodName("spring", CURRENT_YEAR, "exam1"),
  startDate: "",
  endDate: "",
  excludedDates: [],
  coinOnlyExemptDates: [],
})

function formFromPeriod(periodKey: string, period: ExamPeriodData): PeriodFormState {
  const parsed = parsePeriodKey(periodKey)
  const season = parsed?.season ?? "spring"
  const year = parsed?.year ?? CURRENT_YEAR
  const examType = getExamTypeFromKey(periodKey)

  return {
    season,
    year: String(year),
    examType,
    periodKey,
    name: period.name,
    startDate: formatDateForInput(period.startDate),
    endDate: formatDateForInput(period.endDate),
    excludedDates: [...period.excludedDates],
    coinOnlyExemptDates: [...(period.coinOnlyExemptDates || [])],
  }
}

function formatDateForInput(date: string) {
  try {
    if (!date) return ""
    if (date.includes("-") && date.length === 10) return date
    const d = new Date(date)
    if (isNaN(d.getTime())) return ""
    return d.toISOString().split("T")[0]
  } catch {
    return ""
  }
}

function formatDateForDisplay(
  date: string,
  options: { month?: "short" | "long"; day?: "numeric"; year?: "numeric" } = {},
) {
  const monthNamesShort = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ]
  const monthNamesLong = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ]

  try {
    if (!date) return "Invalid Date"

    let year: number
    let month: number
    let day: number

    if (date.includes("-") && date.length === 10) {
      ;[year, month, day] = date.split("-").map(Number)
    } else {
      const d = new Date(date)
      if (isNaN(d.getTime())) return "Invalid Date"
      year = d.getFullYear()
      month = d.getMonth() + 1
      day = d.getDate()
    }

    let result = ""
    if (options.month === "long") result += monthNamesLong[month - 1]
    else result += monthNamesShort[month - 1]
    if (options.day === "numeric") result += ` ${day}`
    if (options.year === "numeric") result += `, ${year}`
    return result
  } catch {
    return "Invalid Date"
  }
}

function formatDateRange(startDate: string, endDate: string) {
  try {
    return `${formatDateForDisplay(startDate, { month: "short", day: "numeric" })} – ${formatDateForDisplay(endDate, { month: "short", day: "numeric" })}`
  } catch {
    return "Invalid Date"
  }
}

export default function ManagePeriodsPage() {
  const { user } = useAdminAuth()
  const [periods, setPeriods] = useState<Record<string, ExamPeriodData>>({})
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [dialogMode, setDialogMode] = useState<"add" | "edit" | null>(null)
  const [editingOriginalKey, setEditingOriginalKey] = useState<string | null>(null)
  const [form, setForm] = useState<PeriodFormState>(emptyForm)
  const [specialDayDate, setSpecialDayDate] = useState("")
  const [collapsedSemesters, setCollapsedSemesters] = useState<Set<string>>(new Set())

  type SpecialDayKind = "exempt" | "coins_only"
  type SpecialDay = { date: string; kind: SpecialDayKind }

  const specialDays = useMemo<SpecialDay[]>(() => {
    const days: SpecialDay[] = [
      ...form.excludedDates.map((date) => ({ date, kind: "exempt" as const })),
      ...form.coinOnlyExemptDates.map((date) => ({ date, kind: "coins_only" as const })),
    ]
    return days.sort((a, b) => a.date.localeCompare(b.date))
  }, [form.excludedDates, form.coinOnlyExemptDates])


  const semesterGroups = useMemo(
    () =>
      groupBySemester(
        Object.entries(periods).map(([periodKey, period]) => ({ periodKey, period })),
        (item) => item.periodKey,
      ),
    [periods],
  )

  const loadPeriods = async () => {
    try {
      const response = await fetch("/api/admin/exam-periods")
      const data = await response.json()

      if (response.ok) {
        setPeriods(data.periods || {})
      } else {
        console.error("Failed to load periods:", data.error)
        setPeriods(EXAM_PERIODS)
      }
    } catch (error) {
      console.error("Error loading periods:", error)
      setPeriods(EXAM_PERIODS)
    }
  }

  useEffect(() => {
    if (user.role !== "professor") return
    loadPeriods()
  }, [user.role])

  const openAddDialog = () => {
    setDialogMode("add")
    setEditingOriginalKey(null)
    setSpecialDayDate("")
    setForm(emptyForm())
    setMessage(null)
  }

  const openEditDialog = (periodKey: string) => {
    const period = periods[periodKey]
    if (!period) return
    setDialogMode("edit")
    setEditingOriginalKey(periodKey)
    setSpecialDayDate("")
    setForm(formFromPeriod(periodKey, period))
    setMessage(null)
  }

  const closeDialog = () => {
    setDialogMode(null)
    setEditingOriginalKey(null)
    setSpecialDayDate("")
  }

  const updateFormPart = <K extends keyof PeriodFormState>(key: K, value: PeriodFormState[K]) => {
    if (key === "season" || key === "year" || key === "examType") {
      setForm((prev) => {
        const next = { ...prev, [key]: value }
        const yearNum = Number(key === "year" ? (value as string) : next.year) || CURRENT_YEAR
        const season = (key === "season" ? value : next.season) as SemesterSeason
        const examType = (key === "examType" ? value : next.examType) as ExamType
        return {
          ...next,
          periodKey: buildPeriodKey(season, yearNum, examType),
          name: buildPeriodName(season, yearNum, examType),
        }
      })
      return
    }
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    const periodKey = form.periodKey.trim()
    if (!periodKey || !form.name.trim() || !form.startDate || !form.endDate) {
      setMessage({ type: "error", text: "Please fill in all required fields" })
      return
    }

    setIsLoading(true)
    setMessage(null)

    try {
      if (dialogMode === "edit" && editingOriginalKey && periodKey !== editingOriginalKey) {
        const renameResponse = await fetch("/api/admin/exam-periods", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            oldPeriodKey: editingOriginalKey,
            newPeriodKey: periodKey,
          }),
        })
        if (renameResponse.status === 401) {
          setMessage({ type: "error", text: "Session expired — refresh and sign in again." })
          setIsLoading(false)
          return
        }
        const renameData = await renameResponse.json()
        if (!renameResponse.ok) {
          setMessage({
            type: "error",
            text: renameData.error || "Failed to change period key. It may already exist.",
          })
          setIsLoading(false)
          return
        }
      }

      const response = await fetch("/api/admin/exam-periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          periodKey,
          name: form.name.trim(),
          startDate: form.startDate,
          endDate: form.endDate,
          excludedDates: form.excludedDates,
          coinOnlyExemptDates: form.coinOnlyExemptDates,
        }),
      })

      if (response.status === 401) {
        setMessage({ type: "error", text: "Session expired — refresh and sign in again." })
        return
      }

      const data = await response.json()

      if (response.ok) {
        setMessage({
          type: "success",
          text: data.message || `Successfully saved ${form.name}`,
        })
        closeDialog()
        await loadPeriods()
      } else {
        setMessage({
          type: "error",
          text: data.error || "Failed to save changes. Please try again.",
        })
      }
    } catch {
      setMessage({ type: "error", text: "Failed to save changes. Please try again." })
    } finally {
      setIsLoading(false)
    }
  }

  const addSpecialDay = (kind: SpecialDayKind) => {
    if (!specialDayDate) return

    const alreadyExempt = form.excludedDates.includes(specialDayDate)
    const alreadyCoinsOnly = form.coinOnlyExemptDates.includes(specialDayDate)
    if (alreadyExempt || alreadyCoinsOnly) {
      setMessage({
        type: "error",
        text: "That date is already a special day. Change its type in the list below, or remove it first.",
      })
      return
    }

    setForm((prev) => {
      if (kind === "exempt") {
        return {
          ...prev,
          excludedDates: [...prev.excludedDates, specialDayDate].sort(),
        }
      }
      return {
        ...prev,
        coinOnlyExemptDates: [...prev.coinOnlyExemptDates, specialDayDate].sort(),
      }
    })
    setSpecialDayDate("")
    setMessage(null)
  }

  const removeSpecialDay = (date: string, kind: SpecialDayKind) => {
    setForm((prev) => {
      if (kind === "exempt") {
        return {
          ...prev,
          excludedDates: prev.excludedDates.filter((d) => d !== date),
        }
      }
      return {
        ...prev,
        coinOnlyExemptDates: prev.coinOnlyExemptDates.filter((d) => d !== date),
      }
    })
  }

  const setSpecialDayKind = (date: string, kind: SpecialDayKind) => {
    setForm((prev) => {
      const without = {
        excludedDates: prev.excludedDates.filter((d) => d !== date),
        coinOnlyExemptDates: prev.coinOnlyExemptDates.filter((d) => d !== date),
      }
      if (kind === "exempt") {
        return {
          ...prev,
          ...without,
          excludedDates: [...without.excludedDates, date].sort(),
        }
      }
      return {
        ...prev,
        ...without,
        coinOnlyExemptDates: [...without.coinOnlyExemptDates, date].sort(),
      }
    })
  }

  const toggleSemester = (semesterKey: string) => {
    setCollapsedSemesters((prev) => {
      const next = new Set(prev)
      if (next.has(semesterKey)) next.delete(semesterKey)
      else next.add(semesterKey)
      return next
    })
  }

  if (user.role !== "professor") {
    return (
      <Alert className="border-utsa-orange/30 bg-utsa-orange/10">
        <AlertTriangle className="h-4 w-4 text-utsa-accessible" />
        <AlertDescription className="text-utsa-accessible">
          Only professors can manage exam periods.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-utsa-midnight">Manage Exam Periods</h1>
          <p className="text-sm text-utsa-muted">Organized by semester — edit dates and exempt days</p>
        </div>
        <Button onClick={openAddDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add Period
        </Button>
      </div>

      {message && (
        <Alert
          className={
            message.type === "success"
              ? "border-green-200 bg-green-50"
              : "border-red-200 bg-red-50"
          }
        >
          <div className="flex items-center gap-2">
            {message.type === "success" ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-red-600" />
            )}
            <AlertDescription
              className={message.type === "success" ? "text-green-800" : "text-red-800"}
            >
              {message.text}
            </AlertDescription>
          </div>
        </Alert>
      )}

      {semesterGroups.length === 0 ? (
        <div className="rounded-md border border-utsa-border bg-white p-8 text-center">
          <Calendar className="h-8 w-8 text-utsa-muted mx-auto mb-2" />
          <p className="text-sm text-utsa-muted">No exam periods yet. Add one to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {semesterGroups.map((group) => {
            const isCollapsed = collapsedSemesters.has(group.semesterKey)
            return (
              <div
                key={group.semesterKey}
                className="rounded-md border border-utsa-border bg-white overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleSemester(group.semesterKey)}
                  className="w-full flex items-center justify-between gap-3 border-b border-utsa-border bg-utsa-surface px-4 py-3 text-left hover:bg-utsa-surface/80 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-utsa-muted shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-utsa-muted shrink-0" />
                    )}
                    <Calendar className="h-4 w-4 text-utsa-orange shrink-0" />
                    <h2 className="text-sm font-semibold text-utsa-midnight truncate">
                      {group.semesterLabel}
                    </h2>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {group.items.length} {group.items.length === 1 ? "period" : "periods"}
                    </Badge>
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="divide-y divide-utsa-border">
                    {group.items.map(({ periodKey, period }) => (
                      <div
                        key={periodKey}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 hover:bg-utsa-surface/40 transition-colors"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="text-xs border-utsa-border font-medium">
                              {getExamLabel(periodKey)}
                            </Badge>
                            <span className="text-sm font-medium text-utsa-midnight truncate">
                              {period.name}
                            </span>
                          </div>
                          <p className="text-xs text-utsa-muted">
                            {formatDateRange(period.startDate, period.endDate)}
                            {period.excludedDates.length > 0 && (
                              <> · {period.excludedDates.length} exempt</>
                            )}
                            {(period.coinOnlyExemptDates?.length || 0) > 0 && (
                              <> · {period.coinOnlyExemptDates!.length} coins-only</>
                            )}
                          </p>
                          {(period.excludedDates.length > 0 || (period.coinOnlyExemptDates?.length || 0) > 0) && (
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {period.excludedDates.map((date, index) => (
                                <span
                                  key={`${periodKey}-ex-${date}-${index}`}
                                  className="px-2 py-0.5 bg-red-50 text-red-700 rounded text-xs"
                                  title="Exempt (counts toward extra credit %)"
                                >
                                  {formatDateForDisplay(date, { month: "short", day: "numeric" })}
                                </span>
                              ))}
                              {(period.coinOnlyExemptDates || []).map((date, index) => (
                                <span
                                  key={`${periodKey}-co-${date}-${index}`}
                                  className="px-2 py-0.5 bg-amber-50 text-amber-800 rounded text-xs"
                                  title="Exempt (coins only)"
                                >
                                  {formatDateForDisplay(date, { month: "short", day: "numeric" })} · coins
                                </span>
                              ))}
                            </div>
                          )}
                          <p className="text-[11px] font-mono text-utsa-muted/80">{periodKey}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditDialog(periodKey)}
                          className="border-utsa-border shrink-0 self-start sm:self-center"
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="rounded-md border border-utsa-border bg-utsa-surface p-4 text-xs text-utsa-muted">
        <h3 className="font-medium text-utsa-midnight mb-2 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-utsa-orange" />
          Important Notes
        </h3>
        <div className="space-y-1">
          <p>• Changes to exam periods will affect all future data uploads</p>
          <p>• Changing the period key updates student_data, coin_adjustments, and student_requests</p>
          <p>• The period name (not the key) is shown to students on their lookup page</p>
          <p>• Special days are excluded from the working-day denominator; re-upload/sync after changing them</p>
        </div>
      </div>

      <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "add" ? "Add Exam Period" : "Edit Exam Period"}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === "add"
                ? "Pick a semester and exam — the key and name are generated for you."
                : "Update dates, name, or the period key used across the system."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Semester</Label>
                <Select
                  value={form.season}
                  onValueChange={(value) => updateFormPart("season", value as SemesterSeason)}
                >
                  <SelectTrigger className="border-utsa-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEMESTER_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="period-year">Year</Label>
                <Input
                  id="period-year"
                  type="number"
                  min={2020}
                  max={2100}
                  value={form.year}
                  onChange={(e) => updateFormPart("year", e.target.value)}
                  className="border-utsa-border focus-visible:ring-utsa-orange"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Exam</Label>
                <Select
                  value={form.examType}
                  onValueChange={(value) => updateFormPart("examType", value as ExamType)}
                >
                  <SelectTrigger className="border-utsa-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXAM_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="period-name">Display Name</Label>
                <Input
                  id="period-name"
                  value={form.name}
                  onChange={(e) => updateFormPart("name", e.target.value)}
                  className="border-utsa-border focus-visible:ring-utsa-orange"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="period-key">Period Key</Label>
                <Input
                  id="period-key"
                  value={form.periodKey}
                  onChange={(e) => updateFormPart("periodKey", e.target.value)}
                  className="font-mono text-sm border-utsa-border focus-visible:ring-utsa-orange"
                />
                <p className="text-[11px] text-utsa-muted">
                  Auto-fills from semester above. Changing it remaps related data.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="start-date">Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => updateFormPart("startDate", e.target.value)}
                  className="border-utsa-border focus-visible:ring-utsa-orange"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end-date">End Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => updateFormPart("endDate", e.target.value)}
                  className="border-utsa-border focus-visible:ring-utsa-orange"
                />
              </div>
            </div>

            <div className="space-y-3 rounded-md border border-utsa-border bg-utsa-surface/40 p-3">
              <div>
                <Label>Special days</Label>
                <p className="text-[11px] text-utsa-muted mt-0.5">
                  Holidays and other non-required days. Skipping never hurts progress.
                </p>
              </div>

              {specialDays.length === 0 ? (
                <p className="text-xs text-utsa-muted">No special days yet.</p>
              ) : (
                <div className="space-y-2">
                  {specialDays.map(({ date, kind }) => (
                    <div
                      key={`${kind}-${date}`}
                      className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-md border border-utsa-border bg-white px-2.5 py-2"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-utsa-midnight">
                          {formatDateForDisplay(date, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                        <p className="text-[11px] text-utsa-muted font-mono">{date}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={kind}
                          onValueChange={(value) => setSpecialDayKind(date, value as SpecialDayKind)}
                        >
                          <SelectTrigger className="h-8 w-[11.5rem] border-utsa-border text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="exempt">Exempt</SelectItem>
                            <SelectItem value="coins_only">Exempt (coins only)</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="outline"
                          type="button"
                          onClick={() => removeSpecialDay(date, kind)}
                          className="text-red-600 border-red-200 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2 border-t border-utsa-border pt-3">
                <Label htmlFor="special-day-date" className="text-xs">
                  Add a special day
                </Label>
                <Input
                  id="special-day-date"
                  type="date"
                  value={specialDayDate}
                  onChange={(e) => setSpecialDayDate(e.target.value)}
                  className="border-utsa-border focus-visible:ring-utsa-orange"
                />

                {specialDayDate ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-utsa-midnight">
                      If a student qualifies on{" "}
                      {formatDateForDisplay(specialDayDate, { month: "short", day: "numeric" })},
                      should it count toward extra credit?
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => addSpecialDay("exempt")}
                        className="text-left rounded-md border border-amber-200 bg-amber-50/70 p-3 hover:border-amber-400 hover:bg-amber-50 transition-colors"
                      >
                        <p className="text-sm font-semibold text-amber-900">Yes — Exempt</p>
                        <p className="text-[11px] text-amber-800/90 mt-1 leading-snug">
                          Earns a coin and counts toward the extra credit %.
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => addSpecialDay("coins_only")}
                        className="text-left rounded-md border border-violet-200 bg-violet-50/70 p-3 hover:border-violet-400 hover:bg-violet-50 transition-colors"
                      >
                        <p className="text-sm font-semibold text-violet-900">No — Exempt (coins only)</p>
                        <p className="text-[11px] text-violet-800/90 mt-1 leading-snug">
                          Earns a coin, but never counts toward the extra credit %.
                        </p>
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-utsa-muted">
                    Pick a date, then answer one question to choose the type.
                  </p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isLoading} className="border-utsa-border">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isLoading} variant="success">
              <Save className="h-4 w-4 mr-2" />
              {isLoading ? "Saving…" : dialogMode === "add" ? "Add Period" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
