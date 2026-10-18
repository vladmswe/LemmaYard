"use client";

// Open-session card above the room tabs (docs/specs/rooms.md §7.4 room page):
// Lobby "Session open · 4 problems · 90 min · 2 joined" + Open lobby; Live:
// countdown + Open session; none: New session. Rendered into R2's
// <RoomOpenSessionRegion> slot.
import { CalendarPlusIcon, ClockIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "cn";

import { buttonVariants } from "@/components/ui/button";
import { clockOffset } from "@/lib/rooms/live-clock";
import { sessionHref } from "@/lib/rooms/live-view";
import type { OpenSessionSummary } from "@/server/rooms/session-page";

import { Countdown } from "./countdown";
import { DAY_CLOCK, LocalTime } from "./local-time";
import { NewSessionButton } from "./new-session-button";

export function OpenSessionCard({ roomId, session }: { roomId: string; session: OpenSessionSummary | null }) {
  if (!session) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card px-6 py-5 shadow-sm" data-testid="open-session-card">
        <div className="flex items-start gap-3">
          <CalendarPlusIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div>
            <h2 className="font-semibold">No session open</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Start a lobby: pick the problems, let friends join, then start the timer for everyone.
            </p>
          </div>
        </div>
        <NewSessionButton roomId={roomId} />
      </div>
    );
  }
  const href = sessionHref(roomId, session.id);
  const live = session.status === "live";
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-4 px-6 py-5",
        live ? "on-night grain rounded-2xl" : "rounded-xl border border-info/40 bg-info-bg shadow-sm",
      )}
      data-testid="open-session-card"
    >
      <div className="flex min-w-0 items-start gap-3">
        {live ? (
          <span aria-hidden className="mt-2 live-dot shrink-0 text-live" />
        ) : (
          <ClockIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-info" />
        )}
        <div className="min-w-0">
          <h2 className="font-semibold">{live ? "Live now" : "Session open"}</h2>
          <p className={cn("mt-0.5 text-sm", live ? "text-on-night-2" : "text-foreground-secondary")}>
            {session.problemCount} problem{session.problemCount === 1 ? "" : "s"} · {session.durationMin} min ·{" "}
            {session.participants} joined
            {session.joined ? " · you're in" : ""}
            {!live && session.hostName ? ` · host ${session.hostName}` : ""}
            {!live && session.plannedFor && (
              <>
                {" · planned for "}
                <LocalTime iso={session.plannedFor} options={DAY_CLOCK} />
              </>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        {live && (
          <CardCountdown endsAt={session.endsAt} serverNow={session.serverNow} />
        )}
        <Link href={href} className={buttonVariants({ variant: live ? "invert" : "default" })} data-testid="open-session-link">
          {live ? "Open session" : "Open lobby"}
        </Link>
      </div>
    </div>
  );
}

function CardCountdown({ endsAt, serverNow }: { endsAt: string | null; serverNow: string }) {
  const [offset] = useState(() => clockOffset(serverNow, Date.now()));
  return <Countdown endsAt={endsAt} offsetMs={offset} size="inline" announce={false} />;
}
