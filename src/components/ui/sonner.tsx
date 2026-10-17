"use client"

import { useAppliedTheme } from "@/components/theme-provider"
import { useSyncExternalStore } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

import { QedLoader } from "@/components/brand/qed-loader"
import {
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
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
  const resolvedTheme = useAppliedTheme()
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
          <QedLoader className="text-primary" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "14px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast font-sans text-sm shadow-lg",
          title: "text-[0.90625rem] font-semibold",
          description: "text-[0.84375rem] text-muted-foreground!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
