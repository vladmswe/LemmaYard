import { ArrowRightIcon, BookOpenIcon, CodeIcon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";

import { HeroIllustration } from "@/components/landing/hero-illustration";
import { exampleProgress, ProgressPreview } from "@/components/landing/progress-preview";
import { Reveal } from "@/components/motion/reveal";
import { DifficultyBadge } from "@/components/problems/difficulty-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  tableLinkClasses,
} from "@/components/ui/table";
import { formatPercent } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/session";
import { getCatalogStats, getFeaturedProblems, getUserProgress } from "@/server/landing";

const VALUE_PROPS = [
  {
    title: "Clear problem statements",
    body: "Every problem has a precise description, worked examples and explicit constraints, written for learners.",
  },
  {
    title: "Feedback you can act on",
    body: "See the failing input, the expected output and what your code returned, plus your own print output.",
  },
  {
    title: "Progress you can see",
    body: "Track solved problems by difficulty and revisit any past submission with its code.",
  },
];

const STEPS = [
  { title: "Pick a problem", body: "Filter by difficulty or topic and choose one that fits today." },
  { title: "Write your solution", body: "Use the in-browser editor with a starter template." },
  { title: "Run the samples", body: "Check your code on the examples or on your own input." },
  { title: "Submit", body: "The judge runs every hidden test and returns a verdict." },
];

