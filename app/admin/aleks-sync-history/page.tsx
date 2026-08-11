"use client"

import { AlertTriangle } from "lucide-react"
import { useAdminAuth } from "@/components/admin-auth-provider"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AleksSyncHistory } from "@/components/aleks-sync-history"

export default function AleksSyncHistoryPage() {
  const { user } = useAdminAuth()

  if (user.role !== "professor") {
    return (
      <Alert className="border-utsa-orange/30 bg-utsa-orange/10">
        <AlertTriangle className="h-4 w-4 text-utsa-accessible" />
        <AlertDescription className="text-utsa-accessible">
          Only professors can view workflow history.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-utsa-midnight">Sync History</h1>
        <p className="text-sm text-utsa-muted">
          Combined timeline for ALEKS pulls and reviewed-topics verification runs.
        </p>
      </div>

      <AleksSyncHistory
        title="Workflow timeline"
        description="Nightly and manual runs across both workflows, grouped by day."
        endpoint="/api/admin/aleks-sync/history-timeline"
        emptyMessage="No workflow timeline entries found yet."
        showWorkflowTag
      />
    </div>
  )
}
