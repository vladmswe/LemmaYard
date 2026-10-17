import * as React from "react"
import { cn } from "cn"

import { fieldClasses } from "@/components/ui/input"

// Same states as Input. For JSON test input add `font-mono text-sm`.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldClasses, "flex field-sizing-content min-h-28 px-3 py-2", className)}
      {...props}
    />
  )
}

export { Textarea }
