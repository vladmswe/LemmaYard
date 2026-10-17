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
import type { RoomEvent } from "@/lib/rooms/events";
import { milestoneMessage } from "@/lib/rooms/live-clock";
import {
  pendingJudgingText,
  problemLabel,
  progressSummary,
  progressText,
  problemSummary,
  resultsHref,
  sessionHref,
  sessionProblemHref,
} from "@/lib/rooms/live-view";
import { eventNotice, feedLine, isHistoryEvent, type FeedLine, type NoticeContext } from "@/lib/rooms/notifications";
import type { LobbyView } from "@/lib/rooms/session-view";
import type { SessionPageData } from "@/server/rooms/session-page";

import { ActivityFeed } from "./activity-feed";
import { Countdown } from "./countdown";
import { CLOCK, DAY, DAY_CLOCK, formatLocal, LocalTime, useIsClient } from "./local-time";
import { NewSessionButton } from "./new-session-button";
import { NotificationSettings } from "./notification-settings";
import { ProblemList } from "./problem-list";
import { Scoreboard } from "./scoreboard";
import { sessionApi } from "./session-api";
import { SessionStatusBadge } from "./session-status";
import { useAnnouncer } from "./use-notifications";
import { useSessionLive } from "./use-session-live";
import { SessionLobby } from "../lobby/session-lobby";

const LARGE = "(min-width: 1024px)";
const MAX_EVENTS = 300;

