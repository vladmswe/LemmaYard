import { XIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/empty-state";
import { PageHead } from "@/components/page-head";
import { Pagination } from "@/components/pagination";
import { SubmissionList } from "@/components/submissions/submission-list";
import { SubmissionsSkeleton } from "@/components/submissions/submissions-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { chipClasses } from "@/components/ui/chip";
import { parseHistoryParams, submissionsHref, type HistoryParams } from "@/lib/submissions/history";
import { requireUser } from "@/server/auth/session";
import { getEnv } from "@/server/env";
import { getSubmissionHistory } from "@/server/submissions/history";

export const metadata: Metadata = { title: "Submissions · LemmaYard" };

// History of the signed-in user's submits (AC-M6-1). Guests are redirected
// before anything streams (so no route-level loading.tsx, DESIGN.md §11.2);
// the list itself streams behind a skeleton. Budget per render: session (1)
// + history (1, one statement for rows, total and the filter title).
export default async function SubmissionsPage({ searchParams }: PageProps<"/submissions">) {
  const user = await requireUser("/submissions");
  const params = parseHistoryParams(await searchParams);

  return (
    <>
      <PageHead
        qed
        crumbs={[{ label: "Home", href: "/" }, { label: "Submissions" }]}
        title="Submissions"
        subtitle="Your submitted solutions, newest first: verdict, runtime, memory and every test."
      />
      <div className="container-page pt-8 pb-14">
        <Suspense key={`${params.problem ?? ""}:${params.page}`} fallback={<SubmissionsSkeleton />}>
          <History userId={user.id} params={params} />
        </Suspense>
      </div>
    </>
  );
}

async function History({ userId, params }: { userId: string; params: HistoryParams }) {
  const data = await getSubmissionHistory({
    userId,
    page: params.page,
    pageSize: getEnv().PAGE_SIZE,
    problemSlug: params.problem,
  });
  const now = new Date();
  const filter = data.filter;

  return (
    <div className="flex flex-col gap-5">
      {filter && (
        // A pressed filter chip (DESIGN.md §12): the whole chip removes the filter.
        <div className="flex flex-wrap items-center gap-2.5 text-sm">
          <span className="label-mono text-muted-foreground">Problem</span>
          <Link
            href={submissionsHref()}
            aria-label={`Remove filter: ${filter.title ?? filter.slug}`}
            data-testid="problem-filter-chip"
            data-pressed="true"
            // after: = 42px hit area around the 34px chip.
            className={chipClasses("relative max-w-full pr-2.5 after:absolute after:inset-x-0 after:-inset-y-1")}
          >
            <span className="truncate">{filter.title ?? filter.slug}</span>
            <XIcon aria-hidden />
          </Link>
          <span className="font-mono text-[0.8125rem] text-muted-foreground tabular-nums">
            {data.total} {data.total === 1 ? "submission" : "submissions"}
          </span>
        </div>
      )}
      <HistoryBody data={data} now={now} />
    </div>
  );
}

function HistoryBody({ data, now }: { data: Awaited<ReturnType<typeof getSubmissionHistory>>; now: Date }) {
  const filter = data.filter;
  if (data.rows.length === 0) {
    // Empty results are "unfinished proofs" (DESIGN.md §13.11): what you have, what you want.
    if (data.total > 0) {
      return (
        <EmptyState
          title="This page is empty"
          given={`page ${data.page}`}
          want={`one of ${data.total} submissions`}
          action={
            <Link href={submissionsHref({ problem: filter?.slug })} className={buttonVariants({ variant: "secondary" })}>
              Go to the first page
            </Link>
          }
        >
          {`There ${data.total === 1 ? "is only 1 submission" : `are only ${data.total} submissions`} here.`}
        </EmptyState>
      );
    }
    if (filter && filter.title === null) {
      return (
        <EmptyState
          title="No such problem"
          given={`problem “${filter.slug}”`}
          want="its submissions"
          action={
            <Link href={submissionsHref()} className={buttonVariants({ variant: "secondary" })}>
              Show all submissions
            </Link>
          }
        >
          There is no problem with this address, so there are no submissions to show.
        </EmptyState>
      );
    }
    if (filter) {
      return (
        <EmptyState
          title="No submissions for this problem yet"
          given={filter.title}
          want="a first submission"
          action={
            <>
              <Link href={`/problems/${filter.slug}`} className={buttonVariants()}>
                Open problem
              </Link>
              <Link href={submissionsHref()} className={buttonVariants({ variant: "secondary" })}>
                Show all submissions
              </Link>
            </>
          }
        >
          Submit a solution to {filter.title} and it will be listed here.
        </EmptyState>
      );
    }
    return (
      <EmptyState
        title="No submissions yet"
        given="an empty history"
        want="your first Accepted"
        action={
          <Link href="/problems" className={buttonVariants()}>
            Browse problems
          </Link>
        }
      >
        Every solution you submit is listed here with its verdict, runtime, memory and tests.
      </EmptyState>
    );
  }

  return (
    <div>
      <SubmissionList rows={data.rows} now={now} caption="Your submissions" />
      <Pagination
        className="mt-5"
        page={data.page}
        pageSize={data.pageSize}
        totalItems={data.total}
        hrefFor={(page) => submissionsHref({ page, problem: filter?.slug })}
      />
    </div>
  );
}
