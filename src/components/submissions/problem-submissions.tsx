import { HistoryIcon, LogInIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { PROBLEM_TAB_LIMIT, submissionsHref } from "@/lib/submissions/history";
import { getProblemSubmissions } from "@/server/submissions/history";

import { SubmissionList } from "./submission-list";

/**
 * Problem page "Submissions" tab (AC-M6-3, DESIGN.md §9.4): the signed-in
 * user's latest submits for this problem, each linking to its page. A server
 * component: the workspace's `router.refresh()` after a finished Submit
 * re-renders it, so a new verdict shows up without a reload.
 */
export async function ProblemSubmissions({ slug, userId }: { slug: string; userId: string | null }) {
  if (!userId) {
    return (
      <EmptyState
        icon={LogInIcon}
        title="Log in to see your submissions"
        action={
          <Link href={`/login?next=${encodeURIComponent(`/problems/${slug}`)}`} className={buttonVariants()}>
            Log in
          </Link>
        }
      >
        Your submitted solutions for this problem are listed here with their verdicts.
      </EmptyState>
    );
  }

  const rows = await getProblemSubmissions({ userId, slug });
  if (rows.length === 0) {
    return (
      <EmptyState icon={HistoryIcon} title="No submissions yet">
        Submit a solution and it will be listed here with its verdict.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4" data-testid="problem-submissions">
      {/* Below md the list sits under the description, where the tab label is not visible. */}
      <h2 className="text-[1.0625rem]/6 font-semibold md:sr-only">Your submissions</h2>
      <SubmissionList rows={rows} now={new Date()} showProblem={false} caption="Your submissions for this problem" />
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span className="tabular-nums">
          {rows.length >= PROBLEM_TAB_LIMIT ? `Latest ${PROBLEM_TAB_LIMIT}` : `${rows.length} ${rows.length === 1 ? "submission" : "submissions"}`}
        </span>
        <Link href={submissionsHref({ problem: slug })} className="inline-flex min-h-10 items-center font-medium text-link underline-offset-4 hover:underline">
          View all
        </Link>
      </div>
    </div>
  );
}
