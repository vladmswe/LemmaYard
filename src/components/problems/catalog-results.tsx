import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "cn";

import { formatPercent, formatTagLabel } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  tableLinkClasses,
} from "@/components/ui/table";
import { type CatalogFilters, catalogHref } from "@/lib/catalog/filters";
import type { CatalogPage, CatalogRow } from "@/server/catalog";

import { DifficultyBadge } from "./difficulty-badge";
import { DIFFICULTIES } from "./difficulty";
import { ProblemStatusIcon } from "./problem-status-icon";

const STATUS_WORDS = { solved: "Solved", attempted: "Attempted", todo: "Not started" } as const;

/** "Hard · Dynamic programming · “sum”": the Given line of the empty state. */
function describeFilters(filters: CatalogFilters, data: CatalogPage): string {
  const parts: string[] = [];
  if (filters.difficulty) parts.push(DIFFICULTIES[filters.difficulty].label);
  if (filters.tag) {
    const tag = data.tags.find((t) => t.slug === filters.tag);
    parts.push(tag ? formatTagLabel(tag.name) : filters.tag);
  }
  if (filters.status) parts.push(STATUS_WORDS[filters.status]);
  if (filters.q) parts.push(`“${filters.q}”`);
  return parts.join(" · ") || "every problem";
}

/**
 * Catalog results (DESIGN.md §13.3): a dense table from `md` (status icon,
 * the number in a mono proof gutter, title, topics, acceptance, difficulty
 * word + shape), list rows below it, pagination, or the unfinished-proof
 * empty state. `showStatus` = signed in.
 */
