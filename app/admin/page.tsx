"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Upload, Shield, Database, CheckCircle, AlertTriangle, Calendar } from "lucide-react"

// Get current year
const CURRENT_YEAR = new Date().getFullYear()

// Define the same periods as in the script
const EXAM_PERIODS = {
  spring2025: {
    name: `Spring ${CURRENT_YEAR} - Exam 1 Period`,
    startDate: `${CURRENT_YEAR}-01-15`,
    endDate: `${CURRENT_YEAR}-02-10`,
    excludedDates: [`${CURRENT_YEAR}-01-20`, `${CURRENT_YEAR}-02-03`],
  },
  spring2025_exam2: {
    name: `Spring ${CURRENT_YEAR} - Exam 2 Period`,
    startDate: `${CURRENT_YEAR}-02-11`,
    endDate: `${CURRENT_YEAR}-03-10`,
    excludedDates: [`${CURRENT_YEAR}-02-17`, `${CURRENT_YEAR}-03-03`],
  },
  spring2025_final: {
    name: `Spring ${CURRENT_YEAR} - Final Exam Period`,
    startDate: `${CURRENT_YEAR}-03-11`,
    endDate: `${CURRENT_YEAR}-04-28`,
    excludedDates: [`${CURRENT_YEAR}-03-17`, `${CURRENT_YEAR}-04-21`],
  },
  summer2025: {
    name: `Summer ${CURRENT_YEAR} - Exam 1 Period`,
    startDate: `${CURRENT_YEAR}-05-31`,
    endDate: `${CURRENT_YEAR}-06-23`,
    excludedDates: [`${CURRENT_YEAR}-06-07`, `${CURRENT_YEAR}-06-08`],
  },
  summer2025_exam2: {
    name: `Summer ${CURRENT_YEAR} - Exam 2 Period`,
    startDate: `${CURRENT_YEAR}-06-24`,
    endDate: `${CURRENT_YEAR}-07-17`,
    excludedDates: [`${CURRENT_YEAR}-07-04`, `${CURRENT_YEAR}-07-05`, `${CURRENT_YEAR}-07-06`],
  },
  summer2025_final: {
    name: `Summer ${CURRENT_YEAR} - Final Exam Period`,
    startDate: `${CURRENT_YEAR}-07-18`,
    endDate: `${CURRENT_YEAR}-08-10`,
    excludedDates: [`${CURRENT_YEAR}-07-26`, `${CURRENT_YEAR}-07-27`],
  },
  fall2025: {
    name: `Fall ${CURRENT_YEAR} - Exam 1 Period`,
    startDate: `${CURRENT_YEAR}-08-26`,
    endDate: `${CURRENT_YEAR}-09-20`,
    excludedDates: [`${CURRENT_YEAR}-09-02`, `${CURRENT_YEAR}-09-16`],
  },
  fall2025_exam2: {
    name: `Fall ${CURRENT_YEAR} - Exam 2 Period`,
    startDate: `${CURRENT_YEAR}-09-21`,
    endDate: `${CURRENT_YEAR}-10-18`,
    excludedDates: [`${CURRENT_YEAR}-10-14`],
  },
  fall2025_final: {
    name: `Fall ${CURRENT_YEAR} - Final Exam Period`,
    startDate: `${CURRENT_YEAR}-10-19`,
    endDate: `${CURRENT_YEAR}-12-13`,
    excludedDates: [
      `${CURRENT_YEAR}-11-25`,
      `${CURRENT_YEAR}-11-26`,
      `${CURRENT_YEAR}-11-27`,
      `${CURRENT_YEAR}-11-28`,
      `${CURRENT_YEAR}-11-29`,
    ],
  },
}

