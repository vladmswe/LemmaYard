"use client";

import { RotateCcwIcon } from "lucide-react";
import Link from "next/link";

import { StatusPage } from "@/components/status-page";
import { Button, buttonVariants } from "@/components/ui/button";

// Route error boundary of the workspace group (problem page): the same
// status page as (site)/error.tsx, scrolling inside the full-height main.
export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background">
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
    </div>
  );
}
