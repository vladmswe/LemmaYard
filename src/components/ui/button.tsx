import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"


// DESIGN.md §12 (v2 "Proof"): pills. Hover darkens (120 ms), a trailing
// `data-arrow` icon nudges 3px, press scales to 0.97 (transform only, off
// under reduced motion). Focus = 2px ring outline + 2px offset.
const buttonVariantsRaw = cva(
  "group/button relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full border border-transparent bg-clip-padding font-semibold whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-120 ease-out select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-safe:active:not-aria-[haspopup]:not-disabled:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-invalid:border-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg[data-arrow]]:transition-transform [&_svg[data-arrow]]:duration-200 motion-safe:hover:[&_svg[data-arrow]]:translate-x-[3px]",
  {
    variants: {
      variant: {
        // primary: inset top highlight plus a coloured shadow.
        default:
          "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.18),var(--primary-glow)] hover:bg-primary-hover active:bg-primary-active aria-expanded:bg-primary-hover",
        secondary:
          "border-border-strong bg-card text-foreground hover:border-foreground-secondary active:bg-surface-sunken aria-expanded:border-foreground-secondary",
        // `outline` is kept as an alias of the bordered `secondary`.
        outline:
          "border-border-strong bg-card text-foreground hover:border-foreground-secondary active:bg-surface-sunken aria-expanded:border-foreground-secondary",
        soft: "bg-secondary text-secondary-foreground hover:bg-blue-200 active:bg-blue-300 dark:hover:bg-[#22337a] dark:active:bg-[#2a3d8c]",
        ghost:
          "font-medium text-foreground-secondary hover:bg-surface-sunken hover:text-foreground aria-expanded:bg-surface-sunken aria-expanded:text-foreground dark:hover:bg-white/[0.06] dark:aria-expanded:bg-white/[0.06]",
        // On cobalt / night blocks: white pill, cobalt text.
        invert: "bg-on-cobalt text-cobalt hover:bg-blue-50 active:bg-blue-100",
        // On night blocks: transparent with a night-line border.
        night:
          "border-night-line text-on-night hover:border-on-night-2 hover:bg-white/5 active:bg-white/10",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive-hover",
        link: "h-auto! rounded-sm px-0! font-medium text-link underline-offset-4 hover:underline",
        // v1 masthead variants, kept for compatibility: the header is paper now.
        header:
          "font-medium text-foreground-secondary hover:bg-surface-sunken hover:text-foreground aria-expanded:bg-surface-sunken aria-expanded:text-foreground dark:hover:bg-white/[0.06] dark:aria-expanded:bg-white/[0.06]",
        "header-solid":
          "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.18),var(--primary-glow)] hover:bg-primary-hover active:bg-primary-active",
      },
      size: {
        sm: "h-[34px] px-3.5 text-sm",
        default: "h-11 px-5 text-[0.9375rem]",
        lg: "h-13 px-6 text-base",
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

/**
 * Class string for a button look (also for links: `className={buttonVariants()}`).
 * Merged with `cn` so variant classes override the base (e.g. border color);
 * raw cva output would leave both and CSS order would decide.
 * Variants: default (primary), secondary/outline, soft, ghost, invert, night,
 * destructive, link. Put `data-arrow` on a trailing arrow icon to nudge it.
 */
function buttonVariants(
  props?: VariantProps<typeof buttonVariantsRaw> & { className?: string }
) {
  const { className, ...variants } = props ?? {}
  return cn(buttonVariantsRaw(variants), className)
}

type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariantsRaw> & {
    /** Shows a ring spinner in place of the leading icon (label kept, no width jump) and disables the button. */
    loading?: boolean
  }

/**
 * Small ring spinner for in-button loading (a recognisable "busy" glyph at 14 px;
 * the ∎ loader stays for page-level and result loading). Under reduced motion the
 * global rule stops the rotation and the open ring remains as a static glyph.
 */
function ButtonSpinner() {
  return (
    <span
      aria-hidden
      data-loader
      className="inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  )
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
      className={(state) =>
        cn(
          buttonVariantsRaw({ variant, size }),
          loading && "[&_svg]:hidden",
          typeof className === "function" ? className(state) : className
        )
      }
      {...props}
    >
      {loading && <ButtonSpinner />}
      {children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
