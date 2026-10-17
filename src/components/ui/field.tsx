import * as React from "react"
import { cn } from "cn"
import { CircleAlertIcon } from "lucide-react"

// Field layout helpers (DESIGN.md §8.2): label-to-input gap 6px, help and
// error text linked to the control via aria-describedby by the caller.

function Field({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  )
}

function FieldHelp({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-help"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

/** Field-level error. Not a live region; link it with aria-describedby. */
function FieldError({
  className,
  children,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-error"
      className={cn(
        "flex gap-1.5 text-sm text-danger motion-safe:animate-enter-up [--motion-distance:-4px]",
        className
      )}
      {...props}
    >
      <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

export { Field, FieldHelp, FieldError }
