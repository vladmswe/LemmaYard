import { SearchIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { Reveal } from "@/components/motion/reveal";
import { PageHead } from "@/components/page-head";
import { Pagination } from "@/components/pagination";
import { NewPlanDialog } from "@/components/plans/new-plan-dialog";
import { PlanCard } from "@/components/plans/plan-card";
import { buttonVariants } from "@/components/ui/button";
import { chipClasses } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { PLAN_SEARCH_MAX, parseDiscoverParams, type PlanSort } from "@/lib/plans/schemas";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { plansEnabled } from "@/server/plans/flag";
import { listMyPlans, listPublicPlans } from "@/server/plans/read";

export const metadata: Metadata = {
  title: "Study plans · LemmaYard",
  description: "Ordered problem lists with sections: problems on LemmaYard and LeetCode links, with your own progress.",
};
export const dynamic = "force-dynamic";

function discoverHref(params: { q: string; sort: PlanSort; page: number }): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.sort !== "popular") search.set("sort", params.sort);
  if (params.page > 1) search.set("page", String(params.page));
  const qs = search.toString();
  return `/plans${qs ? `?${qs}` : ""}#discover`;
}

/**
 * Study plans (docs/specs/community.md §B.8, phase C2): the viewer's plans
 * and saved plans, then Discover (public plans, search by title, Popular /
 * New). Guests see Discover only. Behind PLANS_ENABLED (off → 404).
 */
export default async function PlansPage({ searchParams }: PageProps<"/plans">) {
  if (!plansEnabled()) notFound();
  const user = await getCurrentUser();
  const discover = parseDiscoverParams(await searchParams);
  const db = getDb();
  const [mine, publicPlans] = await Promise.all([
    user ? listMyPlans(db, user.id) : Promise.resolve(null),
    listPublicPlans(db, discover),
  ]);

  return (
    <>
      <PageHead
        size="d1"
        qed
        crumbs={[{ label: "Home", href: "/" }, { label: "Study plans" }]}
        title="Study plans"
        subtitle="Ordered problem lists with sections: problems on LemmaYard and LeetCode links. Progress is always your own: solved problems count by themselves, LeetCode links you tick."
        actions={
          user ? (
            mine && mine.mine.length > 0 ? <NewPlanDialog /> : undefined
          ) : (
            <Link href="/login?next=%2Fplans" className={buttonVariants({ variant: "secondary" })}>
              Log in to make a plan
            </Link>
          )
        }
      />
      <div className="container-page flex flex-col gap-14 py-10 min-[961px]:py-14">
        {mine && (
          <section aria-labelledby="my-plans" className="flex flex-col gap-5">
            <h2 id="my-plans" className="font-display text-[2rem]/[1.1]">
              Your plans
            </h2>
            {mine.mine.length === 0 ? (
              <EmptyState title="No study plans yet" given="a goal" want="an ordered list of problems" action={<NewPlanDialog />}>
                Make a plan from scratch, or press “Add to plan” on any problem. After a room session, “Save as study
                plan” turns its problems into one.
              </EmptyState>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
                {mine.mine.map((plan, i) => (
                  <Reveal as="li" index={i} key={plan.id}>
                    <PlanCard plan={plan} />
                  </Reveal>
                ))}
              </ul>
            )}
          </section>
        )}

        {mine && mine.saved.length > 0 && (
          <section aria-labelledby="saved-plans" className="flex flex-col gap-5">
            <h2 id="saved-plans" className="font-display text-[2rem]/[1.1]">
              Saved plans
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
              {mine.saved.map((plan, i) => (
                <Reveal as="li" index={i} key={plan.id}>
                  <PlanCard plan={plan} showOwner />
                </Reveal>
              ))}
            </ul>
          </section>
        )}

        <section id="discover" aria-labelledby="discover-title" className="flex scroll-mt-24 flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 id="discover-title" className="font-display text-[2rem]/[1.1]">
              Discover
            </h2>
            <p className="text-sm text-muted-foreground">Public plans by other people. Duplicate one to make it yours.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <form action="/plans#discover" method="get" role="search" className="flex w-full max-w-md gap-2">
              <label htmlFor="plan-search" className="sr-only">
                Search public plans by title
              </label>
              <div className="relative min-w-0 flex-1">
                <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="plan-search"
                  name="q"
                  type="search"
                  defaultValue={discover.q}
                  maxLength={PLAN_SEARCH_MAX}
                  placeholder="Search by title"
                  className="pl-10"
                />
              </div>
              {discover.sort !== "popular" && <input type="hidden" name="sort" value={discover.sort} />}
              <button type="submit" className={buttonVariants({ variant: "secondary" })}>
                Search
              </button>
            </form>
            <nav aria-label="Sort public plans" className="flex gap-2">
              {(["popular", "new"] as const).map((sort) => (
                <Link
                  key={sort}
                  href={discoverHref({ ...discover, sort, page: 1 })}
                  aria-current={discover.sort === sort ? "page" : undefined}
                  data-pressed={discover.sort === sort}
                  className={chipClasses("h-10")}
                >
                  {sort === "popular" ? "Popular" : "New"}
                </Link>
              ))}
            </nav>
          </div>
          {publicPlans.plans.length === 0 ? (
            <EmptyState
              title={discover.q ? "No public plan matches" : "No public plans yet"}
              given={discover.q ? `“${discover.q}”` : "an empty shelf"}
              want="a plan to follow"
              action={
                discover.q ? (
                  <Link href="/plans#discover" className={buttonVariants({ variant: "secondary" })}>
                    Clear the search
                  </Link>
                ) : undefined
              }
            >
              {discover.q
                ? "Try another word from the title."
                : "When someone makes a plan public, it shows up here. Yours can be the first."}
            </EmptyState>
          ) : (
            <>
              <ul className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3" aria-label="Public plans">
                {publicPlans.plans.map((plan, i) => (
                  <Reveal as="li" index={i} key={plan.id}>
                    <PlanCard plan={plan} showOwner />
                  </Reveal>
                ))}
              </ul>
              <Pagination
                page={publicPlans.page}
                pageSize={publicPlans.pageSize}
                totalItems={publicPlans.total}
                hrefFor={(page) => discoverHref({ ...discover, page })}
              />
            </>
          )}
        </section>
      </div>
    </>
  );
}