export function SessionScreen({ data }: { data: SessionPageData }) {
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
  const dateIso = startedAt ?? data.session.createdAt;
  const head = (
    <div className="border-b bg-surface-sunken">
      <div className="container-page flex flex-col gap-4 py-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Breadcrumb className="mb-2.5">
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
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-3xl/[2.375rem] font-semibold tracking-[-0.015em] sm:text-4xl/11">
              Session · <LocalTime iso={dateIso} options={DAY} />
            </h1>
            <SessionStatusBadge status={status} />
          </div>
          <HeadMeta data={data} status={status} participants={snapshot?.participants.length ?? 0} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {status === "live" && (
            <div className="hidden lg:block">
              <Countdown
                endsAt={live.endsAt}
                offsetMs={live.offsetMs}
                onExpire={live.refresh}
                onMilestone={onMilestone}
              />
            </div>
          )}
          {(status === "live" || status === "lobby") && <NotificationSettings />}
          {status === "live" && !live.viewer.isParticipant && (
            <Button loading={joining} onClick={joinLive} data-testid="join-live">
              <UserPlusIcon aria-hidden />
              Join session
            </Button>
          )}
          {status === "live" && canManage && (
            <Button variant="secondary" onClick={() => setEndOpen(true)} data-testid="end-session">
              <FlagIcon aria-hidden />
              End session
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {head}
      {status === "live" && (
        <div className="sticky top-[67px] z-30 flex h-12 items-center justify-between border-b bg-card px-4 shadow-xs lg:hidden">
          <Countdown
            endsAt={live.endsAt}
            offsetMs={live.offsetMs}
            size="inline"
            onExpire={live.refresh}
            announce={false}
          />
          {snapshot && (
            <span className="text-sm text-muted-foreground tabular-nums">
              {progressText(progressSummary(snapshot, data.viewerId))}
            </span>
          )}
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
          />
        )}
        {status === "live" && snapshot && (
          <LiveBody
            data={data}
            snapshot={snapshot}
            feed={feed}
            isParticipant={live.viewer.isParticipant}
            pending={live.pendingJudging}
          />
        )}
        {status === "finished" && snapshot && (
          <FinishedBody
            data={data}
            snapshot={snapshot}
            feed={feed}
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
    text = `${data.room.name} · ${s.problemCount} problems · ${s.durationMin} minutes · ${people}`;
  } else if (status === "lobby") {
    const planned = s.plannedFor ? ` · Planned for ${formatLocal(s.plannedFor, DAY_CLOCK, client)}` : "";
    text = `Lobby · ${data.room.name}${planned}`;
  } else {
    text = data.room.name;
  }
  return (
    <p className="mt-2 text-muted-foreground" suppressHydrationWarning>
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

function PendingLine({ pending, finished }: { pending: number; finished: boolean }) {
  const text = pendingJudgingText(pending);
  if (!text) return null;
  if (finished) {
    return (
      <Alert variant="info" data-testid="pending-judging">
        <LoaderCircleIcon aria-hidden className="motion-safe:animate-spin-slow" />
        <AlertDescription>{text}</AlertDescription>
      </Alert>
    );
  }
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="pending-judging">
      <LoaderCircleIcon aria-hidden className="size-4 motion-safe:animate-spin-slow" />
      {pending === 1 ? "1 submission still being judged" : `${pending} submissions still being judged`}
    </p>
  );
}

type BodyProps = {
  data: SessionPageData;
  snapshot: NonNullable<SessionPageData["state"]["snapshot"]>;
  feed: FeedLine[];
};

function LiveBody({
  data,
  snapshot,
  feed,
  isParticipant,
  pending,
}: BodyProps & { isParticipant: boolean; pending: number }) {
  const large = useMediaQuery(LARGE);
  const problems = (
    <section aria-labelledby="live-problems" className="flex flex-col gap-3">
      <h2 id="live-problems" className="text-xl/7 font-semibold">
        Problems
      </h2>
      {!isParticipant && (
        <p className="text-sm text-muted-foreground">
          You are watching. Join the session to have your submissions count.
        </p>
      )}
      <ProblemList
        snapshot={snapshot}
        sessionId={data.session.id}
        viewerId={data.viewerId}
        isParticipant={isParticipant}
      />
    </section>
  );
  const board = (
    <section aria-labelledby="scoreboard" id="scoreboard-section" className="flex scroll-mt-32 flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="scoreboard" className="text-xl/7 font-semibold">
          Scoreboard
        </h2>
        {large !== false && <PendingLine pending={pending} finished={false} />}
      </div>
      <Scoreboard snapshot={snapshot} viewerId={data.viewerId} />
    </section>
  );
  const activity = (
    <section aria-labelledby="activity" className="flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-xs">
      <h2 id="activity" className="text-[1.0625rem]/6 font-semibold">
        Activity
      </h2>
      <ActivityFeed lines={feed} />
    </section>
  );

  if (large === false) {
    return (
      <div className="flex flex-col gap-3">
        <PendingLine pending={pending} finished={false} />
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
          <TabsContent value="problems" keepMounted>
            {problems}
          </TabsContent>
          <TabsContent value="scoreboard" keepMounted>
            {board}
          </TabsContent>
          <TabsContent value="activity" keepMounted>
            {activity}
          </TabsContent>
        </Tabs>
      </div>
    );
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-8">
        {problems}
        {board}
      </div>
      <div className="min-w-0">{activity}</div>
    </div>
  );
}

function FinishedBody({
  data,
  snapshot,
  feed,
  pending,
  roomId,
  sessionId,
}: BodyProps & { pending: number; roomId: string; sessionId: string }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <PendingLine pending={pending} finished />
        <section aria-labelledby="final-standings" className="flex flex-col gap-3">
          <h2 id="final-standings" className="text-xl/7 font-semibold">
            Final standings
          </h2>
          <Scoreboard snapshot={snapshot} viewerId={data.viewerId} final caption="Final standings" />
        </section>
        <section aria-labelledby="per-problem" className="flex flex-col gap-3">
          <h2 id="per-problem" className="text-xl/7 font-semibold">
            Problems
          </h2>
          <ul className="flex flex-col divide-y rounded-lg border bg-card shadow-xs">
            {snapshot.problems.map((p) => (
              <li key={p.position} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 py-3 text-sm">
                <span className="font-semibold">{problemLabel(p.position)}</span>
                {p.slug && p.title && (
                  <Link href={`/problems/${p.slug}`} className="font-medium text-link hover:underline">
                    {p.title}
                  </Link>
                )}
                <span className="text-muted-foreground">· {problemSummary(snapshot, p.position)}</span>
              </li>
            ))}
          </ul>
        </section>
        <div className="flex flex-wrap gap-3">
          <Link href={resultsHref(roomId, sessionId)} className={buttonVariants()} data-testid="results-link">
            Full results
          </Link>
          <NewSessionButton roomId={roomId} variant="secondary" />
        </div>
      </div>
      <section
        aria-labelledby="activity"
        className={cn("flex flex-col gap-2 self-start rounded-lg border bg-card p-4 shadow-xs")}
      >
        <h2 id="activity" className="text-[1.0625rem]/6 font-semibold">
          Activity
        </h2>
        <ActivityFeed lines={feed} />
      </section>
    </div>
  );
}
