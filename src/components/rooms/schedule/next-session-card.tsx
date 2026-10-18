// Next-session card of the room page (docs/specs/rooms-v2.md §2.4, §5, §12),
// shown when no lobby/live session is open (the open-session card takes its
// place otherwise). With a weekly schedule: a night block "Sat, Oct 24 ·
// 18:00", "in 2 days · Europe/Kyiv · preset “Saturday”: 90 min · …", Open
// lobby (preset + planned_for), Edit schedule (owner), Add to calendar
// (.ics). Without one: "No session open" with a preset choice and a link to
// set a schedule (owner) or a hint for members. Nothing starts by itself.
import { CalendarClockIcon, CalendarPlusIcon, PencilIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";

import { buttonVariants } from "@/components/ui/button";
import { presetSummary } from "@/lib/rooms/preset-form";
import type { SessionTemplate } from "@/lib/rooms/room-defaults";
import { formatOccurrence, relativeWhen, scheduleCadence } from "@/lib/rooms/schedule";
import type { NextSessionPlan } from "@/server/rooms/schedule";

import { OpenLobbyButton } from "./open-lobby-button";
import { PresetSessionPicker } from "./preset-session-picker";

export function NextSessionCard({
  roomId,
  plan,
  presets,
  defaultPresetId,
  isOwner,
  now,
}: {
  roomId: string;
  plan: NextSessionPlan | null;
  presets: SessionTemplate[];
  defaultPresetId: string;
  isOwner: boolean;
  now: Date;
}) {
  if (!plan) {
    return (
      <section
        aria-labelledby="next-session-title"
        className="flex h-full flex-col gap-4 rounded-xl border bg-card px-6 py-5 shadow-sm"
        data-testid="open-session-card"
      >
        <div className="flex items-start gap-3">
          <CalendarPlusIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h2 id="next-session-title" className="font-semibold">
              No session open
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Open a lobby: pick the problems, let friends join, then start the timer for everyone.
            </p>
          </div>
        </div>
        <PresetSessionPicker roomId={roomId} presets={presets} defaultPresetId={defaultPresetId} />
        <p className="border-t pt-4 text-sm text-muted-foreground" data-testid="no-schedule">
          No weekly schedule yet.{" "}
          {isOwner ? (
            <Link href={`/rooms/${roomId}?tab=settings#schedule`} className="font-medium text-link underline-offset-4 hover:underline">
              Set a weekly schedule
            </Link>
          ) : (
            "Ask the owner to set one."
          )}
        </p>
      </section>
    );
  }

  const { schedule, preset } = plan;
  return (
    <section
      aria-labelledby="next-session-title"
      className="on-night grain flex h-full flex-col gap-4 rounded-2xl px-6 py-6 min-[961px]:px-7"
      data-testid="next-session-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="next-session-title" className="label-mono text-on-night-2">
          Next session
        </h2>
        <span className="inline-flex h-6 items-center rounded-full bg-secondary px-2.5 text-xs font-semibold text-secondary-foreground">
          {scheduleCadence(schedule)}
        </span>
      </div>
      <div>
        <p className="font-display text-[2.25rem]/[1.1] text-on-night min-[961px]:text-[2.75rem]" data-testid="next-session-when">
          <time dateTime={plan.at}>{formatOccurrence(plan.at, schedule.timeZone)}</time>
        </p>
        <p className="mt-2 text-[0.9375rem] text-on-night-2">
          {relativeWhen(plan.at, now, schedule.timeZone)} · {schedule.timeZone} · preset “{preset.name}”: {presetSummary(preset)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <OpenLobbyButton roomId={roomId} presetId={preset.id} plannedFor={plan.at} testId="open-scheduled-lobby" icon={false}>
          Open the lobby now
        </OpenLobbyButton>
        {isOwner && (
          <Link href={`/rooms/${roomId}?tab=settings#schedule`} className={buttonVariants({ variant: "night" })}>
            <PencilIcon aria-hidden />
            Edit schedule
          </Link>
        )}
        <a
          href={`/api/rooms/${roomId}/schedule.ics`}
          download
          className={buttonVariants({ variant: "night" })}
          data-testid="add-to-calendar"
        >
          <CalendarClockIcon aria-hidden />
          Add to calendar
        </a>
      </div>
      <p className={cn("text-sm text-on-night-2")}>
        It never starts by itself. Anyone in the room can open the lobby; the host presses Start.
      </p>
    </section>
  );
}
