"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Upload, Lock, Calendar, X } from "lucide-react"

const EXAM_PERIODS = {
  exam1: {
    name: "Exam 1 Period",
    startDate: "2025-07-11",
    endDate: "2025-08-04",
    excludedDates: ["2025-07-19", "2025-07-20"], // Weekend example
  },
  exam2: {
    name: "Exam 2 Period",
    startDate: "2025-08-05",
    endDate: "2025-08-29",
    excludedDates: ["2025-08-16", "2025-08-17"],
  },
  exam3: {
    name: "Exam 3 Period",
    startDate: "2025-08-30",
    endDate: "2025-09-23",
    excludedDates: ["2025-09-06", "2025-09-07"],
  },
  final: {
    name: "Final Exam Period",
    startDate: "2025-09-24",
    endDate: "2025-10-18",
    excludedDates: ["2025-10-05", "2025-10-06"],
  },
}

export default function AdminPage() {
  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState("")
  const [selectedPeriod, setSelectedPeriod] = useState("")
  const [customExcludedDates, setCustomExcludedDates] = useState<string[]>([])
  const [newExcludedDate, setNewExcludedDate] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setError("")
    }
  }

  const addExcludedDate = () => {
    if (newExcludedDate && !customExcludedDates.includes(newExcludedDate)) {
      setCustomExcludedDates([...customExcludedDates, newExcludedDate])
      setNewExcludedDate("")
    }
  }

  const removeExcludedDate = (dateToRemove: string) => {
    setCustomExcludedDates(customExcludedDates.filter((date) => date !== dateToRemove))
  }

  const getExcludedDates = () => {
    if (selectedPeriod && EXAM_PERIODS[selectedPeriod as keyof typeof EXAM_PERIODS]) {
      const periodDates = EXAM_PERIODS[selectedPeriod as keyof typeof EXAM_PERIODS].excludedDates
      return [...periodDates, ...customExcludedDates]
    }
    return customExcludedDates
  }

  const handleUpload = async () => {
    if (!file || !password || !selectedPeriod) {
      setError("Please fill in all required fields")
      return
    }

    setIsUploading(true)
    setError("")
    setMessage("")

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("password", password)
      formData.append("period", selectedPeriod)
      formData.append("excludedDates", getExcludedDates().join(","))

      const response = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      })

      const data = await response.json()

      if (response.ok) {
        setMessage(`Success! Processed ${data.studentsProcessed} students.`)
        setFile(null)
        setPassword("")
        setSelectedPeriod("")
        setCustomExcludedDates([])
        // Reset file input
        const fileInput = document.getElementById("file-upload") as HTMLInputElement
        if (fileInput) fileInput.value = ""
      } else {
        setError(data.error || "Upload failed")
      }
    } catch (err) {
      setError("Network error. Please try again.")
      console.error("Upload error:", err)
    } finally {
      setIsUploading(false)
    }
  }

  const selectedPeriodInfo = selectedPeriod ? EXAM_PERIODS[selectedPeriod as keyof typeof EXAM_PERIODS] : null

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-4">
      <div className="container mx-auto max-w-2xl py-8">
        <Card className="shadow-xl border-0 bg-white/90 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100">
            <CardTitle className="flex items-center gap-3 text-xl text-blue-900">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Lock className="h-5 w-5 text-blue-600" />
              </div>
              Admin Upload Portal
            </CardTitle>
            <CardDescription>Upload Excel files to update student data securely</CardDescription>
          </CardHeader>

          <CardContent className="p-6 space-y-6">
            {/* Password Field */}
            <div className="space-y-2">
              <Label htmlFor="password">Admin Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
                className="border-slate-200 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            {/* Period Selection */}
            <div className="space-y-2">
              <Label htmlFor="period">Exam Period</Label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                  <SelectValue placeholder="Select exam period" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EXAM_PERIODS).map(([key, period]) => (
                    <SelectItem key={key} value={key}>
                      {period.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedPeriodInfo && (
                <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center gap-2 text-sm text-blue-800">
                    <Calendar className="h-4 w-4" />
                    <span className="font-medium">{selectedPeriodInfo.name}</span>
                  </div>
                  <p className="text-sm text-blue-700 mt-1">
                    {selectedPeriodInfo.startDate} to {selectedPeriodInfo.endDate}
                  </p>
                  {selectedPeriodInfo.excludedDates.length > 0 && (
                    <p className="text-xs text-blue-600 mt-1">
                      Excluded dates: {selectedPeriodInfo.excludedDates.join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Additional Excluded Dates */}
            <div className="space-y-2">
              <Label>Additional Excluded Dates (Optional)</Label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={newExcludedDate}
                  onChange={(e) => setNewExcludedDate(e.target.value)}
                  className="flex-1 border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                />
                <Button type="button" onClick={addExcludedDate} variant="outline" disabled={!newExcludedDate}>
                  Add
                </Button>
              </div>

              {customExcludedDates.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {customExcludedDates.map((date) => (
                    <div key={date} className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded text-sm">
                      <span>{date}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeExcludedDate(date)}
                        className="h-4 w-4 p-0 hover:bg-slate-200"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* File Upload */}
            <div className="space-y-2">
              <Label htmlFor="file-upload">Excel File</Label>
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                <Input
                  id="file-upload"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Label htmlFor="file-upload" className="cursor-pointer text-blue-600 hover:text-blue-700 font-medium">
                  Click to upload Excel file
                </Label>
                <p className="text-sm text-slate-500 mt-1">Supports .xlsx and .xls files</p>
                {file && <p className="text-sm text-green-600 mt-2 font-medium">Selected: {file.name}</p>}
              </div>
            </div>

            {/* Upload Button */}
            <Button
              onClick={handleUpload}
              disabled={isUploading || !file || !password || !selectedPeriod}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2"
            >
              {isUploading ? "Processing..." : "Upload and Process"}
            </Button>

            {/* Messages */}
            {message && (
              <Alert className="border-green-200 bg-green-50">
                <AlertDescription className="text-green-800">{message}</AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert className="border-red-200 bg-red-50">
                <AlertDescription className="text-red-800">{error}</AlertDescription>
              </Alert>
            )}

            {/* Instructions */}
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <h3 className="font-medium text-slate-900 mb-2">Instructions:</h3>
              <ul className="text-sm text-slate-600 space-y-1">
                <li>• Select the appropriate exam period</li>
                <li>• Upload an Excel file with student data</li>
                <li>• Add any additional excluded dates if needed</li>
                <li>• Data will be securely stored in the database</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Back to Home */}
        <div className="text-center mt-6">
          <Button variant="ghost" asChild>
            <a href="/" className="text-slate-600 hover:text-slate-800">
              ← Back to Student Portal
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}
