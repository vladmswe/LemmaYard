import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { LoaderCircleIcon } from "lucide-react"

// DESIGN.md §8.1. Focus = 2px ring outline; hover/press change colors
// (120 ms) and press scales by 2% (transform only, off under reduced motion).
const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border border-transparent bg-clip-padding font-semibold whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-120 ease-out outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-safe:active:not-aria-[haspopup]:not-disabled:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-invalid:border-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover active:bg-primary-active aria-expanded:bg-primary-hover",
        secondary:
          "border-border-strong bg-card text-foreground shadow-xs hover:border-input hover:bg-accent active:bg-secondary aria-expanded:bg-accent",
        // `outline` is kept as an alias of the bordered `secondary`.
        outline:
          "border-border-strong bg-card text-foreground shadow-xs hover:border-input hover:bg-accent active:bg-secondary aria-expanded:bg-accent",
        soft: "bg-secondary text-secondary-foreground hover:bg-blue-200 dark:hover:bg-[#24385f]",
        ghost:
          "font-medium text-foreground-secondary hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive-hover",
        link: "h-auto! px-0! font-medium text-link underline-offset-4 hover:underline",
        // For the navy masthead (both themes).
        header:
          "font-medium text-header-foreground hover:bg-white/10 aria-expanded:bg-white/10",
        "header-solid":
          "bg-white text-blue-800 hover:bg-blue-50 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary-hover",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        default: "h-10 px-4 text-[0.9375rem]",
        lg: "h-12 px-[22px] text-base",
        icon: "size-10",
        "icon-sm": "size-8 after:absolute after:-inset-1",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    /** Shows a spinner in place of the leading icon and disables the button. */
    loading?: boolean
  }

function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(
        buttonVariants({ variant, size, className }),
        loading && "[&_svg:not([data-spinner])]:hidden"
      )}
      {...props}
    >
      {loading && (
        <LoaderCircleIcon
          data-spinner
          aria-hidden
          className="animate-spin-slow"
        />
      )}
      {children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
