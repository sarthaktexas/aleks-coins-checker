"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Upload, FileSpreadsheet, Lock, CheckCircle, AlertCircle, Loader2, Calendar } from "lucide-react"

export default function AdminPage() {
  const [file, setFile] = useState<File | null>(null)
  const [startDate, setStartDate] = useState("2025-07-11")
  const [endDate, setEndDate] = useState("2025-08-04")
  const [password, setPassword] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<{
    type: "success" | "error" | null
    message: string
  }>({ type: null, message: "" })
  const [selectedPeriod, setSelectedPeriod] = useState("")

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      if (
        selectedFile.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        selectedFile.name.endsWith(".xlsx")
      ) {
        setFile(selectedFile)
        setUploadStatus({ type: null, message: "" })
      } else {
        setUploadStatus({ type: "error", message: "Please select a valid Excel (.xlsx) file" })
      }
    }
  }

  const handleUpload = async () => {
    if (!file || !password) {
      setUploadStatus({ type: "error", message: "Please select a file and enter the admin password" })
      return
    }

    if (!selectedPeriod) {
      setUploadStatus({ type: "error", message: "Please select an exam period" })
      return
    }

    if (selectedPeriod === "custom" && (!startDate || !endDate)) {
      setUploadStatus({ type: "error", message: "Please enter start and end dates for custom period" })
      return
    }

    setIsUploading(true)
    setUploadStatus({ type: null, message: "" })

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("period", selectedPeriod)

      if (selectedPeriod === "custom") {
        formData.append("startDate", startDate)
        formData.append("endDate", endDate)
      }

      formData.append("password", password)

      const response = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      })

      const result = await response.json()

      if (response.ok) {
        setUploadStatus({
          type: "success",
          message: `Successfully processed ${result.studentCount} students and updated the database!`,
        })
        setFile(null)
        setPassword("")
        setSelectedPeriod("")
        // Reset file input
        const fileInput = document.getElementById("file-upload") as HTMLInputElement
        if (fileInput) fileInput.value = ""
      } else {
        setUploadStatus({ type: "error", message: result.error || "Upload failed" })
      }
    } catch (error) {
      setUploadStatus({ type: "error", message: "Network error. Please try again." })
    } finally {
      setIsUploading(false)
    }
  }

  const getPeriodInfo = (period: string) => {
    switch (period) {
      case "exam1":
        return "Aug. 30th - Sept. 26th, 2024. Excludes Sept 1st (Labor Day). Includes weekends."
      case "exam2":
        return "Sept 29th - Oct. 24th, 2024. Excludes Oct. 13th-14th (Fall Break). Includes weekends."
      case "exam3":
        return "Oct. 26th - Dec. 4th, 2024. Excludes Nov. 26th-28th (Thanksgiving Break). Includes weekends."
      case "summer":
        return "July 11th - Aug. 4th, 2025. No excluded dates. Current summer session data."
      default:
        return ""
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8 sm:py-12 max-w-3xl">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4 tracking-tight">Admin Panel</h1>
          <p className="text-slate-600 text-base sm:text-lg">Upload Excel files to update student data</p>
        </div>

        {/* Upload Card */}
        <Card className="shadow-xl border-0 bg-white/90 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100">
            <CardTitle className="flex items-center gap-3 text-lg sm:text-xl text-blue-900">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Upload className="h-5 w-5 text-blue-600" />
              </div>
              Excel File Upload
            </CardTitle>
            <CardDescription className="text-sm sm:text-base">
              Upload Time_and_Topic.xlsx file to update student progress data
            </CardDescription>
          </CardHeader>

          <CardContent className="p-6 sm:p-8 space-y-6">
            {/* Security Warning */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Lock className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-semibold text-amber-800">Secure Access Required</span>
              </div>
              <p className="text-xs sm:text-sm text-amber-700">
                This page is for authorized administrators only. All uploads are logged and monitored.
              </p>
            </div>

            {/* Admin Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-slate-700">
                Admin Password *
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter admin password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                disabled={isUploading}
              />
            </div>

            {/* Period Selection */}
            <div className="space-y-2">
              <Label htmlFor="period" className="text-sm font-medium text-slate-700">
                Exam Period *
              </Label>
              <select
                id="period"
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md focus:border-blue-500 focus:ring-blue-500"
                disabled={isUploading}
              >
                <option value="">Select an exam period</option>
                <option value="exam1">Exam 1 - Aug. 30th - Sept. 26th (excludes Sept 1st)</option>
                <option value="exam2">Exam 2 - Sept 29th - Oct. 24th (excludes Oct. 13th-14th)</option>
                <option value="exam3">Exam 3 - Oct. 26th - Dec. 4th (excludes Nov. 26th-28th)</option>
                <option value="summer">Summer Period - July 11th - Aug. 4th (current data)</option>
                <option value="custom">Custom Period (enter dates manually)</option>
              </select>
            </div>

            {/* Custom Date Range - only show if custom is selected */}
            {selectedPeriod === "custom" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate" className="text-sm font-medium text-slate-700">
                    Start Date
                  </Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                    disabled={isUploading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate" className="text-sm font-medium text-slate-700">
                    End Date
                  </Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                    disabled={isUploading}
                  />
                </div>
              </div>
            )}

            {/* Excluded Dates Info */}
            {selectedPeriod && selectedPeriod !== "custom" && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-semibold text-blue-800">Period Information</span>
                </div>
                <p className="text-xs text-blue-700">{getPeriodInfo(selectedPeriod)}</p>
              </div>
            )}

            {/* File Upload */}
            <div className="space-y-2">
              <Label htmlFor="file-upload" className="text-sm font-medium text-slate-700">
                Excel File (.xlsx) *
              </Label>
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                <input
                  id="file-upload"
                  type="file"
                  accept=".xlsx"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={isUploading}
                />
                <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-2">
                  <FileSpreadsheet className="h-8 w-8 text-slate-400" />
                  <span className="text-sm text-slate-600">{file ? file.name : "Click to select Excel file"}</span>
                  <span className="text-xs text-slate-500">Expected format: Time_and_Topic.xlsx</span>
                </label>
              </div>
            </div>

            {/* Status Messages */}
            {uploadStatus.type && (
              <div
                className={`p-4 rounded-lg border ${
                  uploadStatus.type === "success" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  {uploadStatus.type === "success" ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-600" />
                  )}
                  <span
                    className={`text-sm font-medium ${
                      uploadStatus.type === "success" ? "text-green-800" : "text-red-800"
                    }`}
                  >
                    {uploadStatus.message}
                  </span>
                </div>
              </div>
            )}

            {/* Upload Button */}
            <Button
              onClick={handleUpload}
              disabled={!file || !password || isUploading}
              className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-base font-medium"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload and Process
                </>
              )}
            </Button>

            {/* Instructions */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">Instructions:</h3>
              <ul className="text-xs text-slate-600 space-y-1">
                <li>• Upload the Time_and_Topic.xlsx file from ALEKS</li>
                <li>• Ensure the file has the correct format with h:mm_X and added to pie_X columns</li>
                <li>• Set the correct start and end dates for the period</li>
                <li>• The system will automatically calculate coins and progress for all students</li>
                <li>• Data will be stored securely and replace the current student database</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Back to Portal */}
        <div className="text-center mt-8">
          <Button variant="outline" asChild>
            <a href="/">← Back to Student Portal</a>
          </Button>
        </div>
      </div>
    </div>
  )
}
