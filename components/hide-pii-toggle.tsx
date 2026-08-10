"use client"

import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import { EyeOff } from "lucide-react"

type HidePIIToggleProps = {
  hidePII: boolean
  onToggle: (value: boolean) => void
  showAlert?: boolean
}

export function HidePIIToggle({ hidePII, onToggle, showAlert = true }: HidePIIToggleProps) {
  return (
    <>
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-[rgba(3,32,68,0.14)] bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
        <EyeOff className="h-3.5 w-3.5 text-utsa-muted" />
        <Label htmlFor="hide-pii" className="text-xs font-semibold text-utsa-midnight cursor-pointer">
          Hide PII
        </Label>
        <Switch
          id="hide-pii"
          checked={hidePII}
          onCheckedChange={onToggle}
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
