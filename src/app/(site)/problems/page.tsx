import type { Metadata } from "next";

import { formatTagLabel } from "@/lib/format";
import { PageHead } from "@/components/page-head";
import {
  CatalogFilterBar,
  CatalogResultsRegion,
  CatalogShell,
} from "@/components/problems/catalog-controls";
import { CatalogProgress } from "@/components/problems/catalog-progress";
import { CatalogResults } from "@/components/problems/catalog-results";
import { effectiveFilters, parseCatalogFilters } from "@/lib/catalog/filters";
import { getCurrentUser } from "@/server/auth/session";
import { getCatalogPage } from "@/server/catalog";
import { getEnv } from "@/server/env";

export const metadata: Metadata = {
  title: "Problems · LemmaYard",
  description: "Original algorithm problems with worked examples and hidden tests. Filter by difficulty, topic and status.",
};

// Catalog (AC-M3-1..3, AC-M3-7; DESIGN.md §13.3). Filters and the page live
// in the URL; the route-level loading.tsx is the Suspense fallback on first
// load, filter changes keep the current results visible (dimmed) until the
// next render. The progress card and the topic chips use the same three
// catalog queries.
export default async function ProblemsPage({ searchParams }: PageProps<"/problems">) {
  const user = await getCurrentUser();
  const filters = effectiveFilters(parseCatalogFilters(await searchParams), Boolean(user));
  const data = await getCatalogPage({
    filters,
    userId: user?.id ?? null,
    pageSize: getEnv().PAGE_SIZE,
  });
  const showStatus = Boolean(user);
  const total = data.published.total;

  return (
    <>
      <PageHead
        size="d1"
        qed
        crumbs={[{ label: "Home", href: "/" }, { label: "Problems" }]}
        title="Problems"
        subtitle={
          <span className="tabular-nums">
            {total} {total === 1 ? "problem" : "problems"} · Python 3 and JavaScript, Java on selected problems · every one with examples,
            constraints and hidden tests
          </span>
        }
        actions={<CatalogProgress data={data} />}
      />
      <div className="container-page pt-3 pb-14">
        <CatalogShell>
          <CatalogFilterBar
            filters={filters}
            tags={data.tags.map((t) => ({ value: t.slug, label: formatTagLabel(t.name), count: t.count }))}
            showStatus={showStatus}
          />
          <CatalogResultsRegion>
            <CatalogResults data={data} filters={filters} showStatus={showStatus} />
          </CatalogResultsRegion>
        </CatalogShell>
      </div>
    </>
  );
}