export default async function Home() {
  const user = await getCurrentUser();
  const [stats, featured, progress] = await Promise.all([
    getCatalogStats(),
    getFeaturedProblems(),
    user ? getUserProgress(user.id) : Promise.resolve(null),
  ]);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b bg-surface-sunken">
        <div aria-hidden className="graph-paper" />
        <div className="container-page relative grid items-center gap-10 pt-12 pb-14 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:pt-20 lg:pb-22">
          <Reveal>
            <div aria-hidden className="mb-5 h-[3px] w-12 bg-gold" />
            <p className="eyebrow mb-3">Coding practice, at your own pace</p>
            <h1 className="font-heading text-4xl/11 font-semibold tracking-[-0.02em] text-balance sm:text-[3.25rem]/[3.75rem]">
              Learn to solve problems, one step at a time.
            </h1>
            <p className="mt-5 mb-8 max-w-[34rem] text-[1.1875rem]/[1.875rem] text-foreground-secondary">
              Short, well-written problems with examples and constraints. Write a solution in Python
              or JavaScript, check it against the samples, then submit it to a sandboxed judge.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={user ? "/problems" : "/register"}
                className={buttonVariants({ size: "lg", className: "group/cta" })}
              >
                {user ? "Continue practicing" : "Start practicing"}
                <ArrowRightIcon className="transition-transform duration-180 ease-out motion-safe:group-hover/cta:translate-x-0.5" />
              </Link>
              <Link href="/problems" className={buttonVariants({ variant: "secondary", size: "lg" })}>
                Browse problems
              </Link>
            </div>
            <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <li className="inline-flex items-center gap-1.5">
                <BookOpenIcon aria-hidden className="size-4 text-primary" />
                <span className="tabular-nums">
                  {stats.total} original {stats.total === 1 ? "problem" : "problems"}
                </span>
              </li>
              <li className="inline-flex items-center gap-1.5">
                <CodeIcon aria-hidden className="size-4 text-primary" />
                Python 3 &amp; JavaScript
              </li>
              <li className="inline-flex items-center gap-1.5">
                <ShieldCheckIcon aria-hidden className="size-4 text-primary" />
                Isolated sandbox
              </li>
            </ul>
          </Reveal>
          <HeroIllustration />
        </div>
      </section>

      {/* Why */}
      <section className="py-14 md:py-22">
        <div className="container-page grid items-start gap-8 md:grid-cols-[1fr_1.25fr] md:gap-16">
          <Reveal>
            <p className="eyebrow mb-3">Why LemmaYard</p>
            <h2 className="font-heading text-3xl/[2.375rem] font-semibold tracking-[-0.015em] sm:text-4xl/11">
              A calmer way to practice
            </h2>
            <p className="mt-4 text-[1.1875rem]/[1.875rem] text-foreground-secondary">
              No timers, no leaderboards. Read the problem, think it through, and get clear feedback
              on what went wrong.
            </p>
          </Reveal>
          <ol className="border-b">
            {VALUE_PROPS.map((prop, i) => (
              <Reveal
                as="li"
                index={i + 1}
                key={prop.title}
                className="grid grid-cols-[3.5rem_1fr] gap-2 border-t py-5.5"
              >
                <span aria-hidden className="font-heading text-[1.75rem]/8 font-semibold text-primary tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="text-[1.0625rem]/6 font-semibold">{prop.title}</h3>
                  <p className="mt-1 text-foreground-secondary">{prop.body}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* How it works */}
      <section className="border-y bg-surface-sunken py-14 md:py-22">
        <div className="container-page">
          <Reveal>
            <p className="eyebrow mb-3">How it works</p>
            <h2 className="font-heading text-2xl/8 font-semibold tracking-[-0.01em] sm:text-[1.75rem]/9">
              From reading to Accepted in four steps
            </h2>
          </Reveal>
          <ol className="relative mt-10 grid gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
            <span
              aria-hidden
              className="absolute top-5 right-[calc((100%-72px)/4-20px)] left-5 hidden h-0.5 bg-border lg:block"
            />
            {STEPS.map((step, i) => (
              <Reveal
                as="li"
                index={i + 1}
                key={step.title}
                className="relative grid grid-cols-[2.5rem_1fr] gap-x-4 sm:block"
              >
                <span
                  aria-hidden
                  className="relative row-span-2 grid size-10 place-items-center rounded-full border-2 border-primary bg-card font-heading text-[1.0625rem] leading-none font-semibold text-primary sm:mb-4"
                >
                  {i + 1}
                </span>
                <h3 className="text-[1.0625rem]/6 font-semibold">
                  <span className="sr-only">Step {i + 1}: </span>
                  {step.title}
                </h3>
                <p className="mt-1.5 text-[0.9375rem]/6 text-foreground-secondary">{step.body}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Featured */}
      {featured.length > 0 && (
        <section className="py-14 md:py-22">
          <div className="container-page">
            <Reveal className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <h2 className="font-heading text-2xl/8 font-semibold tracking-[-0.01em] sm:text-[1.75rem]/9">
                  Start with these
                </h2>
                <p className="mt-2 text-muted-foreground">
                  Good first problems, picked to build fundamentals.
                </p>
              </div>
              <Link href="/problems" className={buttonVariants({ variant: "secondary" })}>
                View all problems
                <ArrowRightIcon />
              </Link>
            </Reveal>
            <Reveal index={1}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead numeric className="w-16">
                      #
                    </TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead className="hidden sm:table-cell">Topics</TableHead>
                    <TableHead numeric className="hidden w-32 sm:table-cell">
                      Acceptance
                    </TableHead>
                    <TableHead className="w-28">Difficulty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {featured.map((p) => (
                    <TableRow key={p.slug}>
                      <TableCell numeric className="text-muted-foreground">
                        {p.number}
                      </TableCell>
                      <TableCell>
                        <Link href={`/problems/${p.slug}`} className={tableLinkClasses()}>
                          {p.title}
                        </Link>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="flex flex-wrap gap-1.5">
                          {p.tags.map((t) => (
                            <Badge key={t} variant="tag">
                              {t}
                            </Badge>
                          ))}
                        </span>
                      </TableCell>
                      <TableCell
                        numeric
                        className={`hidden sm:table-cell ${p.acceptance === null ? "text-muted-foreground" : ""}`}
                      >
                        {formatPercent(p.acceptance)}
                      </TableCell>
                      <TableCell>
                        <DifficultyBadge difficulty={p.difficulty} variant="text" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Reveal>
          </div>
        </section>
      )}

      {/* Progress preview */}
      <section className="border-t bg-surface-sunken py-14 md:py-22">
        <div className="container-page grid items-start gap-8 md:grid-cols-[1fr_1.25fr] md:gap-16">
          <Reveal>
            <p className="eyebrow mb-3">Your profile</p>
            <h2 className="font-heading text-2xl/8 font-semibold tracking-[-0.01em] sm:text-[1.75rem]/9">
              See how far you have come
            </h2>
            <p className="mt-4 mb-6 text-[1.1875rem]/[1.875rem] text-foreground-secondary">
              Your profile counts each problem once, by difficulty, and keeps a list of what you
              solved recently.
            </p>
            {user ? (
              <Link href={`/u/${user.username}`} className={buttonVariants()}>
                View your profile
              </Link>
            ) : (
              <Link href="/register" className={buttonVariants()}>
                Create a free account
              </Link>
            )}
          </Reveal>
          <Reveal index={1}>
            {progress ? (
              <ProgressPreview
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
        </div>
      </section>
    </>
  );
}
