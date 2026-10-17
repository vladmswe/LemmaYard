import { ArrowRightIcon, RotateCwIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { cn } from "cn";
import { z } from "zod";

import { VERDICTS } from "@/components/judge/verdict";
import { VerdictLabel } from "@/components/judge/verdict-badge";
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

  return (
    <>
      <PageHead
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Submissions", href: SUBMISSIONS_PATH },
          { label: `${submission.problem.title} · ${short}` },
        ]}
        title={submission.problem.title}
        subtitle={`Submission ${short}`}
      />
      <div className="container-page flex flex-col gap-6 py-8">
        <section
          aria-labelledby="verdict-heading"
          data-testid="verdict-card"
          data-status={submission.status}
          className={cn("rounded-lg border border-l-4 bg-card p-4 shadow-xs sm:p-6", meta.edge)}
        >
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <h2 id="verdict-heading">
                <VerdictLabel status={submission.status} className="text-[1.75rem]/9" />
              </h2>
              <p className="text-sm text-muted-foreground tabular-nums">
                Submitted{" "}
                <time dateTime={submission.createdAt}>{formatDateTime(createdAt)}</time>
              </p>
            </div>
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
          </div>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
            {showMetrics ? (
              <dl className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:flex-wrap">
                <Metric label="Runtime" value={formatMs(submission.runtimeMs)} />
                <Metric label="Memory" value={formatMemory(submission.memoryKb)} />
                <Metric label="Tests passed" value={`${submission.passedCount} / ${submission.totalCount}`} />
              </dl>
            ) : (
              <span />
            )}
            {problemPublished && (
              <div className="flex w-full gap-2 sm:w-auto">
                <SubmitAgainLink
                  slug={submission.problem.slug}
                  language={submission.language}
                  code={code}
                  className="flex-1 sm:flex-none"
                />
                <Link href={problemHref} className={buttonVariants({ variant: "default", className: "flex-1 sm:flex-none" })}>
                  Open problem
                  <ArrowRightIcon aria-hidden />
                </Link>
              </div>
            )}
          </div>

          {!final && (
            <div className="mt-5 flex flex-col items-start gap-2">
              <p className="text-sm text-foreground-secondary">
                The judge is still working on this submission. Refresh the page to see the result.
              </p>
              {/* A full reload (not a soft navigation) re-reads the row. */}
              <a href={`${SUBMISSIONS_PATH}/${submission.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                <RotateCwIcon aria-hidden />
                Refresh
              </a>
            </div>
          )}
          {view?.explanation && <p className="mt-5 text-sm text-foreground-secondary">{view.explanation}</p>}
        </section>

        {view?.type === "submit" && (view.failedCase || view.error || view.stdout) && (
          <section aria-labelledby="details-heading" className="flex flex-col gap-4 rounded-lg border bg-card p-4 shadow-xs sm:p-6">
            <h2 id="details-heading" className="text-[1.0625rem]/6 font-semibold">
              {view.failedCase ? "Failed case" : view.error ? (submission.status === "compile_error" ? "Compile error" : "Error") : "Output"}
              {view.failedCase && view.failedOn && (
                <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">{view.failedOn}</span>
              )}
            </h2>
            {view.failedCase && (
              <div className="flex flex-col gap-3" data-testid="failed-case">
                <InputBlock input={view.failedCase.input} />
                <div className="grid gap-3 min-[520px]:grid-cols-2">
                  <Value label="Output" value={view.failedCase.output} wrong testId="failed-output" />
                  <Value label="Expected" value={view.failedCase.expected} testId="failed-expected" />
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

        <CodeViewer id={submission.id} language={submission.language} code={code} />
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border bg-surface-sunken p-3 sm:min-w-32">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold text-foreground tabular-nums">{value}</dd>
    </div>
  );
}
