import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { EmptyState } from "@/components/empty-state";
import { NOT_FOUND_TITLE } from "@/components/not-found-content";
import { PageHead } from "@/components/page-head";
import { PlanActions } from "@/components/plans/plan-actions";
import { PlanItems } from "@/components/plans/plan-items";
import { planHref } from "@/components/plans/plans-api";
import { ProgressCard } from "@/components/plans/progress-card";
import { VisibilityBadge } from "@/components/plans/visibility";
import { VisibilityCard } from "@/components/plans/visibility-card";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { getEnv } from "@/server/env";
import { plansEnabled } from "@/server/plans/flag";
import { getPlanPage } from "@/server/plans/read";

export const dynamic = "force-dynamic";

// One load per request for generateMetadata and the page.
const loadPlan = cache(async (id: string, share: string | null) => {
  if (!plansEnabled()) return null;
  const user = await getCurrentUser();
  return getPlanPage(getDb(), id, user?.id ?? null, share);
});

function shareParam(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

export async function generateMetadata({ params, searchParams }: PageProps<"/plans/[id]">): Promise<Metadata> {
  const data = await loadPlan((await params).id, shareParam((await searchParams).share));
  if (!data) return { title: NOT_FOUND_TITLE };
  return {
    title: `${data.plan.title} · Study plans · LemmaYard`,
    // Only public plans may be indexed; a link-shared URL carries its token.
    ...(data.plan.visibility === "public" ? {} : { robots: { index: false, follow: false } }),
  };
}

const SOURCE_LINE: Record<string, string> = {
  room_session: "from a room session",
  interview_post: "from an interview post",
};

/**
 * A study plan (mockup 06): head with visibility, counts and actions; the
 * sections and items with the viewer's own status; the progress card and,
 * for the owner, the visibility card. Private plans of others, unknown ids
 * and wrong share tokens are the same 404 (AC-C-SP-2).
 */
export default async function PlanPage({ params, searchParams }: PageProps<"/plans/[id]">) {
  const { id } = await params;
  const share = shareParam((await searchParams).share);
  const data = await loadPlan(id, share);
  if (!data) notFound();
  const { plan, viewer } = data;
  const path = planHref(plan.id, viewer.share);
  const loginHref = `/login?next=${encodeURIComponent(path)}`;
  const items = [...data.unsectioned, ...data.sections.flatMap((s) => s.items)];
  const origin = new URL(getEnv().AUTH_URL).origin;
  const meta = [
    data.sections.length > 0 ? `${data.sections.length} ${data.sections.length === 1 ? "section" : "sections"}` : null,
    `${plan.itemCount} ${plan.itemCount === 1 ? "problem" : "problems"}`,
    viewer.isOwner ? null : `by ${plan.ownerUsername}`,
    SOURCE_LINE[plan.source] ?? null,
  ].filter(Boolean);

  return (
    <>
      <PageHead
        crumbs={[{ label: "Study plans", href: "/plans" }, { label: plan.title }]}
        title={<span dir="auto">{plan.title}</span>}
        qed
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {viewer.isOwner && <VisibilityBadge visibility={plan.visibility} />}
            <span>{meta.join(" · ")}</span>
            {plan.forkedFrom && (
              <span>
                Based on{" "}
                <Link href={`/plans/${plan.forkedFrom.id}`} className="text-link underline underline-offset-4">
                  {plan.forkedFrom.title}
                </Link>{" "}
                by {plan.forkedFrom.ownerUsername}
              </span>
            )}
          </span>
        }
        actions={
          <PlanActions
            planId={plan.id}
            title={plan.title}
            description={plan.description}
            visibility={plan.visibility}
            isOwner={viewer.isOwner}
            signedIn={viewer.signedIn}
            saved={viewer.saved}
            shareToken={viewer.isOwner ? data.shareToken : viewer.share}
            origin={origin}
            sections={data.sections.map((s) => ({ id: s.id, title: s.title }))}
            loginHref={loginHref}
          />
        }
      />
      <div className="container-page grid grid-cols-[minmax(0,1fr)] items-start gap-6 py-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_auto_1fr] lg:gap-8">
        {/* Phones: progress, then the list, then visibility; from lg both cards sit in the right rail. */}
        <aside aria-label="Your progress" className="lg:col-start-2 lg:row-start-1">
          <ProgressCard progress={data.progress} items={items} loginHref={loginHref} />
        </aside>
        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-span-3 lg:row-start-1">
          {plan.description && (
            <p className="max-w-[72ch] whitespace-pre-line break-words text-foreground-secondary" dir="auto" data-testid="plan-description">
              {plan.description}
            </p>
          )}
          {items.length === 0 && data.sections.length === 0 ? (
            <EmptyState
              title="This plan is empty"
              given={plan.title}
              want="problems in order"
            >
              {viewer.isOwner
                ? "Use “Add problems” above, or “Add to plan” on any problem page or in the problem list."
                : "The owner has not added problems yet."}
            </EmptyState>
          ) : (
            <PlanItems
              planId={plan.id}
              share={viewer.share}
              isOwner={viewer.isOwner}
              signedIn={viewer.signedIn}
              unsectioned={data.unsectioned}
              sections={data.sections}
            />
          )}
        </div>
        {viewer.isOwner && (
          <aside aria-label="Sharing" className="lg:col-start-2 lg:row-start-2">
            <VisibilityCard planId={plan.id} visibility={plan.visibility} shareToken={data.shareToken} origin={origin} />
          </aside>
        )}
      </div>
    </>
  );
}
