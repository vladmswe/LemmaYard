import { HistoryIcon, SearchXIcon, XIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/empty-state";
import { PageHead } from "@/components/page-head";
import { Pagination } from "@/components/pagination";
import { SubmissionList } from "@/components/submissions/submission-list";
import { SubmissionsSkeleton } from "@/components/submissions/submissions-skeleton";
import { buttonVariants } from "@/components/ui/button";
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
        crumbs={[{ label: "Home", href: "/" }, { label: "Submissions" }]}
        title="Submissions"
        subtitle="Your submitted solutions, newest first."
      />
      <div className="container-page py-8">
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
        // Same chip as the catalog filters (DESIGN.md §8.4): the whole chip removes the filter.
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtered by</span>
          <Link
            href={submissionsHref()}
            aria-label={`Remove filter: ${filter.title ?? filter.slug}`}
            data-testid="problem-filter-chip"
            className="inline-flex h-7 max-w-full items-center gap-1 rounded-full bg-secondary pr-1.5 pl-2.5 text-[0.8125rem] font-semibold text-secondary-foreground transition-colors duration-120 hover:bg-blue-200 dark:hover:bg-[#24385f]"
          >
            <span className="truncate">{filter.title ?? filter.slug}</span>
            <XIcon aria-hidden className="size-3.5 shrink-0" />
          </Link>
        </div>
      )}
      <HistoryBody data={data} now={now} />
    </div>
  );
}

function HistoryBody({ data, now }: { data: Awaited<ReturnType<typeof getSubmissionHistory>>; now: Date }) {
  const filter = data.filter;
  if (data.rows.length === 0) {
    if (data.total > 0) {
      return (
        <Panel>
          <EmptyState
            icon={SearchXIcon}
            title="This page is empty"
            action={
              <Link href={submissionsHref({ problem: filter?.slug })} className={buttonVariants({ variant: "secondary" })}>
                Go to the first page
              </Link>
            }
          >
            {`There ${data.total === 1 ? "is only 1 submission" : `are only ${data.total} submissions`} here.`}
          </EmptyState>
        </Panel>
      );
    }
    if (filter && filter.title === null) {
      return (
        <Panel>
          <EmptyState
            icon={SearchXIcon}
            title="No such problem"
            action={
              <Link href={submissionsHref()} className={buttonVariants({ variant: "secondary" })}>
                Show all submissions
              </Link>
            }
          >
            There is no problem with this address, so there are no submissions to show.
          </EmptyState>
        </Panel>
      );
    }
    if (filter) {
      return (
        <Panel>
          <EmptyState
            icon={HistoryIcon}
            title="No submissions for this problem yet"
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
        </Panel>
      );
    }
    return (
      <Panel>
        <EmptyState
          icon={HistoryIcon}
          title="No submissions yet"
          action={
            <Link href="/problems" className={buttonVariants()}>
              Browse problems
            </Link>
          }
        >
          Every solution you submit is listed here with its verdict, runtime and memory.
        </EmptyState>
      </Panel>
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

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border bg-card shadow-xs">{children}</div>;
}
