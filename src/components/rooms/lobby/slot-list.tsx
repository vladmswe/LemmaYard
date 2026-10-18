"use client";

// Lobby slots (docs/specs/rooms.md §1.2 step 5, §2.4, §7.4 SlotList). The
// host/owner sees titles, draw notes and the Re-roll / Pin / Unpin actions;
// everyone else sees difficulty and topics only ("Titles are revealed when
// the session starts"). After a re-roll focus moves to the slot and a polite
// message says which slot changed.
import { DicesIcon, PinIcon, PinOffIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "cn";

import { DifficultyBadge } from "@/components/problems/difficulty-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatShortDate, slotNote } from "@/lib/rooms/lobby-copy";
import { slotRatingLines } from "@/lib/rooms/lobby-rating";
import type { LobbySlotView } from "@/lib/rooms/session-view";
import { MAX_PROBLEM_COUNT, type SelectionMode } from "@/lib/rooms/types";

import { LeetCodeLink, LeetCodeTag } from "../external/leetcode-bits";

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
  external = 0,
  onAddExternal,
  onRemoveExternal,
}: {
  /** v2: rating mode shows the rating lines; manual mode has no re-roll and empty slots say "Pick a problem". */
  mode?: SelectionMode;
  /** LeetCode slots at the end (rooms-external-problems §1.2). */
  external?: number;
  /** Opens "Add LeetCode problem" (null: the next free LeetCode slot or a new one). */
  onAddExternal: (position: number | null) => void;
  onRemoveExternal: (position: number) => void;
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
  const drawn = problemCount - external;
  const hasEmptyExternal = positions.some((p) => p > drawn && !byPos.has(p));

  return (
    <div className="flex flex-col gap-2">
      <p className="sr-only" aria-live="polite">
        {focus?.message ?? ""}
      </p>
      <ol className="flex flex-col gap-2" aria-label="Problems" data-testid="slot-list">
        {positions.map((pos) => {
          const slot = byPos.get(pos);
          if (pos > drawn) {
            return (
              <ExternalSlotItem
                key={pos}
                position={pos}
                slot={slot}
                canManage={canManage}
                busy={busy}
                problemCount={problemCount}
                onPick={onAddExternal}
                onRemove={onRemoveExternal}
                itemRef={(el) => {
                  if (el) refs.current.set(pos, el);
                  else refs.current.delete(pos);
                }}
              />
            );
          }
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
                      {slot.difficulty && <DifficultyBadge difficulty={slot.difficulty} />}
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
      {canManage && (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy !== null || (problemCount >= MAX_PROBLEM_COUNT && !hasEmptyExternal)}
            onClick={() => onAddExternal(null)}
            data-testid="add-leetcode"
          >
            <PlusIcon aria-hidden />
            Add LeetCode problem
          </Button>
          <span className="text-sm text-muted-foreground">
            {problemCount >= MAX_PROBLEM_COUNT && !hasEmptyExternal
              ? `A session has at most ${MAX_PROBLEM_COUNT} problems. Remove one first.`
              : "A link to leetcode.com; people mark it solved themselves. It never changes ratings."}
          </span>
        </div>
      )}
      {!canManage && <p className="text-sm text-muted-foreground">Titles are revealed when the session starts.</p>}
    </div>
  );
}

/** A LeetCode slot (always after the drawn ones): the problem, or an empty slot the host fills. */
function ExternalSlotItem({
  position: pos,
  slot,
  canManage,
  busy,
  problemCount,
  onPick,
  onRemove,
  itemRef,
}: {
  position: number;
  slot: LobbySlotView | undefined;
  canManage: boolean;
  busy: string | null;
  problemCount: number;
  onPick: (position: number | null) => void;
  onRemove: (position: number) => void;
  itemRef: (el: HTMLLIElement | null) => void;
}) {
  const ext = slot?.external;
  return (
    <li
      tabIndex={-1}
      ref={itemRef}
      data-testid={`slot-${pos}`}
      data-external="true"
      className={cn(
        "flex flex-wrap items-start gap-x-4 gap-y-2 rounded-xl border bg-card px-5 py-4 shadow-sm outline-offset-2 sm:items-center",
        !slot && "border-dashed",
      )}
    >
      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md border border-dashed bg-surface-sunken font-mono text-sm font-medium tabular-nums">
        {pos}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="sr-only">Problem {pos}: LeetCode problem</span>
          {slot && canManage && ext?.slug ? (
            <LeetCodeLink slug={ext.slug} className="font-medium" testId={`slot-leetcode-${pos}`}>
              {ext.title ?? ext.slug}
            </LeetCodeLink>
          ) : null}
          <LeetCodeTag />
          {slot?.difficulty && <DifficultyBadge difficulty={slot.difficulty} />}
          {canManage && ext?.rating != null && (
            <span
              className="inline-flex h-6 items-center rounded-sm border border-border-strong px-1.5 font-mono text-xs tabular-nums text-foreground-secondary"
              title="Rating entered by the room owner (display only)"
            >
              <span className="sr-only">rating </span>
              {ext.rating}
            </span>
          )}
          {!slot && (
            <span className="text-sm text-muted-foreground">{canManage ? "Pick a LeetCode problem" : "LeetCode problem, not picked yet"}</span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">Self-reported: solved on leetcode.com, marked here. Not rated.</p>
      </div>
      {canManage && (
        <div className="flex shrink-0 items-center gap-1 max-sm:w-full max-sm:pl-9">
          {!slot && (
            <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => onPick(pos)} data-testid={`pick-leetcode-${pos}`}>
              Pick<span className="sr-only"> a LeetCode problem for Problem {pos}</span>
            </Button>
          )}
          <IconAction
            label={`Remove Problem ${pos} (LeetCode slot)`}
            onClick={() => onRemove(pos)}
            disabled={busy !== null || problemCount <= 1}
            loading={busy === `remove-external-${pos}`}
            testId={`remove-external-${pos}`}
          >
            <Trash2Icon aria-hidden />
          </IconAction>
        </div>
      )}
    </li>
  );
}