export default function AdminPage() {
  const [password, setPassword] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState("summer2025")
  const [isUploading, setIsUploading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setMessage(null)
    }
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!password) {
      setMessage({ type: "error", text: "Please enter the admin password" })
      return
    }

    if (!file) {
      setMessage({ type: "error", text: "Please select a file to upload" })
      return
    }

    setIsUploading(true)
    setMessage(null)

    try {
      const formData = new FormData()
      formData.append("password", password)
      formData.append("file", file)

      const response = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      })

      const result = await response.json()

      if (response.ok) {
        setMessage({
          type: "success",
          text: `Successfully uploaded data for ${result.studentCount} students`,
        })
        setFile(null)
        setPassword("")
        // Reset file input
        const fileInput = document.getElementById("file") as HTMLInputElement
        if (fileInput) fileInput.value = ""
      } else {
        setMessage({ type: "error", text: result.error || "Upload failed" })
      }
    } catch (error) {
      setMessage({ type: "error", text: "Network error. Please try again." })
    } finally {
      setIsUploading(false)
    }
  }

  const formatDateRange = (startDate: string, endDate: string) => {
    const start = new Date(startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    const end = new Date(endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    return `${start} - ${end}`
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8 sm:py-12 max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 bg-red-100 rounded-full">
              <Shield className="h-8 w-8 text-red-600" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">Admin Panel</h1>
          </div>
          <p className="text-slate-600">Upload student data to the secure database</p>
        </div>

        {/* Upload Card */}
        <Card className="shadow-xl border-0 bg-white/90 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-red-50 to-orange-50 border-b border-red-100">
            <CardTitle className="flex items-center gap-3 text-xl text-red-900">
              <div className="p-2 bg-red-100 rounded-lg">
                <Database className="h-5 w-5 text-red-600" />
              </div>
              Student Data Upload
            </CardTitle>
            <CardDescription>
              Upload an Excel file (converted to JSON) containing student progress data. This will be stored securely in
              the database.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-6">
            <form onSubmit={handleUpload} className="space-y-6">
              {/* Password Field */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-slate-700">
                  Admin Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter admin password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 border-slate-200 focus:border-red-500 focus:ring-red-500"
                  disabled={isUploading}
                />
              </div>

              {/* Period Selection */}
              <div className="space-y-2">
                <Label htmlFor="period" className="text-sm font-medium text-slate-700">
                  Exam Period ({CURRENT_YEAR})
                </Label>
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod} disabled={isUploading}>
                  <SelectTrigger className="h-12 border-slate-200 focus:border-red-500 focus:ring-red-500">
                    <SelectValue placeholder="Select exam period" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EXAM_PERIODS).map(([key, period]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex flex-col">
                          <span className="font-medium">{period.name}</span>
                          <span className="text-xs text-slate-500">
                            {formatDateRange(period.startDate, period.endDate)} • {period.excludedDates.length} exempt
                            days
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedPeriod && (
                  <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="h-3 w-3" />
                      <span className="font-medium">Selected Period Details:</span>
                    </div>
                    <p>
                      <strong>Period:</strong> {EXAM_PERIODS[selectedPeriod as keyof typeof EXAM_PERIODS].name}
                    </p>
                    <p>
                      <strong>Date Range:</strong>{" "}
                      {formatDateRange(
                        EXAM_PERIODS[selectedPeriod as keyof typeof EXAM_PERIODS].startDate,
                        EXAM_PERIODS[selectedPeriod as keyof typeof EXAM_PERIODS].endDate,
                      )}
                    </p>
                    <p>
                      <strong>Exempt Dates:</strong>{" "}
                      {EXAM_PERIODS[selectedPeriod as keyof typeof EXAM_PERIODS].excludedDates
                        .map((date) => new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }))
                        .join(", ")}
                    </p>
                  </div>
                )}
              </div>

              {/* File Upload */}
              <div className="space-y-2">
                <Label htmlFor="file" className="text-sm font-medium text-slate-700">
                  Student Data File (JSON)
                </Label>
                <div className="relative">
                  <Input
                    id="file"
                    type="file"
                    accept=".json"
                    onChange={handleFileChange}
                    className="h-12 border-slate-200 focus:border-red-500 focus:ring-red-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100"
                    disabled={isUploading}
                  />
                </div>
                {file && (
                  <p className="text-sm text-slate-600 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={isUploading || !password || !file}
                className="w-full h-12 bg-red-600 hover:bg-red-700 text-white font-medium"
              >
                {isUploading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Uploading...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Upload to Database
                  </div>
                )}
              </Button>
            </form>

            {/* Messages */}
            {message && (
              <Alert
                className={`mt-6 ${message.type === "success" ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}
              >
                <div className="flex items-center gap-2">
                  {message.type === "success" ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                  )}
                  <AlertDescription className={message.type === "success" ? "text-green-800" : "text-red-800"}>
                    {message.text}
                  </AlertDescription>
                </div>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card className="mt-6 bg-blue-50 border-blue-200">
          <CardContent className="p-6">
            <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload Instructions
            </h3>
            <div className="space-y-2 text-sm text-blue-800">
              <p>• First, process your Excel file using the script:</p>
              <code className="block bg-blue-100 p-2 rounded text-xs font-mono">
                node process-excel.js students.xlsx {selectedPeriod}
              </code>
              <p>• This creates a JSON file with the correct period dates and exempt days</p>
              <p>• Upload the generated JSON file using this form</p>
              <p>• Exempt days are automatically excluded from progress calculations</p>
              <p>• Data is stored securely in the Vercel Postgres database</p>
            </div>
          </CardContent>
        </Card>

        {/* Back to Home */}
        <div className="text-center mt-8">
          <Button variant="outline" asChild>
            <a href="/">← Back to Student Portal</a>
          </Button>
        </div>
      </div>
    </div>
  )
}
