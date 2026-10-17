"use client"

import * as React from "react"
import { cn } from "cn"

// DESIGN.md §12 (v2) segmented control: sunken track, pill thumb with e2.
// A group of toggle buttons (aria-pressed), one selected. Arrow keys move
// between options (roving tabindex), like a radio group.

type SegmentedOption<T extends string> = { value: T; label: React.ReactNode }

type SegmentedProps<T extends string> = {
  options: readonly SegmentedOption<T>[]
  value: T
  onValueChange: (value: T) => void
  /** Accessible name of the group (required: the options alone are ambiguous). */
  label: string
  className?: string
  size?: "sm" | "default"
}

function Segmented<T extends string>({
  options,
  value,
  onValueChange,
  label,
  className,
  size = "default",
}: SegmentedProps<T>) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([])
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = (i + delta + options.length) % options.length
    onValueChange(options[next].value)
    refs.current[next]?.focus()
  }
  return (
    <div
      role="group"
      aria-label={label}
      data-slot="segmented"
      className={cn(
        "inline-flex rounded-full border border-border bg-surface-sunken p-[3px]",
        className
      )}
    >
      {options.map((o, i) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            aria-pressed={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-[color,background-color,box-shadow] duration-200 ease-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-md dark:aria-pressed:bg-popover",
              size === "sm" ? "h-7" : "h-8"
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export { Segmented, type SegmentedOption }
