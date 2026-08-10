import type React from "react"
import { AdminAuthProvider } from "@/components/admin-auth-provider"
import { AdminShell } from "@/components/admin-shell"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthProvider>
      <AdminShell>{children}</AdminShell>
    </AdminAuthProvider>
  )
}
