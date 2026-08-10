import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-8 w-full rounded border border-[rgba(3,32,68,0.14)] bg-white px-3 py-1 text-sm text-utsa-midnight shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_1px_rgba(3,32,68,0.03)] ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-utsa-midnight placeholder:text-utsa-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-utsa-orange/40 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-utsa-surface",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
