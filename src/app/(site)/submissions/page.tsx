import { HistoryIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PageHead } from "@/components/page-head";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Submissions · LemmaYard" };

// Placeholder until submission history lands in M6: page head is final, the
// table replaces the empty state.
export default async function SubmissionsPage() {
  const user = await requireUser("/submissions");

  return (
    <>
      <PageHead
        crumbs={[{ label: "Home", href: "/" }, { label: "Submissions" }]}
        title="Submissions"
        subtitle="Your submitted solutions, newest first."
      />
      <div className="container-page py-8">
        <EmptyState
          icon={HistoryIcon}
          title="No submissions yet"
          action={
            <Link href="/problems" className={buttonVariants()}>
              Browse problems
            </Link>
          }
        >
          Submission history for {user.username} will appear here.
        </EmptyState>
      </div>
    </>
  );
}
