"use client";

// Lobby slots (docs/specs/rooms.md §1.2 step 5, §2.4, §7.4 SlotList). The
// host/owner sees titles, draw notes and the Re-roll / Pin / Unpin actions;
// everyone else sees difficulty and topics only ("Titles are revealed when
// the session starts"). After a re-roll focus moves to the slot and a polite
// message says which slot changed.
import { DicesIcon, PinIcon, PinOffIcon } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { DifficultyBadge } from "@/components/problems/difficulty-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatShortDate, slotNote } from "@/lib/rooms/lobby-copy";
import { slotRatingLines } from "@/lib/rooms/lobby-rating";
import type { LobbySlotView } from "@/lib/rooms/session-view";
import type { SelectionMode } from "@/lib/rooms/types";

function IconAction({
  label,
  onClick,
  disabled,
  loading,
  children,
  testId,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            data-testid={testId}
            disabled={disabled}
            loading={loading}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function SlotList({
  slots,
  problemCount,
  canManage,
  tagName,
  busy,
  focus,
  onReroll,
  onPin,
  onUnpin,
  mode = "difficulty",
}: {
  /** v2: rating mode shows the rating lines; manual mode has no re-roll and empty slots say "Pick a problem". */
  mode?: SelectionMode;
  slots: LobbySlotView[];
  problemCount: number;
  canManage: boolean;
  tagName: (slug: string) => string;
  /** "reroll-2", "pin-3", … while a slot action runs. */
  busy: string | null;
  /** Slot to focus after an action, with the message to announce. */
  focus: { position: number; message: string; nonce: number } | null;
  onReroll: (position: number) => void;
  onPin: (position: number) => void;
  onUnpin: (position: number) => void;
}) {
  const refs = useRef(new Map<number, HTMLLIElement>());
  useEffect(() => {
    if (focus) refs.current.get(focus.position)?.focus();
  }, [focus]);
  const byPos = new Map(slots.map((s) => [s.position, s]));
  const positions = Array.from({ length: problemCount }, (_, i) => i + 1);

  return (
    <div className="flex flex-col gap-2">
      <p className="sr-only" aria-live="polite">
        {focus?.message ?? ""}
      </p>
      <ol className="flex flex-col gap-2" aria-label="Problems" data-testid="slot-list">
        {positions.map((pos) => {
          const slot = byPos.get(pos);
          const note = slot ? slotNote(slot.note, (iso) => formatShortDate(iso)) : null;
          const r = slotRatingLines(slot?.rating);
          return (
            <li
              key={pos}
              tabIndex={-1}
              ref={(el) => {
                if (el) refs.current.set(pos, el);
                else refs.current.delete(pos);
              }}
              data-testid={`slot-${pos}`}
              className="flex flex-wrap items-start gap-x-4 gap-y-2 rounded-xl sm:items-center border bg-card px-5 py-4 shadow-sm outline-offset-2"
            >
              <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md border bg-surface-sunken font-mono text-sm font-medium tabular-nums">
                {pos}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="sr-only">Problem {pos}:</span>
                  {slot ? (
                    <>
                      {canManage && slot.problem ? (
                        <span className="font-medium text-foreground">{slot.problem.title}</span>
                      ) : null}
                      <DifficultyBadge difficulty={slot.difficulty} />
                      {r?.rating && (
                        <span className="inline-flex h-6 items-center rounded-sm border border-border-strong px-1.5 font-mono text-xs tabular-nums text-foreground-secondary" data-testid={`slot-rating-${pos}`}>
                          {r.rating}
                        </span>
                      )}
                      {slot.pinned && (
                        <Badge variant="outline">
                          <PinIcon aria-hidden />
                          Pinned
                        </Badge>
                      )}
                      {canManage && slot.problem && !slot.problem.published && (
                        <span className="text-sm font-medium text-danger">No longer available; re-roll it</span>
                      )}
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">{mode === "manual" ? "Pick a problem" : "Empty slot"}</span>
                  )}
                </div>
                {slot && (slot.tags.length > 0 || r?.target) && (
                  <p className="text-sm text-muted-foreground">
                    {[slot.tags.map(tagName).join(", "), r?.target].filter(Boolean).join(" · ")}
                  </p>
                )}
                {r && (
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground-secondary" data-testid={`slot-chance-${pos}`}>
                    <span>{r.chance}</span>
                    <span aria-hidden className="relative h-1.5 w-28 overflow-hidden rounded-full bg-surface-sunken ring-1 ring-border">
                      <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${r.chancePercent}%` }} />
                    </span>
                  </p>
                )}
                {canManage && note && <p className="text-sm text-muted-foreground">{note}</p>}
              </div>
              {canManage && (
                <div className="flex shrink-0 items-center gap-1 max-sm:w-full max-sm:pl-9">
                  {slot && !slot.pinned && mode !== "manual" && (
                    <IconAction
                      label={`Re-roll Problem ${pos}`}
                      onClick={() => onReroll(pos)}
                      disabled={busy !== null}
                      loading={busy === `reroll-${pos}`}
                      testId={`reroll-${pos}`}
                    >
                      <DicesIcon aria-hidden />
                    </IconAction>
                  )}
                  <IconAction
                    label={`Pin a problem to Problem ${pos}`}
                    onClick={() => onPin(pos)}
                    disabled={busy !== null}
                    testId={`pin-${pos}`}
                  >
                    <PinIcon aria-hidden />
                  </IconAction>
                  {slot?.pinned && (
                    <IconAction
                      label={`Unpin Problem ${pos}`}
                      onClick={() => onUnpin(pos)}
                      disabled={busy !== null}
                      loading={busy === `unpin-${pos}`}
                      testId={`unpin-${pos}`}
                    >
                      <PinOffIcon aria-hidden />
                    </IconAction>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {!canManage && <p className="text-sm text-muted-foreground">Titles are revealed when the session starts.</p>}
    </div>
  );
}
