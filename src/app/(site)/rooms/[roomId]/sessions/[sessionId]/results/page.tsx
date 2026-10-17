import { BanIcon, LoaderCircleIcon, RotateCwIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { EmptyState } from "@/components/empty-state";
import { NOT_FOUND_TITLE } from "@/components/not-found-content";
import { PageHead } from "@/components/page-head";
import { LocalDate } from "@/components/rooms/local-date";
import { MemberPreferencesCard } from "@/components/rooms/room-settings";
import { FinalScoreboard, ProblemSummaryList, SessionDetails } from "@/components/rooms/session-results";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { plural, sessionResultsHref, sessionScreenHref } from "@/lib/rooms/history";
import { formatShortDate } from "@/lib/format";
import { getCurrentUser, requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { getSessionResults } from "@/server/rooms/results";

export const dynamic = "force-dynamic";

// One load per request for generateMetadata and the page.
const loadResults = cache(async (roomId: string, sessionId: string) => {
  const user = await getCurrentUser();
  if (!user) return null;
  return getSessionResults(getDb(), roomId, sessionId, user.id);
});

export async function generateMetadata({
  params,
}: PageProps<"/rooms/[roomId]/sessions/[sessionId]/results">): Promise<Metadata> {
  const { roomId, sessionId } = await params;
  const results = await loadResults(roomId, sessionId);
  if (!results || results.kind === "open") return { title: NOT_FOUND_TITLE };
  if (results.kind === "cancelled") return { title: `Cancelled session · ${results.room.name} · LemmaYard` };
  return {
    title: `Results ${formatShortDate(new Date(results.session.startedAt))} · ${results.room.name} · LemmaYard`,
  };
}

/**
 * Results of a finished session (spec §4, §5.2, §7.4). Members only (others
 * get the global 404); lobby and live sessions redirect to the session
 * screen; a cancelled session shows an empty state.
 */
export default async function SessionResultsPage({
  params,
}: PageProps<"/rooms/[roomId]/sessions/[sessionId]/results">) {
  const { roomId, sessionId } = await params;
  await requireUser(sessionResultsHref(roomId, sessionId));
  const results = await loadResults(roomId, sessionId);
  if (!results) notFound();
  if (results.kind === "open") redirect(sessionScreenHref(roomId, sessionId));

  const roomCrumb = { label: results.room.name, href: `/rooms/${roomId}` };
  if (results.kind === "cancelled") {
    return (
      <>
        <PageHead crumbs={[{ label: "Rooms", href: "/rooms" }, roomCrumb, { label: "Cancelled session" }]} title="Cancelled session" />
        <div className="container-page py-8">
          <div className="rounded-lg border bg-card shadow-xs">
            <EmptyState
              icon={BanIcon}
              title="This session was cancelled"
              action={
                <Link href={`/rooms/${roomId}`} className={buttonVariants({ variant: "secondary" })}>
                  Back to room
                </Link>
              }
            >
              It was cancelled before it started, so there are no results.
            </EmptyState>
          </div>
        </div>
      </>
    );
  }

  const { session, room, viewer } = results;
  const dateLabel = formatShortDate(new Date(session.startedAt));
  return (
    <>
      <PageHead
        crumbs={[{ label: "Rooms", href: "/rooms" }, roomCrumb, { label: `Results · ${dateLabel}` }]}
        title={
          <>
            Results ·{" "}
            <LocalDate iso={session.startedAt} options={{ month: "short", day: "numeric", year: "numeric" }} />
          </>
        }
        subtitle={`Finished · ${plural(results.participants.length, "participant")} · ${plural(results.problems.length, "problem")}`}
      />
      <div className="container-page flex flex-col gap-8 py-8">
        {session.pendingJudging > 0 && (
          <Alert variant="info" data-testid="pending-judging">
            <LoaderCircleIcon aria-hidden className="motion-safe:animate-spin-slow" />
            <AlertTitle>Judging {plural(session.pendingJudging, "submission")}… results may still change</AlertTitle>
            <AlertDescription>
              Submissions sent before the end still count.{" "}
              <a href={sessionResultsHref(roomId, sessionId)} className="inline-flex items-center gap-1">
                <RotateCwIcon aria-hidden className="size-3.5" />
                Refresh
              </a>
            </AlertDescription>
          </Alert>
        )}
        <FinalScoreboard results={results} />
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <ProblemSummaryList results={results} />
          <div className="flex min-w-0 flex-col gap-6">
            <SessionDetails results={results} />
            {room.shareSolutions ? (
              viewer.isParticipant && <MemberPreferencesCard roomId={roomId} shareSolutions={viewer.shareSolutions} />
            ) : (
              <Alert variant="info">
                <AlertTitle>Solution sharing is off in this room</AlertTitle>
                <AlertDescription>
                  Only you can open your own accepted code. The room owner can turn sharing on in the Members tab.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
