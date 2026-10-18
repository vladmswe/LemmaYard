import {
  ArrowRightIcon,
  BookOpenIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleIcon,
  CodeIcon,
  ShieldCheckIcon,
} from "lucide-react";
import Link from "next/link";

import { Qed } from "@/components/brand/qed";
import { TestSquares } from "@/components/judge/test-squares";
import { HeapFigure } from "@/components/landing/heap-figure";
import { exampleProgress, ProgressPreview } from "@/components/landing/progress-preview";
import { ProofStage } from "@/components/landing/proof-stage";
import { ProofGutter, SectionHead, SectionNumber } from "@/components/layout/section-head";
import { CountUp } from "@/components/motion/count-up";
import { Reveal } from "@/components/motion/reveal";
import { DifficultyBadge } from "@/components/problems/difficulty-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { LESSONS } from "@/content/learn";
import { formatTagLabel } from "@/lib/format";
import { buildRoadmap } from "@/lib/guide/content/roadmap";
import { getCurrentUser } from "@/server/auth/session";
import { getLandingData, LANGUAGE_COUNT } from "@/server/landing";

import "@/components/landing/landing.css";

const STEPS = [
  { title: "Pick a problem", body: "Filter by difficulty or topic and choose one that fits today." },
  { title: "Write your solution", body: "A real editor with a starter template in Python or JavaScript." },
  { title: "Run the samples", body: "See every case, the expected output, what you returned and your prints." },
  { title: "Submit", body: "The judge runs every hidden test and returns a verdict with runtime and memory." },
];

// The catalog card shows the real featured problems with example statuses.
const EXAMPLE_STATUS = [
  { icon: CircleCheckIcon, cls: "text-success" },
  { icon: CircleDashedIcon, cls: "text-warning" },
  { icon: CircleIcon, cls: "text-input" },
  { icon: CircleIcon, cls: "text-input" },
];

const EXAMPLE_BOARD = [
  { name: "Maya K.", initials: "MK", solved: ["pass", "pass", "pending"] as const, score: 2 },
  { name: "Ada L.", initials: "AL", solved: ["pass", "pending", "pending"] as const, score: 1 },
  { name: "Tom S.", initials: "TS", solved: ["pending", "pending", "pending"] as const, score: 0 },
];

function Arrow() {
  return <ArrowRightIcon aria-hidden data-arrow />;
}

