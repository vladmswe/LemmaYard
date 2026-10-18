import { CalendarDaysIcon, ClockIcon, RadioIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { RoomListItem } from "@/server/rooms/queries";

import { LocalDate } from "./local-date";

export function memberCountLabel(n: number): string {
  return `${n} ${n === 1 ? "member" : "members"}`;
}

/**
 * One room on /rooms (spec §7.4): name (the card's only link, stretched over
 * the card), member avatars ×5 + "+N", and the session line.
 */
export function RoomCard({ room }: { room: RoomListItem }) {
  const extra = room.memberCount - room.memberNames.length;
  const live = room.openSession?.status === "live";
  return (
    <Card interactive variant={live ? "night" : "default"} className="relative h-full">
      <CardContent className="flex h-full flex-col gap-5 py-1">
        <div className="flex items-start justify-between gap-3">
          <h2 className="display-3 min-w-0 break-words">
            <Link
              href={`/rooms/${room.id}`}
              className={cn(
                "rounded-sm after:absolute after:inset-0 after:rounded-[inherit]",
                live ? "text-on-night" : "text-foreground hover:text-link",
              )}
            >
              {room.name}
            </Link>
          </h2>
          {room.role === "owner" && (
            <Badge
              variant="outline"
              className={cn("shrink-0", live && "border-night-line text-on-night-2")}
            >
              Owner
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex -space-x-1.5">
            {room.memberNames.map((name) => (
              <Avatar key={name} name={name} className={live ? "ring-2 ring-night" : "ring-2 ring-card"} />
            ))}
            {extra > 0 && (
              <span
                aria-hidden
                className={cn(
                  "inline-grid size-8 place-items-center rounded-[10px] text-xs font-semibold ring-2",
                  live ? "bg-night-line text-on-night ring-night" : "bg-muted text-muted-foreground ring-card",
                )}
              >
                +{extra}
              </span>
            )}
          </div>
          <span className={cn("text-sm", live ? "text-on-night-2" : "text-muted-foreground")}>
            {memberCountLabel(room.memberCount)}
            <span className="sr-only">: {room.memberNames.join(", ")}</span>
          </span>
        </div>
        <SessionLine room={room} />
      </CardContent>
    </Card>
  );
}

function SessionLine({ room }: { room: RoomListItem }) {
  const s = room.openSession;
  if (s?.status === "live" && s.minutesLeft !== null) {
    const minutes = Math.max(1, s.minutesLeft);
    return (
      <p className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-night-line pt-4 text-sm">
        <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-live-bg px-2.5 text-xs font-semibold text-live">
          <RadioIcon aria-hidden className="size-3.5" />
          Live now
        </span>
        <span className="font-mono text-[0.8125rem] text-on-night-2 tabular-nums">{minutes} min left</span>
      </p>
    );
  }
  if (s?.status === "lobby") {
    return (
      <p className="mt-auto flex items-center gap-2 border-t pt-4 text-sm font-medium text-foreground-secondary">
        <ClockIcon aria-hidden className="size-4 text-muted-foreground" />
        Lobby open
      </p>
    );
  }
  return (
    <p className="mt-auto flex items-center gap-2 border-t pt-4 text-sm text-muted-foreground">
      <CalendarDaysIcon aria-hidden className="size-4" />
      {room.lastSessionAt ? (
        <span>
          Last session <span className="font-mono text-[0.8125rem]"><LocalDate iso={room.lastSessionAt} /></span>
        </span>
      ) : (
        "No sessions yet"
      )}
    </p>
  );
}
