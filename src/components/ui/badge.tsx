import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// DESIGN.md §12 (v2): 24px pill, 12.5px 600, icon 13px. Verdict and difficulty colors come from the dictionaries in
// `components/judge/verdict.ts` / `components/problems/difficulty.ts` and are
// passed in via className (`variant="status"`), never built from strings.
const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 text-[0.78rem] font-semibold whitespace-nowrap transition-colors duration-120 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&>svg]:pointer-events-none [&>svg]:size-[13px]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary-hover",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-blue-200 dark:[a]:hover:bg-[#22337a]",
        outline: "border-border-strong font-medium text-foreground-secondary",
        // Topic tag: square-ish, muted.
        tag: "rounded-sm border-border bg-surface-sunken px-[9px] font-medium text-foreground-secondary [a]:hover:bg-secondary [a]:hover:text-secondary-foreground",
        // Colors supplied by a status dictionary through className.
        status: "",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
