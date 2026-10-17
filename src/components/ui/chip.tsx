import * as React from "react"
import { cn } from "cn"

// DESIGN.md §12 (v2). Filter chip: 34px pill, line-strong border; pressed =
// ink fill. Use a real <button> with aria-pressed (toggle) or render a link
// via `chipClasses()`. Counts go in a `ChipCount` (faint mono).

function chipClasses(className?: string) {
  return cn(
    "inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border-strong bg-card px-3.5 text-sm font-medium whitespace-nowrap text-foreground-secondary transition-[color,background-color,border-color,transform] duration-120 ease-out select-none hover:border-foreground-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-safe:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background data-[pressed=true]:border-foreground data-[pressed=true]:bg-foreground data-[pressed=true]:text-background [&_svg]:size-3.5 [&_svg]:shrink-0",
    className
  )
}

function Chip({
  className,
  pressed,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & { pressed?: boolean }) {
  return (
    <button
      type={type}
      data-slot="chip"
      aria-pressed={pressed}
      className={chipClasses(className)}
      {...props}
    />
  )
}

function ChipCount({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="chip-count"
      className={cn("font-mono text-xs tabular-nums opacity-80", className)}
      {...props}
    />
  )
}

export { Chip, ChipCount, chipClasses }
