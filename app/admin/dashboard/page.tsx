"use client"

import { useState, useEffect } from "react"
import {
  Upload,
  Database,
  Calendar,
  Settings,
  Mail,
  Coins,
  MessageSquare,
  Trophy,
  Bug,
  Users,
  SlidersHorizontal,
  Rocket,
} from "lucide-react"
import Link from "next/link"
import { useAdminAuth } from "@/components/admin-auth-provider"

export default function AdminDashboard() {
  const { user } = useAdminAuth()
  const [error, setError] = useState("")
  const [stats, setStats] = useState({
    totalStudents: 0,
    dataUploads: 0,
    activePeriods: 0,
    overrideRequests: 0,
    redemptionRequests: 0,
  })
  const [statsLoading, setStatsLoading] = useState(false)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    setStatsLoading(true)
    setError("")
    try {
      const studentDataResponse = await fetch("/api/admin/student-data", {
        credentials: "same-origin",
      })
      if (studentDataResponse.status === 401) {
        setError("Session expired — refresh and sign in again.")
        return
      }
      const studentDataResult = await studentDataResponse.json()

      const requestStatsResponse = await fetch("/api/admin/request-stats", {
        credentials: "same-origin",
      })
      if (requestStatsResponse.status === 401) {
        setError("Session expired — refresh and sign in again.")
        return
      }
      const requestStatsResult = await requestStatsResponse.json()

      if (studentDataResponse.ok) {
        const uploadRecords = studentDataResult.uploadRecords || []
        const totalStudents = studentDataResult.uniqueStudentCount || 0
        const uniquePeriods = new Set(uploadRecords.map((record: any) => record.period))
        const overrideRequests = requestStatsResponse.ok
          ? requestStatsResult.overrideRequests || 0
          : 0
        const redemptionRequests = requestStatsResponse.ok
          ? requestStatsResult.redemptionRequests || 0
          : 0

        setStats({
          totalStudents,
          dataUploads: uploadRecords.length,
          activePeriods: uniquePeriods.size,
          overrideRequests,
          redemptionRequests,
        })
      }
    } catch (err) {
      console.error("Failed to load stats:", err)
    } finally {
      setStatsLoading(false)
    }
  }

  const tools = [
    ...(user.role === "professor"
      ? [{ title: "Start Here!", href: "/admin/start-here", icon: Rocket }]
      : []),
    ...(user.role === "professor"
      ? [{ title: "Upload & Settings", href: "/admin", icon: Upload }]
      : [{ title: "Feature Settings", href: "/admin", icon: Settings }]),
    { title: "Student Data", href: "/admin/view-data", icon: Database },
    ...(user.role === "professor"
      ? [{ title: "Exam Periods", href: "/admin/manage-periods", icon: Calendar }]
      : []),
    { title: "Day Overrides", href: "/admin/view-overrides", icon: SlidersHorizontal },
    { title: "Student Requests", href: "/admin/requests", icon: MessageSquare },
    ...(user.role === "professor"
      ? [{ title: "Bug Reports", href: "/admin/bug-reports", icon: Bug }]
      : []),
    { title: "Coin Adjustments", href: "/admin/coin-adjustments", icon: Coins },
    { title: "Email Students", href: "/admin/email-students", icon: Mail },
    ...(user.role === "professor"
      ? [{ title: "Leaderboard", href: "/admin/leaderboard", icon: Trophy }]
      : []),
    ...(user.role === "professor"
      ? [{ title: "Staff Accounts", href: "/admin/users", icon: Users }]
      : []),
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-utsa-midnight">Dashboard</h1>
        <p className="text-sm text-utsa-muted">ALEKS Points Portal admin</p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          { label: "Students", value: stats.totalStudents },
          { label: "Uploads", value: stats.dataUploads },
          { label: "Periods", value: stats.activePeriods },
          { label: "Overrides", value: stats.overrideRequests },
          { label: "Redemptions", value: stats.redemptionRequests },
        ].map((s) => (
          <div key={s.label} className="rounded-md bg-white px-3 py-2">
            <p className="text-xs text-utsa-muted">{s.label}</p>
            <p className="text-lg font-semibold text-utsa-midnight">
              {statsLoading ? "…" : s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {tools.map((tool) => {
          const Icon = tool.icon
          return (
            <Link
              key={tool.href}
              href={tool.href}
              className="flex items-center gap-3 rounded-md bg-white px-3 py-3 transition-colors hover:bg-utsa-orange/5"
            >
              <Icon className="h-4 w-4 text-utsa-orange" />
              <span className="text-sm font-medium text-utsa-midnight">{tool.title}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
