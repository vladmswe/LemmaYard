import type { Metadata } from "next";

import { formatTagLabel } from "@/lib/format";
import { PageHead } from "@/components/page-head";
import {
  CatalogFilterBar,
  CatalogResultsRegion,
  CatalogShell,
} from "@/components/problems/catalog-controls";
import { CatalogResults } from "@/components/problems/catalog-results";
import { CatalogSidebar } from "@/components/problems/catalog-sidebar";
import { effectiveFilters, parseCatalogFilters } from "@/lib/catalog/filters";
import { getCurrentUser } from "@/server/auth/session";
import { getCatalogPage } from "@/server/catalog";
import { getEnv } from "@/server/env";

export const metadata: Metadata = { title: "Problems · LemmaYard" };

// Catalog (AC-M3-1..3, AC-M3-7). Filters and the page live in the URL; the
// route-level loading.tsx is the Suspense fallback on first load, filter
// changes keep the current results visible (dimmed) until the next render.
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
        crumbs={[{ label: "Home", href: "/" }, { label: "Problems" }]}
        title="Problems"
        subtitle={
          <span className="tabular-nums">
            {total} {total === 1 ? "problem" : "problems"} · Python 3 and JavaScript
          </span>
        }
      />
      <div className="container-page grid items-start gap-6 py-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <CatalogShell>
            <CatalogFilterBar
              filters={filters}
              tags={data.tags.map((t) => ({ value: t.slug, label: formatTagLabel(t.name) }))}
              showStatus={showStatus}
            />
            <CatalogResultsRegion>
              <CatalogResults data={data} filters={filters} showStatus={showStatus} />
            </CatalogResultsRegion>
          </CatalogShell>
        </div>
        <CatalogSidebar data={data} filters={filters} />
      </div>
    </>
  );
}
