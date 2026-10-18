import { ArrowRightIcon, CalendarIcon, CodeXmlIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { cn } from "cn";

import { Qed } from "@/components/brand/qed";
import { EmptyState } from "@/components/empty-state";
import { CountUp } from "@/components/motion/count-up";
import { Reveal } from "@/components/motion/reveal";
import { NOT_FOUND_TITLE } from "@/components/not-found-content";
import { DifficultyGlyph } from "@/components/problems/difficulty-badge";
import { DIFFICULTIES, DIFFICULTY_ORDER } from "@/components/problems/difficulty";
import { ProofSquares } from "@/components/problems/proof-squares";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { tableLinkClasses } from "@/components/ui/table";
import { formatMonthYear, formatShortDate } from "@/lib/format";
import { initials } from "@/lib/initials";
import { LANGUAGE_LABELS } from "@/lib/workspace/languages";
import { getCurrentUser } from "@/server/auth/session";
import { getProfileData } from "@/server/profile";
import { findUserByUsername } from "@/server/users";

// The head's meta line and the body share one load per request (two queries).
const loadProfile = cache((userId: string) => getProfileData(userId));

export async function generateMetadata({
  params,
}: PageProps<"/u/[username]">): Promise<Metadata> {
  const { username } = await params;
  const user = await findUserByUsername(username);
  // Same title as the not-found page the page itself renders for unknown names.
  return { title: user ? `${user.username} · LemmaYard` : NOT_FOUND_TITLE };
}

/**
 * Public profile (AC-M6-4, DESIGN.md §13.7): a 120px cobalt monogram with a
 * ∎ corner, the d1 username and meta; a stats band of three 96px serif
 * numbers (count-ups); the proof sheet (one square per published problem by
 * difficulty: filled = solved, dashed = attempted) with meters; and the 10
 * most recently solved unique problems. Never any code, and no links into
 * anyone's submissions; the owner additionally gets a link to their history.
 */
export default async function ProfilePage({ params }: PageProps<"/u/[username]">) {
  const { username } = await params;
  const [user, viewer] = await Promise.all([findUserByUsername(username), getCurrentUser()]);
  if (!user) notFound();
  const own = viewer?.id === user.id;

  return (
    <>
      <div className="relative overflow-hidden border-b py-10 min-[961px]:py-16">
        <div
          aria-hidden
          className="grid-paper [mask-image:radial-gradient(60%_90%_at_30%_30%,#000_20%,transparent_75%)]"
        />
        <Reveal className="container-page relative flex flex-wrap items-end justify-between gap-x-8 gap-y-6">
          <div className="flex min-w-0 flex-col gap-6 min-[961px]:flex-row min-[961px]:items-end min-[961px]:gap-8">
            <Monogram name={user.username} />
            <div className="min-w-0">
              <p className="eyebrow-accent">Profile · public</p>
              <h1 className="display-1 mt-3 break-words">{user.username}</h1>
              <Suspense
                fallback={
                  <p className="mt-4 text-foreground-secondary">
                    <MetaJoined date={user.createdAt} />
                  </p>
                }
              >
                <ProfileMeta userId={user.id} joined={user.createdAt} />
              </Suspense>
            </div>
          </div>
          {own && (
            <Link href="/submissions" className={buttonVariants({ variant: "secondary" })}>
              Your submissions
              <ArrowRightIcon aria-hidden data-arrow />
            </Link>
          )}
        </Reveal>
      </div>
      <Suspense fallback={<ProfileSkeleton />}>
        <ProfileBody userId={user.id} own={own} />
      </Suspense>
    </>
  );
}

/** 120px cobalt monogram (96px below 961px) with a ∎ in the corner. Decorative. */
function Monogram({ name }: { name: string }) {
  return (
    <div aria-hidden className="relative w-fit shrink-0">
      <div className="on-cobalt grain grid size-24 place-items-center overflow-hidden rounded-[22px] font-display text-[3rem] leading-none min-[961px]:size-30 min-[961px]:text-[3.75rem]">
        {initials(name).slice(0, 1)}
      </div>
      <span className="absolute -right-1.5 -bottom-1.5 size-4 border-[3px] border-background bg-sky min-[961px]:size-5" />
    </div>
  );
}

function MetaJoined({ date }: { date: Date }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <CalendarIcon aria-hidden className="size-4 text-muted-foreground" />
      Joined {formatMonthYear(date)}
    </span>
  );
}

