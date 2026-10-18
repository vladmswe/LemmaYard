import type { Metadata, Viewport } from "next";

import { RevealObserver } from "@/components/motion/reveal-observer";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { forcedTheme } from "@/lib/theme-config";

import { fontDisplay, fontMono, fontSans } from "./fonts";
import "./globals.css";

const DESCRIPTION =
  "LemmaYard is a practice platform for algorithms and data structures: problems, an in-browser editor, a sandboxed judge in Python, JavaScript and Java, and guided learning.";

// Icons come from the file conventions next to this layout (favicon.ico,
// icon.svg, apple-icon.png). Pages set their own title/description; the
// Open Graph defaults keep link previews branded.
export const metadata: Metadata = {
  title: "LemmaYard",
  description: DESCRIPTION,
  applicationName: "LemmaYard",
  openGraph: { siteName: "LemmaYard", type: "website", title: "LemmaYard", description: DESCRIPTION },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The page background (--background) of each theme.
  themeColor: forcedTheme
    ? "#060b1c"
    : [
        { media: "(prefers-color-scheme: light)", color: "#f4f6fb" },
        { media: "(prefers-color-scheme: dark)", color: "#060b1c" },
      ],
};

// Marks the document as JS-capable before first paint, so scroll reveals
// (`.js .rv`) hide content only when the script that shows it will run.
const JS_FLAG = "document.documentElement.classList.add('js')";

// Page chrome lives in the route-group layouts: `(site)` = header + footer,
// `(workspace)` = compact header only, full height (problem page).
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      // Forced theme (src/lib/theme-config.ts): the class is on the server
      // markup, so the first paint is already dark.
      style={forcedTheme ? { colorScheme: forcedTheme } : undefined}
      className={`${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable} h-full antialiased${forcedTheme ? ` ${forcedTheme}` : ""}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: JS_FLAG }} />
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme={forcedTheme ?? "system"}
          forcedTheme={forcedTheme}
          enableSystem={!forcedTheme}
          disableTransitionOnChange
        >
          <TooltipProvider delay={400}>
            {children}
            <Toaster />
          </TooltipProvider>
          <RevealObserver />
        </ThemeProvider>
      </body>
    </html>
  );
}
