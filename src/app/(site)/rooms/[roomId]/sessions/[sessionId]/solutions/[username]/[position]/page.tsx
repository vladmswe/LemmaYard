import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { NOT_FOUND_TITLE } from "@/components/not-found-content";
import { PageHead } from "@/components/page-head";
import { DifficultyBadge } from "@/components/problems/difficulty-badge";
import { CodeViewer } from "@/components/submissions/code-viewer";
import { buttonVariants } from "@/components/ui/button";
import { formatShortDate } from "@/lib/format";
import { plural, sessionResultsHref, solutionHref } from "@/lib/rooms/history";
import { formatScoreTime } from "@/lib/rooms/scoring";
import { formatMemory, formatMs } from "@/lib/workspace/judge-state";
import { LANGUAGE_LABELS } from "@/lib/workspace/languages";
import { getCurrentUser, requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { getSessionSolution } from "@/server/rooms/results";

export const dynamic = "force-dynamic";

const loadSolution = cache(async (roomId: string, sessionId: string, username: string, position: string) => {
  const user = await getCurrentUser();
  if (!user) return null;
  return getSessionSolution(getDb(), roomId, sessionId, user.id, { username }, position);
});

type Props = PageProps<"/rooms/[roomId]/sessions/[sessionId]/solutions/[username]/[position]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { roomId, sessionId, username, position } = await params;
  const solution = await loadSolution(roomId, sessionId, username, position);
  if (!solution) return { title: NOT_FOUND_TITLE };
  return { title: `${solution.author.username} · ${solution.problem.title} · ${solution.room.name} · LemmaYard` };
}

/**
 * Read-only accepted code of one participant for one problem of a finished
 * session (spec §4.5, D2). 404 unless finished, the viewer is a member and
 * the author shares (or the viewer is the author).
 */
export default async function SessionSolutionPage({ params }: Props) {
  const { roomId, sessionId, username, position } = await params;
  await requireUser(solutionHref(roomId, sessionId, username, Number(position) || 1));
  const solution = await loadSolution(roomId, sessionId, username, position);
  if (!solution) notFound();

  const resultsHref = sessionResultsHref(roomId, sessionId);
  const date = formatShortDate(new Date(solution.session.startedAt));
  const solvedAt =
    `solved at ${formatScoreTime(solution.solveSeconds)}` +
    (solution.wrongBefore > 0 ? ` after ${plural(solution.wrongBefore, "wrong attempt")}` : "");

  return (
    <>
      <PageHead
        crumbs={[
          { label: "Rooms", href: "/rooms" },
          { label: solution.room.name, href: `/rooms/${roomId}` },
          { label: `Results · ${date}`, href: resultsHref },
          { label: `${solution.author.username} · Problem ${solution.position}` },
        ]}
        title={`${solution.author.username} · Problem ${solution.position}`}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            {solution.problem.published ? (
              <Link
                href={`/problems/${solution.problem.slug}`}
                className="font-semibold text-link underline-offset-4 hover:underline"
              >
                {solution.problem.title}
              </Link>
            ) : (
              <span className="font-semibold text-foreground">{solution.problem.title}</span>
            )}
            <DifficultyBadge difficulty={solution.problem.difficulty} />
            <span aria-hidden>·</span>
            <span>{LANGUAGE_LABELS[solution.language]}</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{formatMs(solution.runtimeMs)}</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{formatMemory(solution.memoryKb)}</span>
          </span>
        }
        actions={
          <Link href={resultsHref} className={buttonVariants({ variant: "secondary" })}>
            <ArrowLeftIcon aria-hidden />
            Back to results
          </Link>
        }
      />
      <div className="container-page flex flex-col gap-4 py-8">
        <p className="text-sm text-muted-foreground">
          The first accepted submission in this session, {solvedAt}.{" "}
          {solution.viewerIsAuthor
            ? "This is your code."
            : `${solution.author.username} shares accepted solutions with this room.`}
        </p>
        <CodeViewer
          id={`room-${sessionId}-${solution.position}-${solution.author.username}`}
          language={solution.language}
          code={solution.code}
        />
      </div>
    </>
  );
}
