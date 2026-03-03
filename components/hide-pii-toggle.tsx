"use client"

import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { EyeOff } from "lucide-react"

type HidePIIToggleProps = {
  hidePII: boolean
  onToggle: (value: boolean) => void
  showAlert?: boolean
}

export function HidePIIToggle({ hidePII, onToggle, showAlert = true }: HidePIIToggleProps) {
  return (
    <>
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-200 bg-slate-50">
        <EyeOff className="h-4 w-4 text-slate-500" />
        <Label htmlFor="hide-pii" className="text-sm font-medium text-slate-700 cursor-pointer">
          Hide PII
        </Label>
        <input
          id="hide-pii"
          type="checkbox"
          checked={hidePII}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
      </div>
      {showAlert && hidePII && (
        <Alert className="border-amber-200 bg-amber-50">
          <EyeOff className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            PII is hidden. Names, emails, and IDs are replaced with generated placeholder data for privacy (e.g., when presenting on screen).
          </AlertDescription>
        </Alert>
      )}
    </>
  )
}
