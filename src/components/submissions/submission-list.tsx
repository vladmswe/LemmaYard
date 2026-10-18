import Link from "next/link";
import { cn } from "cn";

import { VERDICTS } from "@/components/judge/verdict";
import { VerdictBadge } from "@/components/judge/verdict-badge";
import { squaresFromCounts, TestSquares } from "@/components/judge/test-squares";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  tableLinkClasses,
} from "@/components/ui/table";
import { formatDateTime, formatRelativeTime, MISSING } from "@/lib/format";
import { formatMemory, formatMs } from "@/lib/workspace/judge-state";
import { LANGUAGE_LABELS } from "@/lib/workspace/languages";
import type { HistoryRow } from "@/server/submissions/history";

/** "3 min ago" with the absolute UTC time as title (DESIGN.md §13.6). */
export function RelativeTime({ date, now, className }: { date: Date; now: Date; className?: string }) {
  return (
    <time dateTime={date.toISOString()} title={formatDateTime(date)} className={cn("tabular-nums", className)}>
      {formatRelativeTime(date, now)}
    </time>
  );
}

const detailHref = (row: HistoryRow) => `/submissions/${row.id}`;

/** Accessible name of the verdict link: "Accepted, Two Sum, submitted 3 min ago. View submission". */
function viewLabel(row: HistoryRow, now: Date) {
  return `${VERDICTS[row.status].label}, ${row.problem.title}, submitted ${formatRelativeTime(row.createdAt, now)}. View submission`;
}

function ProblemTitle({ row }: { row: HistoryRow }) {
  // Unpublished problems have no page any more: plain text, no dead link.
  if (!row.problem.published) return <span className="text-foreground">{row.problem.title}</span>;
  return (
    <Link href={`/problems/${row.problem.slug}`} className={tableLinkClasses()}>
      {row.problem.title}
    </Link>
  );
}

const metric = (value: string) => (value === MISSING ? "text-muted-foreground" : undefined);

/** Squares only for judged submits with tests (not for compile / internal errors). */
function rowSquares(row: HistoryRow) {
  if (VERDICTS[row.status].pending || row.totalCount <= 0) return null;
  if (row.status === "compile_error" || row.status === "internal_error") return null;
  return squaresFromCounts(row.passedCount, row.totalCount, row.status !== "accepted");
}

/** Above 15 tests the strip is compressed to 15 squares (DESIGN.md §13.6). */
function compress(squares: ReturnType<typeof squaresFromCounts>, max = 15) {
  if (squares.length <= max) return squares;
  const failAt = squares.indexOf("fail");
  return Array.from({ length: max }, (_, i) => {
    const at = Math.floor((i * squares.length) / max);
    const next = Math.floor(((i + 1) * squares.length) / max);
    if (failAt >= at && failAt < next) return "fail" as const;
    return squares[at];
  });
}

/**
 * Submissions as a table from `md` and a list below it (DESIGN.md §13.6):
 * mono time (relative, absolute in the title), problem, verdict badge,
 * language, runtime, memory and the test squares (≥ 1280px). The verdict
 * badge links to the submission; the problem title links to the problem
 * (never the whole row). `showProblem: false` drops the problem column
 * (problem page tab).
 */
export function SubmissionList({
  rows,
  now,
  showProblem = true,
  caption,
}: {
  rows: HistoryRow[];
  now: Date;
  showProblem?: boolean;
  caption: string;
}) {
  // History = Submitted | Problem | Verdict | Language | …; problem tab = Time | Verdict | Language | ….
  return (
    <>
      <Table
        density={showProblem ? "default" : "compact"}
        containerClassName={cn("hidden md:block", showProblem && "rounded-xl shadow-sm")}
        data-testid="submissions-table"
      >
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          <TableRow>
            <TableHead>{showProblem ? "Submitted" : "Time"}</TableHead>
            {showProblem && <TableHead>Problem</TableHead>}
            <TableHead>Verdict</TableHead>
            <TableHead>Language</TableHead>
            <TableHead numeric>Runtime</TableHead>
            <TableHead numeric>Memory</TableHead>
            {showProblem && (
              <TableHead className="hidden min-[1280px]:table-cell">
                <span aria-hidden>Tests</span>
                <span className="sr-only">Tests passed</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const runtime = formatMs(row.runtimeMs);
            const memory = formatMemory(row.memoryKb);
            const squares = rowSquares(row);
            return (
              <TableRow key={row.id} data-testid="submission-row" data-id={row.id}>
                <TableCell className="font-mono text-[0.8125rem] whitespace-nowrap text-muted-foreground">
                  <RelativeTime date={row.createdAt} now={now} />
                </TableCell>
                {showProblem && (
                  <TableCell className="max-w-72 truncate" title={row.problem.title}>
                    <ProblemTitle row={row} />
                  </TableCell>
                )}
                <TableCell>
                  <Link
                    href={detailHref(row)}
                    aria-label={viewLabel(row, now)}
                    className="relative inline-flex rounded-full transition-opacity duration-120 after:absolute after:-inset-y-2 after:inset-x-0 hover:opacity-85"
                  >
                    <VerdictBadge status={row.status} compact />
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap text-foreground-secondary">{LANGUAGE_LABELS[row.language]}</TableCell>
                <TableCell numeric className={cn("font-mono text-[0.8125rem]", metric(runtime))}>
                  {runtime}
                </TableCell>
                <TableCell numeric className={cn("font-mono text-[0.8125rem]", metric(memory))}>
                  {memory}
                </TableCell>
                {showProblem && (
                  <TableCell className="hidden min-[1280px]:table-cell">
                    {squares ? (
                      <span className="flex items-center gap-2.5">
                        <TestSquares results={compress(squares)} className="flex-nowrap" />
                        <span className="font-mono text-xs text-muted-foreground tabular-nums">
                          {row.passedCount}/{row.totalCount}
                          <span className="sr-only"> tests passed</span>
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        <span aria-hidden>—</span>
                        <span className="sr-only">No test results</span>
                      </span>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <ul
        aria-label={caption}
        className={cn("divide-y overflow-hidden border bg-card md:hidden", showProblem ? "rounded-xl shadow-sm" : "rounded-lg")}
      >
        {rows.map((row) => (
          <li key={row.id} className="px-4 py-3.5" data-testid="submission-card">
            <div className="flex min-w-0 items-center gap-2.5">
              <Link
                href={detailHref(row)}
                aria-label={viewLabel(row, now)}
                className="relative inline-flex shrink-0 rounded-full after:absolute after:-inset-2"
              >
                <VerdictBadge status={row.status} compact />
              </Link>
              {showProblem && (
                <span className="min-w-0 truncate font-semibold" title={row.problem.title}>
                  <ProblemTitle row={row} />
                </span>
              )}
            </div>
            {/* language · runtime · time; a missing runtime is left out. */}
            <p className="mt-1.5 font-mono text-[0.8125rem] text-muted-foreground tabular-nums">
              {LANGUAGE_LABELS[row.language]}
              {row.runtimeMs !== null && <> · {formatMs(row.runtimeMs)}</>} ·{" "}
              <RelativeTime date={row.createdAt} now={now} />
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
