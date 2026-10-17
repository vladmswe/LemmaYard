import * as React from "react"
import { cn } from "cn"

import { initials } from "@/lib/initials"

// Initials-only avatar (DESIGN.md §8.15; no uploads in MVP). Decorative:
// the username is always shown or announced next to it.
function Avatar({
  name,
  size = "default",
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  name: string
  size?: "default" | "lg"
}) {
  return (
    <span
      data-slot="avatar"
      data-size={size}
      aria-hidden
      className={cn(
        "inline-grid size-8 shrink-0 place-items-center rounded-full bg-avatar text-[13px] leading-none font-semibold text-avatar-foreground select-none data-[size=lg]:size-16 data-[size=lg]:text-xl",
        className
      )}
      {...props}
    >
      {initials(name)}
    </span>
  )
}

export { Avatar }
