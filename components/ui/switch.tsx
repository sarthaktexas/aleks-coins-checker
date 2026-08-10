import * as React from "react"
import { cn } from "@/lib/utils"

export interface SwitchProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked = false, onCheckedChange, disabled, ...props }, ref) => {
    const handleClick = () => {
      if (!disabled && onCheckedChange) {
        onCheckedChange(!checked)
      }
    }

    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        ref={ref}
        className={cn(
          "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-utsa-orange/40 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-utsa-orange" : "bg-[rgba(3,32,68,0.18)]",
          className
        )}
        onClick={handleClick}
        {...props}
      >
        <span
          className={cn(
            "pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow-sm ring-0 transition-transform",
            checked ? "translate-x-[1.125rem]" : "translate-x-0.5"
          )}
        />
      </button>
    )
  }
)
Switch.displayName = "Switch"

export { Switch }