export default async function Home() {
  const user = await getCurrentUser();
  // With the database unavailable, `stats` is null: the page renders without
  // counts, featured list and progress card (never with made-up numbers).
  const { stats, tests, featured, progress } = await getLandingData(user?.id ?? null);
  const lessons = buildRoadmap(LESSONS).flatMap((s) => s.lessons).length;
  const firstProblem = featured[0];
  const roomsHref = user ? "/rooms" : "/register?next=%2Frooms";

  type LedgerCell = { n: React.ReactNode; t: string };
  const ledger = ([
    stats && stats.total > 0 && {
      n: <CountUp value={stats.total} />,
      t: `original ${stats.total === 1 ? "problem" : "problems"}, each with examples and constraints`,
    },
    tests && {
      n:
        tests.min === tests.max ? (
          <CountUp value={tests.max} />
        ) : (
          <>
            {tests.min}–<CountUp value={tests.max} />
          </>
        ),
      t: "tests per problem, run in an isolated sandbox",
    },
    lessons > 0 && {
      n: <CountUp value={lessons} />,
      t: `guide ${lessons === 1 ? "lesson" : "lessons"} with step-through diagrams`,
    },
    { n: <CountUp value={LANGUAGE_COUNT} />, t: "languages: Python 3 and JavaScript" },
  ] as (LedgerCell | false | null)[]).filter((c): c is LedgerCell => Boolean(c));

  return (
    <>
      {/* Hero */}
      <section className="ly-hero" aria-labelledby="hero-title">
        <div aria-hidden className="grid-paper" />
        <div className="container-page ly-hero-grid">
          <ProofGutter lines={10} current={3} />
          <div className="ly-hero-copy">
            <Reveal as="p" className="eyebrow-accent">
              Lemma 1 · Coding practice
            </Reveal>
            {/* The H1 renders at once (LCP); only the ∎ snaps in. */}
            <h1 id="hero-title" className="display-hero mt-7 mb-7 min-[961px]:mb-8">
              Every solution is a small <em>proof</em>
              <Qed snap delayMs={1600} />
            </h1>
            <Reveal as="p" index={1} className="lead mb-10 max-w-[38ch]">
              Read a clear problem, write Python or JavaScript in the browser, and let a sandboxed
              judge check your reasoning, test by test.
            </Reveal>
            <Reveal index={2} className="flex flex-wrap gap-3">
              <Link
                href={user ? "/problems" : "/register"}
                className={buttonVariants({ size: "lg" })}
              >
                {user ? "Continue practicing" : "Start practicing"}
                <Arrow />
              </Link>
              <Link href="/problems" className={buttonVariants({ variant: "secondary", size: "lg" })}>
                Browse problems
              </Link>
            </Reveal>
            <Reveal
              as="ul"
              index={3}
              className="mt-10 flex flex-wrap gap-x-5.5 gap-y-2 text-sm text-muted-foreground"
            >
              {stats && stats.total > 0 && (
                <li className="inline-flex items-center gap-2">
                  <BookOpenIcon aria-hidden className="size-4 text-primary" />
                  <span className="tabular-nums">
                    {stats.total} original {stats.total === 1 ? "problem" : "problems"}
                  </span>
                </li>
              )}
              <li className="inline-flex items-center gap-2">
                <CodeIcon aria-hidden className="size-4 text-primary" />
                Python 3 &amp; JavaScript
              </li>
              <li className="inline-flex items-center gap-2">
                <ShieldCheckIcon aria-hidden className="size-4 text-primary" />
                Isolated sandbox
              </li>
            </Reveal>
          </div>
          <ProofStage />
        </div>
      </section>

      {/* § 01 Ledger: real repository facts */}
      <section className="ly-ledger" aria-label="What is inside">
        <div
          className="ly-ledger-grid container-page max-[960px]:px-0!"
          style={{ "--cells": ledger.length } as React.CSSProperties}
        >
          <div className="hidden py-8 min-[961px]:block">
            <SectionNumber n={1} />
          </div>
          {ledger.map((c, i) => (
            <Reveal trigger="scroll" index={i} key={c.t} className="ly-ledger-cell">
              <div className="font-display text-[2.5rem] leading-none tracking-[-0.01em] tabular-nums min-[961px]:text-[3.25rem]">
                {c.n}
              </div>
              <p className="mt-2.5 text-sm text-muted-foreground">{c.t}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* § 02 How it works: the page's cobalt block */}
      <section className="container-page pt-(--section)" aria-labelledby="how">
        <Reveal trigger="scroll" className="ly-howto on-cobalt grain">
          <div aria-hidden className="grid-paper" />
          <div className="relative">
            <p className="eyebrow-accent">§ 02 · How it works</p>
            <h2 id="how" className="display-1 mt-5.5 mb-5.5">
              From statement to <em>Accepted</em> in four steps.
            </h2>
            <p className="lead text-on-cobalt-2!">
              No timers unless you want one. Read, think, try, and get feedback you can act on.
            </p>
            <div aria-hidden className="ly-pipe mt-11">
              <span>statement</span>
              <i />
              <span>code</span>
              <i />
              <span>samples</span>
              <i />
              <span data-end>∎ verdict</span>
            </div>
          </div>
          <ol className="ly-steps relative">
            {STEPS.map((step, i) => (
              <Reveal as="li" trigger="scroll" index={i + 1} key={step.title}>
                <span aria-hidden className="font-mono text-[0.8125rem] leading-[1.9] text-on-cobalt-2">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="mb-1.5 text-[1.3125rem]/7 font-semibold tracking-[-0.01em]">
                    <span className="sr-only">Step {i + 1}: </span>
                    {step.title}
                  </h3>
                  <p className="text-on-cobalt-2">{step.body}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </Reveal>
      </section>

      {/* § 03 Three ways to practice */}
      <section className="container-page pt-(--section)" aria-labelledby="ways">
        <SectionHead
          n={3}
          className="mb-7 min-[961px]:mb-12"
          title={
            <Reveal as="span" trigger="scroll" className="block">
              <h2 id="ways" className="display-1 max-w-[14ch]">
                Three ways to <em>practice</em>.
              </h2>
            </Reveal>
          }
          action={
            <Link href="/problems" className={buttonVariants({ variant: "secondary" })}>
              See all problems
              <Arrow />
            </Link>
          }
        />
        <div className="ly-ways">
          <Reveal trigger="scroll" className="ly-way border bg-card transition-[transform,box-shadow,border-color] duration-200 ease-out hover:border-border-strong hover:shadow-md motion-safe:hover:-translate-y-[3px]" data-way="catalog">
            <div className="mb-7 flex items-center justify-between">
              <span className="label-mono text-muted-foreground">Catalog</span>
              <span className="example-tag">Example</span>
            </div>
            {featured.length > 0 && (
              <div aria-hidden className="overflow-hidden rounded-lg border bg-background">
                {featured.map((p, i) => {
                  const s = EXAMPLE_STATUS[i % EXAMPLE_STATUS.length];
                  return (
                    <div
                      key={p.slug}
                      className="grid h-[46px] grid-cols-[22px_32px_minmax(0,1fr)_auto] items-center gap-2.5 border-t px-3.5 text-[0.90625rem] first:border-t-0"
                    >
                      <s.icon className={`size-[18px] ${s.cls}`} strokeWidth={1.75} />
                      <span className="font-mono text-[0.78125rem] text-muted-foreground">{p.number}</span>
                      <span className="truncate">{p.title}</span>
                      <DifficultyBadge difficulty={p.difficulty} variant="text" />
                    </div>
                  );
                })}
              </div>
            )}
            <h3 className="display-3 mt-auto mb-2.5 pt-10">Problems with clear statements</h3>
            <p className="max-w-[44ch] text-foreground-secondary">
              Worked examples, explicit constraints and hidden tests. Filter by difficulty, topic
              and status.
            </p>
            <Link href="/problems" className="mt-3 inline-flex min-h-10 items-center gap-2 self-start rounded-sm font-semibold text-link underline-offset-4 hover:underline">
              Browse the catalog
              <ArrowRightIcon aria-hidden className="size-4" />
            </Link>
          </Reveal>

          <Reveal trigger="scroll" index={1} className="ly-way bg-secondary text-secondary-foreground" data-way="guide">
            <div className="mb-7 flex items-center justify-between">
              <span className="label-mono">Data Structures guide</span>
              <span className="example-tag border-current/50! text-current!">Figure</span>
            </div>
            <div className="mb-6">
              <HeapFigure />
            </div>
            <h3 className="display-3 mt-auto mb-2.5">See the structure move</h3>
            <p className="max-w-[44ch]">
              Lessons with step-through diagrams, code in both languages and practice links.
            </p>
            <Link href="/learn" className="mt-3 inline-flex min-h-10 items-center gap-2 self-start rounded-sm font-semibold underline-offset-4 hover:underline">
              Open the guide
              <ArrowRightIcon aria-hidden className="size-4" />
            </Link>
          </Reveal>

          <Reveal trigger="scroll" index={2} className="ly-way on-night grain" data-way="rooms">
            <div>
              <div className="mb-7 flex items-center gap-3">
                <span className="label-mono text-on-night-2">Private rooms</span>
              </div>
              <h3 className="display-3 mb-2.5">Weekly sessions with friends</h3>
              <p className="mb-7 max-w-[48ch] text-on-night-2">
                Create a private room, pick problems for the session and solve them together. A
                shared timer, a scoreboard and a notification when someone gets Accepted.
              </p>
              <Link href={roomsHref} className={buttonVariants({ variant: "invert" })}>
                {user ? "Go to your rooms" : "Sign up to create a room"}
                <Arrow />
              </Link>
            </div>
            <div
              aria-hidden
              className="overflow-hidden rounded-xl border border-night-line bg-white/[0.03] max-[960px]:mt-7"
            >
              <div className="flex items-center gap-3 border-b border-night-line px-4.5 py-3.5">
                <span className="label-mono text-on-night-2">Scoreboard · Example</span>
                <span className="ml-auto font-mono text-[1.375rem] leading-none tracking-[0.02em] tabular-nums">
                  00:41:07
                </span>
              </div>
              {EXAMPLE_BOARD.map((r, i) => (
                <div
                  key={r.name}
                  className="grid grid-cols-[20px_32px_minmax(0,1fr)_44px] items-center gap-3 border-t border-night-line px-4.5 py-3 text-[0.9375rem] first:border-t-0 min-[961px]:grid-cols-[26px_36px_minmax(0,1fr)_auto_56px]"
                >
                  <span className="font-mono text-[0.8125rem] text-on-night-2">{i + 1}</span>
                  <span className="grid size-8 place-items-center rounded-[10px] bg-sky/20 text-[0.78125rem] font-semibold">
                    {r.initials}
                  </span>
                  <span className="truncate">{r.name}</span>
                  <TestSquares results={r.solved} className="hidden min-[961px]:inline-flex" />
                  <span className="text-right font-display text-[1.625rem] leading-none">{r.score}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* § 04 Start with these */}
      {featured.length > 0 && (
        <section className="container-page pt-(--section)" aria-labelledby="start">
          <SectionHead
            n={4}
            className="mb-7 min-[961px]:mb-12"
            title={
              <Reveal as="span" trigger="scroll" className="block">
                <h2 id="start" className="display-2">
                  Start with these.
                </h2>
              </Reveal>
            }
            description="Good first problems, picked to build fundamentals."
            action={
              <Link href="/problems" className={buttonVariants({ variant: "secondary" })}>
                View all problems
                <Arrow />
              </Link>
            }
          />
          <ul className="border-t">
            {featured.map((p, i) => (
              <Reveal as="li" trigger="scroll" index={i} key={p.slug}>
                <Link href={`/problems/${p.slug}`} className="ly-thm focus-visible:-outline-offset-2">
                  <span aria-hidden className="no tabular-nums">
                    {String(p.number).padStart(2, "0")}
                  </span>
                  <span className="tt text-[1.0625rem]/[1.3] font-semibold tracking-[-0.01em] min-[961px]:text-xl">
                    <span className="sr-only">{p.number}. </span>
                    {p.title}
                  </span>
                  <span className="meta">
                    <span className="tg">
                      {p.tags.map((t) => (
                        <Badge key={t} variant="tag">
                          {formatTagLabel(t)}
                        </Badge>
                      ))}
                    </span>
                    <DifficultyBadge difficulty={p.difficulty} variant="text" />
                  </span>
                  <ArrowRightIcon aria-hidden className="go size-5.5" />
                </Link>
              </Reveal>
            ))}
          </ul>
        </section>
      )}

      {/* § 05 Profile */}
      <section className="container-page pt-(--section)" aria-labelledby="prof">
        <div className="grid items-center gap-8 min-[961px]:grid-cols-[var(--gutter-w)_minmax(0,1fr)_minmax(0,1.1fr)] min-[961px]:gap-x-14">
          <SectionNumber n={5} className="hidden self-start pt-[4.2em] min-[961px]:block" />
          <div>
            <p className="eyebrow-accent">Your profile</p>
            <Reveal as="span" trigger="scroll" className="block">
              <h2 id="prof" className="display-2 my-5">
                See how far you have <em>come</em>.
              </h2>
            </Reveal>
            <Reveal as="p" trigger="scroll" index={1} className="lead max-w-[38ch]">
              Each problem counts once, by difficulty. Every submission keeps its code, verdict and
              timing.
            </Reveal>
            <Reveal trigger="scroll" index={2} className="mt-8">
              {user ? (
                <Link href={`/u/${user.username}`} className={buttonVariants({ size: "lg" })}>
                  View your profile
                  <Arrow />
                </Link>
              ) : (
                <Link href="/register" className={buttonVariants({ size: "lg" })}>
                  Create a free account
                  <Arrow />
                </Link>
              )}
            </Reveal>
          </div>
          {stats && (
            <Reveal trigger="scroll" index={1}>
              {progress ? (
                <ProgressPreview
                  username={user?.username}
                  numbers={{
                    solved: progress.solved,
                    totals: stats.byDifficulty,
                    submits: progress.submits,
                    acceptance: progress.acceptance,
                  }}
                />
              ) : (
                <ProgressPreview numbers={exampleProgress(stats.byDifficulty)} example />
              )}
            </Reveal>
          )}
        </div>
      </section>

      {/* § 06 Closing */}
      <section
        className="container-page grid items-center gap-y-12 py-18 min-[961px]:grid-cols-[var(--gutter-w)_minmax(0,1fr)_minmax(0,0.9fr)] min-[961px]:gap-x-14 min-[961px]:py-(--section)"
        aria-labelledby="go"
      >
        <SectionNumber n={6} className="hidden min-[961px]:block" />
        <div>
          <Reveal as="span" trigger="scroll" className="block">
            <h2 id="go" className="display-1 max-[960px]:text-[2.6rem] min-[961px]:max-w-[13ch]">
              Your first proof is one problem away
              <Qed />
            </h2>
          </Reveal>
          <Reveal trigger="scroll" index={1} className="mt-11 flex flex-wrap gap-3">
            {firstProblem ? (
              <Link href={`/problems/${firstProblem.slug}`} className={buttonVariants({ size: "lg" })}>
                Solve {firstProblem.title}
                <Arrow />
              </Link>
            ) : (
              <Link href="/problems" className={buttonVariants({ size: "lg" })}>
                Browse problems
                <Arrow />
              </Link>
            )}
            <Link href="/learn" className={buttonVariants({ variant: "ghost", size: "lg" })}>
              Read the guide first
            </Link>
          </Reveal>
        </div>
        <Reveal trigger="scroll" index={2} className="ly-unproof hidden min-[961px]:block" aria-hidden>
          <div>
            <span className="k">Given</span> nums, target
          </div>
          <div>
            <span className="k">Want</span>&nbsp; i ≠ j, nums[i] + nums[j] = target
          </div>
          <div>
            <span className="k">Proof</span> <span className="caret" />
          </div>
          <div>&nbsp;</div>
          <div className="text-faint-foreground"># your move</div>
          <span className="qbox" />
        </Reveal>
      </section>
    </>
  );
}
