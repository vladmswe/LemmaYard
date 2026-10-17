import type { Metadata, Viewport } from "next";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import { fontMono, fontSans, fontSerif } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "LemmaYard",
  description:
    "LemmaYard is a practice platform for algorithms and data structures: problems, an in-browser editor, a sandboxed judge in Python and JavaScript, and guided learning.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0e1a38" },
    { media: "(prefers-color-scheme: dark)", color: "#091124" },
  ],
};

// Page chrome lives in the route-group layouts: `(site)` = header + footer,
// `(workspace)` = compact header only, full height (problem page, M3).
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontSerif.variable} ${fontMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider delay={400}>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
