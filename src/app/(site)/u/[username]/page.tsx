import { HistoryIcon, TrophyIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cn } from "cn";

import { EmptyState } from "@/components/empty-state";
import { Reveal } from "@/components/motion/reveal";
import { NOT_FOUND_TITLE } from "@/components/not-found-content";
import { PageHead } from "@/components/page-head";
import { DIFFICULTIES, DIFFICULTY_ORDER } from "@/components/problems/difficulty";
import { DifficultyBadge } from "@/components/problems/difficulty-badge";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { tableLinkClasses } from "@/components/ui/table";
import { formatMonthYear, formatPercent, formatShortDate } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/session";
import { getProfileData } from "@/server/profile";
import { findUserByUsername } from "@/server/users";

export async function generateMetadata({
  params,
}: PageProps<"/u/[username]">): Promise<Metadata> {
  const { username } = await params;
  const user = await findUserByUsername(username);
  // Same title as the not-found page the page itself renders for unknown names.
  return { title: user ? `${user.username} · LemmaYard` : NOT_FOUND_TITLE };
}

/**
 * Public profile (AC-M6-4): solved by difficulty against the published
 * totals, counted submits, acceptance and the 10 most recently solved unique
 * problems. Never any code, and no links into anyone's submissions; the
 * owner additionally gets a link to their own history.
 */
export default async function ProfilePage({ params }: PageProps<"/u/[username]">) {
  const { username } = await params;
  const [user, viewer] = await Promise.all([findUserByUsername(username), getCurrentUser()]);
  if (!user) notFound();
  const own = viewer?.id === user.id;

  return (
    <>
      <PageHead
        crumbs={[{ label: "Home", href: "/" }, { label: user.username }]}
        leading={<Avatar name={user.username} size="lg" />}
        title={user.username}
        subtitle={`Joined ${formatMonthYear(user.createdAt)}`}
        actions={
          own ? (
            <Link href="/submissions" className={buttonVariants({ variant: "secondary" })}>
              <HistoryIcon aria-hidden />
              Your submissions
            </Link>
          ) : undefined
        }
      />
      <div className="container-page py-8">
        <Suspense fallback={<ProfileSkeleton />}>
          <ProfileStats userId={user.id} own={own} />
        </Suspense>
      </div>
    </>
  );
}

async function ProfileStats({ userId, own }: { userId: string; own: boolean }) {
  const { stats, totals } = await getProfileData(userId);

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-3 gap-3 sm:gap-6" data-testid="profile-stats">
        <StatCard label="Solved" index={0}>
          {stats.solvedTotal}
          <span className="text-lg text-muted-foreground sm:text-xl">/{totals.total}</span>
        </StatCard>
        <StatCard label="Submissions" index={1}>
          {stats.submits}
        </StatCard>
        <StatCard label="Acceptance" index={2} muted={stats.acceptance === null}>
          {formatPercent(stats.acceptance)}
        </StatCard>
      </dl>

      {/* minmax(0, …): long solved titles truncate instead of widening the page. */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Reveal as="section" index={3} aria-labelledby="progress-heading" className="rounded-lg border bg-card p-6 shadow-xs">
          <h2 id="progress-heading" className="text-lg/7 font-semibold">
            Progress by difficulty
          </h2>
          <div className="mt-4 grid gap-1" data-testid="difficulty-progress">
            {DIFFICULTY_ORDER.map((d, i) => {
              const solved = stats.solved[d];
              const total = totals.byDifficulty[d];
              return (
                <div
                  key={d}
                  data-difficulty={d}
                  className="grid grid-cols-[4.5rem_1fr_4rem] items-center gap-3 py-2 text-[0.9375rem]"
                >
                  <span className={cn("font-semibold", DIFFICULTIES[d].text)}>{DIFFICULTIES[d].label}</span>
                  <Progress
                    value={solved}
                    max={total}
                    label={`${DIFFICULTIES[d].label}: ${solved} of ${total} solved`}
                    indicatorClassName={DIFFICULTIES[d].fill}
                    delayMs={200 + i * 80}
                  />
                  <span className="text-right text-sm text-muted-foreground tabular-nums">
                    {solved} / {total}
                  </span>
                </div>
              );
            })}
          </div>
        </Reveal>

        <Reveal as="section" index={4} aria-labelledby="recent-heading" className="rounded-lg border bg-card shadow-xs">
          <h2 id="recent-heading" className="px-6 pt-6 text-lg/7 font-semibold">
            Recently solved
          </h2>
          {stats.recentSolved.length === 0 ? (
            <EmptyState
              icon={TrophyIcon}
              title="No solved problems yet"
              headingLevel={3}
              className="py-10"
              action={
                own ? (
                  <Link href="/problems" className={buttonVariants()}>
                    Browse problems
                  </Link>
                ) : undefined
              }
            >
              {own ? "Problems you solve will be listed here." : "Problems this user solves will be listed here."}
            </EmptyState>
          ) : (
            <ol className="mt-2 divide-y px-6 pb-2" data-testid="recent-solved">
              {stats.recentSolved.map((p) => (
                <li key={p.slug} className="flex items-center gap-3 py-3">
                  <Link href={`/problems/${p.slug}`} title={p.title} className={cn(tableLinkClasses(), "min-w-0 flex-1 truncate")}>
                    {p.title}
                  </Link>
                  <DifficultyBadge difficulty={p.difficulty} variant="text" className="shrink-0 text-sm" />
                  <time
                    dateTime={p.firstAcceptedAt.toISOString()}
                    className="w-24 shrink-0 text-right text-sm text-muted-foreground tabular-nums"
                  >
                    {formatShortDate(p.firstAcceptedAt)}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </Reveal>
      </div>
    </div>
  );
}

function StatCard({
  label,
  index,
  muted = false,
  children,
}: {
  label: string;
  index: number;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Reveal index={index} className="flex flex-col-reverse rounded-lg border bg-card p-4 shadow-xs sm:p-6">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "font-heading text-2xl/9 font-semibold tabular-nums sm:text-[1.875rem]/9",
          muted && "text-muted-foreground",
        )}
      >
        {children}
      </dd>
    </Reveal>
  );
}

function ProfileSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Loading profile…</span>
      <div className="grid grid-cols-3 gap-3 sm:gap-6">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 rounded-lg sm:h-28" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Skeleton className="h-52 rounded-lg" />
        <Skeleton className="h-52 rounded-lg" />
      </div>
    </div>
  );
}
