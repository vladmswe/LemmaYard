import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";

import { pageRange, pageWindow } from "@/lib/pagination";

const itemClasses =
  "inline-flex h-10 min-w-10 items-center justify-center rounded-md border border-border-strong bg-card px-2.5 text-sm font-medium text-foreground tabular-nums transition-colors duration-120 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * Link-based pagination (DESIGN.md §8.16): `?page=` lives in the URL, so
 * every page is a real link. `hrefFor(page)` builds the URL (keep filters).
 */
export function Pagination({
  page,
  pageSize,
  totalItems,
  hrefFor,
  className,
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  hrefFor: (page: number) => string;
  className?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const current = Math.min(Math.max(page, 1), totalPages);
  const { from, to } = pageRange(current, pageSize, totalItems);
  const items = pageWindow(current, totalPages);

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex flex-col-reverse items-center gap-3 sm:flex-row sm:justify-between",
        className,
      )}
    >
      <p className="text-sm text-muted-foreground tabular-nums">
        {totalItems === 0 ? "No results" : `Showing ${from}–${to} of ${totalItems}`}
      </p>
      {totalPages > 1 && (
        <ul className="flex items-center gap-1">
          <li>
            <PageLink
              href={hrefFor(current - 1)}
              disabled={current <= 1}
              label="Previous page"
            >
              <ChevronLeftIcon aria-hidden className="size-4" />
            </PageLink>
          </li>
          {items.map((item) =>
            typeof item === "number" ? (
              <li key={item}>
                <Link
                  href={hrefFor(item)}
                  aria-current={item === current ? "page" : undefined}
                  aria-label={`Page ${item}`}
                  className={cn(
                    itemClasses,
                    item === current &&
                      "border-primary bg-primary text-primary-foreground hover:bg-primary-hover",
                  )}
                >
                  {item}
                </Link>
              </li>
            ) : (
              <li key={item} aria-hidden className="px-1 text-muted-foreground">
                …
              </li>
            ),
          )}
          <li>
            <PageLink
              href={hrefFor(current + 1)}
              disabled={current >= totalPages}
              label="Next page"
            >
              <ChevronRightIcon aria-hidden className="size-4" />
            </PageLink>
          </li>
        </ul>
      )}
    </nav>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span aria-disabled="true" className={cn(itemClasses, "pointer-events-none opacity-50")}>
        {children}
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className={itemClasses}>
      {children}
    </Link>
  );
}
