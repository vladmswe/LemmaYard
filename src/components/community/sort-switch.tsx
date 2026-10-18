"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { cn } from "cn";

import { Segmented } from "@/components/ui/segmented";
import type { CommentSort } from "@/lib/community/types";

const OPTIONS = [
  { value: "best", label: "Best" },
  { value: "new", label: "New" },
] as const;

/**
 * Best / New in the workspace tab: both lists are rendered on the server
 * (one query each); this only shows one of them, so switching is instant and
 * keeps the editor state. The full page uses links instead (`SortLinks`).
 */
export function SortSwitch({
  best,
  latest,
  header,
  between,
}: {
  best: ReactNode;
  latest: ReactNode;
  header?: ReactNode;
  /** Rendered between the header row and the list (the composer, mockup 01). */
  between?: ReactNode;
}) {
  const [sort, setSort] = useState<CommentSort>("best");
  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {header}
        <Segmented label="Sort comments" options={OPTIONS} value={sort} onValueChange={setSort} className="ml-auto" />
      </div>
      {between}
      <div hidden={sort !== "best"}>{best}</div>
      <div hidden={sort !== "new"}>{latest}</div>
    </div>
  );
}

/** Best / New as links (full discussion page; works without JS). */
export function SortLinks({ current, hrefs }: { current: CommentSort; hrefs: Record<CommentSort, string> }) {
  return (
    <nav aria-label="Sort comments" className="inline-flex rounded-full border border-border bg-surface-sunken p-[3px]">
      {OPTIONS.map((o) => {
        const active = o.value === current;
        return (
          <Link
            key={o.value}
            href={hrefs[o.value]}
            aria-current={active ? "true" : undefined}
            scroll={false}
            className={cn(
              "relative inline-flex h-8 items-center rounded-full px-3.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-[color,background-color,box-shadow] duration-200 ease-out after:absolute after:inset-x-0 after:-inset-y-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
              active && "bg-card text-foreground shadow-md dark:bg-popover",
            )}
          >
            {o.label}
          </Link>
        );
      })}
    </nav>
  );
}
