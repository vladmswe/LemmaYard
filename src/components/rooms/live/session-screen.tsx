"use client";

// Session screen /rooms/[roomId]/sessions/[sessionId] (docs/specs/rooms.md
// §7.4): one route, Lobby → Live → Finished (or Cancelled), driven by the
// session poller. History events are replayed into the Activity feed on load
// (from cursor 0) without being announced; only newer events notify.
import { CalendarXIcon, FlagIcon, LoaderCircleIcon, LogInIcon, UserPlusIcon, WifiOffIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";

import { Qed } from "@/components/brand/qed";
import { EmptyState } from "@/components/empty-state";
import { useMediaQuery } from "@/components/problem/use-media-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PendingCell, RoomEvent } from "@/lib/rooms/events";
import { milestoneMessage } from "@/lib/rooms/live-clock";
import {
  chips,
  pendingJudgingText,
  resultsHref,
  scoreboardRows,
  sessionHref,
  sessionProblemHref,
  viewerChips,
} from "@/lib/rooms/live-view";
import {
  eventNotice,
  feedLine,
  isHistoryEvent,
  judgingFeedLine,
  type FeedLine,
  type JudgingEntry,
  type NoticeContext,
} from "@/lib/rooms/notifications";
import type { LobbyView } from "@/lib/rooms/session-view";
import type { SessionPageData } from "@/server/rooms/session-page";

import { MatrixLegend, ScoreMatrix, YouChips } from "../matrix/score-matrix";
import { ActivityFeed } from "./activity-feed";
import { Countdown } from "./countdown";
import { CLOCK, DAY, DAY_CLOCK, formatLocal, LocalTime, useIsClient } from "./local-time";
import { NewSessionButton } from "./new-session-button";
import { NotificationSettings, NotificationSwitches } from "./notification-settings";
import { ProblemList } from "./problem-list";
import { sessionApi } from "./session-api";
import { SessionStatusBadge } from "./session-status";
import { useAnnouncer } from "./use-notifications";
import { useSessionLive } from "./use-session-live";
import { SessionLobby } from "../lobby/session-lobby";

const LARGE = "(min-width: 1024px)";
const MAX_EVENTS = 300;

/** `judgeEnabled` false: this deployment runs no code, so the lobby cannot start (JUDGE_ENABLED). */
export function SessionScreen({ data, judgeEnabled }: { data: SessionPageData; judgeEnabled: boolean }) {
  const router = useRouter();
  const roomId = data.room.id;
  const sessionId = data.session.id;
  const roomHref = `/rooms/${roomId}`;
  const scoreboardHref = `${sessionHref(roomId, sessionId)}#scoreboard`;
  const initialCursor = useRef(data.state.cursor);

  const [events, setEvents] = useState<RoomEvent[]>([]);
  const [lobby, setLobby] = useState<LobbyView | null>(data.lobby);
  const [prevLobbyProp, setPrevLobbyProp] = useState(data.lobby);
  if (prevLobbyProp !== data.lobby) {
    setPrevLobbyProp(data.lobby);
    if (data.lobby) setLobby(data.lobby);
  }

  const announce = useAnnouncer({
    sessionId,
    // The Activity feed is this screen's announcement; only the start toasts (§3.5).
    toasts: (n) => n.kind === "started",
    scoreboardHref,
  });

  const noticeCtx = useRef<NoticeContext | null>(null);
  const statusRef = useRef(data.state.status);
  const lobbyFetch = useRef<Promise<void> | null>(null);

  const refetchLobby = useCallback(() => {
    if (lobbyFetch.current) return;
    lobbyFetch.current = sessionApi.lobby(roomId, sessionId).then((res) => {
      lobbyFetch.current = null;
      if (res.ok) setLobby(res.data.lobby);
    });
  }, [roomId, sessionId]);

  const onEvents = useCallback(
    (batch: RoomEvent[]) => {
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        const fresh = batch.filter((e) => !seen.has(e.id));
        return fresh.length === 0 ? prev : [...prev, ...fresh].slice(-MAX_EVENTS);
      });
      const fresh = batch.filter((e) => !isHistoryEvent(e.id, initialCursor.current));
      if (fresh.some((e) => e.type === "lobby_updated" || e.type === "participant_joined")) refetchLobby();
      if (
        fresh.some((e) => e.type === "session_ended" || e.type === "session_cancelled" || e.type === "session_started")
      ) {
        router.refresh();
      }
      const ctx = noticeCtx.current;
      if (!ctx) return;
      const isLive = statusRef.current === "live" || fresh.some((e) => e.type === "session_started");
      announce(fresh.map((e) => eventNotice(e, ctx, isLive)).filter((n) => n !== null));
    },
    [announce, refetchLobby, router],
  );

  const live = useSessionLive({ roomId, sessionId, initial: data.state, fromCursor: "0", onEvents });
  const snapshot = live.snapshot;
  const titles = useMemo(
    () => new Map((snapshot?.problems ?? []).filter((p) => p.title).map((p) => [p.position, p.title!])),
    [snapshot],
  );
  const firstSlug = snapshot?.problems.find((p) => p.position === 1)?.slug ?? null;

  useEffect(() => {
    noticeCtx.current = {
      viewerId: data.viewerId,
      titles,
      problemCount: snapshot?.session.problemCount ?? data.session.problemCount,
      durationMin: snapshot?.session.durationMin ?? data.session.durationMin,
      showAttempts: false,
      links: {
        scoreboard: scoreboardHref,
        results: resultsHref(roomId, sessionId),
        firstProblem: firstSlug ? sessionProblemHref(firstSlug, sessionId) : null,
      },
    };
  }, [titles, snapshot, data, firstSlug, roomId, sessionId, scoreboardHref]);

  const startedAt = snapshot?.session.startedAt ?? data.session.startedAt;
  const feed = useMemo(
    () =>
      events
        .map((e) => feedLine(e, { titles }, startedAt))
        .filter((l): l is FeedLine => l !== null)
        .reverse(),
    [events, titles, startedAt],
  );
  const judgingLines = useMemo(
    () => live.judging.map((j: JudgingEntry) => judgingFeedLine(j, startedAt)),
    [live.judging, startedAt],
  );

  const status = live.status;
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  const canManage = live.viewer.canManage;
  const [joining, setJoining] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [ending, setEnding] = useState(false);

  async function joinLive() {
    setJoining(true);
    const res = await sessionApi.join(roomId, sessionId);
    setJoining(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    live.patch({ viewer: { ...live.viewer, isParticipant: true } });
    live.refresh();
  }

  async function endSession() {
    setEnding(true);
    const res = await sessionApi.end(roomId, sessionId);
    setEnding(false);
    setEndOpen(false);
    if (!res.ok) toast.error(res.error);
    live.refresh();
  }

  const onMilestone = useCallback(
    (ms: number) => announce([{ id: `milestone-${ms}`, kind: "milestone", title: milestoneMessage(ms) }]),
    [announce],
  );

  // --- Head band ------------------------------------------------------------
  // Live: the night hero with the giant timer (DESIGN.md §13.10). Lobby,
  // finished and cancelled: a quiet paper head.
  const dateIso = startedAt ?? data.session.createdAt;
  const isLive = status === "live";
  const head = (
    <div
      className={cn(
        "relative overflow-hidden border-b",
        isLive ? "room-hero on-night grain border-night-line" : "bg-background",
      )}
    >
      <div
        aria-hidden
        className="grid-paper [mask-image:radial-gradient(70%_100%_at_85%_20%,#000_25%,transparent_80%)]"
      />
      <div className="container-page relative flex flex-col gap-6 py-8 min-[961px]:py-10 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Breadcrumb className="mb-4">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href="/rooms" />}>Rooms</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href={roomHref} />} className="break-words">
                  {data.room.name}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Session</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <SessionStatusBadge status={status} className="mb-4" />
          <h1 className={cn("break-words", isLive ? "display-1 max-w-[16ch]" : "display-2")}>
            {isLive ? (
              <>
                {data.room.name}
                <Qed />
              </>
            ) : (
              <>
                Session · <LocalTime iso={dateIso} options={DAY} />
              </>
            )}
          </h1>
          <HeadMeta data={data} status={status} participants={snapshot?.participants.length ?? 0} />
        </div>
        <div className="flex flex-col items-start gap-4 lg:items-end">
          {isLive && (
            <div className="hidden lg:block">
              <Countdown
                endsAt={live.endsAt}
                offsetMs={live.offsetMs}
                size="hero"
                totalMs={(snapshot?.session.durationMin ?? data.session.durationMin) * 60_000}
                onExpire={live.refresh}
                onMilestone={onMilestone}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {(isLive || status === "lobby") && (
              <NotificationSettings
                className={isLive ? "text-on-night hover:bg-white/10 hover:text-on-night" : undefined}
              />
            )}
            {isLive && !live.viewer.isParticipant && (
              <Button variant="invert" loading={joining} onClick={joinLive} data-testid="join-live">
                <UserPlusIcon aria-hidden />
                Join session
              </Button>
            )}
            {isLive && canManage && (
              <Button variant="night" onClick={() => setEndOpen(true)} data-testid="end-session">
                <FlagIcon aria-hidden />
                End session
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {head}
      {status === "live" && (
        <div className="sticky top-[60px] z-30 min-[961px]:top-[68px] flex h-12 items-center justify-between border-b bg-card px-4 shadow-xs lg:hidden">
          <Countdown
            endsAt={live.endsAt}
            offsetMs={live.offsetMs}
            size="inline"
            onExpire={live.refresh}
            announce={false}
          />
          {snapshot && <StickyChips snapshot={snapshot} viewerId={data.viewerId} pending={live.pending} />}
        </div>
      )}
      <div className="container-page flex flex-col gap-6 py-8">
        <ConnectionNotice connection={live.connection} sessionPath={sessionHref(roomId, sessionId)} />
        {status === "lobby" && lobby && (
          <SessionLobby
            roomId={roomId}
            sessionId={sessionId}
            viewerId={data.viewerId}
            lobby={lobby}
            onLobby={setLobby}
            snapshot={snapshot}
            viewer={live.viewer}
            tags={data.tags}
            refresh={live.refresh}
            onJoinedChange={(joined) => live.patch({ viewer: { ...live.viewer, isParticipant: joined } })}
            judgeEnabled={judgeEnabled}
          />
        )}
        {status === "live" && snapshot && (
          <LiveBody
            data={data}
            snapshot={snapshot}
            feed={feed}
            judging={judgingLines}
            isParticipant={live.viewer.isParticipant}
            pendingCells={live.pending}
          />
        )}
        {status === "finished" && snapshot && (
          <FinishedBody
            data={data}
            snapshot={snapshot}
            feed={feed}
            pendingCells={live.pending}
            pending={live.pendingJudging}
            roomId={roomId}
            sessionId={sessionId}
          />
        )}
        {(status === "cancelled" || (status === "lobby" && !lobby)) && (
          <EmptyState
            icon={CalendarXIcon}
            title="This session was cancelled"
            action={
              <Link href={roomHref} className={buttonVariants({ variant: "secondary" })}>
                Back to room
              </Link>
            }
          >
            {data.session.endReason === "stale"
              ? "The lobby was open for more than a week without starting."
              : "Nothing was scored."}
          </EmptyState>
        )}
      </div>

      <AlertDialog open={endOpen} onOpenChange={setEndOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End the session now?</AlertDialogTitle>
            <AlertDialogDescription>
              The timer stops for everyone. Submissions already sent are still judged and count.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep going</AlertDialogCancel>
            <AlertDialogAction variant="destructive" loading={ending} onClick={endSession} data-testid="confirm-end">
              End session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function HeadMeta({
  data,
  status,
  participants,
}: {
  data: SessionPageData;
  status: SessionPageData["session"]["status"];
  participants: number;
}) {
  const client = useIsClient();
  const s = data.session;
  const people = `${participants} participant${participants === 1 ? "" : "s"}`;
  let text: string;
  if (status === "finished" && s.startedAt) {
    const end = s.endedAt ?? s.endsAt;
    text = `Finished · ${formatLocal(s.startedAt, DAY_CLOCK, client)}${end ? `–${formatLocal(end, CLOCK, client)}` : ""} · ${people}`;
  } else if (status === "live") {
    const count = `${s.problemCount} problem${s.problemCount === 1 ? "" : "s"}`;
    const started = s.startedAt ? ` · started ${formatLocal(s.startedAt, CLOCK, client)}` : "";
    text = `${formatLocal(s.startedAt ?? s.createdAt, DAY, client)} · ${count} · ${s.durationMin} min · ${people}${started}`;
  } else if (status === "lobby") {
    const planned = s.plannedFor ? ` · Planned for ${formatLocal(s.plannedFor, DAY_CLOCK, client)}` : "";
    text = `Lobby · ${data.room.name}${planned}`;
  } else {
    text = data.room.name;
  }
  return (
    <p
      className={cn("mt-4 text-[1.0625rem]", status === "live" ? "text-on-night-2" : "text-muted-foreground")}
      suppressHydrationWarning
    >
      {text}
    </p>
  );
}

function ConnectionNotice({ connection, sessionPath }: { connection: string; sessionPath: string }) {
  if (connection === "reconnecting") {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="reconnecting">
        <LoaderCircleIcon aria-hidden className="size-4 motion-safe:animate-spin-slow" />
        Reconnecting… Updates will resume automatically.
      </p>
    );
  }
  if (connection === "gone") {
    return (
      <Alert variant="danger" role="alert" data-testid="gone">
        <WifiOffIcon aria-hidden />
        <AlertTitle>You no longer have access to this room.</AlertTitle>
        <AlertDescription>
          <Link href="/rooms">Go to your rooms</Link>
        </AlertDescription>
      </Alert>
    );
  }
  if (connection === "unauthenticated") {
    return (
      <Alert variant="warning" role="alert">
        <LogInIcon aria-hidden />
        <AlertTitle>You were signed out.</AlertTitle>
        <AlertDescription>
          <Link href={`/login?next=${encodeURIComponent(sessionPath)}`}>Sign in again</Link> to keep following the
          session.
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}

/** "Only verdicts are shared" (DESIGN.md §13.10): what the room can see of each other. */
function RoomRules() {
  return (
    <p className="rounded-xl border bg-surface-sunken px-5 py-4 text-sm/6 text-foreground-secondary">
      <strong className="font-semibold text-foreground">Room rules.</strong> Only results are shared while the session
      runs: who solved what, when and after how many tries. No code, verdict types or test data.
    </p>
  );
}

function PendingLine({ pending }: { pending: number }) {
  const text = pendingJudgingText(pending);
  if (!text) return null;
  return (
    <Alert variant="info" data-testid="pending-judging">
      <LoaderCircleIcon aria-hidden className="motion-safe:animate-spin-slow" />
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}

/** "37:50 left · You 1✓ 2✗ 3✓ 4·" (sticky bar below lg); nothing for watchers. */
function StickyChips({
  snapshot,
  viewerId,
  pending,
}: {
  snapshot: NonNullable<SessionPageData["state"]["snapshot"]>;
  viewerId: string;
  pending: readonly PendingCell[];
}) {
  const mine = viewerChips(snapshot, viewerId, pending);
  if (!mine) return null;
  return <YouChips chips={mine} className="text-sm text-muted-foreground" />;
}

type BodyProps = {
  data: SessionPageData;
  snapshot: NonNullable<SessionPageData["state"]["snapshot"]>;
  feed: FeedLine[];
  pendingCells: PendingCell[];
};

function useMatrix({ data, snapshot, pendingCells }: Pick<BodyProps, "data" | "snapshot" | "pendingCells">) {
  return useMemo(() => {
    const rows = scoreboardRows(snapshot, data.viewerId, pendingCells);
    const me = rows.find((r) => r.isViewer);
    return { rows, myChips: me ? chips(me.cells) : null };
  }, [snapshot, data.viewerId, pendingCells]);
}

function LiveBody({
  data,
  snapshot,
  feed,
  judging,
  isParticipant,
  pendingCells,
}: BodyProps & { judging: FeedLine[]; isParticipant: boolean }) {
  const large = useMediaQuery(LARGE);
  const { rows, myChips } = useMatrix({ data, snapshot, pendingCells });
  const sessionId = data.session.id;
  const matrix = (mobileLegend: boolean) => (
    <ScoreMatrix
      problems={snapshot.problems}
      rows={rows}
      durationSec={snapshot.session.durationMin * 60}
      problemHref={(p) => (p.slug ? sessionProblemHref(p.slug, sessionId) : null)}
      mobileLegend={mobileLegend}
    />
  );
  const watching = !isParticipant && (
    <p className="text-sm text-muted-foreground">You are watching. Join the session to have your submissions count.</p>
  );
  const board = (mobileLegend: boolean) => (
    <section aria-labelledby="scoreboard" id="scoreboard-section" className="flex scroll-mt-32 flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="flex items-baseline gap-3">
          <h2 id="scoreboard" className="font-display text-[2rem]/none">
            Scoreboard
          </h2>
          <span aria-hidden className="eyebrow">
            Updates live
          </span>
        </div>
        {myChips && <YouChips chips={myChips} className="hidden text-sm text-muted-foreground lg:inline-flex" />}
      </div>
      {large !== false && watching}
      {matrix(mobileLegend)}
      <MatrixLegend className="mt-1" />
    </section>
  );
  const activity = (
    <section aria-labelledby="activity" className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="inline-flex h-6 items-center gap-1.5 rounded-full bg-live-bg px-2.5 text-xs font-semibold text-live">
            <span className="live-dot" />
            Live
          </span>
          <h2 id="activity" className="text-[1.0625rem]/6 font-semibold">
            Activity
          </h2>
        </div>
        <span aria-hidden className="label-mono text-muted-foreground">
          Newest first
        </span>
      </div>
      <ActivityFeed lines={feed} judging={judging} />
    </section>
  );
  const notifications = (
    <section aria-labelledby="notifications-card" className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-5 shadow-sm" data-testid="notifications-card">
      <h2 id="notifications-card" className="text-[1.0625rem]/6 font-semibold">
        Notifications
      </h2>
      <p className="text-sm text-muted-foreground">
        Saved in this browser. Updates arrive every 3 s, and within about a second after a submission finishes judging.
      </p>
      <NotificationSwitches testIdPrefix="card-pref" />
      <RoomRules />
    </section>
  );

  if (large === false) {
    return (
      <Tabs defaultValue="problems" className="gap-4">
        <TabsList aria-label="Session" className="w-full">
          <TabsTrigger value="problems" className="h-11 flex-1">
            Problems
          </TabsTrigger>
          <TabsTrigger value="scoreboard" className="h-11 flex-1">
            Scoreboard
          </TabsTrigger>
          <TabsTrigger value="activity" className="h-11 flex-1">
            Activity
          </TabsTrigger>
        </TabsList>
        {/* keepMounted: the Activity log stays the live region while another tab is open. */}
        <TabsContent value="problems" keepMounted className="flex flex-col gap-3">
          {watching}
          <ProblemList
            snapshot={snapshot}
            sessionId={sessionId}
            viewerId={data.viewerId}
            isParticipant={isParticipant}
            pending={pendingCells}
          />
        </TabsContent>
        <TabsContent value="scoreboard" keepMounted>
          {board(false)}
        </TabsContent>
        <TabsContent value="activity" keepMounted className="flex flex-col gap-4">
          {activity}
          {notifications}
        </TabsContent>
      </Tabs>
    );
  }
  return (
    <div className="flex flex-col gap-8">
      {board(true)}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        {activity}
        {notifications}
      </div>
    </div>
  );
}

function FinishedBody({
  data,
  snapshot,
  feed,
  pendingCells,
  pending,
  roomId,
  sessionId,
}: BodyProps & { pending: number; roomId: string; sessionId: string }) {
  const { rows } = useMatrix({ data, snapshot, pendingCells });
  return (
    <div className="flex flex-col gap-8">
      <PendingLine pending={pending} />
      <section aria-labelledby="final-standings" className="flex flex-col gap-3">
        <h2 id="final-standings" className="font-display text-[2rem]/none">
          Final standings
        </h2>
        <ScoreMatrix
          problems={snapshot.problems}
          rows={rows}
          durationSec={snapshot.session.durationMin * 60}
          final
          caption="Final standings: who solved which problem and when"
        />
        <MatrixLegend className="mt-1" />
      </section>
      <div className="flex flex-wrap gap-3">
        {/* No prefetch: the results page is a separate, heavier route. */}
        <Link href={resultsHref(roomId, sessionId)} prefetch={false} className={buttonVariants()} data-testid="results-link">
          Full results
        </Link>
        <NewSessionButton roomId={roomId} variant="secondary" />
      </div>
      <section aria-labelledby="activity" className={cn("flex flex-col gap-2 rounded-xl border bg-card p-5 shadow-sm")}>
        <h2 id="activity" className="text-[1.0625rem]/6 font-semibold">
          Activity
        </h2>
        <ActivityFeed lines={feed} />
      </section>
    </div>
  );
}
