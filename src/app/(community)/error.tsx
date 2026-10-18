"use client";

import { RotateCcwIcon } from "lucide-react";
import Link from "next/link";

import { StatusPage } from "@/components/status-page";
import { Button, buttonVariants } from "@/components/ui/button";

// Route error boundary for (community) pages, same as (site) (DESIGN.md §13.11): no stack traces,
// only the digest so a report can be matched to server logs.
export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <StatusPage
      role="alert"
      tone="danger"
      eyebrow="Error"
      title="Something broke on our side."
      lead="The page could not be loaded. Try again, or go back to the home page."
      actions={
        <>
          <Button onClick={reset}>
            <RotateCcwIcon aria-hidden />
            Try again
          </Button>
          <Link href="/" className={buttonVariants({ variant: "secondary" })}>
            Home
          </Link>
        </>
      }
      footnote={error.digest ? `Error ID: ${error.digest}` : undefined}
    />
  );
}
