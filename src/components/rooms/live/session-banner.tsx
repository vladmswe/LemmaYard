"use client";

// Session banner on the problem page (docs/specs/rooms.md §3.5, §7.4
// SessionBanner): "Saturday Algo Club · Problem 2 of 4 · 47:12 left · You 1/4
// · Leader 2/4" with the way back to the session, prev/next problem and the
// notification settings. While the viewer is a live participant it registers
// the session for Submit (never Run). Other people's events toast here; the
// viewer's own verdict stays in the console.
import { ChevronLeftIcon, ChevronRightIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { cn } from "cn";

import { useSetSubmitSession } from "@/components/problem/submit-context";
import { Button, buttonVariants } from "@/components/ui/button";
import type { RoomEvent } from "@/lib/rooms/events";
import { milestoneMessage } from "@/lib/rooms/live-clock";
import { problemLabel, progressSummary, progressText, resultsHref, sessionHref, sessionProblemHref } from "@/lib/rooms/live-view";
import { eventNotice, type NoticeContext } from "@/lib/rooms/notifications";
import type { ProblemSessionContext } from "@/server/rooms/session-page";

import { Countdown } from "./countdown";
import { NotificationSettings } from "./notification-settings";
import { sessionApi } from "./session-api";
import { useAnnouncer, useNotificationPrefs } from "./use-notifications";
import { useSessionLive } from "./use-session-live";

const NAV_LINK = "relative inline-flex size-8 items-center justify-center rounded-full text-foreground-secondary transition-colors duration-(--d-1) after:absolute after:-inset-1 hover:bg-card hover:text-foreground";

export function SessionBanner({ context, viewerId }: { context: ProblemSessionContext; viewerId: string }) {
  const { roomId, sessionId, position, problemCount, slugs } = context;
  const backHref = sessionHref(roomId, sessionId);
  const prefs = useNotificationPrefs();
  const initial = useMemo(
    () => ({
      serverNow: context.serverNow,
      status: context.status,
      endsAt: context.endsAt,
      cursor: "0",
      events: [],
      hasMore: false,
      pendingJudging: 0,
      viewer: { isParticipant: context.isParticipant, canManage: false },
    }),
    [context],
  );

  const announce = useAnnouncer({ sessionId, toasts: () => true, scoreboardHref: `${backHref}#scoreboard` });
  const ctxRef = useRef<NoticeContext | null>(null);
  const statusRef = useRef(context.status);

  const onEvents = useCallback(
    (events: RoomEvent[]) => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      announce(events.map((e) => eventNotice(e, ctx, statusRef.current === "live")).filter((n) => n !== null));
    },
    [announce],
  );
  // Start from "now": the first poll brings the snapshot and the latest cursor, no history.
  const live = useSessionLive({ roomId, sessionId, initial, fromCursor: null, onEvents });
  const status = live.status === "live" ? "live" : "finished";
  const snapshot = live.snapshot;

  useEffect(() => {
    statusRef.current = status;
    const titles = new Map((snapshot?.problems ?? []).filter((p) => p.title).map((p) => [p.position, p.title!]));
    ctxRef.current = {
      viewerId,
      titles,
      problemCount,
      durationMin: snapshot?.session.durationMin ?? 0,
      showAttempts: prefs.showAttempts,
      links: { scoreboard: `${backHref}#scoreboard`, results: resultsHref(roomId, sessionId), firstProblem: null },
    };
  }, [status, snapshot, viewerId, problemCount, prefs.showAttempts, backHref, roomId, sessionId]);

  // Register the session for Submit while the viewer is a live participant.
  const setSubmitSession = useSetSubmitSession();
  const { patch, refresh } = live;
  const isParticipant = live.viewer.isParticipant;
  const join = useCallback(async () => {
    const res = await sessionApi.join(roomId, sessionId);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    patch({ viewer: { isParticipant: true, canManage: false } });
    refresh();
    toast.success("You joined the session. Your submissions now count.");
    return true;
  }, [roomId, sessionId, patch, refresh]);
  useEffect(() => {
    if (status === "live" && isParticipant) {
      setSubmitSession({
        roomSessionId: sessionId,
        label: `${context.roomName} · ${problemLabel(position)} of ${problemCount}`,
        join,
      });
    } else {
      setSubmitSession(null);
    }
  }, [status, isParticipant, sessionId, context.roomName, position, problemCount, join, setSubmitSession]);
  useEffect(() => () => setSubmitSession(null), [setSubmitSession]);

  const onMilestone = useCallback(
    (ms: number) => announce([{ id: `milestone-${ms}`, kind: "milestone", title: milestoneMessage(ms) }]),
    [announce],
  );

  const prev = position > 1 ? slugs[position - 2] : null;
  const next = position < slugs.length ? slugs[position] : null;
  const summary = snapshot ? progressText(progressSummary(snapshot, viewerId)) : null;

  return (
    <div
      className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b bg-info-bg px-3 py-1.5 text-sm md:h-10 md:flex-nowrap md:py-0"
      data-testid="session-banner"
      data-status={status}
      role="region"
      aria-label="Room session"
    >
      {status === "live" ? (
        <span aria-hidden className="live-dot shrink-0 text-live" />
      ) : (
        <UsersIcon aria-hidden className="size-4 shrink-0 text-info" />
      )}
      <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <strong className="truncate font-semibold">{context.roomName}</strong>
        <span aria-hidden className="text-muted-foreground">·</span>
        <span>
          {problemLabel(position)} of {problemCount}
        </span>
        {status === "live" ? (
          <>
            <span aria-hidden className="text-muted-foreground">·</span>
            <Countdown
              endsAt={live.endsAt}
              offsetMs={live.offsetMs}
              size="inline"
              onExpire={live.refresh}
              onMilestone={onMilestone}
              announce={false}
            />
            {summary && (
              <>
                <span aria-hidden className="text-muted-foreground">·</span>
                <span className="tabular-nums text-foreground-secondary" data-testid="banner-progress">
                  {summary}
                </span>
              </>
            )}
            {!isParticipant && (
              <>
                <span aria-hidden className="text-muted-foreground">·</span>
                <span className="font-medium">You haven&apos;t joined this session</span>
              </>
            )}
          </>
        ) : (
          <>
            <span aria-hidden className="text-muted-foreground">·</span>
            <span className="font-medium">Session finished · submissions no longer count</span>
          </>
        )}
      </p>
      <div className="flex shrink-0 items-center gap-1">
        {status === "live" && !isParticipant && (
          <Button size="sm" onClick={() => void join()} data-testid="banner-join">
            Join
          </Button>
        )}
        {status === "live" && (
          <>
            {prev ? (
              <Link href={sessionProblemHref(prev, sessionId)} className={NAV_LINK} aria-label={problemLabel(position - 1)}>
                <ChevronLeftIcon aria-hidden className="size-4" />
              </Link>
            ) : null}
            {next ? (
              <Link href={sessionProblemHref(next, sessionId)} className={NAV_LINK} aria-label={problemLabel(position + 1)}>
                <ChevronRightIcon aria-hidden className="size-4" />
              </Link>
            ) : null}
          </>
        )}
        <Link
          href={status === "live" ? backHref : resultsHref(roomId, sessionId)}
          prefetch={status === "live" ? undefined : false}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "after:absolute after:-inset-1")}
          data-testid="banner-session-link"
        >
          {status === "live" ? "Session" : "Results"}
        </Link>
        {status === "live" && <NotificationSettings size="icon-sm" />}
      </div>
    </div>
  );
}
