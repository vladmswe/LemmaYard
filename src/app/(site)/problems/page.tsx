import { LibraryIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PageHead } from "@/components/page-head";
import { buttonVariants } from "@/components/ui/button";
import { getCatalogStats } from "@/server/landing";

export const metadata: Metadata = { title: "Problems · LemmaYard" };

// Placeholder until the catalog lands in M3: page head is final, the body
// (filters, table, pagination) replaces the empty state.
export default async function ProblemsPage() {
  const stats = await getCatalogStats();

  return (
    <>
      <PageHead
        crumbs={[{ label: "Home", href: "/" }, { label: "Problems" }]}
        title="Problems"
        subtitle={
          <span className="tabular-nums">
            {stats.total} {stats.total === 1 ? "problem" : "problems"} · Python 3 and JavaScript
          </span>
        }
      />
      <div className="container-page py-8">
        <EmptyState
          icon={LibraryIcon}
          title="The problem catalog is coming soon"
          action={
            <Link href="/" className={buttonVariants({ variant: "secondary" })}>
              Go home
            </Link>
          }
        >
          Search, filters and the full list of problems will appear here.
        </EmptyState>
      </div>
    </>
  );
}
