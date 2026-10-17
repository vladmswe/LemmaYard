import * as React from "react"
import { cn } from "cn"

// Dense data table (DESIGN.md §8.5). Rows 48px; `density="compact"` = 40px.
// Zebra + hover tint; numbers right-aligned with `TableCell numeric`.
function Table({
  className,
  density = "default",
  containerClassName,
  ...props
}: React.ComponentProps<"table"> & {
  density?: "default" | "compact"
  containerClassName?: string
}) {
  return (
    <div
      data-slot="table-container"
      className={cn(
        "relative w-full overflow-x-auto rounded-lg border bg-card shadow-xs",
        containerClassName
      )}
    >
      <table
        data-slot="table"
        data-density={density}
        className={cn("group/table w-full caption-bottom border-collapse text-[0.9375rem] data-[density=compact]:text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn(className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn(
        "[&_tr:last-child]:border-0 [&>tr:hover]:bg-accent [&>tr:nth-child(even):not(:hover)]:bg-surface-sunken dark:[&>tr:nth-child(even):not(:hover)]:bg-white/[0.02]",
        className
      )}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t bg-surface-sunken font-medium", className)}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors duration-120",
        className
      )}
      {...props}
    />
  )
}

function TableHead({
  className,
  numeric = false,
  ...props
}: React.ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 border-b bg-surface-sunken px-4 text-left align-middle text-[0.78rem] font-semibold tracking-[0.04em] whitespace-nowrap text-muted-foreground uppercase",
        numeric && "text-right",
        className
      )}
      {...props}
    />
  )
}

function TableCell({
  className,
  numeric = false,
  ...props
}: React.ComponentProps<"td"> & { numeric?: boolean }) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "h-12 px-4 align-middle group-data-[density=compact]/table:h-10",
        numeric && "text-right tabular-nums",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

/** Title link inside a row: only the title is a link, never the whole row. */
function tableLinkClasses(className?: string) {
  return cn(
    "font-medium text-foreground underline-offset-4 hover:text-link hover:underline",
    className
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  tableLinkClasses,
}
