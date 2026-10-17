import { SearchXIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";

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
import { formatPercent } from "@/lib/format";
import type { CatalogPage, CatalogRow } from "@/server/catalog";

import { DifficultyBadge } from "./difficulty-badge";
import { ProblemStatusIcon } from "./problem-status-icon";

/**
 * Catalog results (DESIGN.md §9.3): a dense table from `md`, a card list
 * below it, pagination, or an empty state. `showStatus` = signed in.
 */
export function CatalogResults({
  data,
  filters,
  showStatus,
}: {
  data: CatalogPage;
  filters: CatalogFilters;
  showStatus: boolean;
}) {
  if (data.rows.length === 0) {
    const pastEnd = data.total > 0;
    return (
      <div className="rounded-lg border bg-card shadow-xs">
        <EmptyState
          icon={SearchXIcon}
          title={pastEnd ? "This page is empty" : "No problems match these filters"}
          action={
            <Link
              href={pastEnd ? catalogHref(filters, { page: 1 }) : catalogHref({ page: 1 })}
              className={buttonVariants({ variant: "secondary" })}
            >
              {pastEnd ? "Go to the first page" : "Clear filters"}
            </Link>
          }
        >
          {pastEnd
            ? `There are only ${data.total} matching problems.`
            : "Try a different title, difficulty or topic."}
        </EmptyState>
      </div>
    );
  }

  return (
    <>
      <Table containerClassName="hidden md:block" className="table-fixed">
        <caption className="sr-only">Problems</caption>
        <TableHeader>
          <TableRow>
            {showStatus && <TableHead className="w-16">Status</TableHead>}
            <TableHead numeric className="w-16">
              #
            </TableHead>
            <TableHead>Title</TableHead>
            <TableHead className="hidden w-[30%] xl:table-cell">Topics</TableHead>
            <TableHead numeric className="w-32">
              Acceptance
            </TableHead>
            <TableHead className="w-28">Difficulty</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.map((row) => (
            <TableRow key={row.id}>
              {showStatus && (
                <TableCell>{row.status && <ProblemStatusIcon status={row.status} />}</TableCell>
              )}
              <TableCell numeric className="text-muted-foreground">
                {row.number}
              </TableCell>
              <TableCell className="truncate" title={row.title}>
                <Link href={`/problems/${row.slug}`} className={tableLinkClasses()}>
                  {row.title}
                </Link>
              </TableCell>
              <TableCell className="hidden xl:table-cell">
                <TagList row={row} filters={filters} />
              </TableCell>
              <TableCell numeric className={cn(row.acceptance === null && "text-muted-foreground")}>
                {formatPercent(row.acceptance)}
              </TableCell>
              <TableCell>
                <DifficultyBadge difficulty={row.difficulty} variant="text" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ul aria-label="Problems" className="divide-y overflow-hidden rounded-lg border bg-card shadow-xs md:hidden">
        {data.rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/problems/${row.slug}`}
              className="flex items-start gap-3 px-4 py-3.5 transition-colors duration-120 hover:bg-accent focus-visible:-outline-offset-2"
            >
              {showStatus && row.status && <ProblemStatusIcon status={row.status} className="mt-0.5" />}
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-foreground">
                  <span className="tabular-nums">{row.number}.</span> {row.title}
                </span>
                <span className="mt-1 block text-sm text-muted-foreground tabular-nums">
                  {row.acceptance === null ? "No submissions yet" : `${formatPercent(row.acceptance)} accepted`}
                </span>
              </span>
              <DifficultyBadge difficulty={row.difficulty} variant="text" className="mt-0.5" />
            </Link>
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

function TagList({ row, filters }: { row: CatalogRow; filters: CatalogFilters }) {
  if (row.tags.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <ul aria-label="Topics" className="flex flex-wrap gap-1.5 overflow-hidden">
      {row.tags.map((t) => (
        <li key={t.slug} className="min-w-0">
          <Badge
            variant="tag"
            className="max-w-full"
            render={<Link href={catalogHref(filters, { tag: t.slug })} aria-label={`Filter by ${t.name}`} />}
          >
            <span className="truncate">{t.name}</span>
          </Badge>
        </li>
      ))}
    </ul>
  );
}
