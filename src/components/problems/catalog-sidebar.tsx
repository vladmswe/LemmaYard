import Link from "next/link";
import { cn } from "cn";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { type CatalogFilters, catalogHref } from "@/lib/catalog/filters";
import type { CatalogPage } from "@/server/catalog";

import { DIFFICULTIES, DIFFICULTY_ORDER } from "./difficulty";

/**
 * Catalog aside (DESIGN.md §9.3, >= 1024px): progress for signed-in users,
 * topic links with counts for everyone. Its data comes from the same three
 * catalog queries (AC-M3-7), so it costs no extra round trip.
 */
export function CatalogSidebar({ data, filters }: { data: CatalogPage; filters: CatalogFilters }) {
  return (
    <aside aria-label="Overview" className="hidden flex-col gap-4 lg:flex">
      {data.progress && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Your progress</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3.5">
            {DIFFICULTY_ORDER.map((d, i) => {
              const solved = data.progress!.solved[d];
              const total = data.published.byDifficulty[d];
              return (
                <div key={d} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 text-sm">
                  <span className={cn("font-semibold", DIFFICULTIES[d].text)}>{DIFFICULTIES[d].label}</span>
                  <Progress
                    value={solved}
                    max={total}
                    indicatorClassName={DIFFICULTIES[d].fill}
                    delayMs={i * 60}
                    label={`${DIFFICULTIES[d].label}: ${solved} of ${total} solved`}
                  />
                  <span className="text-muted-foreground tabular-nums">
                    {solved}/{total}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
      {data.tags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Topics</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-1.5">
              {data.tags.map((t) => {
                const active = filters.tag === t.slug;
                return (
                  <li key={t.slug}>
                    <Link
                      href={catalogHref(filters, { tag: active ? undefined : t.slug })}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-[0.78rem] font-medium transition-colors duration-120",
                        active
                          ? "bg-secondary text-secondary-foreground"
                          : "bg-muted text-foreground-secondary hover:bg-secondary hover:text-secondary-foreground",
                      )}
                    >
                      {t.name}
                      <span className="text-muted-foreground tabular-nums">{t.count}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </aside>
  );
}
