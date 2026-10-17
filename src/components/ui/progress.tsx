import * as React from "react"
import { cn } from "cn"

import { progressPercent } from "@/lib/progress"

// DESIGN.md §8.11. Server-renderable. The indicator is a full-width bar moved
// with transform (fills in on mount, see `.progress-indicator`); always show
// the numbers next to it ("10 / 16").
function Progress({
  value,
  max,
  label,
  className,
  indicatorClassName,
  delayMs,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  value: number
  max: number
  /** Accessible name, e.g. "Easy: 10 of 16 solved". */
  label: string
  indicatorClassName?: string
  /** Stagger for several bars in a group. */
  delayMs?: number
}) {
  const percent = progressPercent(value, max)
  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(Math.max(value, 0), max)}
      className={cn("relative h-1.5 w-full overflow-hidden rounded-full border border-border bg-surface-sunken", className)}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        className={cn("progress-indicator h-full w-full rounded-full bg-primary", indicatorClassName)}
        style={
          {
            "--progress-value": `${percent}%`,
            ...(delayMs === undefined ? {} : { "--progress-delay": `${delayMs}ms` }),
          } as React.CSSProperties
        }
      />
    </div>
  )
}

export { Progress }
