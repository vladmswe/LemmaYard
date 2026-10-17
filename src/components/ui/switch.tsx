"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "cn"

// On/off setting (docs/specs/rooms.md §7.4, themed per DESIGN.md): the track
// uses the form-field border (3:1) when off and the primary when on; the
// thumb moves with transform only. The visible text label is the caller's
// `<label>`; the 24px control gets a 40px hit area.
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-input bg-muted p-0.5 transition-colors duration-120 after:absolute after:-inset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-checked:border-primary data-checked:bg-primary data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="block size-[1.125rem] rounded-full bg-card shadow-xs ring-1 ring-border-strong transition-transform duration-120 ease-out data-checked:translate-x-5 data-checked:ring-transparent"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
