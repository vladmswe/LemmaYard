import { ArrowRightIcon, RotateCwIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { cn } from "cn";
import { z } from "zod";

import { VERDICTS } from "@/components/judge/verdict";
import { VerdictLabel } from "@/components/judge/verdict-badge";
import { squaresFromCounts, TestSquares } from "@/components/judge/test-squares";
import { Qed } from "@/components/brand/qed";
import { QedLoader } from "@/components/brand/qed-loader";
import { NOT_FOUND_TITLE } from "@/components/not-found-content";
import { PageHead } from "@/components/page-head";
import { InputBlock, TextBlock, Value } from "@/components/problem/console-result";
import { CodeViewer } from "@/components/submissions/code-viewer";
import { SubmitAgainLink } from "@/components/submissions/submit-again-button";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { isFinalStatus } from "@/lib/submission-dto";
import { shortId, SUBMISSIONS_PATH } from "@/lib/submissions/history";
import { formatMemory, formatMs, submissionView } from "@/lib/workspace/judge-state";
import { LANGUAGE_LABELS } from "@/lib/workspace/languages";
import { getCurrentUser, requireUser } from "@/server/auth/session";
import { getSubmissionDetail } from "@/server/submissions/history";

const idSchema = z.uuid();

// Deduped per request: generateMetadata and the page share one load.
const loadDetail = cache(async (id: string) => {
  const user = await getCurrentUser();
  if (!user) return null;
  return getSubmissionDetail({ userId: user.id, id });
});

export async function generateMetadata({ params }: PageProps<"/submissions/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return { title: NOT_FOUND_TITLE };
  if (!(await getCurrentUser())) return { title: "Submission · LemmaYard" };
  const detail = await loadDetail(id);
  if (!detail) return { title: NOT_FOUND_TITLE };
  const { submission } = detail;
  return { title: `${VERDICTS[submission.status].label} · ${submission.problem.title} · LemmaYard` };
}

/**
 * One of the signed-in user's own submits (AC-M6-2). Another user's id, an
 * unknown or malformed id and a Run (history is submits only) all render the
 * standard 404, never 403, so ids cannot be probed. Guests with a well-formed
 * id are sent to log in first.
 */
export default async function SubmissionPage({ params }: PageProps<"/submissions/[id]">) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  await requireUser(`${SUBMISSIONS_PATH}/${id}`);
  const detail = await loadDetail(id);
  if (!detail) notFound();

  const { submission, code, paramOrder, problemPublished } = detail;
  const short = shortId(submission.id);
  const problemHref = `/problems/${submission.problem.slug}`;
  const createdAt = new Date(submission.createdAt);
  const final = isFinalStatus(submission.status);
  const view = final ? submissionView(submission, paramOrder) : null;
  const meta = VERDICTS[submission.status];
  const showMetrics = final && submission.status !== "internal_error" && submission.status !== "compile_error";

  const squares =
    final && submission.totalCount > 0 && submission.status !== "compile_error" && submission.status !== "internal_error"
      ? squaresFromCounts(submission.passedCount, submission.totalCount, submission.status !== "accepted")
      : null;
  const failedAt = squares ? squares.indexOf("fail") : -1;

  return (
    <>
      <PageHead
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Submissions", href: SUBMISSIONS_PATH },
          { label: `${submission.problem.title} · ${short}` },
        ]}
        title={submission.problem.title}
        subtitle={
          <span className="font-mono text-sm text-muted-foreground">
            Submission {short} · <time dateTime={submission.createdAt}>{formatDateTime(createdAt)}</time>
          </span>
        }
      />
      <div className="container-page flex flex-col gap-6 pt-8 pb-14">
        {/* Two-column verdict head (DESIGN.md §13.6): verdict + meta | the full test strip. */}
        <section
          aria-labelledby="verdict-heading"
          data-testid="verdict-card"
          data-status={submission.status}
          className={cn("rounded-xl border border-l-4 bg-card p-5 shadow-sm sm:p-7", meta.edge)}
        >
          <div className="grid gap-6 min-[961px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] min-[961px]:items-start">
            <div className="flex min-w-0 flex-col gap-4">
              <h2 id="verdict-heading" className="flex items-center">
                <VerdictLabel status={submission.status} size="lg" />
                {submission.status === "accepted" && <Qed size={9} className="mb-1.5 ml-2 self-end" />}
              </h2>
              <p className="flex flex-wrap items-center gap-x-2 text-[0.9375rem]">
                {problemPublished ? (
                  <Link href={problemHref} className="font-semibold text-link underline-offset-4 hover:underline">
                    {submission.problem.title}
                  </Link>
                ) : (
                  <span className="font-semibold">{submission.problem.title}</span>
                )}
                <span aria-hidden className="text-muted-foreground">
                  ·
                </span>
                <span className="text-foreground-secondary">{LANGUAGE_LABELS[submission.language]}</span>
              </p>
              {showMetrics && (
                <dl className="flex flex-wrap gap-2" data-testid="submission-metrics">
                  <Metric label="Runtime" value={formatMs(submission.runtimeMs)} />
                  <Metric label="Memory" value={formatMemory(submission.memoryKb)} />
                  <Metric label="Tests" value={`${submission.passedCount} / ${submission.totalCount}`} />
                </dl>
              )}
            </div>

            {squares && (
              <div className="flex min-w-0 flex-col gap-3 min-[961px]:items-end min-[961px]:text-right">
                <p className="label-mono text-muted-foreground">
                  {submission.passedCount} / {submission.totalCount} passed
                  {failedAt >= 0 && view?.type === "submit" && view.failedOn ? ` · ${view.failedOn.toLowerCase()}` : ""}
                </p>
                <TestSquares results={squares} className="max-w-full gap-1 [&>i]:size-3" />
              </div>
            )}
          </div>

          {view?.explanation && <p className="mt-5 max-w-[72ch] text-[0.9375rem] text-foreground-secondary">{view.explanation}</p>}

          {!final && (
            <div className="mt-5 flex flex-col items-start gap-2.5">
              <p className="inline-flex items-center gap-2.5 text-sm text-foreground-secondary">
                <QedLoader className="size-3 text-verdict-running" />
                The judge is still working on this submission. Refresh the page to see the result.
              </p>
              {/* A full reload (not a soft navigation) re-reads the row. */}
              <a href={`${SUBMISSIONS_PATH}/${submission.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                <RotateCwIcon aria-hidden />
                Refresh
              </a>
            </div>
          )}

          {problemPublished && (
            <div className="mt-6 flex flex-wrap gap-2 border-t pt-5">
              <Link href={problemHref} className={buttonVariants({ variant: "default", className: "max-sm:flex-1" })}>
                Open problem
                <ArrowRightIcon aria-hidden data-arrow />
              </Link>
            </div>
          )}
        </section>

        {view?.type === "submit" && (view.failedCase || view.error || view.stdout) && (
          <section aria-labelledby="details-heading" className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm sm:p-7">
            <h2 id="details-heading" className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-lg/7 font-semibold">
              {view.failedCase ? "Failed case" : view.error ? (submission.status === "compile_error" ? "Compile error" : "Error") : "Output"}
              {view.failedCase && view.failedOn && (
                <span className="font-mono text-[0.8125rem] font-normal text-muted-foreground tabular-nums">{view.failedOn}</span>
              )}
            </h2>
            {view.failedCase && (
              <div className="flex flex-col gap-3" data-testid="failed-case">
                <InputBlock input={view.failedCase.input} />
                <div className="grid gap-3 min-[520px]:grid-cols-2">
                  <Value label="Expected" value={view.failedCase.expected} testId="failed-expected" />
                  <Value label="Your output" value={view.failedCase.output} wrong testId="failed-output" />
                </div>
              </div>
            )}
            {view.error && (
              <TextBlock
                // The section heading already names it, unless a failed case comes first.
                label={view.failedCase ? (submission.status === "compile_error" ? "Compile error" : "Error") : undefined}
                text={view.error}
                tone={submission.status === "compile_error" ? "compile" : "runtime"}
              />
            )}
            {view.stdout && <TextBlock label="Stdout" text={view.stdout} />}
          </section>
        )}

        <CodeViewer
          id={submission.id}
          language={submission.language}
          code={code}
          actions={
            problemPublished ? (
              <SubmitAgainLink slug={submission.problem.slug} language={submission.language} code={code} />
            ) : undefined
          }
        />
      </div>
    </>
  );
}

/** Mono meta chip: "RUNTIME 41 ms". */
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex h-8 items-center gap-2 rounded-full border border-border-strong px-3 font-mono text-[0.8125rem]">
      <dt className="label-mono text-[0.6875rem] text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", value === "—" ? "text-muted-foreground" : "text-foreground")}>{value}</dd>
    </div>
  );
}
