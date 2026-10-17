import type { Metadata, Viewport } from "next";

import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import { fontMono, fontSans, fontSerif } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "leetcopy",
  description: "Practice coding problems with an in-browser editor and judge.",
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
// `(workspace)` = header only, full height (problem page).
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
            <SiteHeader />
            <main className="flex flex-1 flex-col">{children}</main>
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
