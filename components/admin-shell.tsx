"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { AdminUserBadge, useAdminAuth } from "@/components/admin-auth-provider"
import "@/app/admin/admin.css"

const NAV_ITEMS = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin", label: "Upload", exact: true },
  { href: "/admin/view-data", label: "Data" },
  { href: "/admin/manage-periods", label: "Periods" },
  { href: "/admin/view-overrides", label: "Overrides" },
  { href: "/admin/requests", label: "Requests" },
  { href: "/admin/bug-reports", label: "Bugs" },
  { href: "/admin/coin-adjustments", label: "Coins" },
  { href: "/admin/email-students", label: "Email" },
  { href: "/admin/leaderboard", label: "Leaderboard" },
  { href: "/admin/users", label: "Staff", professorOnly: true },
] as const

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { user } = useAdminAuth()

  const navItems = NAV_ITEMS.filter(
    (item) => !("professorOnly" in item && item.professorOnly) || user.role === "professor",
  )

  return (
    <div className="admin-shell flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 bg-white">
        <div className="h-1 w-full" />
        <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
          <Link href="/admin/dashboard" className="shrink-0 text-sm font-bold text-utsa-midnight">
            ALEKS Admin
          </Link>
          <div className="flex items-center gap-3">
            <AdminUserBadge />
            <Link href="/" className="text-xs text-utsa-muted hover:text-utsa-orange">
              ← Student portal
            </Link>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 pt-1">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href, "exact" in item ? item.exact : false)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "shrink-0 rounded px-2.5 py-1.5 text-xs font-semibold transition-[filter,box-shadow]",
                  active
                    ? "btn-tactile-orange text-white"
                    : "text-utsa-midnight/70 hover:bg-black/[0.04] hover:text-utsa-midnight",
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-6">{children}</main>
    </div>
  )
}
