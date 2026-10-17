"use client"

import { useTheme } from "next-themes"
import { useSyncExternalStore } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import {
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
} from "lucide-react"

const MOBILE = "(max-width: 767px)"

function subscribeMobile(onChange: () => void) {
  const mql = window.matchMedia(MOBILE)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

// Toasts (DESIGN.md §8.10): rate limits, network errors, "Code reset", and
// other people's room events on the problem page (§9.9). Never used for
// verdicts; those live in the console. Bottom-right on desktop, top-center
// on mobile, where the problem page's Run/Submit bar is at the bottom.
const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()
  const mobile = useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia(MOBILE).matches,
    () => false
  )

  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position={mobile ? "top-center" : "bottom-right"}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" />,
        info: <InfoIcon className="size-4 text-info" />,
        warning: <TriangleAlertIcon className="size-4 text-warning" />,
        error: <CircleAlertIcon className="size-4 text-danger" />,
        loading: (
          <LoaderCircleIcon className="size-4 animate-spin-slow text-muted-foreground" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast font-sans text-sm shadow-md",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