export function CatalogResults({
  data,
  filters,
  showStatus,
  rowAction,
}: {
  data: CatalogPage;
  filters: CatalogFilters;
  showStatus: boolean;
  /** An extra control per row (e.g. "Add to a study plan"), last column / beside the card. */
  rowAction?: (row: CatalogRow) => ReactNode;
}) {
  if (data.rows.length === 0) {
    const pastEnd = data.total > 0;
    return pastEnd ? (
      <EmptyState
        title="This page is empty"
        given={`page ${data.page}`}
        want={`one of ${data.total} matching problems`}
        action={
          <Link href={catalogHref(filters, { page: 1 })} className={buttonVariants({ variant: "secondary" })}>
            Go to the first page
          </Link>
        }
      >
        {`There ${data.total === 1 ? "is only 1 matching problem" : `are only ${data.total} matching problems`}.`}
      </EmptyState>
    ) : (
      <EmptyState
        title="No problems match these filters"
        given={describeFilters(filters, data)}
        want="a problem"
        action={
          <Link href={catalogHref({ page: 1 })} className={buttonVariants()}>
            Clear filters
          </Link>
        }
      >
        Try a different title, difficulty or topic.
      </EmptyState>
    );
  }

  return (
    <>
      <Table containerClassName="hidden md:block rounded-xl shadow-sm" className="table-fixed">
        <caption className="sr-only">Problems</caption>
        <TableHeader>
          <TableRow>
            {showStatus && (
              <TableHead className="w-14 pr-0">
                <span className="sr-only">Status</span>
              </TableHead>
            )}
            <TableHead numeric className="w-16 border-r pr-4">
              #
            </TableHead>
            <TableHead className="pl-5">Title</TableHead>
            <TableHead className="hidden w-[30%] lg:table-cell">Topics</TableHead>
            <TableHead numeric className="w-32">
              Acceptance
            </TableHead>
            <TableHead className="w-32">Difficulty</TableHead>
            {rowAction && (
              <TableHead className="w-14">
                <span className="sr-only">Actions</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.map((row) => (
            <TableRow key={row.id} data-testid="catalog-row" className="group/row">
              {showStatus && (
                <TableCell className="pr-0">
                  {row.status && (
                    <span className="flex items-center">
                      <ProblemStatusIcon status={row.status} />
                    </span>
                  )}
                </TableCell>
              )}
              {/* The proof gutter: the problem number in mono gutter ink with a hairline. */}
              <TableCell
                numeric
                className="border-r pr-4 font-mono text-[0.8125rem] text-gutter-ink transition-colors duration-120 group-hover/row:text-primary"
              >
                {row.number}
              </TableCell>
              <TableCell className="truncate pl-5" title={row.title}>
                <Link href={`/problems/${row.slug}`} className={tableLinkClasses()}>
                  {row.title}
                </Link>
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                <TagList row={row} filters={filters} />
              </TableCell>
              <TableCell
                numeric
                className={cn("font-mono text-[0.8125rem]", row.acceptance === null && "text-muted-foreground")}
              >
                {row.acceptance === null ? (
                  <>
                    <span aria-hidden>—</span>
                    <span className="sr-only">No submissions yet</span>
                  </>
                ) : (
                  formatPercent(row.acceptance)
                )}
              </TableCell>
              <TableCell>
                <DifficultyBadge difficulty={row.difficulty} variant="text" />
              </TableCell>
              {rowAction && <TableCell className="pr-3">{rowAction(row)}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ul aria-label="Problems" className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm md:hidden">
        {data.rows.map((row) => (
          <li key={row.id} data-testid="catalog-card" className={rowAction ? "flex items-center" : undefined}>
            <Link
              href={`/problems/${row.slug}`}
              className={cn(
                "grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 px-4 py-3.5 transition-colors duration-120 hover:bg-accent focus-visible:-outline-offset-2",
                rowAction && "min-w-0 flex-1",
              )}
            >
              {showStatus && row.status ? (
                <ProblemStatusIcon status={row.status} className="row-span-2 mt-px" />
              ) : (
                <span aria-hidden className="row-span-2 w-0" />
              )}
              <span className="font-semibold text-foreground">
                <span className="font-mono text-[0.8125rem] font-medium text-gutter-ink tabular-nums">{row.number}.</span>{" "}
                {row.title}
              </span>
              <DifficultyBadge difficulty={row.difficulty} variant="text" className="mt-px" />
              <span className="col-span-2 flex min-w-0 items-center justify-between gap-3 text-[0.8125rem] text-muted-foreground">
                <span className="truncate">
                  {row.tags.length > 0 ? row.tags.map((t) => formatTagLabel(t.name)).join(" · ") : "No topics"}
                </span>
                <span className="shrink-0 font-mono tabular-nums">
                  {row.acceptance === null ? (
                    <>
                      <span aria-hidden>—</span>
                      <span className="sr-only">No submissions yet</span>
                    </>
                  ) : (
                    <>
                      {formatPercent(row.acceptance)}
                      <span className="sr-only"> accepted</span>
                    </>
                  )}
                </span>
              </span>
            </Link>
            {rowAction && <div className="shrink-0 pr-3">{rowAction(row)}</div>}
          </li>
        ))}
      </ul>

      <Pagination
        className="mt-5"
        page={data.page}
        pageSize={data.pageSize}
        totalItems={data.total}
        hrefFor={(page) => catalogHref(filters, { page })}
      />
    </>
  );
}

const MAX_ROW_TAGS = 2;

/** Up to two topic links, then "+N" (full list in the title); one line. */
function TagList({ row, filters }: { row: CatalogRow; filters: CatalogFilters }) {
  if (row.tags.length === 0) return <span className="text-muted-foreground">—</span>;
  const shown = row.tags.slice(0, MAX_ROW_TAGS);
  const rest = row.tags.slice(MAX_ROW_TAGS);
  return (
    <ul aria-label="Topics" className="flex min-w-0 items-center gap-1.5">
      {shown.map((t, i) => (
        // The first tag keeps its width; only the second one truncates.
        <li key={t.slug} className={i === 0 ? "shrink-0" : "min-w-0"}>
          <Badge
            variant="tag"
            className="max-w-full justify-start"
            render={<Link href={catalogHref(filters, { tag: t.slug })} title={`Show ${formatTagLabel(t.name)} problems`} />}
          >
            <span className="truncate">{formatTagLabel(t.name)}</span>
          </Badge>
        </li>
      ))}
      {rest.length > 0 && (
        <li
          className="shrink-0 font-mono text-[0.75rem] text-muted-foreground tabular-nums"
          title={rest.map((t) => formatTagLabel(t.name)).join(", ")}
        >
          +{rest.length}
          <span className="sr-only"> more: {rest.map((t) => formatTagLabel(t.name)).join(", ")}</span>
        </li>
      )}
    </ul>
  );
}
