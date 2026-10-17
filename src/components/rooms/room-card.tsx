import { CalendarDaysIcon, ClockIcon, RadioIcon } from "lucide-react";
import Link from "next/link";

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
  return (
    <Card interactive className="relative h-full">
      <CardContent className="flex h-full flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 text-lg/7 font-semibold break-words">
            <Link
              href={`/rooms/${room.id}`}
              className="rounded-sm text-foreground after:absolute after:inset-0 hover:text-link"
            >
              {room.name}
            </Link>
          </h2>
          {room.role === "owner" && (
            <Badge variant="outline" className="shrink-0">
              Owner
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {room.memberNames.map((name) => (
              <Avatar key={name} name={name} className="ring-2 ring-card" />
            ))}
            {extra > 0 && (
              <span
                aria-hidden
                className="inline-grid size-8 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground ring-2 ring-card"
              >
                +{extra}
              </span>
            )}
          </div>
          <span className="text-sm text-muted-foreground">
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
      <p className="mt-auto flex items-center gap-2 text-sm font-semibold text-info">
        <RadioIcon aria-hidden className="size-4" />
        Live now · {minutes} min left
      </p>
    );
  }
  if (s?.status === "lobby") {
    return (
      <p className="mt-auto flex items-center gap-2 text-sm font-medium text-foreground-secondary">
        <ClockIcon aria-hidden className="size-4 text-muted-foreground" />
        Lobby open
      </p>
    );
  }
  return (
    <p className="mt-auto flex items-center gap-2 text-sm text-muted-foreground">
      <CalendarDaysIcon aria-hidden className="size-4" />
      {room.lastSessionAt ? (
        <span>
          Last session <LocalDate iso={room.lastSessionAt} />
        </span>
      ) : (
        "No sessions yet"
      )}
    </p>
  );
}
