"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { BadgeShield } from "@/components/badge-shield"
import { SURVEY_COMPLETE_COINS } from "@/lib/badge-constants"
import { useHidePII } from "@/hooks/use-hide-pii"
import { getFakeDataForStudent } from "@/lib/fake-data"
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  ClipboardList,
  Eye,
  EyeOff,
  Upload,
} from "lucide-react"

const SESSION_EXPIRED = "Session expired — refresh and sign in again."

type SurveyResultRow = {
  rawName: string
  score: 0 | 100
  lineNumber: number
  status: string
  studentId?: string
  studentName?: string
  coinsAwarded?: number
  message?: string
}

type SurveyResponse = {
  success?: boolean
  dryRun?: boolean
  coinAmount?: number
  awarded?: number
  alreadyAwarded?: number
  skippedZero?: number
  notFound?: number
  ambiguous?: number
  coinsAwarded?: number
  parseErrors?: string[]
  results?: SurveyResultRow[]
  error?: string
}

export default function SurveyRewardsPage() {
  const [periods, setPeriods] = useState<Record<string, { name: string }>>({})
  const [period, setPeriod] = useState("")
  const [sectionNumber, setSectionNumber] = useState("")
  const [coinAmount, setCoinAmount] = useState(String(SURVEY_COMPLETE_COINS))
  const [text, setText] = useState("")
  const [isLoadingPeriods, setIsLoadingPeriods] = useState(true)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [response, setResponse] = useState<SurveyResponse | null>(null)
  const [hidePII] = useHidePII()
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const loadPeriods = async () => {
      setIsLoadingPeriods(true)
      try {
        const res = await fetch("/api/admin/exam-periods", { credentials: "same-origin" })
        if (res.status === 401) {
          setError(SESSION_EXPIRED)
          return
        }
        const data = await res.json()
        if (res.ok && data.periods) {
          setPeriods(data.periods)
          const keys = Object.keys(data.periods)
          if (keys.length > 0) setPeriod((prev) => prev || keys[0])
        } else {
          setError(data.error || "Failed to load exam periods")
        }
      } catch {
        setError("Network error loading exam periods.")
      } finally {
        setIsLoadingPeriods(false)
      }
    }
    void loadPeriods()
  }, [])

  const handleFileUpload = async (file: File | null) => {
    if (!file) return
    setError("")
    try {
      const lower = file.name.toLowerCase()
      if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        const XLSX = await import("xlsx")
        const buffer = await file.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: "array" })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const csv = XLSX.utils.sheet_to_csv(sheet)
        setText(csv)
        setSuccess(`Loaded ${file.name}. Preview matches before awarding.`)
        return
      }
      const content = await file.text()
      setText(content)
      setSuccess(`Loaded ${file.name}. Preview matches before awarding.`)
    } catch {
      setError("Could not read that file. Try CSV or paste the list instead.")
    }
  }

  const submit = async (dryRun: boolean) => {
    setError("")
    setSuccess("")
    if (!text.trim()) {
      setError("Paste a list of student names with scores (0 or 100).")
      return
    }
    if (!period) {
      setError("Select an exam period.")
      return
    }
    if (!sectionNumber.trim()) {
      setError("Enter a section number.")
      return
    }
    const coins = Number(coinAmount)
    if (!Number.isFinite(coins) || coins < 1 || coins > 100) {
      setError("Coin reward must be between 1 and 100.")
      return
    }

    if (dryRun) setIsPreviewing(true)
    else setIsApplying(true)

    try {
      const res = await fetch("/api/admin/survey-rewards", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          period,
          sectionNumber: sectionNumber.trim(),
          coinAmount: Math.round(coins),
          dryRun,
        }),
      })

      if (res.status === 401) {
        setError(SESSION_EXPIRED)
        return
      }

      const data: SurveyResponse = await res.json()
      setResponse(data)

      if (!res.ok) {
        setError(data.error || "Failed to process survey list")
        return
      }

      if (dryRun) {
        setSuccess(
          `Preview ready: ${data.awarded || 0} would be awarded, ${data.skippedZero || 0} scored 0, ${data.notFound || 0} unmatched.`,
        )
      } else {
        setSuccess(
          `Done: awarded ${data.awarded || 0} badge${(data.awarded || 0) === 1 ? "" : "s"} and ${data.coinsAwarded || 0} coins.`,
        )
      }
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setIsPreviewing(false)
      setIsApplying(false)
    }
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case "awarded":
        return "bg-emerald-500 text-white hover:bg-emerald-500"
      case "already_awarded":
        return "bg-sky-500 text-white hover:bg-sky-500"
      case "skipped_zero":
        return "bg-slate-400 text-white hover:bg-slate-400"
      case "not_found":
      case "ambiguous":
      case "error":
        return "bg-red-500 text-white hover:bg-red-500"
      default:
        return "bg-utsa-muted text-white hover:bg-utsa-muted"
    }
  }

  const statusLabel = (status: string) => {
    switch (status) {
      case "awarded":
        return response?.dryRun ? "Would award" : "Awarded"
      case "already_awarded":
        return "Already has badge"
      case "skipped_zero":
        return "Score 0"
      case "not_found":
        return "Not found"
      case "ambiguous":
        return "Ambiguous"
      case "error":
        return "Error"
      default:
        return status
    }
  }

  const sortedResults = useMemo(() => {
    const rows = response?.results || []
    return [...rows].sort((a, b) => a.lineNumber - b.lineNumber)
  }, [response])

  const busy = isPreviewing || isApplying || isLoadingPeriods

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-utsa-midnight">Survey Rewards</h1>
          <p className="text-sm text-utsa-muted">
            Upload names with score 100 or 0. Score 100 unlocks the Survey Complete badge and a coin bonus.
          </p>
        </div>
        <BadgeShield kind="survey_complete" unlocked className="h-16 w-14 shrink-0" />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3">
          <CheckCircle className="h-4 w-4 shrink-0 text-green-600" />
          <p className="text-sm text-green-800">{success}</p>
        </div>
      )}

      <div className="space-y-4 rounded-md border border-utsa-border bg-white p-4">
        <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 p-3">
          <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
          <div className="text-sm text-sky-950">
            <p className="font-medium">How to format the list</p>
            <p className="mt-1 text-sky-900">
              One student per line: <code className="rounded bg-white/80 px-1">Last, First, 100</code> or{" "}
              <code className="rounded bg-white/80 px-1">First Last 0</code>. Student IDs work too. Only{" "}
              <strong>0</strong> or <strong>100</strong> scores are accepted.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Exam period</Label>
            <Select value={period} onValueChange={setPeriod} disabled={busy}>
              <SelectTrigger className="border-utsa-border">
                <SelectValue placeholder={isLoadingPeriods ? "Loading…" : "Select period"} />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(periods).map(([key, value]) => (
                  <SelectItem key={key} value={key}>
                    {value.name || key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="section">Section</Label>
            <Input
              id="section"
              placeholder="e.g. 001"
              value={sectionNumber}
              onChange={(e) => setSectionNumber(e.target.value)}
              disabled={busy}
              className="border-utsa-border focus-visible:ring-utsa-orange"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="coins">Coins for score 100</Label>
            <Input
              id="coins"
              type="number"
              min={1}
              max={100}
              value={coinAmount}
              onChange={(e) => setCoinAmount(e.target.value)}
              disabled={busy}
              className="border-utsa-border focus-visible:ring-utsa-orange"
            />
            <p className="text-xs text-utsa-muted">Default is {SURVEY_COMPLETE_COINS}. Applied once per student.</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="survey-list">Student list</Label>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.tsv,.xlsx,.xls,text/csv,text/plain"
                className="hidden"
                onChange={(e) => {
                  void handleFileUpload(e.target.files?.[0] || null)
                  e.target.value = ""
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                className="border-utsa-border"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-3.5 w-3.5" />
                Upload CSV / Excel
              </Button>
            </div>
          </div>
          <Textarea
            id="survey-list"
            placeholder={"Smith, Jordan, 100\nLee, Alex, 0\nPatel, Sam, 100"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
            rows={10}
            className="resize-y border-utsa-border font-mono text-sm focus-visible:ring-utsa-orange"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void submit(true)}
            disabled={busy}
            className="border-utsa-border"
          >
            {isPreviewing ? (
              "Previewing…"
            ) : (
              <>
                <Eye className="mr-2 h-4 w-4" />
                Preview matches
              </>
            )}
          </Button>
          <Button type="button" onClick={() => void submit(false)} disabled={busy}>
            {isApplying ? (
              "Applying…"
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Award badges &amp; coins
              </>
            )}
          </Button>
        </div>
      </div>

      {response?.parseErrors && response.parseErrors.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-900">
            <p className="font-medium">Some lines could not be parsed</p>
            <ul className="mt-1 list-inside list-disc text-sm">
              {response.parseErrors.slice(0, 8).map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {response?.results && (
        <div className="rounded-md border border-utsa-border bg-white">
          {hidePII && (
            <Alert className="rounded-none border-0 border-b border-amber-200 bg-amber-50">
              <EyeOff className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                PII is hidden. Names and IDs are replaced with placeholder data.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-3 border-b border-utsa-border px-3 py-2 text-xs text-utsa-muted">
            <span>
              {response.dryRun ? "Preview" : "Applied"} · {response.awarded || 0} award
              {(response.awarded || 0) === 1 ? "" : "s"}
            </span>
            <span>{response.alreadyAwarded || 0} already had badge</span>
            <span>{response.skippedZero || 0} scored 0</span>
            <span>{response.notFound || 0} not found</span>
            <span>{response.ambiguous || 0} ambiguous</span>
            <span>{response.coinsAwarded || 0} coins</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-utsa-surface text-left text-xs uppercase tracking-wide text-utsa-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">#</th>
                  <th className="px-3 py-2 font-semibold">Input</th>
                  <th className="px-3 py-2 font-semibold">Score</th>
                  <th className="px-3 py-2 font-semibold">Matched student</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((row) => {
                  const display =
                    row.studentId && hidePII
                      ? getFakeDataForStudent(row.studentId)
                      : {
                          name: row.studentName || "—",
                          studentId: row.studentId || "",
                        }
                  return (
                    <tr key={`${row.lineNumber}-${row.rawName}`} className="border-t border-utsa-border">
                      <td className="px-3 py-2 text-utsa-muted">{row.lineNumber}</td>
                      <td className="px-3 py-2 text-utsa-midnight">{hidePII && row.studentId ? display.name : row.rawName}</td>
                      <td className="px-3 py-2 font-mono text-utsa-midnight">{row.score}</td>
                      <td className="px-3 py-2 text-utsa-midnight">
                        {row.studentId ? (
                          <>
                            <span className="font-medium">{display.name}</span>
                            <span className="ml-2 font-mono text-xs text-utsa-muted">{display.studentId}</span>
                          </>
                        ) : (
                          <span className="text-utsa-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Badge className={`h-5 px-1.5 text-[10px] ${statusBadge(row.status)}`}>
                          {statusLabel(row.status)}
                        </Badge>
                      </td>
                      <td className="max-w-[16rem] truncate px-3 py-2 text-xs text-utsa-muted" title={row.message}>
                        {row.message || "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
