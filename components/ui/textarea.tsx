import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded border border-[rgba(3,32,68,0.14)] bg-white px-3 py-2 text-sm text-utsa-midnight shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_1px_rgba(3,32,68,0.03)] ring-offset-background placeholder:text-utsa-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-utsa-orange/40 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-utsa-surface",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
