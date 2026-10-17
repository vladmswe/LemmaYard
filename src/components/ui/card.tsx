import * as React from "react"
import { cn } from "cn"

// DESIGN.md §9/§12 (v2): surface, 1px line, radius 20, e1; 24px padding
// (16 for sm). `interactive` (whole card is a link) lifts 3px with e2.
// `variant="cobalt" | "night"`: colour blocks (radius 28, grain).
function Card({
  className,
  size = "default",
  interactive = false,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & {
  size?: "default" | "sm"
  interactive?: boolean
  variant?: "default" | "cobalt" | "night"
}) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-variant={variant}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl border py-(--card-spacing) [--card-spacing:--spacing(6)] has-data-[slot=card-footer]:pb-0 data-[size=sm]:[--card-spacing:--spacing(4)]",
        variant === "default" && "border-border bg-card text-card-foreground shadow-sm",
        variant === "cobalt" && "on-cobalt grain rounded-2xl border-transparent",
        variant === "night" && "on-night grain rounded-2xl border-transparent",
        interactive &&
          "transition-[border-color,box-shadow,transform] duration-200 ease-out hover:border-border-strong hover:shadow-md motion-safe:hover:-translate-y-[3px]",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-sans text-lg/7 font-semibold group-data-[size=sm]/card:text-base",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-[0.9375rem] text-muted-foreground group-data-[variant=cobalt]/card:text-on-cobalt-2 group-data-[variant=night]/card:text-on-night-2", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center border-t bg-surface-sunken px-(--card-spacing) py-4 group-data-[variant=cobalt]/card:border-cobalt-line/40 group-data-[variant=cobalt]/card:bg-transparent group-data-[variant=night]/card:border-night-line group-data-[variant=night]/card:bg-transparent",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
