"use client";

import { CircleAlertIcon, RotateCcwIcon } from "lucide-react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";

// Route error boundary for (site) pages (DESIGN.md §9.8): no stack traces,
// only the digest so a report can be matched to server logs.
export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container-page flex flex-1 items-center justify-center py-20">
      <div
        role="alert"
        className="reveal w-full max-w-md rounded-lg border border-danger/30 bg-card p-6 shadow-sm"
      >
        <div className="flex gap-3">
          <CircleAlertIcon aria-hidden className="mt-1 size-5 shrink-0 text-danger" />
          <div className="min-w-0">
            <h1 className="font-heading text-2xl/8 font-semibold">Something went wrong</h1>
            <p className="mt-2 text-foreground-secondary">
              The page could not be loaded. Try again, or go back to the home page.
            </p>
            {error.digest && (
              <p className="mt-3 font-mono text-xs break-all text-muted-foreground">
                Error ID: {error.digest}
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <Button variant="secondary" onClick={reset}>
                <RotateCcwIcon aria-hidden />
                Try again
              </Button>
              <Link href="/" className={buttonVariants({ variant: "ghost" })}>
                Go home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
