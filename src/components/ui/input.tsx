import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

// DESIGN.md §8.2. The border change on focus carries the 3:1 contrast;
// the soft ring is decoration. aria-invalid switches to the danger color.
const fieldClasses =
  "w-full min-w-0 rounded-md border border-input bg-card text-[0.9375rem] text-foreground transition-[border-color,box-shadow] duration-120 ease-out outline-none placeholder:text-faint-foreground hover:border-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-danger aria-invalid:ring-2 aria-invalid:ring-danger/20"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        fieldClasses,
        "h-10 px-3 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Input, fieldClasses }
