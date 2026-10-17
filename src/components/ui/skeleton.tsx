import { cn } from "cn"

// Loading placeholder (DESIGN.md §8.12) with a transform-only shimmer
// (static under reduced motion). Wrap groups in `aria-busy` + sr-only text.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("skeleton-shimmer rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
