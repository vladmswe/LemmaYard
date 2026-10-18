"use client";

import type { CSSProperties } from "react";

// Last-resort error boundary: shown when the root layout itself fails. It
// replaces that layout, so it renders its own <html>/<body> and depends on no
// provider, font or stylesheet. Inline styles only (the CSP allows inline
// styles, not external resources); the colours are the dark theme tokens of
// globals.css, since the site is dark only (src/lib/theme-config.ts). No stack
// trace or message: only the digest, to match a report with the server logs.

const COLORS = {
  background: "#060b1c",
  foreground: "#ebf0ff",
  muted: "#9ca9cc",
  primary: "#8da8ff",
  primaryForeground: "#07102f",
  border: "#1f2c55",
  ring: "#a9beff",
} as const;

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const styles = {
  body: {
    margin: 0,
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 16px",
    boxSizing: "border-box",
    background: COLORS.background,
    color: COLORS.foreground,
    fontFamily: FONT,
    lineHeight: 1.5,
  },
  main: { maxWidth: 480, width: "100%" },
  eyebrow: { margin: 0, fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.muted },
  title: { margin: "8px 0 12px", fontSize: 28, lineHeight: 1.2, fontWeight: 600 },
  lead: { margin: "0 0 24px", fontSize: 16, color: COLORS.muted },
  actions: { display: "flex", flexWrap: "wrap", gap: 12 },
  button: {
    font: "inherit",
    fontSize: 15,
    fontWeight: 600,
    padding: "10px 18px",
    minHeight: 44,
    borderRadius: 8,
    border: `1px solid ${COLORS.primary}`,
    background: COLORS.primary,
    color: COLORS.primaryForeground,
    cursor: "pointer",
  },
  link: {
    display: "inline-flex",
    alignItems: "center",
    fontSize: 15,
    fontWeight: 600,
    padding: "10px 18px",
    minHeight: 44,
    boxSizing: "border-box",
    borderRadius: 8,
    border: `1px solid ${COLORS.border}`,
    color: COLORS.foreground,
    textDecoration: "none",
  },
  footnote: { margin: "24px 0 0", fontSize: 13, color: COLORS.muted, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
} satisfies Record<string, CSSProperties>;

// Visible keyboard focus without a stylesheet.
const FOCUS_CSS = `.ge-focus:focus-visible{outline:2px solid ${COLORS.ring};outline-offset:2px}`;

function digestOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("digest" in error)) return undefined;
  const { digest } = error as { digest?: unknown };
  return typeof digest === "string" && digest !== "" ? digest : undefined;
}

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = digestOf(error);
  return (
    <html lang="en" className="dark" style={{ colorScheme: "dark", background: COLORS.background }}>
      <head>
        <title>Error | LemmaYard</title>
        <meta name="robots" content="noindex" />
        <style>{FOCUS_CSS}</style>
      </head>
      <body style={styles.body}>
        <main role="alert" style={styles.main}>
          <p style={styles.eyebrow}>Error</p>
          <h1 style={styles.title}>Something broke on our side.</h1>
          <p style={styles.lead}>LemmaYard could not load this page. Try again, or go back to the home page.</p>
          <div style={styles.actions}>
            <button type="button" className="ge-focus" style={styles.button} onClick={() => retry()}>
              Try again
            </button>
            {/* A plain link on purpose: a full page load gets a fresh root layout. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="ge-focus" style={styles.link}>
              Home
            </a>
          </div>
          {digest ? <p style={styles.footnote}>Error ID: {digest}</p> : null}
        </main>
      </body>
    </html>
  );
}
