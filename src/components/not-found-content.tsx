import Link from "next/link";
import type { ReactNode } from "react";

import { CurrentPath } from "@/components/current-path";
import { StatusPage } from "@/components/status-page";
import { buttonVariants } from "@/components/ui/button";

/** Tab title of every 404 (not-found pages and `generateMetadata` of dynamic routes). */
export const NOT_FOUND_TITLE = "Page not found · LemmaYard";

/**
 * 404 body (DESIGN.md §13.11), shared by the root and route-group not-found
 * pages: a dashed ∎, "This page is not proven yet." and the missing path.
 * `title` / `lead` / `actions` override the defaults (e.g. a missing lesson).
 */
export function NotFoundContent({
  title,
  lead,
  actions,
}: {
  title?: string;
  lead?: ReactNode;
  actions?: ReactNode;
} = {}) {
  return (
    <StatusPage
      eyebrow="404 · Not found"
      title={title ?? "This page is not proven yet."}
      lead={
        lead ?? (
          <>
            We couldn&apos;t find <CurrentPath fallback="that page" />. The problem or page may
            have moved, or the link is incorrect.
          </>
        )
      }
      actions={
        actions ?? (
          <>
            <Link href="/problems" className={buttonVariants()}>
              Go to problems
            </Link>
            <Link href="/" className={buttonVariants({ variant: "secondary" })}>
              Home
            </Link>
          </>
        )
      }
    />
  );
}