async function ProfileMeta({ userId, joined }: { userId: string; joined: Date }) {
  const { extras } = await loadProfile(userId);
  return (
    <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-foreground-secondary">
      <MetaJoined date={joined} />
      {extras.mainLanguage && (
        <span className="inline-flex items-center gap-1.5">
          <CodeXmlIcon aria-hidden className="size-4 text-muted-foreground" />
          Mostly {LANGUAGE_LABELS[extras.mainLanguage]}
        </span>
      )}
    </p>
  );
}

async function ProfileBody({ userId, own }: { userId: string; own: boolean }) {
  const { stats, extras, totals } = await loadProfile(userId);
  const acceptance = stats.acceptance === null ? null : Math.round(stats.acceptance * 1000) / 10;

  return (
    <>
      {/* Stats band: three serif numbers with hairline dividers. */}
      <div className="container-page">
        <dl
          className="grid grid-cols-3 border-b max-[960px]:-mx-[var(--pad)] max-[960px]:px-[var(--pad)]"
          data-testid="profile-stats"
        >
          <Stat label="Solved" index={0} first>
            <CountUp value={stats.solvedTotal} />
            <span className="ml-1 text-[0.4em] text-muted-foreground">/ {totals.total}</span>
          </Stat>
          <Stat label="Submissions" index={1}>
            <CountUp value={stats.submits} />
          </Stat>
          <Stat label="Acceptance" index={2} muted={acceptance === null}>
            {acceptance === null ? (
              "—"
            ) : (
              <>
                <CountUp value={acceptance} decimals={1} />
                <span className="ml-0.5 text-[0.4em] text-muted-foreground">%</span>
              </>
            )}
          </Stat>
        </dl>
      </div>

      <div className="container-page pt-10 pb-16 min-[961px]:pt-14">
        {/* minmax(0, …): long solved titles truncate instead of widening the page. */}
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <Reveal
            as="section"
            trigger="scroll"
            index={0}
            aria-labelledby="progress-heading"
            className="rounded-xl border bg-card p-6 shadow-sm sm:p-8"
          >
            <h2 id="progress-heading" className="font-display text-[2rem]/[1.1]">
              Proof sheet
            </h2>
            <p className="mt-1.5 text-[0.9375rem] text-muted-foreground">
              One square per problem. Filled means Accepted at least once.
            </p>
            <div className="mt-6 grid gap-5" data-testid="difficulty-progress">
              {DIFFICULTY_ORDER.map((d) => {
                const meta = DIFFICULTIES[d];
                return (
                  <div
                    key={d}
                    data-difficulty={d}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5 sm:grid-cols-[6.5rem_minmax(0,1fr)_auto]"
                  >
                    <span className={cn("inline-flex items-center gap-1.5 text-[0.9375rem] font-semibold", meta.text)}>
                      <DifficultyGlyph difficulty={d} />
                      {meta.label}
                    </span>
                    <ProofSquares
                      difficulty={d}
                      solved={stats.solved[d]}
                      attempted={extras.attempted[d]}
                      total={totals.byDifficulty[d]}
                      className="max-sm:order-last max-sm:col-span-2"
                    />
                    <span className="text-right font-mono text-sm text-foreground-secondary tabular-nums">
                      {stats.solved[d]} / {totals.byDifficulty[d]}
                      <span className="sr-only">
                        {" "}
                        solved{extras.attempted[d] > 0 ? `, ${extras.attempted[d]} attempted` : ""}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
            <ul aria-hidden className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t pt-5 text-sm text-muted-foreground">
              <li className="inline-flex items-center gap-2">
                <i className="block size-3 rounded-[3px] border-[1.5px] border-foreground-secondary bg-foreground-secondary" />
                Solved
              </li>
              <li className="inline-flex items-center gap-2">
                <i className="block size-3 rounded-[3px] border-[1.5px] border-dashed border-foreground-secondary" />
                Attempted
              </li>
              <li className="inline-flex items-center gap-2">
                <i className="block size-3 rounded-[3px] border-[1.5px] border-border-strong" />
                Not started
              </li>
            </ul>
            <div className="mt-5 grid gap-1">
              {DIFFICULTY_ORDER.map((d, i) => {
                const solved = stats.solved[d];
                const total = totals.byDifficulty[d];
                return (
                  <div key={d} className="grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-4 py-1.5 text-sm">
                    <span className={cn("inline-flex items-center gap-1.5 font-semibold", DIFFICULTIES[d].text)}>
                      <DifficultyGlyph difficulty={d} />
                      {DIFFICULTIES[d].label}
                    </span>
                    <Progress
                      value={solved}
                      max={total}
                      label={`${DIFFICULTIES[d].label}: ${solved} of ${total} solved`}
                      indicatorClassName={DIFFICULTIES[d].fill}
                      delayMs={200 + i * 120}
                    />
                    <span className="text-right font-mono text-[0.8125rem] text-muted-foreground tabular-nums">
                      {total > 0 ? Math.round((solved / total) * 100) : 0}%
                    </span>
                  </div>
                );
              })}
            </div>
          </Reveal>

          <Reveal
            as="section"
            trigger="scroll"
            index={1}
            aria-labelledby="recent-heading"
            className="rounded-xl border bg-card shadow-sm"
          >
            <div className="px-6 pt-6 sm:px-8 sm:pt-8">
              <h2 id="recent-heading" className="font-display text-[2rem]/[1.1]">
                Recently solved
              </h2>
              <p className="mt-1.5 text-[0.9375rem] text-muted-foreground">
                Last 10 unique problems, by first Accepted.
              </p>
            </div>
            {stats.recentSolved.length === 0 ? (
              <div className="px-6 pb-6 sm:px-8">
                <EmptyState
                  title="No solved problems yet"
                  headingLevel={3}
                  given={own ? "an open catalog" : "a new profile"}
                  want="a first Accepted"
                  className="mb-0"
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
              </div>
            ) : (
              <ol className="mt-4 divide-y px-6 pb-3 sm:px-8" data-testid="recent-solved">
                {stats.recentSolved.map((p) => {
                  const language = extras.solvedLanguage[p.slug];
                  return (
                    <li key={p.slug} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 py-3.5">
                      <Qed size={10} className="[background:var(--verdict-accepted)]" />
                      <div className="min-w-0">
                        <Link href={`/problems/${p.slug}`} title={p.title} className={cn(tableLinkClasses(), "block truncate")}>
                          {p.title}
                        </Link>
                        <p className="mt-0.5 flex items-center gap-2.5 text-[0.8125rem]">
                          <span className={cn("inline-flex items-center gap-1.5 font-semibold", DIFFICULTIES[p.difficulty].text)}>
                            <DifficultyGlyph difficulty={p.difficulty} />
                            {DIFFICULTIES[p.difficulty].label}
                          </span>
                          {language && <span className="text-muted-foreground">{LANGUAGE_LABELS[language]}</span>}
                        </p>
                      </div>
                      <time
                        dateTime={p.firstAcceptedAt.toISOString()}
                        className="font-mono text-[0.8125rem] text-muted-foreground tabular-nums"
                      >
                        {formatShortDate(p.firstAcceptedAt)}
                      </time>
                    </li>
                  );
                })}
              </ol>
            )}
          </Reveal>
        </div>
      </div>
    </>
  );
}

/** One number of the stats band: 96px serif (56px below 961px) over its label. */
function Stat({
  label,
  index,
  first = false,
  muted = false,
  children,
}: {
  label: string;
  index: number;
  first?: boolean;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Reveal
      index={index}
      className={cn(
        "flex min-w-0 flex-col-reverse py-7 min-[961px]:py-10",
        !first && "border-l pl-3.5 sm:pl-8",
        first ? "pr-3" : "pr-3 sm:pr-8",
      )}
    >
      <dt className="mt-3 text-sm text-muted-foreground sm:text-[0.9375rem]">{label}</dt>
      <dd
        className={cn(
          "font-display text-[2.75rem] leading-[0.9] tracking-[-0.01em] whitespace-nowrap tabular-nums sm:text-[4rem] min-[961px]:text-[6rem]",
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
    <div aria-busy="true">
      <span className="sr-only">Loading profile…</span>
      <div className="container-page grid grid-cols-3 gap-6 border-b py-8">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <div className="container-page grid gap-6 pt-10 pb-16 lg:grid-cols-[1.15fr_1fr]">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
