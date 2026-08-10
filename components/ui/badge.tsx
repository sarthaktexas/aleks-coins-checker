import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-utsa-orange/40 focus:ring-offset-1 w-fit",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-utsa-orange/10 text-utsa-accessible",
        secondary:
          "border-transparent bg-utsa-surface text-utsa-muted",
        destructive:
          "border-transparent bg-red-50 text-red-700",
        outline:
          "border-[rgba(3,32,68,0.14)] bg-white text-utsa-midnight",
        success:
          "border-transparent bg-emerald-50 text-emerald-700",
        warning:
          "border-transparent bg-amber-50 text-amber-800",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
