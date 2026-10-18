import { RadioIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "cn";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatShortDate } from "@/lib/rooms/lobby-copy";
import { ratingLabel } from "@/lib/rooms/lobby-rating";
import { formatOccurrence, relativeWhen } from "@/lib/rooms/schedule";
import type { LastSessionChip, RoomListItemV2 } from "@/server/rooms/room-list";

import { RoomTile } from "./room-color";

export function memberCountLabel(n: number): string {
  return `${n} ${n === 1 ? "member" : "members"}`;
}

/**
 * One room on /rooms (spec §7.4, Rooms v2 §2.5): color tile, name (the
 * card's only link, stretched over the card), description, member avatars
 * ×5 + "+N", role, and the rows Next / Last / You. A live room turns night.
 */
export function RoomCard({ room, now }: { room: RoomListItemV2; now: Date }) {
  const extra = room.memberCount - room.memberNames.length;
  const live = room.openSession?.status === "live";
  return (
    <Card interactive variant={live ? "night" : "default"} className="relative h-full" data-testid="room-card">
      <CardContent className="flex h-full flex-col gap-4 py-1">
        <div className="flex items-start gap-3">
          <RoomTile name={room.name} color={room.color} />
          <div className="min-w-0 flex-1">
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
            <p className={cn("mt-1 text-sm break-words", live ? "text-on-night-2" : "text-muted-foreground")}>
              {room.description || "No description"}
            </p>
          </div>
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
          <Badge variant="outline" className={cn("ml-auto shrink-0", live && "border-night-line text-on-night-2")}>
            {room.role === "owner" ? "Owner" : "Member"}
          </Badge>
        </div>
        <div
          className={cn(
            "mt-auto flex flex-col gap-2 border-t pt-4 text-sm",
            live ? "border-night-line text-on-night" : "text-foreground",
          )}
        >
          <SessionRow room={room} live={live} />
          <dl className="flex flex-col gap-2">
          <Row label="Next" live={live}>
            {room.next ? (
              <span data-testid="room-card-next">
                <span className="font-semibold">
                  <time dateTime={room.next.at}>{formatOccurrence(room.next.at, room.next.timeZone)}</time>
                </span>
                <span className={live ? "text-on-night-2" : "text-muted-foreground"}>
                  {" · "}
                  {relativeWhen(room.next.at, now, room.next.timeZone)}
                </span>
              </span>
            ) : (
              <span className={live ? "text-on-night-2" : "text-muted-foreground"}>
                No weekly schedule
                {room.role === "owner" && (
                  <>
                    {" · "}
                    <Link
                      href={`/rooms/${room.id}?tab=settings#schedule`}
                      className={cn("relative z-10 font-medium underline-offset-4 hover:underline", live ? "text-on-night" : "text-link")}
                    >
                      set one<span className="sr-only"> for {room.name}</span>
                    </Link>
                  </>
                )}
              </span>
            )}
          </Row>
          {!live && (
            <Row label="Last" live={live}>
              {room.last ? (
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>
                    <time dateTime={room.last.date}>{formatShortDate(room.last.date)}</time>
                  </span>
                  {room.last.chips ? (
                    <ChipRow chips={room.last.chips} />
                  ) : (
                    <span className="text-muted-foreground">you didn&apos;t play</span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground">No sessions yet</span>
              )}
            </Row>
          )}
          {(room.you.attendance || room.you.rating !== null) && (
            <Row label="You" live={live}>
              {[room.you.attendance, room.you.rating !== null ? `rating ${ratingLabel(room.you.rating, room.you.provisional)}` : null]
                .filter(Boolean)
                .join(" · ")}
            </Row>
          )}
          </dl>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, live, children }: { label: string; live: boolean; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className={cn("label-mono w-12 shrink-0", live ? "text-on-night-2" : "text-muted-foreground")}>{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

const CHIP: Record<LastSessionChip["state"], { mark: string; word: string; cls: string }> = {
  solved: { mark: "✓", word: "solved", cls: "bg-success-bg text-success" },
  tried: { mark: "✗", word: "tried, not solved", cls: "bg-danger-bg text-danger" },
  none: { mark: "·", word: "not attempted", cls: "bg-surface-sunken text-muted-foreground" },
};

/** "1✓ 2✗ 3✓ 4·": the viewer's problems of the last session (no "N of total"). */
function ChipRow({ chips }: { chips: LastSessionChip[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1" data-testid="room-card-last-chips">
      {chips.map((c) => (
        <span
          key={c.position}
          className={cn("inline-flex h-6 items-center rounded-sm px-1.5 font-mono text-xs tabular-nums", CHIP[c.state].cls)}
        >
          {c.position}
          <span aria-hidden>{CHIP[c.state].mark}</span>
          <span className="sr-only">
            {" "}
            Problem {c.position}: {CHIP[c.state].word}
          </span>
        </span>
      ))}
    </span>
  );
}

function SessionRow({ room, live }: { room: RoomListItemV2; live: boolean }) {
  const s = room.openSession;
  if (live && s) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-live-bg px-2.5 text-xs font-semibold text-live">
          <RadioIcon aria-hidden className="size-3.5" />
          Live now
        </span>
        {s.minutesLeft !== null && (
          <span className="font-mono text-[0.8125rem] text-on-night-2 tabular-nums">{Math.max(1, s.minutesLeft)} min left</span>
        )}
      </div>
    );
  }
  if (s?.status === "lobby") {
    return (
      <div className="flex items-center gap-2 font-medium text-info">
        <span aria-hidden className="inline-block size-2 rounded-[2px] bg-info" />
        Lobby open
      </div>
    );
  }
  return null;
}
