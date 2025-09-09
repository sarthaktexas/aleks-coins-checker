"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Shield, 
  Upload, 
  Database, 
  Calendar,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  Lock
} from "lucide-react"
import Link from "next/link"

export default function AdminDashboard() {
  const [password, setPassword] = useState("")
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [stats, setStats] = useState({
    totalStudents: 0,
    dataUploads: 0,
    activePeriods: 0
  })
  const [statsLoading, setStatsLoading] = useState(false)

  const loadStats = async () => {
    setStatsLoading(true)
    try {
      const response = await fetch("/api/admin/student-data")
      const result = await response.json()

      if (response.ok) {
        const uploadRecords = result.uploadRecords || []
        let totalStudents = 0
        
        // Calculate total students across all uploads
        uploadRecords.forEach((record: any) => {
          totalStudents += record.student_count || 0
        })

        setStats({
          totalStudents,
          dataUploads: uploadRecords.length,
          activePeriods: uploadRecords.length // For now, each upload is an active period
        })
      }
    } catch (error) {
      console.error("Failed to load stats:", error)
    } finally {
      setStatsLoading(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

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
        setError("")
        // Load stats after successful authentication
        loadStats()
      } else {
        setError(result.error || "Invalid password")
      }
    } catch (error) {
      setError("Network error. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
        <Card className="w-full max-w-md shadow-xl border-0 bg-white/90 backdrop-blur-sm">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="p-3 bg-red-100 rounded-full">
                <Shield className="h-8 w-8 text-red-600" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900">Admin Access</h1>
            </div>
            <CardDescription>
              Enter the admin password to access the dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Admin Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter admin password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12"
                />
              </div>
              <Button 
                type="submit" 
                disabled={isLoading}
                className="w-full h-12 bg-red-600 hover:bg-red-700"
              >
                {isLoading ? "Authenticating..." : "Access Dashboard"}
              </Button>
              {error && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">{error}</AlertDescription>
                </Alert>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  const adminTools = [
    {
      title: "Upload Student Data",
      description: "Upload Excel files with student ALEKS data and process them into the database",
      icon: Upload,
      href: "/admin",
      color: "bg-blue-500 hover:bg-blue-600",
      iconColor: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "View Student Data",
      description: "Browse and search through uploaded student data and progress",
      icon: Database,
      href: "/admin/view-data",
      color: "bg-green-500 hover:bg-green-600",
      iconColor: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      title: "Manage Exam Periods",
      description: "Edit exam period dates, excluded dates, and period configurations",
      icon: Calendar,
      href: "/admin/manage-periods",
      color: "bg-purple-500 hover:bg-purple-600",
      iconColor: "text-purple-600",
      bgColor: "bg-purple-50",
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 bg-red-100 rounded-full">
              <Shield className="h-8 w-8 text-red-600" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">Admin Dashboard</h1>
          </div>
          <p className="text-slate-600">Manage the ALEKS Points Portal system</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Database className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600">Total Students</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {statsLoading ? "..." : stats.totalStudents}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <FileSpreadsheet className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600">Data Uploads</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {statsLoading ? "..." : stats.dataUploads}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Calendar className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600">Active Periods</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {statsLoading ? "..." : stats.activePeriods}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Admin Tools Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {adminTools.map((tool, index) => {
            const IconComponent = tool.icon
            return (
              <Link key={index} href={tool.href}>
                <Card className="h-full bg-white/90 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 cursor-pointer">
                  <CardHeader className="pb-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-3 ${tool.bgColor} rounded-lg`}>
                        <IconComponent className={`h-6 w-6 ${tool.iconColor}`} />
                      </div>
                      <CardTitle className="text-lg text-slate-900">{tool.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-slate-600 mb-4">
                      {tool.description}
                    </CardDescription>
                    <Button className={`w-full ${tool.color} text-white`}>
                      Access Tool
                    </Button>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>

        {/* Back to Home */}
        <div className="text-center mt-8">
          <Button variant="outline" asChild>
            <Link href="/">← Back to Student Portal</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
