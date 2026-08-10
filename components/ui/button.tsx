import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded text-xs font-semibold tracking-wide transition-[filter,box-shadow,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-utsa-orange/40 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "btn-tactile-orange text-white",
        destructive: "btn-tactile-danger text-white",
        outline: "btn-tactile-outline text-utsa-midnight",
        secondary: "bg-utsa-surface text-utsa-midnight hover:bg-black/[0.06]",
        ghost: "text-utsa-muted hover:bg-black/[0.05] hover:text-utsa-midnight",
        link: "text-utsa-orange underline-offset-4 hover:underline",
        success: "btn-tactile-success text-white",
      },
      size: {
        default: "h-8 px-3",
        sm: "h-7 rounded px-2.5 text-[11px]",
        lg: "h-9 rounded px-4 text-sm",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
