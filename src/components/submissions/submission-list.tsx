import Link from "next/link";
import { cn } from "cn";

import { VerdictBadge } from "@/components/judge/verdict-badge";
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
import { VERDICTS } from "@/components/judge/verdict";
import type { HistoryRow } from "@/server/submissions/history";

/** "3 min ago" with the absolute UTC time as title (DESIGN.md §9.5). */
export function RelativeTime({ date, now, className }: { date: Date; now: Date; className?: string }) {
  return (
    <time dateTime={date.toISOString()} title={formatDateTime(date)} className={cn("tabular-nums", className)}>
      {formatRelativeTime(date, now)}
    </time>
  );
}

const detailHref = (row: HistoryRow) => `/submissions/${row.id}`;

/** Accessible name of the verdict link: "Accepted, submitted 3 min ago. View submission". */
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

/**
 * Submissions as a compact table from `md` and a card list below it
 * (DESIGN.md §9.5). The verdict badge links to the submission; the problem
 * title links to the problem (never the whole row). `showProblem: false`
 * drops the problem column (problem page tab).
 */
export function SubmissionList({
  rows,
  now,
  showProblem = true,
  caption,
  breakpoint = "md",
}: {
  rows: HistoryRow[];
  now: Date;
  showProblem?: boolean;
  caption: string;
  /** Where the table replaces the card list (`none`: always the table). */
  breakpoint?: "md" | "none";
}) {
  // DESIGN.md: history = Submitted | Problem | Language | Verdict | …;
  // problem tab = Time | Verdict | Language | ….
  const verdictFirst = !showProblem;
  return (
    <>
      <Table
        density="compact"
        containerClassName={cn(breakpoint === "md" && "hidden md:block")}
        data-testid="submissions-table"
      >
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          <TableRow>
            <TableHead>{showProblem ? "Submitted" : "Time"}</TableHead>
            {showProblem && <TableHead>Problem</TableHead>}
            {verdictFirst && <TableHead>Verdict</TableHead>}
            <TableHead>Language</TableHead>
            {!verdictFirst && <TableHead>Verdict</TableHead>}
            <TableHead numeric>Runtime</TableHead>
            <TableHead numeric>Memory</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const runtime = formatMs(row.runtimeMs);
            const memory = formatMemory(row.memoryKb);
            const verdict = (
              <TableCell>
                <Link
                  href={detailHref(row)}
                  aria-label={viewLabel(row, now)}
                  className="inline-flex rounded-full transition-opacity duration-120 hover:opacity-85"
                >
                  <VerdictBadge status={row.status} compact />
                </Link>
              </TableCell>
            );
            return (
              <TableRow key={row.id} data-testid="submission-row" data-id={row.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  <RelativeTime date={row.createdAt} now={now} />
                </TableCell>
                {showProblem && (
                  <TableCell className="max-w-64 truncate" title={row.problem.title}>
                    <ProblemTitle row={row} />
                  </TableCell>
                )}
                {verdictFirst && verdict}
                <TableCell className="whitespace-nowrap">{LANGUAGE_LABELS[row.language]}</TableCell>
                {!verdictFirst && verdict}
                <TableCell numeric className={metric(runtime)}>
                  {runtime}
                </TableCell>
                <TableCell numeric className={metric(memory)}>
                  {memory}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {breakpoint === "md" && (
        <ul aria-label={caption} className="divide-y overflow-hidden rounded-lg border bg-card shadow-xs md:hidden">
          {rows.map((row) => (
            <li key={row.id} className="px-4 py-3" data-testid="submission-card">
              <div className="flex min-w-0 items-center gap-2">
                <Link href={detailHref(row)} aria-label={viewLabel(row, now)} className="inline-flex shrink-0 rounded-full">
                  <VerdictBadge status={row.status} compact />
                </Link>
                {showProblem && (
                  <span className="min-w-0 truncate font-semibold" title={row.problem.title}>
                    <ProblemTitle row={row} />
                  </span>
                )}
              </div>
              {/* DESIGN.md §9.5: language · runtime · time; a missing runtime is left out. */}
              <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                {LANGUAGE_LABELS[row.language]}
                {row.runtimeMs !== null && <> · {formatMs(row.runtimeMs)}</>} ·{" "}
                <RelativeTime date={row.createdAt} now={now} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
